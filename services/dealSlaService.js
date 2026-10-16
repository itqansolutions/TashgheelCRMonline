const db = require('../config/db');
const notificationService = require('./notificationService');
const { logActivity } = require('../utils/activityLogger');

/**
 * 🎯 Batch F: Deal SLA Management, Escalations & Reassignment Service
 *
 * Rules:
 * 1. Overdue = Deal is active (not won/lost/cancelled/closed) and > 48 hours without
 *    an impactful follow-up activity (call, whatsapp, meeting, email, site visit, or completed task).
 * 2. Unlimited extensions: each +48 hours added to MAX(current_deadline, NOW()).
 * 3. Idempotent extension via unique idempotencyKey.
 * 4. Completed tasks in `tasks` table count as impactful activities; mere creation does not.
 * 5. Reassignment starts a fresh 48h SLA window for the new rep while preserving history.
 * 6. Alert deduplication: one notification per overdue cycle key.
 */

// Actions from activities table that count as impactful client follow-ups
const IMPACTFUL_ACTIVITY_ACTIONS = [
  'called',
  'whatsapp',
  'meeting',
  'email_sent',
  'visited',
  'follow_up'
];

/**
 * Pure calculation helper for deal SLA metrics
 */
function calculateDealSla(deal, activities = [], tasks = [], now = new Date()) {
  const custom = (deal && typeof deal.custom_fields === 'object' && deal.custom_fields !== null) 
    ? deal.custom_fields 
    : {};

  const isTerminal = ['won', 'lost', 'cancelled', 'closed'].includes(
    String(deal?.pipeline_stage || '').toLowerCase().trim()
  );

  // 1. Determine latest impactful activity date
  let latestActivityDate = null;
  for (const a of activities) {
    if (a && a.created_at && IMPACTFUL_ACTIVITY_ACTIONS.includes(String(a.action || '').toLowerCase())) {
      const dt = new Date(a.created_at);
      if (!isNaN(dt.getTime())) {
        if (!latestActivityDate || dt > latestActivityDate) {
          latestActivityDate = dt;
        }
      }
    }
  }

  // 2. Determine latest completed task date (tasks linked to deal)
  let latestCompletedTaskDate = null;
  for (const t of tasks) {
    if (!t) continue;
    const isCompleted = (
      t.is_final === true || 
      String(t.status || '').toLowerCase() === 'completed' ||
      String(t.status_name || '').toLowerCase().includes('complete') ||
      String(t.status_name || '').toLowerCase().includes('done')
    );
    if (isCompleted) {
      const taskDate = new Date(t.updated_at || t.created_at);
      if (!isNaN(taskDate.getTime())) {
        if (!latestCompletedTaskDate || taskDate > latestCompletedTaskDate) {
          latestCompletedTaskDate = taskDate;
        }
      }
    }
  }

  // 3. Anchor date for SLA: Max of (deal.created_at, reassigned_at, latest impactful activity, latest completed task)
  const dealCreated = deal?.created_at ? new Date(deal.created_at) : new Date(now);
  let effectiveAnchor = dealCreated;

  if (custom.reassigned_at) {
    const reassignedDate = new Date(custom.reassigned_at);
    if (!isNaN(reassignedDate.getTime()) && reassignedDate > effectiveAnchor) {
      effectiveAnchor = reassignedDate;
    }
  }
  if (latestActivityDate && latestActivityDate > effectiveAnchor) {
    effectiveAnchor = latestActivityDate;
  }
  if (latestCompletedTaskDate && latestCompletedTaskDate > effectiveAnchor) {
    effectiveAnchor = latestCompletedTaskDate;
  }

  // 4. Base deadline = 48 hours after effective anchor
  const baseDeadline = new Date(effectiveAnchor.getTime() + 48 * 3600 * 1000);

  // 5. Extensions: add to base deadline if extended
  let effectiveDeadline = baseDeadline;
  if (custom.sla_extended_until) {
    const extendedUntil = new Date(custom.sla_extended_until);
    if (!isNaN(extendedUntil.getTime()) && extendedUntil > effectiveDeadline) {
      effectiveDeadline = extendedUntil;
    }
  }

  const nowDate = new Date(now);
  const isOverdue = !isTerminal && (nowDate > effectiveDeadline);
  const remainingMs = effectiveDeadline.getTime() - nowDate.getTime();
  const remainingHours = Number((remainingMs / (3600 * 1000)).toFixed(1));
  const extensionCount = parseInt(custom.sla_extension_count, 10) || 0;

  // Unique cycle key identifying this exact SLA deadline cycle
  const cycleKey = `sla_cycle:${deal?.id}:${effectiveDeadline.toISOString()}`;

  return {
    dealId: deal?.id,
    isTerminal,
    isOverdue,
    effectiveAnchor: effectiveAnchor.toISOString(),
    effectiveDeadline: effectiveDeadline.toISOString(),
    remainingHours: isOverdue ? 0 : Math.max(0, remainingHours),
    overdueHours: isOverdue ? Number((Math.abs(remainingMs) / (3600 * 1000)).toFixed(1)) : 0,
    extensionCount,
    extendedUntil: custom.sla_extended_until || null,
    lastExtendedBy: custom.sla_last_extended_by_name || null,
    lastAlertedAt: custom.sla_last_alerted_at || null,
    cycleKey
  };
}

