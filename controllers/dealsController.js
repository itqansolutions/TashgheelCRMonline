const db = require('../config/db');
const accessScopeService = require('../services/accessScopeService');
const notificationService = require('../services/notificationService');
const { logAction, logCreate, logUpdate, logDelete, ACTIONS, LOG_LEVELS } = require('../services/loggerService');
const { logActivity } = require('../utils/activityLogger');
const { getTenantTemplate } = require('../services/templateService');
const templateAutomationService = require('../services/templateAutomationService');
const { checkDealPermission } = require('../middleware/dealPermission');
const dealSlaService = require('../services/dealSlaService');
// Ensure deal columns exist to prevent missing-column 500 crashes
let dealColumnsEnsured = false;
async function ensureDealColumns() {
  if (dealColumnsEnsured) return;
  const run = async (sql) => {
    try { await db.query(sql); } catch (e) { /* ignore – column already exists or handled */ }
  };
  await run(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)`);
  await run(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS unit_id VARCHAR(255)`);
  await run(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS probability INTEGER DEFAULT 0`);
  await run(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS expected_close_date DATE NULL`);
  await run(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS next_action VARCHAR(255) NULL`);
  await run(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) NULL`);
  await run(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS source_id VARCHAR(255) NULL`);
  await run(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'`);
  await run(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS product_id INTEGER`);
  await run(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS project_id INTEGER`);
  dealColumnsEnsured = true;
  console.log('[Deals] Column guard completed.');
}

// ─── Deal Lock (commercial integrity) ────────────────────────────────────────
// A deal becomes locked once it reaches its canonical final stage
// (Real Estate: 'Closed'; General: 'won') OR once it has originated a
// non-cancelled contract. Locked deals cannot change core commercial data,
// cannot leave the final stage and cannot be deleted. The only exit path is
// the audited Cancellation workflow (/api/re-cancellations).
const FINAL_DEAL_STAGES = ['closed', 'won'];
const isFinalStage = (stage) => FINAL_DEAL_STAGES.includes(String(stage || '').trim().toLowerCase());

const RESERVATION_STAGES = new Set(['reserved', 'reservation', 'حجز']);
const isReservationStage = (stage) => RESERVATION_STAGES.has(String(stage || '').trim().toLowerCase());

const isExplicitlyReservingDeal = (deal) => {
  if (!deal) return false;
  if (isReservationStage(deal.pipeline_stage)) return true;
  const cf = deal.custom_fields && typeof deal.custom_fields === 'object' ? deal.custom_fields : {};
  return cf.is_unit_reservation === true || String(cf.is_unit_reservation || '').toLowerCase() === 'true';
};

/**
 * Safely releases a unit from 'Reserved' back to 'Available' when a deal is lost or deleted.
 * Guarantees:
 * 1. Never modifies unit status unless its current status is 'Reserved' (protects Contracted, Handed Over, Under Dispute).
 * 2. Never releases a unit if another active (non-lost, non-cancelled) deal holds an active reservation on the unit.
 * 3. If the lost/deleted deal was the reserving deal (and no other deal holds a reservation), releases the unit
 *    even if other early-stage (Lead / Site Visit / Negotiation) deals exist on the same unit.
 */
async function releaseUnitIfReservedByDeal(queryable, { unitId, dealRow, tenantId }) {
  if (!unitId || !dealRow) return { released: false, reason: 'missing_unit_or_deal' };

  const unitRes = await queryable.query(
    `SELECT id, status FROM re_units
     WHERE id::text = $1::text AND tenant_id::text = $2::text
     FOR UPDATE`,
    [String(unitId), String(tenantId)]
  );
  if (unitRes.rows.length === 0) {
    return { released: false, reason: 'unit_not_found' };
  }

  const currentStatus = String(unitRes.rows[0].status || '').trim().toLowerCase();
  if (currentStatus !== 'reserved') {
    return { released: false, reason: `unit_status_is_${currentStatus}` };
  }

  const otherActiveRes = await queryable.query(
    `SELECT id, pipeline_stage, custom_fields FROM deals
     WHERE unit_id::text = $1::text
       AND id::text != $2::text
       AND tenant_id::text = $3::text
       AND LOWER(COALESCE(pipeline_stage, '')) NOT IN ('lost', 'cancelled')`,
    [String(unitId), String(dealRow.id), String(tenantId)]
  );

  const otherActiveDeals = otherActiveRes.rows || [];
  const hasOtherExplicitReservation = otherActiveDeals.some(d => isExplicitlyReservingDeal(d));
  if (hasOtherExplicitReservation) {
    return { released: false, reason: 'other_deal_holds_reservation' };
  }

  const wasExplicitlyReserving = isExplicitlyReservingDeal(dealRow);
  const shouldRelease = wasExplicitlyReserving || otherActiveDeals.length === 0;
  if (!shouldRelease) {
    return { released: false, reason: 'lost_deal_was_not_reservation_holder' };
  }

  const upd = await queryable.query(
    `UPDATE re_units
     SET status = 'Available',
         reservation_expires_at = NULL,
         reservation_extended_at = NULL,
         reservation_extended_by = NULL,
         reservation_extension_count = 0,
         updated_at = CURRENT_TIMESTAMP
     WHERE id::text = $1::text
       AND tenant_id::text = $2::text
       AND LOWER(status) = 'reserved'
     RETURNING id, status`,
    [String(unitId), String(tenantId)]
  );

  return { released: upd.rows.length > 0 };
}

async function getDealLockState(queryable, deal, tenantId) {
  if (isFinalStage(deal.pipeline_stage)) {
    return { locked: true, reason: `Deal is ${deal.pipeline_stage}` };
  }
  try {
    const c = await queryable.query(
      `SELECT contract_number, status FROM re_contracts
       WHERE deal_id::text = $1::text AND tenant_id::text = $2::text
         AND COALESCE(status, '') <> 'Cancelled'
       LIMIT 1`,
      [deal.id, tenantId]
    );
    if (c.rows.length > 0) {
      return { locked: true, reason: `Deal has contract ${c.rows[0].contract_number || ''} (${c.rows[0].status})`.trim() };
    }
  } catch (e) {
    // re_contracts may not exist for General tenants – not locked by contract
  }
  return { locked: false, reason: null };
}

const normScalar = (v) => (v === undefined || v === null || v === '') ? '' : String(v);
// Operational (non-commercial) custom fields that stay editable on locked deals
const NON_COMMERCIAL_FIELDS = new Set(['visit_date', 'visit_result', 'visit_notes', 'is_unit_reservation', 'reserved_at']);
const stableJson = (obj) => {
  const src = (obj && typeof obj === 'object') ? obj : {};
  const out = {};
  Object.keys(src).sort().forEach(k => {
    if (NON_COMMERCIAL_FIELDS.has(k)) return;
    const raw = src[k] && typeof src[k] === 'object' ? JSON.stringify(src[k]) : src[k];
    const n = normScalar(raw);
    if (n !== '') out[k] = n;
  });
  return JSON.stringify(out);
};



