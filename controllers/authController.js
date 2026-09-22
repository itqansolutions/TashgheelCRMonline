const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const { logAction, logSecurity, ACTIONS, LOG_LEVELS } = require('../services/loggerService');
const emailService = require('../services/emailService');

// ── PUBLIC: Submit Registration Request ─────────────────────────
// Creates a pending registration_requests row only.
// Does NOT create any tenant, user, subscription, or modules.
exports.registerRequest = async (req, res) => {
  const { name, email, password, companyName, phone, templateName = 'general' } = req.body;

  // Required field validation
  if (!name || !name.trim()) {
    return res.status(400).json({ status: 'error', message: 'Full name is required.' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ status: 'error', message: 'Email is required.' });
  }
  if (!companyName || !companyName.trim()) {
    return res.status(400).json({ status: 'error', message: 'Company name is required.' });
  }
  if (!password) {
    return res.status(400).json({ status: 'error', message: 'Password is required.' });
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({ status: 'error', message: 'Please enter a valid email address.' });
  }

  // Password strength validation (same as register)
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      status: 'error',
      message: 'Password must be at least 8 characters with 1 uppercase letter and 1 number.'
    });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Check if email already belongs to an existing user (safe error)
    const existingUser = await db.query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        status: 'error',
        message: 'An account with this email address already exists. Please sign in instead.'
      });
    }

    // 2. Check for existing pending request (partial unique index also enforces this at DB level)
    const existingPending = await db.query(
      `SELECT id FROM registration_requests WHERE LOWER(email) = $1 AND status = 'pending'`,
      [normalizedEmail]
    );
    if (existingPending.rows.length > 0) {
      return res.status(409).json({
        status: 'error',
        message: 'We already have a pending registration request for this email. Our team will be in touch soon.'
      });
    }

    // 3. Hash password using existing bcrypt mechanism
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 4. Insert registration request — NO tenant/user created here
    await db.query(
      `INSERT INTO registration_requests
         (company_name, contact_name, email, phone, password_hash, template_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [companyName.trim(), name.trim(), normalizedEmail, phone || null, passwordHash, templateName]
    );

    // Notify Super Admin (non-critical)
    try {
      await db.query(`
        INSERT INTO notifications (user_id, tenant_id, type, title, message, link)
        SELECT u.id, u.tenant_id, 'info',
          'New Registration Request',
          $1,
          '/itqan-crm-hud/registrations'
        FROM users u
        WHERE u.tenant_id::text = '00000000-0000-0000-0000-000000000000' AND u.role = 'admin'
      `, [`${companyName.trim()} (${normalizedEmail}) submitted a registration request.`]);
    } catch (_) {}

    return res.status(201).json({
      status: 'success',
      message: 'Registration request received. Our team will contact you soon.'
    });
  } catch (err) {
    // Handle partial unique index violation gracefully
    if (err.code === '23505' && err.constraint === 'idx_reg_requests_pending_email') {
      return res.status(409).json({
        status: 'error',
        message: 'We already have a pending registration request for this email.'
      });
    }
    console.error('[RegisterRequest] Error:', err.message);
    // Never expose internal errors to public callers
    res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again later.' });
  }
};

// Register User & Create Tenant (SaaS Flow — kept for demo/internal use)
exports.register = async (req, res) => {
  const { name, email, password, companyName, selectedPlan, phone, templateName = 'general' } = req.body;

  if (!companyName) {
    return res.status(400).json({ status: 'error', message: 'Company Name is required for SaaS registration' });
  }

  // Plan-based Template Validation
  if (templateName === 'real_estate' && (selectedPlan === 'basic' || !selectedPlan)) {
    return res.status(403).json({ 
      status: 'error', 
      message: 'The Real Estate template is a Pro feature. Please upgrade your plan to continue.' 
    });
  }

  // Password Strength Check
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number.' 
    });
  }

  try {
    // 1. Check if user exists
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'User already exists' });
    }

    // 2. Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Provision tenant using the shared provisioning service
    const { provisionTenant } = require('../services/provisioningService');
    const { user, subscription } = await provisionTenant({
      name,
      email,
      passwordHash,
      companyName,
      phone,
      templateName,
      selectedPlan,
      moduleOverride: null,
      req
    });

    // Generate JWT
    const payload = { user: { id: user.id, name: user.name, role: user.role, tenant_id: user.tenant_id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({ 
      status: 'success', 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role, 
        tenant_id: user.tenant_id,
        template_name: templateName 
      },
      subscription
    });
  } catch (err) {
    console.error('🔥 SaaS Registration Error:', err.message);
    res.status(500).json({ 
      status: 'error', 
      message: 'Server error during registration',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Helper to fetch user allowed pages from user_access table
const getUserAllowedPages = async (userId, userRole) => {
  try {
    const accessRes = await db.query(
      'SELECT page_path FROM user_access WHERE user_id = $1 AND can_access = true',
      [userId]
    );
    let allowedPages = accessRes.rows.map(r => r.page_path);
    if (allowedPages.length > 0) {
      if (!allowedPages.includes('/my-profile')) allowedPages.push('/my-profile');
      if (!allowedPages.includes('/dashboard')) allowedPages.push('/dashboard');
      return allowedPages;
    }
  } catch (err) {
    console.error('Error fetching user allowedPages:', err.message);
  }

  // Sensible default pages if no specific user_access rows exist
  if (userRole === 'admin') {
    return [
      '/dashboard', '/my-profile', '/customers', '/contacts/customers', '/contacts/vendors',
      '/contacts/employees', '/products', '/deals', '/tasks', '/finance', '/erp/accounts',
      '/erp/journals', '/erp/reports', '/erp/banking', '/erp/closing', '/erp/entries',
      '/inventory/warehouses', '/inventory/keepers', '/inventory/transaction-impact',
      '/inventory/balances', '/inventory/item-card', '/inventory/movements', '/purchases',
      '/sales/salesmen', '/sales/target', '/sales/orders', '/sales/documents',
      '/sales/price-tiers', '/integrations/einvoice', '/integrations/meta-forms',
      '/employees', '/hr/my-attendance', '/hr/dashboard', '/hr/approvals',
      '/hr/payroll', '/hr/activity-definition', '/hr/activity-balance', '/hr/shifts',
      '/hr/devices', '/hr/my-requests', '/automation', '/automation/rules',
      '/files', '/reports', '/logs', '/settings', '/settings/company', '/billing'
    ];
  } else if (userRole === 'manager') {
    return [
      '/dashboard', '/my-profile', '/customers', '/contacts/customers', '/contacts/vendors',
      '/contacts/employees', '/deals', '/tasks', '/files', '/reports',
      '/hr/my-attendance', '/hr/my-requests', '/hr/dashboard', '/hr/approvals',
      '/sales/orders', '/sales/salesmen', '/sales/target'
    ];
  } else {
    // Standard employee
    return [
      '/dashboard', '/my-profile', '/customers', '/contacts/customers',
      '/deals', '/tasks', '/files', '/hr/my-attendance', '/hr/my-requests'
    ];
  }
};

// Login User
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Get user with tenant template
    const userResult = await db.query(`
      SELECT u.*, t.template_name 
      FROM users u 
      JOIN tenants t ON u.tenant_id::text = t.id::text 
      WHERE u.email = $1
    `, [email]);

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

    // Resolve primary branch_id (linked in user_branches or users table)
    const branchRes = await db.query('SELECT branch_id FROM user_branches WHERE user_id = $1 LIMIT 1', [user.id]);
    const primaryBranchId = branchRes.rows[0]?.branch_id || user.branch_id;

    // Resolve allowed pages for PBAC
    const allowedPages = await getUserAllowedPages(user.id, user.role);

    // Generate JWT with Tenant Context
    const payload = { user: { id: user.id, name: user.name, role: user.role, tenant_id: user.tenant_id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '72h' });

    // NEW Audit Logging
    logAction({ req, action: ACTIONS.LOGIN, userId: user.id, tenantId: user.tenant_id });

    res.json({ 
      status: 'success', 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role, 
        tenant_id: user.tenant_id,
        template_name: user.template_name,
        branch_id: primaryBranchId,
        allowedPages
      } 
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

/**
 * ⚡ Lightning-Fast Demo Login
 * Bypasses password for the official static demo account.
 * frictionless = zero
 */
exports.demoLogin = async (req, res) => {
  const DEMO_EMAIL = 'demo@tashgheel.com';

  try {
    const userResult = await db.query(`
      SELECT u.*, t.template_name 
      FROM users u 
      JOIN tenants t ON u.tenant_id::text = t.id::text 
      WHERE u.email = $1
    `, [DEMO_EMAIL]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Demo account not found. Please run the seeding script.' 
      });
    }

    const user = userResult.rows[0];

    // Resolve primary branch_id for Demo user
    const dbBranchRes = await db.query('SELECT branch_id FROM user_branches WHERE user_id = $1 LIMIT 1', [user.id]);
    const demoBranchId = dbBranchRes.rows[0]?.branch_id || user.branch_id;

    const allowedPages = await getUserAllowedPages(user.id, user.role);

    // Generate JWT
    const payload = { user: { id: user.id, name: user.name, role: user.role, tenant_id: user.tenant_id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' }); 

    res.json({ 
      status: 'success', 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role, 
        tenant_id: user.tenant_id,
        template_name: user.template_name,
        branch_id: demoBranchId,
        isDemo: true,
        allowedPages
      } 
    });
  } catch (err) {
    console.error('Demo Login Error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to initiate demo' });
  }
};

// Forgot Password
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const userResult = await db.query('SELECT id, email FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      // Security: Don't reveal if user exists, but for UX we can say check email
      return res.json({ status: 'success', message: 'If that email exists, a reset link has been sent.' });
    }

    const user = userResult.rows[0];
    
    // Create Reset Token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await db.query(
      'UPDATE users SET reset_token = $1, reset_expires = $2 WHERE id = $3',
      [hashedToken, expiry, user.id]
    );

    // Send Email
    await emailService.sendResetEmail(user.email, resetToken);

    res.json({ status: 'success', message: 'Reset link sent to your email.' });
  } catch (err) {
    console.error('Forgot Password Error:', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const userResult = await db.query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_expires > CURRENT_TIMESTAMP',
      [hashedToken]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Token is invalid or has expired' });
    }

    const userId = userResult.rows[0].id;

    // Password Strength Check
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number.' 
      });
    }

    // Hash New Password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await db.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_expires = NULL WHERE id = $2',
      [passwordHash, userId]
    );

    res.json({ status: 'success', message: 'Password has been reset successfully.' });
  } catch (err) {
    console.error('Reset Password Error:', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// Get User Detail
exports.getMe = async (req, res) => {
  try {
    const userResult = await db.query(`
      SELECT u.id, u.name, u.email, u.role, u.tenant_id, u.created_at, t.template_name 
      FROM users u 
      JOIN tenants t ON u.tenant_id::text = t.id::text
      WHERE u.id = $1
    `, [req.user.id]);
    
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // Fetch accessible branches
    const branchesResult = await db.query(
      `SELECT b.* FROM branches b 
       INNER JOIN user_branches ub ON b.id = ub.branch_id 
       WHERE ub.user_id = $1`,
      [req.user.id]
    );

    const allowedPages = await getUserAllowedPages(user.id, user.role);
    
    res.json({ 
      status: 'success', 
      user: { ...user, branches: branchesResult.rows, allowedPages } 
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