/**
 * Fetch complete SLA status for a single deal from the database
 */
async function getDealSlaStatus(dealId, tenantId, queryable = db) {
  const dealRes = await queryable.query(
    `SELECT d.* FROM deals d WHERE d.id::text = $1::text AND d.tenant_id::text = $2::text`,
    [dealId, tenantId]
  );
  if (dealRes.rows.length === 0) return null;
  const deal = dealRes.rows[0];

  // Fetch impactful activities
  const actRes = await queryable.query(
    `SELECT action, created_at FROM activities 
     WHERE tenant_id::text = $1::text 
       AND LOWER(entity_type) = 'deal' 
       AND entity_id::text = $2::text
       AND action = ANY($3::text[])`,
    [tenantId, dealId, IMPACTFUL_ACTIVITY_ACTIONS]
  ).catch(() => ({ rows: [] }));

  // Fetch linked completed tasks
  const tasksRes = await queryable.query(
    `SELECT t.id, t.status, t.created_at, t.updated_at, ts.is_final, ts.name as status_name
     FROM tasks t
     LEFT JOIN task_statuses ts ON t.status_id = ts.id
     WHERE t.tenant_id::text = $1::text
       AND t.parent_type = 'deal'
       AND t.parent_id::text = $2::text`,
    [tenantId, dealId]
  ).catch(() => ({ rows: [] }));

  return calculateDealSla(deal, actRes.rows, tasksRes.rows, new Date());
}

/**
 * Extend Deal SLA by +48 hours (unlimited times permitted).
 * Idempotent via idempotencyKey.
 */
async function extendDealSla({ dealId, tenantId, user, reason, idempotencyKey = null, queryable = db }) {
  const currentSla = await getDealSlaStatus(dealId, tenantId, queryable);
  if (!currentSla) {
    throw new Error('Deal not found or unauthorized.');
  }

  const dealRes = await queryable.query(
    `SELECT id, custom_fields, pipeline_stage FROM deals WHERE id::text = $1::text AND tenant_id::text = $2::text FOR UPDATE`,
    [dealId, tenantId]
  );
  const deal = dealRes.rows[0];
  const custom = typeof deal.custom_fields === 'object' && deal.custom_fields !== null ? { ...deal.custom_fields } : {};

  // 1. Idempotency Check: if this specific idempotencyKey was already applied, return current status without adding +48h again
  const appliedKeys = Array.isArray(custom.sla_idempotency_keys) ? custom.sla_idempotency_keys : [];
  if (idempotencyKey && appliedKeys.includes(String(idempotencyKey))) {
    return {
      status: 'idempotent_duplicate',
      message: 'Extension with this key was already applied.',
      sla: currentSla
    };
  }

  // 2. Compute new deadline: +48h to MAX(current_effective_deadline, NOW())
  const now = new Date();
  const currentDeadline = new Date(currentSla.effectiveDeadline);
  const baseTime = currentDeadline > now ? currentDeadline : now;
  const newDeadline = new Date(baseTime.getTime() + 48 * 3600 * 1000);

  const newCount = (parseInt(custom.sla_extension_count, 10) || 0) + 1;
  if (idempotencyKey) {
    appliedKeys.push(String(idempotencyKey));
  }

  custom.sla_extended_until = newDeadline.toISOString();
  custom.sla_last_extended_at = now.toISOString();
  custom.sla_last_extended_by = user.id;
  custom.sla_last_extended_by_name = user.name || 'Manager';
  custom.sla_extension_reason = (reason || '').trim();
  custom.sla_extension_count = newCount;
  custom.sla_idempotency_keys = appliedKeys.slice(-50); // keep last 50 keys

  await queryable.query(
    `UPDATE deals 
     SET custom_fields = $1::jsonb, updated_at = CURRENT_TIMESTAMP 
     WHERE id::text = $2::text AND tenant_id::text = $3::text`,
    [JSON.stringify(custom), dealId, tenantId]
  );

  // 3. Log administrative audit action in activities
  await logActivity(tenantId, user, 'deal', dealId, 'sla_extended', {
    sla_extended_until: { to: newDeadline.toISOString() },
    extension_number: { to: newCount },
    reason: { to: (reason || 'SLA extended by 48h').trim() }
  });

  const updatedSla = await getDealSlaStatus(dealId, tenantId, queryable);

  return {
    status: 'success',
    message: `SLA successfully extended by 48 hours (Extension #${newCount}).`,
    sla: updatedSla
  };
}