// @desc    Get all deals
// @route   GET /api/deals
// @access  Private
exports.getDeals = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;

  try {
    await ensureDealColumns();

    // Check deal.view_overdue if overdue or stalled filter requested
    if (req.query.overdue === 'true' || req.query.stalled === 'true') {
      const canViewOverdue = await checkDealPermission(req.user.id, tenant_id, 'deal.view_overdue', req.user.role);
      if (!canViewOverdue) {
        return res.status(403).json({
          status: 'error',
          code: 'PERMISSION_DENIED',
          message: 'Permission denied: "deal.view_overdue" is required to view overdue or stalled deals.',
          required_permission: 'deal.view_overdue'
        });
      }
    }

    const scope = await accessScopeService.buildScopePredicate({
      user: req.user,
      tableAlias: 'd',
      assigneeCol: 'assigned_to',
      paramIndex: 3
    });

    let whereClause = `d.tenant_id::text = $1::text AND ($2::text IS NULL OR d.branch_id::text = $2::text OR d.branch_id IS NULL)`;
    const params = [tenant_id, branch_id];

    if (scope.sql && scope.sql !== '1=1') {
      whereClause += ` AND ${scope.sql}`;
      params.push(...scope.params);
    }

    if (req.query.overdue === 'true') {
      whereClause += ` AND LOWER(COALESCE(d.pipeline_stage, '')) NOT IN ('won', 'lost', 'cancelled', 'closed', 'closed won', 'closed lost')
        AND (
          CURRENT_TIMESTAMP > COALESCE(
            NULLIF(d.custom_fields->>'sla_extended_until', '')::timestamptz,
            GREATEST(
              d.created_at,
              COALESCE(NULLIF(d.custom_fields->>'reassigned_at', '')::timestamptz, d.created_at),
              COALESCE((
                SELECT MAX(a.created_at) FROM activities a 
                WHERE a.tenant_id::text = d.tenant_id::text 
                  AND (
                    (LOWER(a.entity_type) = 'deal' AND a.entity_id::text = d.id::text)
                    OR (d.client_id IS NOT NULL AND LOWER(a.entity_type) = 'customer' AND a.entity_id::text = d.client_id::text)
                  )
                  AND a.action IN ('called', 'whatsapp', 'meeting', 'email_sent', 'visited', 'follow_up')
              ), d.created_at),
              COALESCE((
                SELECT MAX(COALESCE(t.updated_at, t.created_at)) FROM tasks t
                LEFT JOIN task_statuses ts ON t.status_id = ts.id
                WHERE t.tenant_id::text = d.tenant_id::text
                  AND t.parent_type IN ('deal', 'deals')
                  AND t.parent_id::text = d.id::text
                  AND (ts.is_final = true OR t.status = 'completed' OR ts.name ILIKE '%complete%' OR ts.name ILIKE '%done%')
              ), d.created_at)
            ) + INTERVAL '48 hours'
          )
        )`;
    }

    const result = await db.query(`
      SELECT 
        d.*, 
        c.name as client_name, 
        c.company_name as client_company,
        p.name as product_name,
        u.name as assigned_to_name,
        ru.project_name as unit_project,
        ru.unit_number as unit_number,
        ru.name as unit_name,
        ru.status as unit_status,
        ru.reservation_expires_at as unit_reservation_expires_at,
        ru.reservation_extended_at as unit_reservation_extended_at,
        ru.reservation_extension_count as unit_reservation_extension_count,
        rp.next_payment_date,
        rp.status as payment_status,
        COALESCE(fv.actual_paid, rp.paid_amount, 0) as paid_amount,
        rp.total_amount as payment_total,
        (d.pipeline_stage NOT IN ('won', 'lost', 'cancelled', 'closed')
         AND CURRENT_TIMESTAMP > COALESCE(
            NULLIF(d.custom_fields->>'sla_extended_until', '')::timestamptz,
            GREATEST(
              d.created_at,
              COALESCE(NULLIF(d.custom_fields->>'reassigned_at', '')::timestamptz, d.created_at),
              COALESCE((
                SELECT MAX(a.created_at) FROM activities a 
                WHERE a.tenant_id::text = d.tenant_id::text 
                  AND LOWER(a.entity_type) = 'deal' 
                  AND a.entity_id::text = d.id::text 
                  AND a.action IN ('called', 'whatsapp', 'meeting', 'email_sent', 'visited', 'follow_up')
              ), d.created_at),
              COALESCE((
                SELECT MAX(COALESCE(t.updated_at, t.created_at)) FROM tasks t
                LEFT JOIN task_statuses ts ON t.status_id = ts.id
                WHERE t.tenant_id::text = d.tenant_id::text
                  AND LOWER(t.parent_type) IN ('deal', 'deals')
                  AND t.parent_id::text = d.id::text
                  AND (ts.is_final = true OR t.status = 'completed' OR ts.name ILIKE '%complete%' OR ts.name ILIKE '%done%')
              ), d.created_at)
            ) + INTERVAL '48 hours'
          )
        ) as is_overdue
      FROM deals d
      LEFT JOIN customers c ON d.client_id::text = c.id::text AND d.tenant_id::text = c.tenant_id::text
      LEFT JOIN products p ON d.product_id::text = p.id::text AND d.tenant_id::text = p.tenant_id::text
      LEFT JOIN users u ON d.assigned_to::text = u.id::text AND d.tenant_id::text = u.tenant_id::text
      LEFT JOIN re_units ru ON d.unit_id::text = ru.id::text AND d.tenant_id::text = ru.tenant_id::text
      LEFT JOIN re_payments_mvp rp ON d.id::text = rp.deal_id::text AND d.tenant_id::text = rp.tenant_id::text
      LEFT JOIN (
        SELECT deal_id, SUM(amount) as actual_paid
        FROM finance_vouchers
        WHERE tenant_id::text = $1::text
        AND voucher_type = 'receipt'
        AND (COALESCE(status, 'active') != 'cancelled')
        AND deal_id IS NOT NULL
        GROUP BY deal_id
      ) fv ON d.id::text = fv.deal_id::text
      WHERE ${whereClause}
      ORDER BY d.created_at DESC
    `, params);

    const templateConfig = await getTenantTemplate(tenant_id);

    res.json({ 
      status: 'success', 
      data: result.rows,
      template_config: templateConfig 
    });
  } catch (err) {
    console.error('[Deals API Error]', err.message);
    res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  }
};

// @desc    Get single deal
// @route   GET /api/deals/:id
// @access  Private
exports.getDealById = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;

  try {
    await ensureDealColumns();

    // Enforce row-level scope for single deal view
    const scope = await accessScopeService.buildScopePredicate({
      user: req.user,
      tableAlias: 'd',
      assigneeCol: 'assigned_to',
      paramIndex: 4
    });

    let whereClause = `d.id = $1 AND d.tenant_id::text = $2::text AND ($3::text IS NULL OR d.branch_id::text = $3::text OR d.branch_id IS NULL)`;
    const params = [req.params.id, tenant_id, branch_id];

    if (scope.sql && scope.sql !== '1=1') {
      whereClause += ` AND ${scope.sql}`;
      params.push(...scope.params);
    }

    const result = await db.query(`
      SELECT 
        d.*, 
        c.name as client_name,
        c.phone as client_phone,
        c.company_name as client_company,
        u.name as assigned_to_name,
        u.email as assigned_to_email,
        p.name as product_name,
        ru.project_name as unit_project,
        ru.unit_number as unit_number,
        ru.name as unit_name,
        ru.price as unit_price,
        ru.status as unit_status,
        ru.reservation_expires_at as unit_reservation_expires_at,
        ru.reservation_extended_at as unit_reservation_extended_at,
        ru.reservation_extension_count as unit_reservation_extension_count,
        rp.next_payment_date,
        rp.status as payment_status,
        COALESCE(fv.actual_paid, rp.paid_amount, 0) as paid_amount,
        rp.total_amount as payment_total
      FROM deals d 
      LEFT JOIN customers c ON d.client_id::text = c.id::text AND d.tenant_id::text = c.tenant_id::text
      LEFT JOIN users u ON d.assigned_to::text = u.id::text AND d.tenant_id::text = u.tenant_id::text
      LEFT JOIN products p ON d.product_id::text = p.id::text AND d.tenant_id::text = p.tenant_id::text 
      LEFT JOIN re_units ru ON d.unit_id::text = ru.id::text AND d.tenant_id::text = ru.tenant_id::text
      LEFT JOIN re_payments_mvp rp ON d.id::text = rp.deal_id::text AND d.tenant_id::text = rp.tenant_id::text
      LEFT JOIN (
        SELECT deal_id, SUM(amount) as actual_paid
        FROM finance_vouchers
        WHERE tenant_id::text = $2::text
        AND voucher_type = 'receipt'
        AND (COALESCE(status, 'active') != 'cancelled')
        AND deal_id IS NOT NULL
        GROUP BY deal_id
      ) fv ON d.id::text = fv.deal_id::text
      WHERE ${whereClause}
    `, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }
    const deal = result.rows[0];
    const sla = await dealSlaService.getDealSlaStatus(deal.id, tenant_id).catch(() => null);
    res.json({ status: 'success', data: { ...deal, sla } });
  } catch (err) {
    console.error('[Deal Detail Error]', err.message);
    res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  }
};

