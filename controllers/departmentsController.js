const db = require('../config/db');

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private (Admin, Manager)
exports.getDepartments = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM departments WHERE tenant_id::text = $1::text ORDER BY name ASC', [req.user.tenant_id]);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create department
// @route   POST /api/departments
// @access  Private (Admin)
exports.createDepartment = async (req, res) => {
  const { name, description } = req.body;
  try {
    const result = await db.query(
      'INSERT INTO departments (name, description, tenant_id) VALUES ($1, $2, $3) RETURNING *',
      [name, description, req.user.tenant_id]
    );
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update department
// @route   PUT /api/departments/:id
// @access  Private (Admin)
exports.updateDepartment = async (req, res) => {
  const { name, description } = req.body;
  try {
    const result = await db.query(
      'UPDATE departments SET name = $1, description = $2 WHERE id = $3 AND tenant_id::text = $4::text RETURNING *',
      [name, description, req.params.id, req.user.tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Department not found' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete department
// @route   DELETE /api/departments/:id
// @access  Private (Admin)
exports.deleteDepartment = async (req, res) => {
  try {
    const result = await db.query('DELETE FROM departments WHERE id = $1 AND tenant_id::text = $2::text RETURNING *', [req.params.id, req.user.tenant_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Department not found' });
    }
    res.json({ status: 'success', message: 'Department deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