/**
 * Reassign deal to an eligible sales representative
 * Resets SLA window to 48 hours from reassignment time.
 */
async function reassignDeal({ dealId, tenantId, user, targetUserId, reason = '', queryable = db }) {
  // 1. Fetch existing deal FOR UPDATE
  const dealRes = await queryable.query(
    `SELECT id, title, assigned_to, branch_id, custom_fields 
     FROM deals 
     WHERE id::text = $1::text AND tenant_id::text = $2::text 
     FOR UPDATE`,
    [dealId, tenantId]
  );

  if (dealRes.rows.length === 0) {
    const err = new Error('Deal not found or unauthorized.');
    err.statusCode = 404;
    throw err;
  }

  const deal = dealRes.rows[0];

  // Branch scope check on Deal: Branch-restricted managers cannot reassign deals outside their branch
  const userBranchId = user?.branch_id;
  if (user?.role !== 'admin' && userBranchId && deal.branch_id && String(deal.branch_id) !== String(userBranchId)) {
    const err = new Error('Unauthorized: You can only reassign deals belonging to your branch.');
    err.statusCode = 403;
    err.code = 'PERMISSION_DENIED';
    throw err;
  }

  // 2. Verify target user is in same tenant, active, and working
  const targetRes = await queryable.query(
    `SELECT id, name, email, role, branch_id, COALESCE(is_working, true) as is_working
     FROM users 
     WHERE id::text = $1::text AND tenant_id::text = $2::text`,
    [targetUserId, tenantId]
  );

  if (targetRes.rows.length === 0) {
    const err = new Error('Target sales representative does not exist in your company.');
    err.statusCode = 400;
    throw err;
  }

  const targetRep = targetRes.rows[0];
  if (!targetRep.is_working) {
    const err = new Error(`Target representative "${targetRep.name}" is currently marked inactive or on leave.`);
    err.statusCode = 400;
    throw err;
  }

  // Branch scope check on Target Rep: Branch-restricted managers cannot reassign deals to reps in other branches
  if (user?.role !== 'admin' && userBranchId && targetRep.branch_id && String(targetRep.branch_id) !== String(userBranchId)) {
    const err = new Error(`Unauthorized: Target representative "${targetRep.name}" belongs to a different branch.`);
    err.statusCode = 403;
    err.code = 'PERMISSION_DENIED';
    throw err;
  }

  const previousAssigneeId = deal.assigned_to;
  const now = new Date();

  const custom = typeof deal.custom_fields === 'object' && deal.custom_fields !== null ? { ...deal.custom_fields } : {};
  custom.reassigned_at = now.toISOString();
  custom.reassigned_by = user.id;
  custom.reassigned_by_name = user.name || 'Manager';
  custom.reassigned_from = previousAssigneeId;
  custom.reassignment_reason = (reason || '').trim();
  // Clear alerted cycle keys so the new rep receives a fresh 48h SLA window before any alerts
  custom.sla_alerted_cycle_key = null;
  custom.sla_alerted_rep_cycle_key = null;
  custom.sla_alerted_mgr_cycle_key = null;
  custom.sla_last_alerted_at = null;

  await queryable.query(
    `UPDATE deals 
     SET assigned_to = $1, 
         custom_fields = $2::jsonb, 
         updated_at = CURRENT_TIMESTAMP 
     WHERE id::text = $3::text AND tenant_id::text = $4::text`,
    [targetRep.id, JSON.stringify(custom), dealId, tenantId]
  );

  // 3. Log activity in timeline
  await logActivity(tenantId, user, 'deal', dealId, 'reassigned', {
    assigned_to: { from: previousAssigneeId, to: targetRep.id },
    assignee_name: { to: targetRep.name },
    reason: { to: reason || 'Manager reassigned deal' }
  });

  // 4. Dispatch notification to the new assignee
  await notificationService.notifyAssignment({
    tenantId,
    branchId: deal.branch_id,
    recipientUserId: targetRep.id,
    assignedByUserId: user.id,
    assignedByName: user.name,
    entityType: 'Deal',
    entityName: deal.title,
    link: `/deals?deal_id=${dealId}`,
    metadata: { reason }
  });

  const updatedSla = await getDealSlaStatus(dealId, tenantId, queryable);

  return {
    status: 'success',
    message: `Deal successfully reassigned to ${targetRep.name}. Fresh 48h SLA window started.`,
    sla: updatedSla
  };
}