// @desc    Create deal
// @route   POST /api/deals
// @access  Private
exports.createDeal = async (req, res) => {
  const { title, value, pipeline_stage, client_id, product_id, project_id, assigned_to, custom_fields, unit_id, probability, expected_close_date, next_action, source_type, source_id } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;

  try {
    await ensureDealColumns();

    if (!title || !String(title).trim()) {
      return res.status(400).json({ status: 'error', message: 'Deal title is required.' });
    }

    // DEFINITIVE SANITIZATION: Prevent 500 Server Error for Empty String / Type mismatches
    const cleanClientId = (client_id && client_id !== '') ? (!isNaN(client_id) ? parseInt(client_id) : client_id) : null;
    const cleanProductId = (product_id && product_id !== '' && !isNaN(product_id)) ? parseInt(product_id) : null;
    const cleanProjectId = (project_id && project_id !== '' && !isNaN(project_id)) ? parseInt(project_id) : null;
    const cleanUnitId = (unit_id && unit_id !== '') ? String(unit_id) : null;
    const cleanAssignedTo = (assigned_to !== undefined && assigned_to !== null && String(assigned_to).trim() !== '') 
      ? assigned_to 
      : (req.user?.id || null);
    let cleanValue = (value !== undefined && value !== null && value !== '' && !isNaN(Number(value))) ? Number(value) : 0;
    const cleanProbability = (probability !== undefined && probability !== null && probability !== '' && !isNaN(probability)) ? Math.min(100, Math.max(0, parseInt(probability))) : 0;

    let cleanExpectedDate = null;
    if (expected_close_date && typeof expected_close_date === 'string' && expected_close_date.trim() !== '') {
      const d = new Date(expected_close_date);
      if (!isNaN(d.getTime())) {
        cleanExpectedDate = expected_close_date.split('T')[0];
      }
    }

    const cleanSourceType = (source_type && source_type !== '') ? source_type : null;
    const cleanSourceId = (source_id && source_id !== '') ? String(source_id) : null;
    const cleanCustomFields = (custom_fields && typeof custom_fields === 'object') ? custom_fields : {};

    // If assigning to a different user, require deal.reassign
    if (assigned_to && cleanAssignedTo && String(cleanAssignedTo) !== String(req.user.id)) {
      const canReassign = await checkDealPermission(req.user.id, tenant_id, 'deal.reassign', req.user.role);
      if (!canReassign) {
        return res.status(403).json({
          status: 'error',
          code: 'PERMISSION_DENIED',
          message: 'Permission denied: "deal.reassign" is required to assign deals to other users.',
          required_permission: 'deal.reassign'
        });
      }
    }

    // Tenant Isolation Guard: verify assigned user exists within current tenant
    if (assigned_to && cleanAssignedTo) {
      const userCheck = await db.query(
        'SELECT id FROM users WHERE id::text = $1::text AND tenant_id::text = $2::text LIMIT 1',
        [cleanAssignedTo, tenant_id]
      );
      if (userCheck.rows.length === 0) {
        return res.status(400).json({
          status: 'error',
          code: 'INVALID_ASSIGNEE',
          message: 'The assigned user does not exist or does not belong to this organization.'
        });
      }
    }

    // Phase 8: Task to Deal Conversion Validation & Auto-Transition
    if (cleanSourceType === 'task' && cleanSourceId) {
      try {
        const taskRes = await db.query(
            "SELECT t.id, COALESCE(ts.can_make_deal, true) as can_make_deal " +
            "FROM tasks t " +
            "LEFT JOIN task_statuses ts ON t.status_id = ts.id " +
            "WHERE t.id = $1 AND t.tenant_id::text = $2::text AND ($3::text IS NULL OR t.branch_id::text = $3::text OR t.branch_id IS NULL)",
            [cleanSourceId, tenant_id, branch_id]
        );

        if (taskRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Source task not found.' });
        }
        if (taskRes.rows[0].can_make_deal === false) {
            return res.status(400).json({ status: 'error', message: 'This task status does not permit conversion to a deal.' });
        }
      } catch (taskErr) {
        console.warn('[Deal Task Conversion Check Warning]:', taskErr.message);
      }
    }

    // ── ATOMIC TRANSACTION FOR RESERVATION & DEAL CREATION ──
    const client = await db.connect();
    let newDeal;
    let reservationHours = 48;
    const shouldReserveOnCreate = Boolean(
      req.body.reserve_unit === true ||
      req.body.reserve_unit === 'true' ||
      isReservationStage(pipeline_stage)
    );

    try {
      await client.query('BEGIN');

      // 1. Real Estate Concurrency Gate: Lock unit row with SELECT ... FOR UPDATE
      if (cleanUnitId) {
        const unitLockRes = await client.query(
          `SELECT id, status, project_name, unit_number, price, branch_id 
           FROM re_units 
           WHERE id::text = $1::text AND tenant_id::text = $2::text 
           FOR UPDATE`,
          [cleanUnitId, String(tenant_id)]
        );

        if (unitLockRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ status: 'error', message: 'Unit not found.' });
        }

        const targetUnit = unitLockRes.rows[0];

        // Branch check: If unit belongs to a specific branch, user must belong to that branch (unless admin)
        if (targetUnit.branch_id && branch_id && String(targetUnit.branch_id) !== String(branch_id) && req.user?.role !== 'admin') {
          await client.query('ROLLBACK');
          return res.status(403).json({ status: 'error', message: 'Unauthorized: Unit belongs to a different branch.' });
        }

        if (targetUnit.status?.toLowerCase() !== 'available') {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            status: 'error',
            code: 'UNIT_NOT_AVAILABLE',
            message: `This unit is already ${targetUnit.status}. Please select an Available unit.` 
          });
        }

        // If deal value was not set explicitly, default to unit price
        if (cleanValue === 0 && targetUnit.price) {
          cleanValue = Number(targetUnit.price);
        }

        if (shouldReserveOnCreate) {
          // Fetch custom reservation hours setting
          try {
            const settingsRes = await client.query("SELECT value FROM settings WHERE key = 'reservation_duration_hours'");
            if (settingsRes.rows.length > 0 && !isNaN(settingsRes.rows[0].value)) {
              reservationHours = parseInt(settingsRes.rows[0].value);
            }
          } catch (e) {
            console.error('Settings fetch error:', e.message);
          }

          // Update unit to Reserved inside the transaction
          await client.query(
            `UPDATE re_units 
             SET status = 'Reserved', 
                 reservation_expires_at = CURRENT_TIMESTAMP + INTERVAL '${reservationHours} hours',
                 reservation_extended_at = NULL,
                 reservation_extended_by = NULL,
                 reservation_extension_count = 0,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id::text = $1::text AND tenant_id::text = $2::text`,
            [cleanUnitId, String(tenant_id)]
          );

          cleanCustomFields.is_unit_reservation = true;
          cleanCustomFields.reserved_at = new Date().toISOString();
        }
      }

      // 2. Insert Deal inside transaction
      const result = await client.query(
        'INSERT INTO deals (title, value, pipeline_stage, client_id, product_id, project_id, assigned_to, tenant_id, branch_id, custom_fields, unit_id, probability, expected_close_date, next_action, source_type, source_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *',
        [String(title).trim(), cleanValue, pipeline_stage || 'discovery', cleanClientId, cleanProductId, cleanProjectId, cleanAssignedTo, tenant_id, branch_id, cleanCustomFields, cleanUnitId, cleanProbability, cleanExpectedDate, next_action || '', cleanSourceType, cleanSourceId]
      );
      newDeal = result.rows[0];

      // Auto Transition Task if converted (inside transaction)
      if (cleanSourceType === 'task' && cleanSourceId) {
        try {
          const statusRes = await client.query('SELECT id FROM task_statuses WHERE tenant_id::text = $1::text AND (name ILIKE $2 OR is_final = true) ORDER BY is_final DESC LIMIT 1', [tenant_id, '%converted%']);
          if (statusRes.rows.length > 0) {
            const convertedStatusId = statusRes.rows[0].id;
            await client.query('UPDATE tasks SET status_id = $1 WHERE id = $2', [convertedStatusId, cleanSourceId]);
          }
        } catch (stErr) {
          console.warn('[Task Status Transition Warning]:', stErr.message);
        }
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

    // 3. Post-commit side effects: Audit Logging & Notifications
    if (cleanUnitId && shouldReserveOnCreate) {
      logAction({ req, action: ACTIONS.AUTOMATION, entityType: 'Unit', entityId: cleanUnitId, details: { deal_id: newDeal.id, status_change: 'Reserved', expires_in_hours: reservationHours } });
    }

    logCreate(req, 'Deal', newDeal.id, newDeal);

    await logActivity(tenant_id, req.user, 'deal', newDeal.id, 'created', { 
        title: { to: title },
        value: { to: cleanValue },
        pipeline_stage: { to: pipeline_stage || 'discovery' }
    });

    if (cleanSourceType === 'task' && cleanSourceId) {
      logAction({ req, action: ACTIONS.AUTOMATION, entityType: 'Task', entityId: cleanSourceId, details: { deal_id: newDeal.id, status_change: 'Converted' } });
    }

    // Phase 7 Workflow Engine: Auto-Assign if no explicit assignee was given
    if (!assigned_to) {
        const workflowEngine = require('../services/workflowEngine');
        workflowEngine.onDealCreated({
            deal_id: newDeal.id,
            deal_title: newDeal.title,
            tenant_id,
            branch_id
        }).catch(e => console.error('[Workflow] onDealCreated error:', e.message));

        // Phase 3: DB-driven rules for DEAL_CREATED
        const { runRules } = require('../services/ruleEngine');
        runRules('DEAL_CREATED', {
            tenant_id,
            branch_id,
            deal_id: newDeal.id,
            deal_title: newDeal.title,
            pipeline_stage: newDeal.pipeline_stage,
            value: newDeal.value,
            _entity_type: 'deals',
            _entity_id: newDeal.id,
            _summary: `New deal "${newDeal.title}" created.`,
            _link: '/deals'
        }).catch(e => console.error('[RuleEngine] DEAL_CREATED error:', e.message));
    }

    // Assignment notification
    if (cleanAssignedTo && String(cleanAssignedTo) !== String(req.user.id)) {
      notificationService.notifyAssignment({
        tenantId: tenant_id,
        branchId: branch_id,
        recipientUserId: cleanAssignedTo,
        assignedByUserId: req.user.id,
        assignedByName: req.user.name,
        entityType: 'Deal',
        entityName: newDeal.title,
        link: '/deals'
      }).catch(e => console.warn('[Deal Assignment Notification Warning]:', e.message));
    }

    res.status(201).json({ status: 'success', data: newDeal });

  } catch (err) {
    console.error('[Deal Create Error]', err);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to create deal' });
  }
};

