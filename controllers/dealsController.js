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
        rp.next_payment_date,
        rp.status as payment_status,
        rp.paid_amount,
        rp.total_amount as payment_total
      FROM deals d
      LEFT JOIN customers c ON d.client_id::text = c.id::text AND d.tenant_id::text = c.tenant_id::text
      LEFT JOIN products p ON d.product_id::text = p.id::text AND d.tenant_id::text = p.tenant_id::text
      LEFT JOIN users u ON d.assigned_to::text = u.id::text AND d.tenant_id::text = u.tenant_id::text
      LEFT JOIN re_units ru ON d.unit_id::text = ru.id::text AND d.tenant_id::text = ru.tenant_id::text
      LEFT JOIN re_payments_mvp rp ON d.id::text = rp.deal_id::text AND d.tenant_id::text = rp.tenant_id::text
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
      SELECT d.*, p.name as product_name 
      FROM deals d 
      LEFT JOIN products p ON d.product_id::text = p.id::text AND d.tenant_id::text = p.tenant_id::text 
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

    // 1. Real Estate Validation: If unit_id is provided, check availability
    if (unit_id) {
        const unitCheck = await db.query('SELECT status FROM re_units WHERE id = $1 AND tenant_id::text = $2::text', [unit_id, tenant_id]);
        if (unitCheck.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Unit not found.' });
        if (unitCheck.rows[0].status !== 'Available') {
            return res.status(400).json({ status: 'error', message: `This unit is already ${unitCheck.rows[0].status}. Please select an Available unit.` });
        }
    }

    // DEFINITIVE SANITIZATION: Prevent 500 Server Error for Empty String / Type mismatches
    const cleanClientId = (client_id && client_id !== '') ? (!isNaN(client_id) ? parseInt(client_id) : client_id) : null;
    const cleanProductId = (product_id && product_id !== '' && !isNaN(product_id)) ? parseInt(product_id) : null;
    const cleanProjectId = (project_id && project_id !== '' && !isNaN(project_id)) ? parseInt(project_id) : null;
    const cleanUnitId = (unit_id && unit_id !== '') ? String(unit_id) : null;
    const cleanAssignedTo = (assigned_to && assigned_to !== '') ? (!isNaN(assigned_to) ? parseInt(assigned_to) : assigned_to) : (!isNaN(req.user.id) ? parseInt(req.user.id) : req.user.id);
    const cleanValue = (value !== undefined && value !== null && value !== '' && !isNaN(Number(value))) ? Number(value) : 0;
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

    // 2. Insert Deal (With branch_id injection and new Phase 2 schema)
    const result = await db.query(
      'INSERT INTO deals (title, value, pipeline_stage, client_id, product_id, project_id, assigned_to, tenant_id, branch_id, custom_fields, unit_id, probability, expected_close_date, next_action, source_type, source_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *',
      [String(title).trim(), cleanValue, pipeline_stage || 'discovery', cleanClientId, cleanProductId, cleanProjectId, cleanAssignedTo, tenant_id, branch_id, cleanCustomFields, cleanUnitId, cleanProbability, cleanExpectedDate, next_action || '', cleanSourceType, cleanSourceId]
    );

    const newDeal = result.rows[0];

    // 3. Fetch Reservation Duration Settings & Automation
    if (unit_id) {
        let reservationHours = 48;
        try {
            const settingsRes = await db.query("SELECT value FROM settings WHERE key = 'reservation_duration_hours'");
            if (settingsRes.rows.length > 0 && !isNaN(settingsRes.rows[0].value)) {
                reservationHours = parseInt(settingsRes.rows[0].value);
            }
        } catch(e) { console.error('Settings fetch error:', e.message); }

        await db.query(`UPDATE re_units SET status = 'Reserved', reservation_expires_at = CURRENT_TIMESTAMP + INTERVAL '${reservationHours} hours' WHERE id = $1`, [unit_id]);
        logAction({ req, action: ACTIONS.AUTOMATION, entityType: 'Unit', entityId: unit_id, details: { deal_id: newDeal.id, status_change: 'Reserved', expires_in_hours: reservationHours } });
    }

    // Audit Logging
    logCreate(req, 'Deal', newDeal.id, newDeal);

    // Activity Timeline Logging
    await logActivity(tenant_id, req.user, 'deal', newDeal.id, 'created', { 
        title: { to: title },
        value: { to: cleanValue },
        pipeline_stage: { to: pipeline_stage || 'discovery' }
    });

    // Auto Transition Task if converted
    if (cleanSourceType === 'task' && cleanSourceId) {
        try {
          const statusRes = await db.query('SELECT id FROM task_statuses WHERE tenant_id::text = $1::text AND (name ILIKE $2 OR is_final = true) ORDER BY is_final DESC LIMIT 1', [tenant_id, '%converted%']);
          if (statusRes.rows.length > 0) {
              const convertedStatusId = statusRes.rows[0].id;
              await db.query('UPDATE tasks SET status_id = $1 WHERE id = $2', [convertedStatusId, cleanSourceId]);
              logAction({ req, action: ACTIONS.AUTOMATION, entityType: 'Task', entityId: cleanSourceId, details: { deal_id: newDeal.id, status_change: 'Converted' } });
          }
        } catch (stErr) {
          console.warn('[Task Status Transition Warning]:', stErr.message);
        }
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

    // 2. Perform Update (With phase 2 metrics)
    const result = await db.query(
      `UPDATE deals 
       SET title = $1, value = $2, pipeline_stage = $3, client_id = $4, product_id = $5, project_id = $6, assigned_to = $7, custom_fields = $8, probability = $9, expected_close_date = $10, next_action = $11, source_type = $12, source_id = $13, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $14 AND tenant_id::text = $15::text AND ($16::text IS NULL OR branch_id::text = $16::text OR branch_id IS NULL) RETURNING *`,
      [title || oldData.title, cleanValue, pipeline_stage || oldData.pipeline_stage, cleanClientId, cleanProductId, cleanProjectId, cleanAssignedTo, cleanCustomFields, cleanProbability, cleanExpectedDate, next_action !== undefined ? next_action : (oldData.next_action || ''), cleanSourceType, cleanSourceId, req.params.id, tenant_id, branch_id]
    );

    // Audit Logging
    logUpdate(req, 'Deal', req.params.id, oldData, result.rows[0]);

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
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;

  try {
    await ensureDealColumns();

    // 1. Get old status & security check
    const oldResult = await db.query(
      'SELECT title, pipeline_stage, assigned_to FROM deals WHERE id = $1 AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)', 
      [req.params.id, tenant_id, branch_id]
    );
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }
    const { title, pipeline_stage: oldStage, assigned_to } = oldResult.rows[0];

    // 2. Update status
    const result = await db.query(
      'UPDATE deals SET pipeline_stage = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id::text = $3::text AND ($4::text IS NULL OR branch_id::text = $4::text OR branch_id IS NULL) RETURNING *',
      [pipeline_stage, req.params.id, tenant_id, branch_id]
    );

    // Audit Logging
    if (oldStage !== pipeline_stage) {
      logAction({ 
        req, 
        action: ACTIONS.STAGE_CHANGE, 
        entityType: 'Deal', 
        entityId: req.params.id, 
        details: { before: { pipeline_stage: oldStage }, after: { pipeline_stage } },
        level: LOG_LEVELS.INFO
      });

      // 3. Real Estate Automation: Unit Status Transitions
      const unitIdRes = await db.query('SELECT unit_id FROM deals WHERE id = $1', [req.params.id]);
      const unit_id = unitIdRes.rows[0]?.unit_id;

      if (unit_id) {
          if (pipeline_stage === 'won') {
              await db.query('UPDATE re_units SET status = \'Sold\' WHERE id = $1', [unit_id]);
              logAction({ req, action: ACTIONS.AUTOMATION, entityType: 'Unit', entityId: unit_id, details: { deal_id: req.params.id, status_change: 'Sold (Deal Won)' } });

              // Create Payment Registry
              const dealRes = await db.query('SELECT value, tenant_id, branch_id FROM deals WHERE id = $1', [req.params.id]);
              const deal = dealRes.rows[0];
              
              const payCheck = await db.query('SELECT id FROM re_payments_mvp WHERE deal_id = $1', [req.params.id]);
              if (payCheck.rows.length === 0) {
                  await db.query(`
                      INSERT INTO re_payments_mvp (tenant_id, branch_id, deal_id, total_amount, status)
                      VALUES ($1, $2, $3, $4, 'Pending')
                  `, [deal.tenant_id, deal.branch_id, req.params.id, deal.value]);
              }
          } else if (pipeline_stage === 'lost') {
              await db.query('UPDATE re_units SET status = \'Available\' WHERE id = $1', [unit_id]);
          }
      }

      // Trigger Template Automation
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
      
      // Activity Timeline Logging
      await logActivity(tenant_id, req.user, 'deal', req.params.id, 'stage_changed', { 
          pipeline_stage: { from: oldStage, to: pipeline_stage }
      });
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Deal Status Update Error]', err);
    res.status(500).json({ status: 'error', message: err.message || 'Server error' });
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
        await db.query('UPDATE re_units SET status = \'Available\' WHERE id = $1', [unit_id]);
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
