const db = require('../config/db');
const logger = require('../utils/logger');

// @desc    Get all users (Employees)
// @route   GET /api/users
// @access  Private (Admin, Manager)
exports.getUsers = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  if (!branch_id) {
    return res.json({ status: 'success', data: [] });
  }

  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.department_id, d.name as department_name,
              u.national_id, u.insurance_no, u.marital_status, u.gender, u.birth_date,
              u.hire_date, u.job_title_id, jt.name as job_title_name, u.is_working,
              u.created_at 
       FROM users u 
       LEFT JOIN departments d ON u.department_id = d.id 
       LEFT JOIN job_titles jt ON u.job_title_id = jt.id
       WHERE u.tenant_id::text = $1::text AND u.branch_id::text = $2::text
       ORDER BY u.created_at DESC`,
      [tenant_id, branch_id]
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
  const { role, department_id, job_title_id, national_id, insurance_no, marital_status, gender, birth_date, hire_date, is_working, phone } = req.body;
  const cleanDeptId = (department_id && department_id !== '') ? parseInt(department_id) : null;
  const cleanJobTitleId = (job_title_id && job_title_id !== '') ? parseInt(job_title_id) : null;
  try {
    const result = await db.query(
      `UPDATE users SET role = $1, department_id = $2, job_title_id = $3,
        national_id = $4, insurance_no = $5, marital_status = $6, gender = $7,
        birth_date = $8, hire_date = $9, is_working = $10,
        updated_at = CURRENT_TIMESTAMP 
       WHERE id = $11 RETURNING id, name, email, role, department_id, job_title_id, national_id, insurance_no, marital_status, gender, birth_date, hire_date, is_working`,
      [role, cleanDeptId, cleanJobTitleId, national_id || null, insurance_no || null, marital_status || 'single', gender || 'male', birth_date || null, hire_date || null, is_working !== false, req.params.id]
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

// @desc    Create a new user (Admin only)
// @route   POST /api/users
// @access  Private (Admin)
exports.createUser = async (req, res) => {
  let { name, email, password, role, department_id, job_title_id, national_id, insurance_no, marital_status, gender, birth_date, hire_date, is_working } = req.body;
  const bcrypt = require('bcrypt');

  // Sanitize integer fields
  if (department_id === '' || department_id === 'null' || !department_id) department_id = null;
  if (job_title_id === '' || job_title_id === 'null' || !job_title_id) job_title_id = null;

  try {
    // Check if user already exists
    const userExists = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Auto-Inject Context
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId || req.user?.branch_id;

    // Insert user with Triple Isolation + HR fields
    const result = await db.query(
      `INSERT INTO users (
        name, email, password_hash, role, department_id, job_title_id,
        national_id, insurance_no, marital_status, gender, birth_date, hire_date, is_working,
        tenant_id, branch_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::text,$15::text) 
       RETURNING id, name, email, role, department_id, job_title_id`,
      [
        name, email, password_hash, role || 'employee', department_id, job_title_id,
        national_id || null, insurance_no || null, marital_status || 'single', gender || 'male',
        birth_date || null, hire_date || null, is_working !== false,
        tenant_id, branch_id
      ]
    );

    const newUser = result.rows[0];

    // Grant default access to Dashboard
    await db.query(
      'INSERT INTO user_access (user_id, page_path, can_access) VALUES ($1, $2, $3)',
      [newUser.id, '/dashboard', true]
    );

    // Log action
    await logger.logAction(req, null, 'CREATE', 'User', newUser.id, { 
      name, 
      email, 
      role 
    });

    res.status(201).json({ status: 'success', data: newUser });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