// @desc    Update deal
// @route   PUT /api/deals/:id
// @access  Private
exports.updateDeal = async (req, res) => {
  const { title, value, pipeline_stage, client_id, product_id, project_id, assigned_to, custom_fields, unit_id, probability, expected_close_date, next_action, source_type, source_id } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;

  try {
    await ensureDealColumns();

    // 1. Get old version for logging & security check (Row-level Scope + Triple Isolation)
    const scope = await accessScopeService.buildScopePredicate({
      user: req.user,
      tableAlias: 'deals',
      assigneeCol: 'assigned_to',
      paramIndex: 4
    });
    let oldWhere = 'id = $1 AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)';
    const oldParams = [req.params.id, tenant_id, branch_id];
    if (scope.sql && scope.sql !== '1=1') {
      oldWhere += ` AND ${scope.sql}`;
      oldParams.push(...scope.params);
    }

    const oldResult = await db.query(
      `SELECT * FROM deals WHERE ${oldWhere}`, 
      oldParams
    );
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }
    const oldData = oldResult.rows[0];

    const requestedUnitId = (unit_id !== undefined && unit_id !== null && String(unit_id).trim() !== '') ? String(unit_id).trim() : null;
    const isChangingUnit = Boolean(oldData.unit_id && requestedUnitId && String(oldData.unit_id) !== String(requestedUnitId));
    if (isChangingUnit && (isExplicitlyReservingDeal(oldData) || isFinalStage(oldData.pipeline_stage))) {
      return res.status(400).json({
        status: 'error',
        code: 'UNIT_ALREADY_LINKED',
        message: 'Cannot change a linked property unit after the deal has been reserved or closed.'
      });
    }
    const isLinkingUnit = (!oldData.unit_id && Boolean(requestedUnitId)) || isChangingUnit;

    // DEFINITIVE SANITIZATION
    const cleanClientId = (client_id !== undefined && client_id !== null && client_id !== '') ? (!isNaN(client_id) ? parseInt(client_id) : client_id) : oldData.client_id;
    const cleanProductId = (product_id !== undefined && product_id !== null && product_id !== '' && !isNaN(product_id)) ? parseInt(product_id) : (product_id === '' || product_id === null ? null : oldData.product_id);
    const cleanProjectId = (project_id !== undefined && project_id !== null && project_id !== '' && !isNaN(project_id)) ? parseInt(project_id) : (project_id === '' || project_id === null ? null : oldData.project_id);
    const cleanAssignedTo = (assigned_to && assigned_to !== '')
      ? (!isNaN(assigned_to) ? parseInt(assigned_to) : assigned_to)
      : (oldData.assigned_to || (assigned_to === '' ? req.user.id : null));
    let cleanValue = (value !== undefined && value !== null && value !== '' && !isNaN(Number(value))) ? Number(value) : oldData.value;
    const cleanProbability = (probability !== undefined && probability !== null && probability !== '' && !isNaN(probability)) ? Math.min(100, Math.max(0, parseInt(probability))) : (oldData.probability || 0);

    let cleanExpectedDate = oldData.expected_close_date;
    if (expected_close_date !== undefined) {
      if (expected_close_date && typeof expected_close_date === 'string' && expected_close_date.trim() !== '') {
        const d = new Date(expected_close_date);
        cleanExpectedDate = !isNaN(d.getTime()) ? expected_close_date.split('T')[0] : null;
      } else {
        cleanExpectedDate = null;
      }
    }

    const cleanSourceType = (source_type !== undefined) ? (source_type || null) : oldData.source_type;
    const cleanSourceId = (source_id !== undefined) ? (source_id ? String(source_id) : null) : oldData.source_id;
    const cleanCustomFields = (custom_fields && typeof custom_fields === 'object') ? { ...oldData.custom_fields, ...custom_fields } : (oldData.custom_fields || {});

    // ── Granular Deal Permissions check against modified fields ──
    const isChangingField = (bodyVal, oldVal) => {
      if (bodyVal === undefined) return false;
      return normScalar(bodyVal) !== normScalar(oldVal);
    };
    const isChangingJson = (bodyVal, oldVal) => {
      if (bodyVal === undefined) return false;
      return stableJson(bodyVal) !== stableJson(oldVal);
    };

    const changesDetails =
      isLinkingUnit ||
      isChangingField(title, oldData.title) ||
      (value !== undefined && Number(value || 0) !== Number(oldData.value || 0)) ||
      isChangingField(client_id, oldData.client_id) ||
      isChangingField(product_id, oldData.product_id) ||
      isChangingField(project_id, oldData.project_id) ||
      (probability !== undefined && Number(probability || 0) !== Number(oldData.probability || 0)) ||
      isChangingField(next_action, oldData.next_action) ||
      isChangingField(source_type, oldData.source_type) ||
      isChangingField(source_id, oldData.source_id) ||
      (expected_close_date !== undefined && normScalar(cleanExpectedDate) !== normScalar(oldData.expected_close_date ? String(oldData.expected_close_date).split('T')[0] : null)) ||
      isChangingJson(custom_fields, oldData.custom_fields);

    if (changesDetails) {
      const canEdit = await checkDealPermission(req.user.id, tenant_id, 'deal.edit_details', req.user.role);
      if (!canEdit) {
        return res.status(403).json({
          status: 'error',
          code: 'PERMISSION_DENIED',
          message: 'Permission denied: "deal.edit_details" is required to modify deal details.',
          required_permission: 'deal.edit_details'
        });
      }
    }

    const changesAssignee = (assigned_to !== undefined && oldData.assigned_to && normScalar(cleanAssignedTo) !== normScalar(oldData.assigned_to));
    if (changesAssignee) {
      const canReassign = await checkDealPermission(req.user.id, tenant_id, 'deal.reassign', req.user.role);
      if (!canReassign) {
        return res.status(403).json({
          status: 'error',
          code: 'PERMISSION_DENIED',
          message: 'Permission denied: "deal.reassign" is required to reassign deals.',
          required_permission: 'deal.reassign'
        });
      }
    }

    // Tenant Isolation Guard: verify assigned user exists within current tenant
    if (assigned_to !== undefined && assigned_to !== null && String(assigned_to).trim() !== '' && cleanAssignedTo) {
      const userCheck = await db.query(
        'SELECT id FROM users WHERE id::text = $1::text AND tenant_id::text = $2::text LIMIT 1',
        [cleanAssignedTo, tenant_id]
      );
      if (userCheck.rows.length === 0) {
        return res.status(400).json({
          status: 'error',
          code: 'INVALID_ASSIGNEE',
          message: 'The assigned user does not exist or does not belong to this organization.'
        });
      }
    }

    const changesStage = (pipeline_stage !== undefined && normScalar(pipeline_stage).toLowerCase() !== normScalar(oldData.pipeline_stage).toLowerCase());
    if (changesStage) {
      const canUpdateStage = await checkDealPermission(req.user.id, tenant_id, 'deal.update_stage', req.user.role);
      if (!canUpdateStage) {
        return res.status(403).json({
          status: 'error',
          code: 'PERMISSION_DENIED',
          message: 'Permission denied: "deal.update_stage" is required to change deal stage.',
          required_permission: 'deal.update_stage'
        });
      }
    }

    // ── Deal Lock enforcement ──
    const lock = await getDealLockState(db, oldData, tenant_id);
    if (lock.locked) {
      const violations = [];
      if (isLinkingUnit) violations.push('unit');
      if (normScalar(cleanClientId) !== normScalar(oldData.client_id)) violations.push('customer');
      if (Number(cleanValue || 0) !== Number(oldData.value || 0)) violations.push('deal value');
      if (normScalar(cleanAssignedTo) !== normScalar(oldData.assigned_to)) violations.push('owner');
      if (normScalar(cleanProductId) !== normScalar(oldData.product_id)) violations.push('product');
      if (normScalar(cleanProjectId) !== normScalar(oldData.project_id)) violations.push('project');
      if (stableJson(cleanCustomFields) !== stableJson(oldData.custom_fields)) violations.push('commercial terms');
      const newStage = pipeline_stage ? String(pipeline_stage).trim().toLowerCase() : String(oldData.pipeline_stage || '').toLowerCase();
      const oldStageLc = String(oldData.pipeline_stage || '').toLowerCase();
      if (newStage !== oldStageLc && (isFinalStage(oldStageLc) || newStage === 'lost')) violations.push('stage');
      if (violations.length > 0) {
        return res.status(409).json({
          status: 'error',
          code: 'DEAL_LOCKED',
          message: `${lock.reason}. Locked fields cannot be changed: ${violations.join(', ')}. Use the Cancellation workflow to reverse a closed deal.`
        });
      }
    }

    let cleanUnitId = oldData.unit_id || null;
    let cleanTitle = title || oldData.title;
    if (isLinkingUnit) {
      const unitCheck = await db.query(
        `SELECT id, status, project_name, unit_number, name, price, branch_id
         FROM re_units
         WHERE id::text = $1::text AND tenant_id::text = $2::text`,
        [requestedUnitId, String(tenant_id)]
      );
      if (unitCheck.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Unit not found.' });
      }
      const targetUnit = unitCheck.rows[0];
      if (targetUnit.branch_id && branch_id && String(targetUnit.branch_id) !== String(branch_id) && req.user?.role !== 'admin') {
        return res.status(403).json({ status: 'error', message: 'Unauthorized: Unit belongs to a different branch.' });
      }
      if (String(targetUnit.status || '').trim().toLowerCase() !== 'available') {
        return res.status(400).json({
          status: 'error',
          code: 'UNIT_NOT_AVAILABLE',
          message: `This unit is already ${targetUnit.status || 'unavailable'}. Please select an Available unit.`
        });
      }
      cleanUnitId = String(targetUnit.id);
      const unitPrice = Number(targetUnit.price || 0);
      if (unitPrice > 0 && (Number(cleanValue || 0) === 0 || isChangingUnit)) {
        cleanValue = unitPrice;
      }
      if (targetUnit.project_name && !cleanCustomFields.project) {
        cleanCustomFields.project = targetUnit.project_name;
      }
      const unitRefLabel = targetUnit.unit_number || targetUnit.name;
      if (unitRefLabel && cleanTitle && cleanTitle.startsWith('Property Finder:') && !cleanTitle.includes(' - ')) {
        cleanTitle = `${cleanTitle} - ${unitRefLabel}`;
      }
    }

    const effectiveNextStage = pipeline_stage || oldData.pipeline_stage;
    const isMovingToLost = changesStage && ['lost', 'closed lost'].includes(String(effectiveNextStage || '').trim().toLowerCase());
    const isMovingToSiteVisit = changesStage && String(effectiveNextStage || '').trim().toLowerCase() === 'site visit';
    const isRequestingReserve = Boolean(
      req.body.reserve_unit === true ||
      req.body.reserve_unit === 'true' ||
      (changesStage && isReservationStage(effectiveNextStage))
    );

    if (isMovingToSiteVisit && !cleanCustomFields.visit_date) {
      cleanCustomFields.visit_date = new Date().toISOString().slice(0, 16);
    }

    if (cleanUnitId && isRequestingReserve) {
      const uRes = await db.query(
        `SELECT id, status, branch_id FROM re_units WHERE id::text = $1::text AND tenant_id::text = $2::text`,
        [String(cleanUnitId), String(tenant_id)]
      );
      if (uRes.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Unit not found.' });
      }
      const uRow = uRes.rows[0];
      const uStatus = String(uRow.status || '').trim().toLowerCase();
      const alreadyReservedByThisDeal = uStatus === 'reserved' && isExplicitlyReservingDeal(oldData);
      if (uStatus !== 'available' && !alreadyReservedByThisDeal) {
        return res.status(409).json({
          status: 'error',
          code: 'UNIT_NOT_AVAILABLE',
          message: `This unit is already ${uRow.status || 'unavailable'}. Only an Available unit can be reserved.`
        });
      }
      if (uStatus === 'available') {
        await db.query(
          `UPDATE re_units
           SET status = 'Reserved',
               reservation_expires_at = CURRENT_TIMESTAMP + INTERVAL '48 hours',
               reservation_extended_at = NULL,
               reservation_extended_by = NULL,
               reservation_extension_count = 0,
               updated_at = CURRENT_TIMESTAMP
           WHERE id::text = $1::text AND tenant_id::text = $2::text AND LOWER(status) = 'available'`,
          [String(cleanUnitId), String(tenant_id)]
        );
      }
      cleanCustomFields.is_unit_reservation = true;
      cleanCustomFields.reserved_at = cleanCustomFields.reserved_at || new Date().toISOString();
    } else if (isMovingToLost && cleanCustomFields.is_unit_reservation) {
      cleanCustomFields.is_unit_reservation = false;
    }

    // 2. Perform Update (With phase 2 metrics)
    const result = await db.query(
      `UPDATE deals 
       SET title = $1, value = $2, pipeline_stage = $3, client_id = $4, product_id = $5, project_id = $6, assigned_to = $7, custom_fields = $8, probability = $9, expected_close_date = $10, next_action = $11, source_type = $12, source_id = $13, unit_id = COALESCE($17, unit_id), updated_at = CURRENT_TIMESTAMP 
       WHERE id = $14 AND tenant_id::text = $15::text AND ($16::text IS NULL OR branch_id::text = $16::text OR branch_id IS NULL) RETURNING *`,
      [cleanTitle, cleanValue, effectiveNextStage, cleanClientId, cleanProductId, cleanProjectId, cleanAssignedTo, cleanCustomFields, cleanProbability, cleanExpectedDate, next_action !== undefined ? next_action : (oldData.next_action || ''), cleanSourceType, cleanSourceId, req.params.id, tenant_id, branch_id, cleanUnitId]
    );

    if (isMovingToLost && cleanUnitId) {
      await releaseUnitIfReservedByDeal(db, {
        unitId: cleanUnitId,
        dealRow: oldData,
        tenantId: tenant_id
      });
    }

    if (isLinkingUnit && oldData.source_type === 'property_finder' && oldData.source_id) {
      await db.query(
        `UPDATE property_finder_lead_mappings
         SET unit_id = $1::uuid
         WHERE tenant_id::text = $2::text AND external_lead_id = $3`,
        [cleanUnitId, tenant_id, String(oldData.source_id)]
      ).catch(() => {});
    }

    // Audit Logging
    logUpdate(req, 'Deal', req.params.id, oldData, result.rows[0]);

    // Trigger Template Automation if stage changed
    if (oldData.pipeline_stage !== effectiveNextStage) {
      await templateAutomationService.runTemplateAutomation({
          tenantId: tenant_id,
          event: 'stage_change',
          payload: {
              stage: effectiveNextStage,
              deal_id: req.params.id,
              title: cleanTitle,
              assigned_to: cleanAssignedTo || req.user.id,
              user_id: req.user.id,
              branch_id: branch_id,
              custom_fields: cleanCustomFields
          }
      });
    }

    // Activity Timeline Logging
    if (oldData.pipeline_stage !== effectiveNextStage) {
        await logActivity(tenant_id, req.user, 'deal', req.params.id, 'stage_changed', { 
            pipeline_stage: { from: oldData.pipeline_stage, to: effectiveNextStage }
        });
        if (isMovingToSiteVisit) {
            await logActivity(tenant_id, req.user, 'deal', req.params.id, 'visited', {
                note: { to: cleanCustomFields.visit_notes || `Site Visit scheduled/logged (${cleanCustomFields.visit_result || 'Pending'})` }
            });
        }
    } else {
        await logActivity(tenant_id, req.user, 'deal', req.params.id, 'updated', { 
            fields_updated: { to: Object.keys(req.body) } 
        });
    }

    // Assignment notification on reassignment
    if (cleanAssignedTo && String(cleanAssignedTo) !== String(oldData.assigned_to || '') && String(cleanAssignedTo) !== String(req.user.id)) {
      notificationService.notifyAssignment({
        tenantId: tenant_id,
        branchId: branch_id,
        recipientUserId: cleanAssignedTo,
        assignedByUserId: req.user.id,
        assignedByName: req.user.name,
        entityType: 'Deal',
        entityName: result.rows[0]?.title || oldData.title,
        link: '/deals'
      }).catch(e => console.warn('[Deal Reassignment Notification Warning]:', e.message));
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Deal Update Error]', err);
    res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  }
};

