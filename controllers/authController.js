const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const { logAction, logSecurity, ACTIONS, LOG_LEVELS } = require('../services/loggerService');
const emailService = require('../services/emailService');

// Register User & Create Tenant (SaaS Flow)
exports.register = async (req, res) => {
  const { name, email, password, companyName, selectedPlan, templateName = 'general' } = req.body;

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

    // 2. Create Tenant
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const tenantResult = await db.query(
      'INSERT INTO tenants (name, slug, plan, status, template_name) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [companyName, `${slug}-${Date.now().toString().slice(-4)}`, selectedPlan || 'basic', 'active', templateName]
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

    // 🔥 5. AUTO-SEEDING CORE DATA (MVP Essentials)
    console.log(`🚀 Seeding initial data for Tenant: ${tenantId}`);
    
    // Seed Departments
    const departments = ['General', 'Sales', 'Accounting'];
    for (const dep of departments) {
      await db.query('INSERT INTO departments (name, tenant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [dep, tenantId]);
    }

    // Seed Lead Sources
    const leadSources = ['Facebook', 'Google', 'Referral', 'Direct'];
    for (const src of leadSources) {
      await db.query(`
        INSERT INTO lead_sources (name, tenant_id) 
        VALUES ($1, $2) 
        ON CONFLICT DO NOTHING
      `, [src, tenantId]);
    }

    // 🔥 Seed First Branch (The "Main Branch")
    console.log(`🏢 Creating Main Branch for Tenant: ${tenantId}`);
    const branchResult = await db.query(
      'INSERT INTO branches (name, address, tenant_id) VALUES ($1, $2, $3) RETURNING id',
      ['Main Branch', 'Corporate Headquarters', tenantId]
    );
    const mainBranchId = branchResult.rows[0].id;

    // Link Admin to this branch
    await db.query('INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)', [user.id, mainBranchId]);
    await db.query('UPDATE users SET branch_id = $1 WHERE id = $2', [mainBranchId, user.id]);

    // Seed Settings (Note: settings table is global in current schema, need to make it tenant-aware if needed, 
    // but schema.sql says it lacks tenant_id. For now, we seed global keys if missing, 
    // but in a real SaaS we'd have a tenant_settings table. 
    // As per user request, we'll assume settings should be set.)
    // Note: The global settings table keys are unique. We'll skip per-tenant settings for Now 
    // unless the customer has a tenant_settings table.
    
    // Audit Logging
    logAction({ req, action: ACTIONS.REGISTER, entityType: 'Tenant', entityId: tenantId, userId: user.id });

    // ── AUTO-CREATE 14-DAY TRIAL SUBSCRIPTION ──
    const planName = selectedPlan || 'basic';
    const planRes = await db.query('SELECT id, modules FROM plans WHERE name = $1', [planName]);
    let planId = null;
    let modules = { crm: true, finance: true };

    if (planRes.rows.length > 0) {
      planId = planRes.rows[0].id;
      modules = planRes.rows[0].modules;
    }

    const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await db.query(`
      INSERT INTO subscriptions (tenant_id, plan_id, status, trial_ends_at, expires_at)
      VALUES ($1, $2, 'trial', $3, $3)
      ON CONFLICT (tenant_id) DO NOTHING
    `, [tenantId, planId, trialEnd]);

    // Generate JWT
    const payload = { user: { id: user.id, role: user.role, tenant_id: user.tenant_id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({ 
      status: 'success', 
      token, 
      user: { id: user.id, name: user.name, email: user.email, role: user.role, tenant_id: user.tenant_id },
      subscription: { status: 'trial', plan: planName, modules, trial_ends_at: trialEnd }
    });
  } catch (err) {
    console.error('🔥 SaaS Registration Error Details:', {
      message: err.message,
      stack: err.stack,
      body: { ...req.body, password: '***' }
    });
    res.status(500).json({ 
      status: 'error', 
      message: 'Server error during registration',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
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
        tenant_id: user.tenant_id
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
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [DEMO_EMAIL]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Demo account not found. Please run the seeding script.' 
      });
    }

    const user = userResult.rows[0];

    // Generate JWT
    const payload = { user: { id: user.id, role: user.role, tenant_id: user.tenant_id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' }); // Short-lived demo token

    res.json({ 
      status: 'success', 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        tenant_id: user.tenant_id,
        isDemo: true // Indicator for UI
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
    const userResult = await db.query('SELECT id, name, email, role, tenant_id, created_at FROM users WHERE id = $1', [req.user.id]);
    
    const user = userResult.rows[0];

    // Fetch accessible branches
    const branchesResult = await db.query(
      `SELECT b.* FROM branches b 
       INNER JOIN user_branches ub ON b.id = ub.branch_id 
       WHERE ub.user_id = $1`,
      [req.user.id]
    );
    
    res.json({ 
      status: 'success', 
      user: { ...user, branches: branchesResult.rows } 
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
