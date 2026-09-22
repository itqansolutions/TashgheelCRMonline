const db = require('../config/db');

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private (Admin, Manager)
exports.getDepartments = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT d.*, u.name as manager_name, pd.name as parent_department_name 
       FROM departments d 
       LEFT JOIN users u ON d.manager_id = u.id 
       LEFT JOIN departments pd ON d.parent_department_id = pd.id
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
  const { name, description, manager_id, parent_department_id } = req.body;
  const cleanManagerId = (manager_id && manager_id !== '') ? parseInt(manager_id, 10) : null;
  const cleanParentId = (parent_department_id && parent_department_id !== '') ? parseInt(parent_department_id, 10) : null;
  try {
    const result = await db.query(
      'INSERT INTO departments (name, description, manager_id, parent_department_id, tenant_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, description, cleanManagerId, cleanParentId, req.user.tenant_id]
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
  const { name, description, manager_id, parent_department_id } = req.body;
  const cleanManagerId = (manager_id && manager_id !== '') ? parseInt(manager_id, 10) : null;
  const cleanParentId = (parent_department_id && parent_department_id !== '') ? parseInt(parent_department_id, 10) : null;
  const deptId = parseInt(req.params.id, 10);

  if (cleanParentId && cleanParentId === deptId) {
    return res.status(400).json({ status: 'error', message: 'A department cannot be its own supervising parent' });
  }

  try {
    const result = await db.query(
      'UPDATE departments SET name = $1, description = $2, manager_id = $3, parent_department_id = $4 WHERE id = $5 AND tenant_id::text = $6::text RETURNING *',
      [name, description, cleanManagerId, cleanParentId, deptId, req.user.tenant_id]
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