// @desc    Update deal status
// @route   PATCH /api/deals/:id/status
// @access  Private
exports.updateDealStatus = async (req, res) => {
  const { pipeline_stage } = req.body;
  if (!pipeline_stage || typeof pipeline_stage !== 'string' || !pipeline_stage.trim() || pipeline_stage.trim().length > 100) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid pipeline_stage. Must be a non-empty string up to 100 characters.'
    });
  }
  const cleanStage = pipeline_stage.trim();

  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;

  const client = db.connect ? await db.connect() : await db.pool.connect();

  try {
    await ensureDealColumns();
    await client.query('BEGIN');

    // 1. Get old status & security check FOR UPDATE (Row-level Scope + Branch Isolation)
    const scope = await accessScopeService.buildScopePredicate({
      user: req.user,
      tableAlias: 'deals',
      assigneeCol: 'assigned_to',
      paramIndex: 4
    });
    let lockWhere = 'id::text = $1::text AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)';
    const lockParams = [req.params.id, tenant_id, branch_id];
    if (scope.sql && scope.sql !== '1=1') {
      lockWhere += ` AND ${scope.sql}`;
      lockParams.push(...scope.params);
    }

    const oldResult = await client.query(
      `SELECT title, pipeline_stage, assigned_to FROM deals WHERE ${lockWhere} FOR UPDATE`, 
      lockParams
    );
    if (oldResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }
    const { title, pipeline_stage: oldStage, assigned_to } = oldResult.rows[0];

    // Deal Lock: a closed/contracted deal cannot leave its final stage or be marked lost here
    if (String(oldStage || '').toLowerCase() !== cleanStage.toLowerCase()) {
      const lock = await getDealLockState(db, { id: req.params.id, pipeline_stage: oldStage }, tenant_id);
      if (lock.locked && (isFinalStage(oldStage) || cleanStage.toLowerCase() === 'lost')) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          status: 'error',
          code: 'DEAL_LOCKED',
          message: `${lock.reason}. Stage cannot be changed. Use the Cancellation workflow to reverse a closed deal.`
        });
      }
    }

    // 2. Update status (and auto-assign if deal was unassigned)
    const effectiveAssignee = assigned_to || req.user.id;
    const result = await client.query(
      'UPDATE deals SET pipeline_stage = $1, assigned_to = COALESCE(assigned_to, $5), updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id::text = $3::text AND ($4::text IS NULL OR branch_id::text = $4::text OR branch_id IS NULL) RETURNING *',
      [cleanStage, req.params.id, tenant_id, branch_id, effectiveAssignee]
    );

    // Audit Logging & Automations
    if (oldStage !== cleanStage) {
      const lowerStage = cleanStage.toLowerCase();
      // 3. Real Estate Automation: Unit Status Transitions
      const unitIdRes = await client.query(
        'SELECT unit_id, custom_fields FROM deals WHERE id = $1 AND tenant_id::text = $2::text',
        [req.params.id, tenant_id]
      );
      const unit_id = unitIdRes.rows[0]?.unit_id || result.rows[0]?.unit_id;
      const dealCustomFields = unitIdRes.rows[0]?.custom_fields || result.rows[0]?.custom_fields || {};

      if (lowerStage === 'site visit' && !dealCustomFields.visit_date) {
        const nextVisitCf = { ...(typeof dealCustomFields === 'object' ? dealCustomFields : {}), visit_date: new Date().toISOString().slice(0, 16) };
        await client.query(
          `UPDATE deals SET custom_fields = $1 WHERE id = $2 AND tenant_id::text = $3::text`,
          [nextVisitCf, req.params.id, tenant_id]
        );
        if (result.rows[0]) result.rows[0].custom_fields = nextVisitCf;
      }

      if (unit_id) {
          if (isReservationStage(cleanStage)) {
              const unitLockRes = await client.query(
                `SELECT id, status FROM re_units WHERE id::text = $1::text AND tenant_id::text = $2::text FOR UPDATE`,
                [String(unit_id), String(tenant_id)]
              );
              if (unitLockRes.rows.length > 0) {
                const uStatus = String(unitLockRes.rows[0].status || '').trim().toLowerCase();
                const alreadyMine = uStatus === 'reserved' && isExplicitlyReservingDeal({ pipeline_stage: oldStage, custom_fields: dealCustomFields });
                if (uStatus !== 'available' && !alreadyMine) {
                  await client.query('ROLLBACK');
                  return res.status(409).json({
                    status: 'error',
                    code: 'UNIT_NOT_AVAILABLE',
                    message: `Cannot reserve unit: Unit is currently ${unitLockRes.rows[0].status}.`
                  });
                }
                if (uStatus === 'available') {
                  await client.query(
                    `UPDATE re_units
                     SET status = 'Reserved',
                         reservation_expires_at = CURRENT_TIMESTAMP + INTERVAL '48 hours',
                         reservation_extended_at = NULL,
                         reservation_extended_by = NULL,
                         reservation_extension_count = 0,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id::text = $1::text AND tenant_id::text = $2::text AND LOWER(status) = 'available'`,
                    [String(unit_id), String(tenant_id)]
                  );
                }
                const nextCf = { ...(typeof dealCustomFields === 'object' ? dealCustomFields : {}), is_unit_reservation: true, reserved_at: new Date().toISOString() };
                await client.query(
                  `UPDATE deals SET custom_fields = $1 WHERE id = $2 AND tenant_id::text = $3::text`,
                  [nextCf, req.params.id, tenant_id]
                );
                if (result.rows[0]) result.rows[0].custom_fields = nextCf;
              }
          } else if (lowerStage === 'closed' || lowerStage === 'won' || lowerStage === 'closed won') {
              // Create Payment Registry
              const dealRes = await client.query(
                'SELECT value, tenant_id, branch_id FROM deals WHERE id = $1 AND tenant_id::text = $2::text',
                [req.params.id, tenant_id]
              );
              const deal = dealRes.rows[0];
              
              if (deal) {
                const payCheck = await client.query(
                  'SELECT id FROM re_payments_mvp WHERE deal_id = $1 AND tenant_id::text = $2::text',
                  [req.params.id, tenant_id]
                );
                if (payCheck.rows.length === 0) {
                    await client.query(`
                        INSERT INTO re_payments_mvp (tenant_id, branch_id, deal_id, total_amount, status)
                        VALUES ($1, $2, $3, $4, 'Pending')
                    `, [tenant_id, deal.branch_id || branch_id, req.params.id, deal.value]);
                }
              }
          } else if (lowerStage === 'lost' || lowerStage === 'closed lost') {
              await releaseUnitIfReservedByDeal(client, {
                unitId: unit_id,
                dealRow: {
                  id: req.params.id,
                  pipeline_stage: oldStage,
                  custom_fields: dealCustomFields
                },
                tenantId: tenant_id
              });

              if (dealCustomFields && dealCustomFields.is_unit_reservation) {
                const clearedCf = { ...dealCustomFields, is_unit_reservation: false };
                await client.query(
                  `UPDATE deals SET custom_fields = $1 WHERE id = $2 AND tenant_id::text = $3::text`,
                  [clearedCf, req.params.id, tenant_id]
                );
                if (result.rows[0]) result.rows[0].custom_fields = clearedCf;
              }
          }
      }

      await client.query('COMMIT');

      // Post-commit side effects
      try {
        logAction({ 
          req, 
          action: ACTIONS.STAGE_CHANGE, 
          entityType: 'Deal', 
          entityId: req.params.id, 
          details: { before: { pipeline_stage: oldStage }, after: { pipeline_stage: cleanStage } },
          level: LOG_LEVELS.INFO
        });

        if (unit_id && (lowerStage === 'won' || lowerStage === 'closed won')) {
          logAction({ req, action: ACTIONS.AUTOMATION, entityType: 'Unit', entityId: unit_id, details: { deal_id: req.params.id, status_change: 'Sold (Deal Won)' } });
        }

        // Trigger Template Automation (asynchronous/post-commit)
        await templateAutomationService.runTemplateAutomation({
            tenantId: tenant_id,
            event: 'stage_change',
            payload: {
                stage: cleanStage,
                deal_id: req.params.id,
                title: title,
                assigned_to: effectiveAssignee,
                user_id: req.user.id,
                branch_id: branch_id,
                custom_fields: result.rows[0]?.custom_fields || dealCustomFields
            }
        });
        
        // Activity Timeline Logging
        await logActivity(tenant_id, req.user, 'deal', req.params.id, 'stage_changed', { 
            pipeline_stage: { from: oldStage, to: cleanStage }
        });
        if (lowerStage === 'site visit') {
            await logActivity(tenant_id, req.user, 'deal', req.params.id, 'visited', {
                note: { to: `Moved deal to Site Visit stage` }
            });
        }
      } catch (postCommitErr) {
        console.warn('[Deal Status Update] Post-commit hook notice (non-fatal):', postCommitErr.message);
      }
    } else {
      await client.query('COMMIT');
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      // Ignore rollback errors if already committed/rolled back
    }
    console.error('[Deal Status Update Error]', err);
    res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  } finally {
    client.release();
  }
};

