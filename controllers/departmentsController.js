const db = require('../config/db');

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private (Admin, Manager)
exports.getDepartments = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT d.*, u.name as manager_name 
       FROM departments d 
       LEFT JOIN users u ON d.manager_id = u.id 
       WHERE d.tenant_id::text = $1::text ORDER BY d.name ASC`,
      [req.user.tenant_id]
    );
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
  const { name, description, manager_id } = req.body;
  const cleanManagerId = (manager_id && manager_id !== '') ? parseInt(manager_id) : null;
  try {
    const result = await db.query(
      'INSERT INTO departments (name, description, manager_id, tenant_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, cleanManagerId, req.user.tenant_id]
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
  const { name, description, manager_id } = req.body;
  const cleanManagerId = (manager_id && manager_id !== '') ? parseInt(manager_id) : null;
  try {
    const result = await db.query(
      'UPDATE departments SET name = $1, description = $2, manager_id = $3 WHERE id = $4 AND tenant_id::text = $5::text RETURNING *',
      [name, description, cleanManagerId, req.params.id, req.user.tenant_id]
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
