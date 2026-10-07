const db = require('../config/db');
const accessScopeService = require('../services/accessScopeService');
const notificationService = require('../services/notificationService');
const { logAction, logCreate, logUpdate, logDelete, ACTIONS, LOG_LEVELS } = require('../services/loggerService');
const { logActivity } = require('../utils/activityLogger');
const { getTenantTemplate } = require('../services/templateService');
const templateAutomationService = require('../services/templateAutomationService');
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
const NON_COMMERCIAL_FIELDS = new Set(['visit_date', 'visit_result', 'visit_notes']);
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

    const result = await db.query(`
      SELECT 
        d.*, 
        c.name as client_name, 
        c.company_name as client_company,
        p.name as product_name,
        u.name as assigned_to_name,
        ru.project_name as unit_project,
        ru.unit_number as unit_number,
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

    const result = await db.query(`
      SELECT 
        d.*, 
        p.name as product_name,
        ru.project_name as unit_project,
        ru.unit_number as unit_number,
        ru.status as unit_status,
        ru.reservation_expires_at as unit_reservation_expires_at,
        ru.reservation_extended_at as unit_reservation_extended_at,
        ru.reservation_extension_count as unit_reservation_extension_count,
        rp.next_payment_date,
        rp.status as payment_status,
        COALESCE(fv.actual_paid, rp.paid_amount, 0) as paid_amount,
        rp.total_amount as payment_total
      FROM deals d 
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
      WHERE d.id = $1 AND d.tenant_id::text = $2::text AND ($3::text IS NULL OR d.branch_id::text = $3::text OR d.branch_id IS NULL)
    `, [req.params.id, tenant_id, branch_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }
    res.json({ status: 'success', data: result.rows[0] });
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
    const cleanAssignedTo = (assigned_to && !isNaN(parseInt(assigned_to)) && /^\d+$/.test(String(assigned_to))) 
      ? parseInt(assigned_to) 
      : (req.user?.id && !isNaN(parseInt(req.user.id)) && /^\d+$/.test(String(req.user.id)) ? parseInt(req.user.id) : null);
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
            message: `This unit is already ${targetUnit.status}. Please select an Available unit.` 
          });
        }

        // If deal value was not set explicitly, default to unit price
        if (cleanValue === 0 && targetUnit.price) {
          cleanValue = Number(targetUnit.price);
        }

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
    if (cleanUnitId) {
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
  const { title, value, pipeline_stage, client_id, product_id, project_id, assigned_to, custom_fields, probability, expected_close_date, next_action, source_type, source_id } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;

  try {
    await ensureDealColumns();

    // 1. Get old version for logging & security check (Triple Isolation)
    const oldResult = await db.query(
      'SELECT * FROM deals WHERE id = $1 AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)', 
      [req.params.id, tenant_id, branch_id]
    );
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }
    const oldData = oldResult.rows[0];

    // DEFINITIVE SANITIZATION
    const cleanClientId = (client_id !== undefined && client_id !== null && client_id !== '') ? (!isNaN(client_id) ? parseInt(client_id) : client_id) : oldData.client_id;
    const cleanProductId = (product_id !== undefined && product_id !== null && product_id !== '' && !isNaN(product_id)) ? parseInt(product_id) : (product_id === '' || product_id === null ? null : oldData.product_id);
    const cleanProjectId = (project_id !== undefined && project_id !== null && project_id !== '' && !isNaN(project_id)) ? parseInt(project_id) : (project_id === '' || project_id === null ? null : oldData.project_id);
    const cleanAssignedTo = (assigned_to && assigned_to !== '') ? (!isNaN(assigned_to) ? parseInt(assigned_to) : assigned_to) : oldData.assigned_to;
    const cleanValue = (value !== undefined && value !== null && value !== '' && !isNaN(Number(value))) ? Number(value) : oldData.value;
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
    const cleanCustomFields = (custom_fields && typeof custom_fields === 'object') ? custom_fields : (oldData.custom_fields || {});

    // ── Deal Lock enforcement ──
    const lock = await getDealLockState(db, oldData, tenant_id);
    if (lock.locked) {
      const violations = [];
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

    // 2. Perform Update (With phase 2 metrics)
    const result = await db.query(
      `UPDATE deals 
       SET title = $1, value = $2, pipeline_stage = $3, client_id = $4, product_id = $5, project_id = $6, assigned_to = $7, custom_fields = $8, probability = $9, expected_close_date = $10, next_action = $11, source_type = $12, source_id = $13, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $14 AND tenant_id::text = $15::text AND ($16::text IS NULL OR branch_id::text = $16::text OR branch_id IS NULL) RETURNING *`,
      [title || oldData.title, cleanValue, pipeline_stage || oldData.pipeline_stage, cleanClientId, cleanProductId, cleanProjectId, cleanAssignedTo, cleanCustomFields, cleanProbability, cleanExpectedDate, next_action !== undefined ? next_action : (oldData.next_action || ''), cleanSourceType, cleanSourceId, req.params.id, tenant_id, branch_id]
    );

    // Audit Logging
    logUpdate(req, 'Deal', req.params.id, oldData, result.rows[0]);

    // Real Estate: entering the canonical final stage finalizes the unit as Sold
    if (oldData.unit_id && pipeline_stage && isFinalStage(pipeline_stage) && !isFinalStage(oldData.pipeline_stage)) {
      try {
        await db.query(
          `UPDATE re_units SET status = 'Sold', reservation_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id::text = $1::text AND tenant_id::text = $2::text`,
          [oldData.unit_id, tenant_id]
        );
      } catch (e) { console.warn('[Deal Update] Unit finalize notice:', e.message); }
    }

    // Trigger Template Automation if stage changed
    if (oldData.pipeline_stage !== pipeline_stage) {
      await templateAutomationService.runTemplateAutomation({
          tenantId: tenant_id,
          event: 'stage_change',
          payload: {
              stage: pipeline_stage,
              deal_id: req.params.id,
              title: title,
              assigned_to: assigned_to,
              branch_id: branch_id
          }
      });
    }

    // Activity Timeline Logging
    if (oldData.pipeline_stage !== pipeline_stage) {
        await logActivity(tenant_id, req.user, 'deal', req.params.id, 'stage_changed', { 
            pipeline_stage: { from: oldData.pipeline_stage, to: pipeline_stage }
        });
    } else {
        await logActivity(tenant_id, req.user, 'deal', req.params.id, 'updated', { 
            fields_updated: { to: Object.keys(req.body) } 
        });
    }

    // Assignment notification on reassignment
    if (assigned_to && assigned_to !== oldData.assigned_to && String(assigned_to) !== String(req.user.id)) {
      notificationService.notifyAssignment({
        tenantId: tenant_id,
        branchId: branch_id,
        recipientUserId: assigned_to,
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

    // 1. Get old status & security check FOR UPDATE
    const oldResult = await client.query(
      'SELECT title, pipeline_stage, assigned_to FROM deals WHERE id::text = $1::text AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL) FOR UPDATE', 
      [req.params.id, tenant_id, branch_id]
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

    // 2. Update status
    const result = await client.query(
      'UPDATE deals SET pipeline_stage = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id::text = $3::text AND ($4::text IS NULL OR branch_id::text = $4::text OR branch_id IS NULL) RETURNING *',
      [cleanStage, req.params.id, tenant_id, branch_id]
    );

    // Audit Logging & Automations
    if (oldStage !== cleanStage) {
      const lowerStage = cleanStage.toLowerCase();
      // 3. Real Estate Automation: Unit Status Transitions
      const unitIdRes = await client.query(
        'SELECT unit_id FROM deals WHERE id = $1 AND tenant_id::text = $2::text',
        [req.params.id, tenant_id]
      );
      const unit_id = unitIdRes.rows[0]?.unit_id;

      if (unit_id) {
          if (lowerStage === 'closed') {
              // Real Estate canonical final stage: unit is finalized as Sold.
              // Collections come from installments → finance_vouchers (no re_payments_mvp seeding).
              await client.query(
                `UPDATE re_units SET status = 'Sold', reservation_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
                 WHERE id::text = $1::text AND tenant_id::text = $2::text`,
                [unit_id, tenant_id]
              );
          } else if (lowerStage === 'won') {
              await client.query(
                'UPDATE re_units SET status = \'Sold\' WHERE id::text = $1::text AND tenant_id::text = $2::text',
                [unit_id, tenant_id]
              );

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
          } else if (lowerStage === 'lost') {
              // P2 Guard: Check if another active (non-lost, non-won) deal references the same unit for this tenant
              const otherActiveDeals = await client.query(
                `SELECT id FROM deals 
                 WHERE unit_id::text = $1::text 
                   AND id::text != $2::text 
                   AND tenant_id::text = $3::text 
                   AND LOWER(COALESCE(pipeline_stage, '')) <> 'lost' 
                 LIMIT 1`,
                [unit_id, req.params.id, tenant_id]
              );

              if (otherActiveDeals.rows.length === 0) {
                  await client.query(`
                      UPDATE re_units 
                      SET status = 'Available', 
                          reservation_expires_at = NULL, 
                          reservation_extended_at = NULL, 
                          reservation_extended_by = NULL, 
                          reservation_extension_count = 0, 
                          updated_at = CURRENT_TIMESTAMP 
                      WHERE id::text = $1::text AND tenant_id::text = $2::text
                  `, [unit_id, tenant_id]);
              }
          }
      }

      await client.query('COMMIT');

      // Post-commit side effects: isolated so any logging/automation failure does not fail the HTTP response or try to rollback an already committed transaction
      try {
        logAction({ 
          req, 
          action: ACTIONS.STAGE_CHANGE, 
          entityType: 'Deal', 
          entityId: req.params.id, 
          details: { before: { pipeline_stage: oldStage }, after: { pipeline_stage: cleanStage } },
          level: LOG_LEVELS.INFO
        });

        if (unit_id && lowerStage === 'won') {
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
                assigned_to: assigned_to,
                branch_id: branch_id
            }
        });
        
        // Activity Timeline Logging
        await logActivity(tenant_id, req.user, 'deal', req.params.id, 'stage_changed', { 
            pipeline_stage: { from: oldStage, to: cleanStage }
        });
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

    // Deal Lock: closed or contracted deals cannot be deleted (re_contracts cascades on delete)
    const existing = await db.query(
      'SELECT id, pipeline_stage FROM deals WHERE id = $1 AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)',
      [req.params.id, tenant_id, branch_id]
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
      'DELETE FROM deals WHERE id = $1 AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL) RETURNING *', 
      [req.params.id, tenant_id, branch_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }

    // Real Estate Automation: Revert unit status if linked
    const unit_id = result.rows[0].unit_id;
    if (unit_id) {
        await db.query(`
            UPDATE re_units 
            SET status = 'Available', 
                reservation_expires_at = NULL, 
                reservation_extended_at = NULL, 
                reservation_extended_by = NULL, 
                reservation_extension_count = 0, 
                updated_at = CURRENT_TIMESTAMP 
            WHERE id::text = $1::text AND tenant_id::text = $2::text
        `, [unit_id, tenant_id]);
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

// @desc    Extend reservation for a deal's linked unit
// @route   POST /api/deals/:id/extend-reservation
// @access  Private
exports.extendDealReservation = async (req, res) => {
  const { extension_hours = 24 } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;

  try {
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
