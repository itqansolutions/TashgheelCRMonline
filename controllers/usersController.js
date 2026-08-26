const db = require('../config/db');
const logger = require('../utils/logger');

// @desc    Get all users (Employees)
// @route   GET /api/users
// @access  Private (Admin, Manager)
exports.getUsers = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    let query = `
      SELECT u.id, u.name, u.email, u.phone, u.role, u.department_id, d.name as department_name,
             u.national_id, u.insurance_no, u.marital_status, u.gender, u.birth_date,
             u.hire_date, u.job_title_id, jt.name as job_title_name, u.is_working,
             u.created_at 
      FROM users u 
      LEFT JOIN departments d ON u.department_id = d.id 
      LEFT JOIN job_titles jt ON u.job_title_id = jt.id
      WHERE u.tenant_id::text = $1::text
    `;
    const params = [tenant_id];

    if (branch_id) {
      query += ` AND (u.branch_id::text = $2::text OR u.branch_id IS NULL)`;
      params.push(branch_id);
    }

    query += ` ORDER BY u.created_at DESC`;

    const result = await db.query(query, params);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[getUsers]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update user role or department
// @route   PUT /api/users/:id/role
// @access  Private (Admin)
exports.updateUserRole = async (req, res) => {
  const { role, department_id, job_title_id, national_id, insurance_no, marital_status, gender, birth_date, hire_date, is_working, phone } = req.body;
  const cleanDeptId = (department_id && department_id !== '' && department_id !== 'null') ? parseInt(department_id) : null;
  const cleanJobTitleId = (job_title_id && job_title_id !== '' && job_title_id !== 'null') ? parseInt(job_title_id) : null;
  const cleanBirthDate = (birth_date && String(birth_date).trim() !== '') ? birth_date : null;
  const cleanHireDate = (hire_date && String(hire_date).trim() !== '') ? hire_date : null;

  try {
    const result = await db.query(
      `UPDATE users SET
        role = COALESCE($1, role),
        department_id = $2,
        job_title_id = $3,
        national_id = $4,
        insurance_no = $5,
        marital_status = COALESCE($6, 'single'),
        gender = COALESCE($7, 'male'),
        birth_date = $8,
        hire_date = $9,
        is_working = $10,
        phone = $11,
        updated_at = CURRENT_TIMESTAMP 
       WHERE id = $12 AND tenant_id::text = $13::text
       RETURNING id, name, email, phone, role, department_id, job_title_id, national_id, insurance_no, marital_status, gender, birth_date, hire_date, is_working`,
      [
        role || null,
        cleanDeptId,
        cleanJobTitleId,
        national_id?.trim() || null,
        insurance_no?.trim() || null,
        marital_status || 'single',
        gender || 'male',
        cleanBirthDate,
        cleanHireDate,
        is_working !== false,
        phone?.trim() || null,
        req.params.id,
        req.user.tenant_id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // Log the change
    await logger.logAction(req, null, 'UPDATE', 'User', req.params.id, { 
      role, 
      department_id: cleanDeptId,
      job_title_id: cleanJobTitleId
    });

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[updateUserRole]', err.message);
    res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  }
};

// @desc    Get users by department
// @route   GET /api/users/department/:deptId
// @access  Private (Admin, Manager)
exports.getUsersByDepartment = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, email, role FROM users WHERE department_id = $1 AND tenant_id::text = $2::text',
      [req.params.deptId, req.user.tenant_id]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[getUsersByDepartment]', err.message);
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
    console.error('[getUserPermissions]', err.message);
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
    console.error('[updateUserPermissions]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create a new user (Admin only)
// @route   POST /api/users
// @access  Private (Admin)
exports.createUser = async (req, res) => {
  let { name, email, password, phone, role, department_id, job_title_id, national_id, insurance_no, marital_status, gender, birth_date, hire_date, is_working } = req.body;
  const bcrypt = require('bcrypt');

  if (!name || !name.trim()) {
    return res.status(400).json({ status: 'error', message: 'Full name is required' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ status: 'error', message: 'Email address is required' });
  }
  if (!password || String(password).trim() === '') {
    return res.status(400).json({ status: 'error', message: 'Password is required' });
  }

  // Sanitize integer and string fields
  const cleanDeptId = (department_id && department_id !== '' && department_id !== 'null') ? parseInt(department_id) : null;
  const cleanJobTitleId = (job_title_id && job_title_id !== '' && job_title_id !== 'null') ? parseInt(job_title_id) : null;
  const cleanBirthDate = (birth_date && String(birth_date).trim() !== '') ? birth_date : null;
  const cleanHireDate = (hire_date && String(hire_date).trim() !== '') ? hire_date : null;

  try {
    // Check if user already exists
    const userExists = await db.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'A user with this email address already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(String(password), salt);

    // Auto-Inject Context
    const tenant_id = req.user.tenant_id;
    let branch_id = req.branchId || req.user?.branch_id;

    // If branch_id is missing, find default branch for this tenant
    if (!branch_id) {
      const bRes = await db.query('SELECT id FROM branches WHERE tenant_id::text = $1::text LIMIT 1', [tenant_id]);
      if (bRes.rows.length > 0) {
        branch_id = bRes.rows[0].id;
      }
    }

    // Insert user with Triple Isolation + HR fields
    const result = await db.query(
      `INSERT INTO users (
        name, email, password_hash, phone, role, department_id, job_title_id,
        national_id, insurance_no, marital_status, gender, birth_date, hire_date, is_working,
        tenant_id, branch_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) 
       RETURNING id, name, email, phone, role, department_id, job_title_id`,
      [
        name.trim(),
        email.trim().toLowerCase(),
        password_hash,
        phone?.trim() || null,
        role || 'employee',
        cleanDeptId,
        cleanJobTitleId,
        national_id?.trim() || null,
        insurance_no?.trim() || null,
        marital_status || 'single',
        gender || 'male',
        cleanBirthDate,
        cleanHireDate,
        is_working !== false,
        tenant_id,
        branch_id || null
      ]
    );

    const newUser = result.rows[0];

    // Grant default access to Dashboard
    await db.query(
      'INSERT INTO user_access (user_id, page_path, can_access) VALUES ($1, $2, $3)',
      [newUser.id, '/dashboard', true]
    );

    // If branch_id exists, associate in user_branches table
    if (branch_id) {
      await db.query(
        'INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [newUser.id, branch_id]
      ).catch(() => {});
    }

    // Log action
    await logger.logAction(req, null, 'CREATE', 'User', newUser.id, { 
      name: newUser.name, 
      email: newUser.email, 
      role: newUser.role 
    });

    res.status(201).json({ status: 'success', data: newUser });
  } catch (err) {
    console.error('[createUser]', err.message);
    res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  }
};