// @desc    Delete deal
// @route   DELETE /api/deals/:id
// @access  Private
exports.deleteDeal = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;

  try {
    await ensureDealColumns();

    // Enforce row-level scope check
    const scope = await accessScopeService.buildScopePredicate({
      user: req.user,
      tableAlias: 'deals',
      assigneeCol: 'assigned_to',
      paramIndex: 4
    });
    let delWhere = 'id = $1 AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)';
    const delParams = [req.params.id, tenant_id, branch_id];
    if (scope.sql && scope.sql !== '1=1') {
      delWhere += ` AND ${scope.sql}`;
      delParams.push(...scope.params);
    }

    // Deal Lock: closed or contracted deals cannot be deleted (re_contracts cascades on delete)
    const existing = await db.query(
      `SELECT id, pipeline_stage FROM deals WHERE ${delWhere}`,
      delParams
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }
    const lock = await getDealLockState(db, existing.rows[0], tenant_id);
    if (lock.locked) {
      return res.status(409).json({
        status: 'error',
        code: 'DEAL_LOCKED',
        message: `${lock.reason}. Closed or contracted deals cannot be deleted. Use the Cancellation workflow instead.`
      });
    }

    const result = await db.query(
      `DELETE FROM deals WHERE ${delWhere} RETURNING *`, 
      delParams
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }

    // Real Estate Automation: Safely revert unit status only if unit is currently Reserved by this deal
    const unit_id = result.rows[0].unit_id;
    if (unit_id) {
        await releaseUnitIfReservedByDeal(db, {
          unitId: unit_id,
          dealRow: result.rows[0],
          tenantId: tenant_id
        });
    }

    // Clean up orphaned RE payment records
    await db.query('DELETE FROM re_payments_mvp WHERE deal_id::text = $1::text AND tenant_id::text = $2::text', [req.params.id, tenant_id]);

    // Audit Logging
    logDelete(req, 'Deal', req.params.id, { title: result.rows[0].title });

    res.json({ status: 'success', message: 'Deal deleted' });
  } catch (err) {
    console.error('[Deal Delete Error]', err);
    res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  }
};

