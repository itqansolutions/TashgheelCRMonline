const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { logAction, logSecurity, ACTIONS, LOG_LEVELS } = require('../services/loggerService');

// Register User & Create Tenant (SaaS Flow)
exports.register = async (req, res) => {
  const { name, email, password, companyName } = req.body;

  if (!companyName) {
    return res.status(400).json({ status: 'error', message: 'Company Name is required for SaaS registration' });
  }

  try {
    // 1. Check if user exists
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'User already exists' });
    }

    // 2. Create Tenant (The SaaS Company)
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const tenantResult = await db.query(
      'INSERT INTO tenants (name, slug, plan, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [companyName, `${slug}-${Date.now().toString().slice(-4)}`, 'basic', 'active']
    );
    const tenantId = tenantResult.rows[0].id;

    // 3. Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 4. Insert Admin User
    const newUserResult = await db.query(
      'INSERT INTO users (name, email, password_hash, role, tenant_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, email, passwordHash, 'admin', tenantId]
    );

    const user = newUserResult.rows[0];

    // Audit Logging
    logAction({ req, action: ACTIONS.REGISTER, entityType: 'Tenant', entityId: tenantId, userId: user.id });

    // Generate JWT
    const payload = { user: { id: user.id, role: user.role, tenant_id: user.tenant_id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({ 
      status: 'success', 
      token, 
      user: { id: user.id, name: user.name, email: user.email, role: user.role, tenant_id: user.tenant_id } 
    });
  } catch (err) {
    console.error('SaaS Registration Error:', err.message);
    res.status(500).json({ status: 'error', message: 'Server error during registration' });
  }
};

// Login User
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Get user
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      logSecurity(req, ACTIONS.LOGIN_FAIL, { email, reason: 'user_not_found' });
      return res.status(400).json({ status: 'error', message: 'Invalid Credentials' });
    }

    const user = userResult.rows[0];

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      logSecurity(req, ACTIONS.LOGIN_FAIL, { email }, LOG_LEVELS.CRITICAL, user.id);
      return res.status(400).json({ status: 'error', message: 'Invalid Credentials' });
    }

    // Generate JWT with Tenant Context
    const payload = { user: { id: user.id, role: user.role, tenant_id: user.tenant_id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '72h' });

    // NEW Audit Logging (Async & Contextual)
    logAction({ req, action: ACTIONS.LOGIN, userId: user.id, tenantId: user.tenant_id });

    // Fetch allowed pages (RBAC)
    const permissions = await db.query('SELECT page_path FROM user_access WHERE user_id = $1 AND can_access = true', [user.id]);
    const allowedPages = permissions.rows.map(p => p.page_path);

    res.json({ 
      status: 'success', 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        tenant_id: user.tenant_id,
        allowedPages
      } 
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// Get User Detail
exports.getMe = async (req, res) => {
  try {
    const userResult = await db.query('SELECT id, name, email, role, created_at FROM users WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0];
    
    // Fetch allowed pages
    const permissions = await db.query('SELECT page_path FROM user_access WHERE user_id = $1 AND can_access = true', [user.id]);
    const allowedPages = permissions.rows.map(p => p.page_path);

    res.json({ 
      status: 'success', 
      user: {
        ...user,
        allowedPages
      } 
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
