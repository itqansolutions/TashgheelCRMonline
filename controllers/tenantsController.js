const db = require('../config/db');
const bcrypt = require('bcrypt');
const { logAction, logUpdate, ACTIONS } = require('../services/loggerService');

const SYSTEM_DEFAULT_TENANT = '00000000-0000-0000-0000-000000000000';

// @desc    Get all tenants (Super Admin only)
// @route   GET /api/tenants
// @access  Private (Super Admin)
exports.getTenants = async (req, res) => {
    // Only users in System Default tenant can see all tenants
    if (req.user.tenant_id !== SYSTEM_DEFAULT_TENANT) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized access to global tenant list' });
    }

    try {
        const result = await db.query('SELECT * FROM tenants ORDER BY created_at DESC');
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// @desc    Get tenant details
// @route   GET /api/tenants/:id
// @access  Private (Admin)
exports.getTenantById = async (req, res) => {
  const { id } = req.params;
  const tenant_id = req.user.tenant_id;

  // Security check: user can only see their own tenant UNLESS they are Super Admin
  if (id !== tenant_id && tenant_id !== SYSTEM_DEFAULT_TENANT) {
    return res.status(403).json({ status: 'error', message: 'Unauthorized access to tenant data' });
  }

  try {
    const result = await db.query('SELECT * FROM tenants WHERE id::text = $1::text', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Tenant not found' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update tenant details
// @route   PUT /api/tenants/:id
// @access  Private (Admin)
exports.updateTenant = async (req, res) => {
  const { id } = req.params;
  const { name, plan, status, subscription_end } = req.body;
  const tenant_id = req.user.tenant_id;

  // Security check
  if (id !== tenant_id && tenant_id !== SYSTEM_DEFAULT_TENANT) {
    return res.status(403).json({ status: 'error', message: 'Unauthorized access to tenant data' });
  }

  try {
    // 1. Get old data for audit
    const oldResult = await db.query('SELECT * FROM tenants WHERE id::text = $1::text', [id]);
    if (oldResult.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Tenant not found' });
    }
    const oldData = oldResult.rows[0];

    // 2. Perform Update (Super Admin can update plan/status/date, Tenant Admin only identity/financials)
    let query, params;
    if (tenant_id === SYSTEM_DEFAULT_TENANT) {
        query = `
          UPDATE tenants 
          SET name = $1, plan = $2, status = $3, subscription_end = $4 
          WHERE id::text = $5::text RETURNING *`;
        params = [name || oldData.name, plan || oldData.plan, status || oldData.status, subscription_end || oldData.subscription_end, id];
    } else {
        const { 
          address, phone, tax_no, reg_no, logo_url, 
          currency, tax_rate, invoice_prefix, invoice_footer, terms 
        } = req.body;

        query = `
          UPDATE tenants 
          SET name = $1, address = $2, phone = $3, tax_no = $4, reg_no = $5, logo_url = $6,
              currency = $7, tax_rate = $8, invoice_prefix = $9, invoice_footer = $10, terms = $11
          WHERE id::text = $12::text RETURNING *`;
        
        params = [
          name || oldData.name,
          address !== undefined ? address : oldData.address,
          phone !== undefined ? phone : oldData.phone,
          tax_no !== undefined ? tax_no : oldData.tax_no,
          reg_no !== undefined ? reg_no : oldData.reg_no,
          logo_url !== undefined ? logo_url : oldData.logo_url,
          currency !== undefined ? currency : oldData.currency,
          tax_rate !== undefined ? tax_rate : oldData.tax_rate,
          invoice_prefix !== undefined ? invoice_prefix : oldData.invoice_prefix,
          invoice_footer !== undefined ? invoice_footer : oldData.invoice_footer,
          terms !== undefined ? terms : oldData.terms,
          id
        ];
    }

    const result = await db.query(query, params);

    // Audit Logging
    logUpdate(req, 'Tenant', id, oldData, result.rows[0]);

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Reset Tenant Admin Password (Super Admin only)
// @route   POST /api/tenants/:id/reset-admin
// @access  Private (Super Admin)
exports.resetAdminPassword = async (req, res) => {
    const { id } = req.params; // tenant_id
    const { newPassword } = req.body;

    if (req.user.tenant_id !== SYSTEM_DEFAULT_TENANT) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized password override attempt blocked' });
    }

    try {
        // 1. Find the primary admin for this tenant
        const userResult = await db.query('SELECT id FROM users WHERE tenant_id::text = $1::text AND role = $2 LIMIT 1', [id, 'admin']);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'No admin user found for this tenant' });
        }
        const adminId = userResult.rows[0].id;

        // 2. Hash & Update
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);
        
        await db.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [passwordHash, adminId]);

        // Audit Logging
        logAction({ req, action: ACTIONS.SECURITY_OVERRIDE, entityType: 'User', entityId: adminId, details: { description: 'SuperAdmin reset tenant admin password' } });

        res.json({ status: 'success', message: 'Tenant admin password reset successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ status: 'error', message: 'Server error during password reset' });
    }
};
