const db = require('../config/db');
const logger = require('../utils/logger');

// @desc    Get all users (Employees)
// @route   GET /api/users
// @access  Private (Admin, Manager)
exports.getUsers = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.department_id, d.name as department_name, u.created_at 
       FROM users u 
       LEFT JOIN departments d ON u.department_id = d.id 
       ORDER BY u.created_at DESC`
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update user role or department
// @route   PUT /api/users/:id/role
// @access  Private (Admin)
exports.updateUserRole = async (req, res) => {
  const { role, department_id } = req.body;
  try {
    const result = await db.query(
      'UPDATE users SET role = $1, department_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING id, name, email, role, department_id',
      [role, department_id, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // Log the change
    await logger.logAction(req, null, 'UPDATE', 'User', req.params.id, { 
      role, 
      department_id 
    });

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get users by department
// @route   GET /api/users/department/:deptId
// @access  Private (Admin, Manager)
exports.getUsersByDepartment = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, email, role FROM users WHERE department_id = $1',
      [req.params.deptId]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get user permissions
// @route   GET /api/users/:id/permissions
// @access  Private (Admin)
exports.getUserPermissions = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT page_path FROM user_access WHERE user_id = $1 AND can_access = true',
      [req.params.id]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update user permissions (Bulk)
// @route   POST /api/users/:id/permissions
// @access  Private (Admin)
exports.updateUserPermissions = async (req, res) => {
  const { allowedPages } = req.body;
  const userId = req.params.id;

  try {
    // 1. Reset
    await db.query('DELETE FROM user_access WHERE user_id = $1', [userId]);

    // 2. Insert
    if (allowedPages && allowedPages.length > 0) {
      const values = allowedPages.map(path => `(${userId}, '${path}', true)`).join(',');
      await db.query(`INSERT INTO user_access (user_id, page_path, can_access) VALUES ${values}`);
    }

    // 3. Log the change
    await logger.logAction(req, null, 'PERMISSION_CHANGE', 'User', userId, { 
      allowedPages 
    });

    res.json({ status: 'success', message: 'Permissions updated successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
