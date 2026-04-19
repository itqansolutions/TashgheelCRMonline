const db = require('../config/db');
const notificationService = require('../services/notificationService');
const { logAction, logCreate, logUpdate, logDelete, ACTIONS, LOG_LEVELS } = require('../services/loggerService');
const { getTenantTemplate } = require('../services/templateService');
const templateAutomationService = require('../services/templateAutomationService');

// @desc    Get all deals
// @route   GET /api/deals
// @access  Private
exports.getDeals = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
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
      LEFT JOIN customers c ON .client_id::text = .id::text AND .tenant_id::text = .tenant_id::text
      LEFT JOIN products p ON .product_id::text = .id::text AND .tenant_id::text = .tenant_id::text
      LEFT JOIN users u ON .assigned_to::text = .id::text AND .tenant_id::text = .tenant_id::text
      LEFT JOIN re_units ru ON .unit_id::text = .id::text AND .tenant_id::text = .tenant_id::text
      LEFT JOIN re_payments_mvp rp ON .id::text = .deal_id::text AND .tenant_id::text = .tenant_id::text
      WHERE d.tenant_id::text = $1::text AND d.branch_id::text = $2::text
      ORDER BY d.created_at DESC
    `, [tenant_id, branch_id]);

    const templateConfig = await getTenantTemplate(tenant_id);

    res.json({ 
      status: 'success', 
      data: result.rows,
      template_config: templateConfig 
    });
  } catch (err) {
    console.error('[Deals API Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get single deal
// @route   GET /api/deals/:id
// @access  Private
exports.getDealById = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    const result = await db.query(`
      SELECT d.*, p.name as product_name 
      FROM deals d 
      LEFT JOIN products p ON .product_id::text = .id::text AND .tenant_id::text = .tenant_id::text 
      WHERE d.id = $1 AND d.tenant_id::text = $2::text AND d.branch_id::text = $3::text
    `, [req.params.id, tenant_id, branch_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Deal Detail Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create deal
// @route   POST /api/deals
// @access  Private
exports.createDeal = async (req, res) => {
  const { title, value, pipeline_stage, client_id, product_id, project_id, assigned_to, custom_fields, unit_id } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    // 1. Real Estate Validation: If unit_id is provided, check availability
    if (unit_id) {
        const unitCheck = await db.query('SELECT status FROM re_units WHERE id = $1 AND tenant_id::text = $2::text', [unit_id, tenant_id]);
        if (unitCheck.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Unit not found.' });
        if (unitCheck.rows[0].status !== 'Available') {
            return res.status(400).json({ status: 'error', message: `This unit is already ${unitCheck.rows[0].status}. Please select an Available unit.` });
        }
    }

    // 2. Insert Deal (With branch_id injection)
    const result = await db.query(
      'INSERT INTO deals (title, value, pipeline_stage, client_id, product_id, project_id, assigned_to, tenant_id, branch_id, custom_fields, unit_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
      [title, value || 0, pipeline_stage || 'discovery', client_id, product_id, project_id, assigned_to || req.user.id, tenant_id, branch_id, custom_fields || {}, unit_id]
    );

    const newDeal = result.rows[0];

    // 3. Automation: If unit linked, mark it as Reserved
    if (unit_id) {
        await db.query('UPDATE re_units SET status = \'Reserved\' WHERE id = $1', [unit_id]);
        logAction({ req, action: ACTIONS.AUTOMATION, entityType: 'Unit', entityId: unit_id, details: { deal_id: newDeal.id, status_change: 'Reserved' } });
    }

    // Audit Logging
    logCreate(req, 'Deal', newDeal.id, newDeal);

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

    res.status(201).json({ status: 'success', data: newDeal });
  } catch (err) {
    console.error('[Deal Create Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to create deal' });
  }
};

// @desc    Update deal
// @route   PUT /api/deals/:id
// @access  Private
exports.updateDeal = async (req, res) => {
  const { title, value, pipeline_stage, client_id, product_id, project_id, assigned_to, custom_fields } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    // 1. Get old version for logging & security check (Triple Isolation)
    const oldResult = await db.query('SELECT * FROM deals WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text', [req.params.id, tenant_id, branch_id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }
    const oldData = oldResult.rows[0];

    // 2. Perform Update
    const result = await db.query(
      `UPDATE deals 
       SET title = $1, value = $2, pipeline_stage = $3, client_id = $4, product_id = $5, project_id = $6, assigned_to = $7, custom_fields = $8, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $9 AND tenant_id::text = $10::text AND branch_id::text = $11::text RETURNING *`,
      [title, value, pipeline_stage, client_id, product_id, project_id, assigned_to, custom_fields || oldData.custom_fields, req.params.id, tenant_id, branch_id]
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
              assigned_to: assigned_to
          }
      });
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Deal Update Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update deal status
// @route   PATCH /api/deals/:id/status
// @access  Private
exports.updateDealStatus = async (req, res) => {
  const { pipeline_stage } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    // 1. Get old status & security check
    const oldResult = await db.query('SELECT title, pipeline_stage, assigned_to FROM deals WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text', [req.params.id, tenant_id, branch_id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }
    const { title, pipeline_stage: oldStage, assigned_to } = oldResult.rows[0];

    // 2. Update status
    const result = await db.query(
      'UPDATE deals SET pipeline_stage = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id::text = $3::text AND branch_id::text = $4::text RETURNING *',
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
              assigned_to: assigned_to
          }
      });
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Deal Status Update Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete deal
// @route   DELETE /api/deals/:id
// @access  Private
exports.deleteDeal = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    const result = await db.query('DELETE FROM deals WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text RETURNING *', [req.params.id, tenant_id, branch_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }

    // Real Estate Automation: Revert unit status if linked
    const unit_id = result.rows[0].unit_id;
    if (unit_id) {
        await db.query('UPDATE re_units SET status = \'Available\' WHERE id = $1', [unit_id]);
    }

    // Audit Logging
    logDelete(req, 'Deal', req.params.id, { title: result.rows[0].title });

    res.json({ status: 'success', message: 'Deal deleted' });
  } catch (err) {
    console.error('[Deal Delete Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
