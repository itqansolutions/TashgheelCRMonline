const db = require('../config/db');
const notificationService = require('../services/notificationService');
const { logAction, logCreate, logUpdate, logDelete, ACTIONS, LOG_LEVELS } = require('../services/loggerService');

// @desc    Get all deals
// @route   GET /api/deals
// @access  Private
exports.getDeals = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(`
      SELECT 
        d.*, 
        c.name as client_name, 
        c.company_name as client_company,
        p.name as product_name,
        u.name as assigned_to_name
      FROM deals d
      LEFT JOIN customers c ON d.client_id = c.id
      LEFT JOIN products p ON d.product_id = p.id
      LEFT JOIN users u ON d.assigned_to = u.id
      WHERE d.tenant_id = $1
      ORDER BY d.created_at DESC
    `, [tenant_id]);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get single deal
// @route   GET /api/deals/:id
// @access  Private
exports.getDealById = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(`
      SELECT d.*, p.name as product_name 
      FROM deals d 
      LEFT JOIN products p ON d.product_id = p.id 
      WHERE d.id = $1 AND d.tenant_id = $2
    `, [req.params.id, tenant_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create deal
// @route   POST /api/deals
// @access  Private
exports.createDeal = async (req, res) => {
  const { title, value, pipeline_stage, client_id, product_id, project_id, assigned_to } = req.body;
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(
      'INSERT INTO deals (title, value, pipeline_stage, client_id, product_id, project_id, assigned_to, tenant_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [title, value || 0, pipeline_stage || 'discovery', client_id, product_id, project_id, assigned_to || req.user.id, tenant_id]
    );

    const newDeal = result.rows[0];

    // Audit Logging
    logCreate(req, 'Deal', newDeal.id, newDeal);

    // Phase 7 Workflow Engine: Auto-Assign if no explicit assignee was given
    if (!assigned_to) {
        const workflowEngine = require('../services/workflowEngine');
        const branch_id = req.branchId || null;
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
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update deal
// @route   PUT /api/deals/:id
// @access  Private
exports.updateDeal = async (req, res) => {
  const { title, value, pipeline_stage, client_id, product_id, project_id, assigned_to } = req.body;
  const tenant_id = req.user.tenant_id;
  try {
    // 1. Get old version for logging & security check
    const oldResult = await db.query('SELECT * FROM deals WHERE id = $1 AND tenant_id = $2', [req.params.id, tenant_id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }
    const oldData = oldResult.rows[0];

    // 2. Perform Update
    const result = await db.query(
      `UPDATE deals 
       SET title = $1, value = $2, pipeline_stage = $3, client_id = $4, product_id = $5, project_id = $6, assigned_to = $7, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $8 AND tenant_id = $9 RETURNING *`,
      [title, value, pipeline_stage, client_id, product_id, project_id, assigned_to, req.params.id, tenant_id]
    );

    // Audit Logging
    logUpdate(req, 'Deal', req.params.id, oldData, result.rows[0]);

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update deal status
// @route   PATCH /api/deals/:id/status
// @access  Private
exports.updateDealStatus = async (req, res) => {
  const { pipeline_stage } = req.body;
  const tenant_id = req.user.tenant_id;
  try {
    // 1. Get old status & security check
    const oldResult = await db.query('SELECT title, pipeline_stage, assigned_to FROM deals WHERE id = $1 AND tenant_id = $2', [req.params.id, tenant_id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }
    const { title, pipeline_stage: oldStage, assigned_to } = oldResult.rows[0];

    // 2. Update status
    const result = await db.query(
      'UPDATE deals SET pipeline_stage = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id = $3 RETURNING *',
      [pipeline_stage, req.params.id, tenant_id]
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

      // Trigger Notification for Assignee
      if (assigned_to && assigned_to !== req.user.id) {
          notificationService.notify({
              type: pipeline_stage === 'won' ? 'INVOICE_PAID' : 'SYSTEM_ALERT',
              title: 'Deal Stage Updated',
              message: `Deal "${title}" moved from ${oldStage} to ${pipeline_stage}`,
              tenant_id,
              branch_id: null,
              user_id: assigned_to,
              link: '/deals'
          }).catch(e => console.error('Deal notify error:', e));
      }
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete deal
// @route   DELETE /api/deals/:id
// @access  Private
exports.deleteDeal = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query('DELETE FROM deals WHERE id = $1 AND tenant_id = $2 RETURNING *', [req.params.id, tenant_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    }

    // Audit Logging
    logDelete(req, 'Deal', req.params.id, { title: result.rows[0].title });

    res.json({ status: 'success', message: 'Deal deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