/**
 * Concurrency-safe periodic scanner: Scans active deals for SLA breach and sends deduplicated alerts.
 */
async function scanAndAlertOverdueDeals({ tenantId = null, queryable = db } = {}) {
  const client = queryable.connect ? await queryable.connect() : null;
  const runner = client || queryable;
  let scannedCount = 0;
  let alertedCount = 0;

  try {
    if (client) await client.query('BEGIN');

    // Query active deals for overdue check (excluding closed/won/lost/cancelled)
    // Protected by FOR UPDATE SKIP LOCKED to prevent concurrent scanner workers from overlapping
    const dealsRes = await runner.query(`
      SELECT d.* 
      FROM deals d
      WHERE d.pipeline_stage NOT IN ('won', 'lost', 'cancelled', 'closed')
        AND ($1::text IS NULL OR d.tenant_id::text = $1::text)
      ORDER BY d.created_at ASC
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    `, [tenantId || null]);

    scannedCount = dealsRes.rows.length;

    for (const deal of dealsRes.rows) {
      const dealTenantId = String(deal.tenant_id);

      // Fetch impactful activities
      const actRes = await runner.query(
        `SELECT action, created_at FROM activities 
         WHERE tenant_id::text = $1::text 
           AND LOWER(entity_type) = 'deal' 
           AND entity_id::text = $2::text
           AND action = ANY($3::text[])`,
        [dealTenantId, deal.id, IMPACTFUL_ACTIVITY_ACTIONS]
      ).catch(() => ({ rows: [] }));

      // Fetch linked tasks
      const tasksRes = await runner.query(
        `SELECT t.id, t.status, t.created_at, t.updated_at, ts.is_final, ts.name as status_name
         FROM tasks t
         LEFT JOIN task_statuses ts ON t.status_id = ts.id
         WHERE t.tenant_id::text = $1::text
           AND t.parent_type = 'deal'
           AND t.parent_id::text = $2::text`,
        [dealTenantId, deal.id]
      ).catch(() => ({ rows: [] }));

      const sla = calculateDealSla(deal, actRes.rows, tasksRes.rows, new Date());

      if (sla.isOverdue) {
        const custom = typeof deal.custom_fields === 'object' && deal.custom_fields !== null 
          ? { ...deal.custom_fields } 
          : {};

        // 🚨 Strict Granular Alert Deduplication Guard:
        // Track rep and manager notification cycles independently to allow safe retries upon partial failure.
        const repAlerted = !deal.assigned_to || (custom.sla_alerted_rep_cycle_key === sla.cycleKey);
        const mgrAlerted = (custom.sla_alerted_mgr_cycle_key === sla.cycleKey);

        // If both rep and manager have already been notified for this exact cycle, skip!
        if (repAlerted && mgrAlerted) {
          continue;
        }

        let repNotifiedNow = repAlerted;
        let mgrNotifiedNow = mgrAlerted;

        // 1. Notify Assigned Sales Rep (only if NOT yet notified for this cycle)
        if (deal.assigned_to && !repAlerted) {
          try {
            const sent = await notificationService.notify({
              tenant_id: dealTenantId,
              branch_id: deal.branch_id,
              user_id: deal.assigned_to,
              type: 'DEAL_OVERDUE',
              title: '⚠️ متابعة مطلوبة: تجاوز مهلة الـ 48 ساعة للصفقة',
              message: `الصفقة "${deal.title}" تجاوزت مهلة المتابعة البيعية (${sla.overdueHours} ساعة تأخير). يرجى التواصل مع العميل وتحديث الموقف فوراً.`,
              link: `/deals?deal_id=${deal.id}`,
              metadata: { deal_id: deal.id, overdue_hours: sla.overdueHours }
            });
            if (sent) {
              repNotifiedNow = true;
              custom.sla_alerted_rep_cycle_key = sla.cycleKey;
            }
          } catch (err) {
            console.warn('[DealSla Notification Error - Rep]:', err.message);
          }
        }

        // 2. Notify Supervising Manager / Admins (only if NOT yet notified for this cycle)
        if (!mgrAlerted) {
          try {
            const sent = await notificationService.notifyRole({
              role: 'manager',
              type: 'DEAL_OVERDUE',
              title: '🚨 تصعيد إداري: صفقة متأخرة بدون متابعة (>48h)',
              message: `الصفقة "${deal.title}" متأخرة عن المتابعة البيعية. يمكنك إعادة إسناد الصفقة لمندوب آخر أو تمديد المهلة من شاشة الصفقات.`,
              tenant_id: dealTenantId,
              branch_id: deal.branch_id,
              link: `/deals?deal_id=${deal.id}&overdue=true`,
              metadata: { deal_id: deal.id, overdue_hours: sla.overdueHours, assigned_to: deal.assigned_to }
            });
            if (sent) {
              mgrNotifiedNow = true;
              custom.sla_alerted_mgr_cycle_key = sla.cycleKey;
            }
          } catch (err) {
            console.warn('[DealSla Notification Error - Manager]:', err.message);
          }
        }

        // Persist cycle keys if at least one notification completed or was updated
        if (repNotifiedNow || mgrNotifiedNow) {
          if (repNotifiedNow && mgrNotifiedNow) {
            custom.sla_alerted_cycle_key = sla.cycleKey;
          }
          custom.sla_last_alerted_at = new Date().toISOString();

          await runner.query(
            `UPDATE deals 
             SET custom_fields = $1::jsonb, updated_at = CURRENT_TIMESTAMP 
             WHERE id::text = $2::text AND tenant_id::text = $3::text`,
            [JSON.stringify(custom), deal.id, dealTenantId]
          );

          alertedCount++;
        }
      }
    }

    if (client) await client.query('COMMIT');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('⚠️ [DealSlaScanner Error]:', err.message);
  } finally {
    if (client) client.release();
  }

  return { scannedCount, alertedCount };
}

/**
 * Bootstraps the SLA scanner background timer using standard interval
 */
let slaScannerInterval = null;
function startSlaScanner(intervalMinutes = 15) {
  console.log(`⏱️ [DealSlaEngine] SLA scanner activated. Checking overdue deals every ${intervalMinutes} minutes.`);
  setTimeout(() => scanAndAlertOverdueDeals().catch(() => {}), 15000);
  slaScannerInterval = setInterval(() => scanAndAlertOverdueDeals().catch(() => {}), intervalMinutes * 60 * 1000);
  return slaScannerInterval;
}

module.exports = {
  IMPACTFUL_ACTIVITY_ACTIONS,
  calculateDealSla,
  getDealSlaStatus,
  extendDealSla,
  reassignDeal,
  scanAndAlertOverdueDeals,
  startSlaScanner
};
