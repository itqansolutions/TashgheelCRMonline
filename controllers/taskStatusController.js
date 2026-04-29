const db = require('../config/db');

// @desc    Get all task statuses
// @route   GET /api/task-statuses
// @access  Private
exports.getStatuses = async (req, res) => {
  const tenant_id = String(req.user.tenant_id);
  
  try {
    const result = await db.query(
      'SELECT * FROM task_statuses WHERE tenant_id::text = $1::text ORDER BY order_index ASC, id ASC',
      [tenant_id]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[TaskStatuses GET Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create task status
// @route   POST /api/task-statuses
// @access  Private (Admin/Manager)
exports.createStatus = async (req, res) => {
  const { name, can_make_deal, is_final, order_index, color } = req.body;
  const tenant_id = String(req.user.tenant_id);

  try {
    const result = await db.query(
      `INSERT INTO task_statuses (name, can_make_deal, is_final, order_index, color, tenant_id) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, can_make_deal || false, is_final || false, order_index || 0, color || '#64748b', tenant_id]
    );
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[TaskStatuses CREATE Error]', err.message);
    // Handle unique constraint violation
    if (err.code === '23505') {
        return res.status(400).json({ status: 'error', message: 'Status name already exists.' });
    }
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update task status
// @route   PUT /api/task-statuses/:id
// @access  Private (Admin/Manager)
exports.updateStatus = async (req, res) => {
  const { name, can_make_deal, is_final, order_index, color } = req.body;
  const tenant_id = String(req.user.tenant_id);

  try {
    const result = await db.query(
      `UPDATE task_statuses 
       SET name = $1, can_make_deal = $2, is_final = $3, order_index = $4, color = $5 
       WHERE id = $6 AND tenant_id::text = $7::text RETURNING *`,
      [name, can_make_deal, is_final, order_index, color, req.params.id, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Status not found' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[TaskStatuses UPDATE Error]', err.message);
    if (err.code === '23505') {
        return res.status(400).json({ status: 'error', message: 'Status name already exists.' });
    }
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete task status
// @route   DELETE /api/task-statuses/:id
// @access  Private (Admin/Manager)
exports.deleteStatus = async (req, res) => {
  const tenant_id = String(req.user.tenant_id);

  try {
    // Optional: Prevent deletion if tasks are using this status
    const tasksCheck = await db.query('SELECT id FROM tasks WHERE status_id = $1 LIMIT 1', [req.params.id]);
    if (tasksCheck.rows.length > 0) {
        return res.status(400).json({ status: 'error', message: 'Cannot delete status because it is assigned to existing tasks.' });
    }

    const result = await db.query(
        'DELETE FROM task_statuses WHERE id = $1 AND tenant_id::text = $2::text RETURNING *', 
        [req.params.id, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Status not found' });
    }
    res.json({ status: 'success', message: 'Status deleted' });
  } catch (err) {
    console.error('[TaskStatuses DELETE Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