// @desc    Explicitly reserve the linked unit for this deal (atomic concurrency lock)
// @route   POST /api/deals/:id/reserve-unit
// @access  Private (deal.edit_details)
exports.reserveDealUnit = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;
  const client = db.connect ? await db.connect() : await db.pool.connect();

  try {
    await ensureDealColumns();
    await client.query('BEGIN');

    const scope = await accessScopeService.buildScopePredicate({
      user: req.user,
      tableAlias: 'deals',
      assigneeCol: 'assigned_to',
      paramIndex: 4
    });
    let chkWhere = 'id::text = $1::text AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)';
    const chkParams = [req.params.id, tenant_id, branch_id];
    if (scope.sql && scope.sql !== '1=1') {
      chkWhere += ` AND ${scope.sql}`;
      chkParams.push(...scope.params);
    }

    const dealRes = await client.query(
      `SELECT * FROM deals WHERE ${chkWhere} FOR UPDATE`,
      chkParams
    );
    if (dealRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }

    const deal = dealRes.rows[0];
    if (!deal.unit_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', code: 'NO_LINKED_UNIT', message: 'This deal is not linked to any property unit.' });
    }

    const stageLc = String(deal.pipeline_stage || '').trim().toLowerCase();
    if (['lost', 'cancelled'].includes(stageLc)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', code: 'INVALID_DEAL_STAGE', message: `Cannot reserve a unit for a ${deal.pipeline_stage} deal.` });
    }

    const unitRes = await client.query(
      `SELECT * FROM re_units WHERE id::text = $1::text AND tenant_id::text = $2::text FOR UPDATE`,
      [String(deal.unit_id), String(tenant_id)]
    );
    if (unitRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Linked unit not found.' });
    }

    const targetUnit = unitRes.rows[0];
    if (targetUnit.branch_id && branch_id && String(targetUnit.branch_id) !== String(branch_id) && req.user?.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ status: 'error', message: 'Unauthorized: Unit belongs to a different branch.' });
    }

    const uStatus = String(targetUnit.status || '').trim().toLowerCase();
    if (uStatus === 'reserved' && isExplicitlyReservingDeal(deal)) {
      await client.query('COMMIT');
      return res.json({ status: 'success', data: deal, unit: targetUnit, message: 'Unit is already reserved for this deal.' });
    }

    if (uStatus !== 'available') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        status: 'error',
        code: 'UNIT_NOT_AVAILABLE',
        message: `This unit is already ${targetUnit.status || 'unavailable'}. Only an Available unit can be reserved.`
      });
    }

    let reservationHours = 48;
    try {
      const settingsRes = await client.query("SELECT value FROM settings WHERE key = 'reservation_duration_hours'");
      if (settingsRes.rows.length > 0 && !isNaN(settingsRes.rows[0].value)) {
        reservationHours = parseInt(settingsRes.rows[0].value, 10);
      }
    } catch (_) {}

    const updUnitRes = await client.query(
      `UPDATE re_units
       SET status = 'Reserved',
           reservation_expires_at = CURRENT_TIMESTAMP + INTERVAL '${reservationHours} hours',
           reservation_extended_at = NULL,
           reservation_extended_by = NULL,
           reservation_extension_count = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE id::text = $1::text AND tenant_id::text = $2::text AND LOWER(status) = 'available'
       RETURNING *`,
      [String(deal.unit_id), String(tenant_id)]
    );

    if (updUnitRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        status: 'error',
        code: 'UNIT_NOT_AVAILABLE',
        message: 'Unit could not be reserved because it is no longer Available.'
      });
    }

    const updatedCustomFields = {
      ...(deal.custom_fields && typeof deal.custom_fields === 'object' ? deal.custom_fields : {}),
      is_unit_reservation: true,
      reserved_at: new Date().toISOString()
    };

    const updDealRes = await client.query(
      `UPDATE deals
       SET custom_fields = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id::text = $3::text
       RETURNING *`,
      [updatedCustomFields, deal.id, String(tenant_id)]
    );

    await client.query('COMMIT');

    try {
      logAction({
        req,
        action: ACTIONS.AUTOMATION,
        entityType: 'Unit',
        entityId: deal.unit_id,
        details: { deal_id: deal.id, status_change: 'Reserved', expires_in_hours: reservationHours }
      });
    } catch (_) {}

    res.json({
      status: 'success',
      data: updDealRes.rows[0],
      unit: updUnitRes.rows[0],
      message: 'Unit reserved successfully.'
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Reserve Deal Unit Error]:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message || 'Failed to reserve unit' });
  } finally {
    client.release();
  }
};

