const db = require('../config/db');
const logger = require('../utils/logger');

// @desc    Get all deals
// @route   GET /api/deals
// @access  Private
exports.getDeals = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM deals ORDER BY created_at DESC');
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
  try {
    const result = await db.query('SELECT * FROM deals WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found' });
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
  const { title, value, pipeline_stage, client_id, project_id, assigned_to } = req.body;
  try {
    const result = await db.query(
      'INSERT INTO deals (title, value, pipeline_stage, client_id, project_id, assigned_to) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [title, value || 0, pipeline_stage || 'discovery', client_id, project_id, assigned_to || req.user.id]
    );

    // Log the creation
    await logger.logAction(req, null, 'CREATE', 'Deal', result.rows[0].id, result.rows[0]);

    res.status(201).json({ status: 'success', data: result.rows[0] });
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
  try {
    // 1. Get old status
    const oldResult = await db.query('SELECT pipeline_stage FROM deals WHERE id = $1', [req.params.id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found' });
    }
    const oldStage = oldResult.rows[0].pipeline_stage;

    // 2. Update status
    const result = await db.query(
      'UPDATE deals SET pipeline_stage = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [pipeline_stage, req.params.id]
    );

    // 3. Log the change
    if (oldStage !== pipeline_stage) {
      await logger.logAction(req, null, 'UPDATE', 'Deal', req.params.id, { 
        pipeline_stage: { old: oldStage, new: pipeline_stage } 
      });
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
  try {
    const result = await db.query('DELETE FROM deals WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Deal not found' });
    }

    // Log the deletion
    await logger.logAction(req, null, 'DELETE', 'Deal', req.params.id, { title: result.rows[0].title });

    res.json({ status: 'success', message: 'Deal deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