// @desc    Extend reservation for a deal's linked unit
// @route   POST /api/deals/:id/extend-reservation
// @access  Private
exports.extendDealReservation = async (req, res) => {
  const { extension_hours = 24 } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;

  try {
    // Check row-level access scope
    const scope = await accessScopeService.buildScopePredicate({
      user: req.user,
      tableAlias: 'deals',
      assigneeCol: 'assigned_to',
      paramIndex: 4
    });
    let chkWhere = 'id = $1 AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)';
    const chkParams = [req.params.id, tenant_id, branch_id];
    if (scope.sql && scope.sql !== '1=1') {
      chkWhere += ` AND ${scope.sql}`;
      chkParams.push(...scope.params);
    }
    const chkDeal = await db.query(`SELECT id FROM deals WHERE ${chkWhere}`, chkParams);
    if (chkDeal.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }

    const { extendReservation } = require('../services/reservationService');
    const result = await extendReservation({
      dealId: req.params.id,
      tenantId: tenant_id,
      branchId: branch_id,
      user: req.user,
      extensionHours: extension_hours,
      req
    });
    res.json(result);
  } catch (err) {
    console.error('[Extend Deal Reservation Error]:', err.message);
    res.status(err.statusCode || 400).json({ status: 'error', message: err.message });
  }
};

// @desc    Get deal SLA status
// @route   GET /api/deals/:id/sla
// @access  Private (deal.view)
exports.getDealSla = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const sla = await dealSlaService.getDealSlaStatus(req.params.id, tenant_id);
    if (!sla) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized.' });
    }
    res.json({ status: 'success', data: sla });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Extend deal SLA by +48h (unlimited extensions permitted, idempotent via key)
// @route   POST /api/deals/:id/extend-sla
// @access  Private (deal.extend_sla)
exports.extendDealSla = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { reason, idempotency_key, idempotencyKey } = req.body;
  const key = idempotency_key || idempotencyKey || null;

  try {
    const result = await dealSlaService.extendDealSla({
      dealId: req.params.id,
      tenantId: tenant_id,
      user: req.user,
      reason,
      idempotencyKey: key
    });
    res.json({ status: 'success', ...result });
  } catch (err) {
    console.error('[Extend Deal SLA Error]:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// @desc    Reassign deal to an eligible representative and start fresh 48h SLA
// @route   POST /api/deals/:id/reassign
// @access  Private (deal.reassign)
exports.reassignDeal = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { target_user_id, targetUserId, reason } = req.body;
  const newAssigneeId = target_user_id || targetUserId;

  if (!newAssigneeId) {
    return res.status(400).json({ status: 'error', message: 'Target sales representative is required.' });
  }

  try {
    const result = await dealSlaService.reassignDeal({
      dealId: req.params.id,
      tenantId: tenant_id,
      user: req.user,
      targetUserId: newAssigneeId,
      reason
    });
    res.json({ status: 'success', ...result });
  } catch (err) {
    console.error('[Reassign Deal Error]:', err.message);
    res.status(err.statusCode || 400).json({ 
      status: 'error', 
      code: err.code || 'BAD_REQUEST',
      message: err.message 
    });
  }
};

