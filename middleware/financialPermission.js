/**
 * financialPermission.js — Granular Financial Permission Middleware
 *
 * Checks fine-grained financial permissions beyond simple role-based guards.
 * Permissions are seeded per-tenant in financial_permissions table.
 * Falls back to role-based defaults if no explicit record exists.
 *
 * Usage in routes:
 *   const { requirePermission } = require('../middleware/financialPermission');
 *   router.post('/post', authMiddleware, requirePermission('journal.post'), controller.post);
 */

const db = require('../config/db');

// Default permissions per role (used if no explicit DB record exists)
const ROLE_DEFAULT_PERMISSIONS = {
  admin: new Set([
    'gl.view', 'journal.create', 'journal.post', 'journal.reverse',
    'period.close', 'period.reopen', 'coa.manage',
    'reports.financial', 'reports.operational',
    'pr.create', 'pr.approve',
    'po.create', 'po.approve',
    'grn.create', 'grn.approve',
    'payment.create', 'payment.approve',
    'stock.adjust', 'stock.approve', 'stock.negative_override',
    'payroll.run', 'payroll.view_own',
    'fiscal.manage', 'opening.post',
  ]),
  finance_manager: new Set([
    'gl.view', 'journal.create', 'journal.post', 'journal.reverse',
    'period.close',
    'reports.financial', 'reports.operational',
    'pr.create', 'pr.approve',
    'po.create', 'po.approve',
    'grn.create', 'grn.approve',
    'payment.create', 'payment.approve',
    'payroll.run', 'payroll.view_own',
  ]),
  manager: new Set([
    'reports.operational',
    'pr.create', 'pr.approve',
    'po.create', 'po.approve',
    'grn.create', 'grn.approve',
    'stock.adjust', 'stock.approve',
    'payroll.view_own',
  ]),
  accountant: new Set([
    'gl.view', 'journal.create',
    'reports.financial', 'reports.operational',
    'payment.create',
    'payroll.view_own',
  ]),
  employee: new Set([
    'reports.operational',
    'pr.create',
    'grn.create',
    'payroll.view_own',
  ]),
};

/**
 * Check if a user has a specific financial permission.
 * First checks explicit DB record, then falls back to role defaults.
 *
 * @param {string|number} userId
 * @param {string} tenantId
 * @param {string} permission
 * @param {string} userRole
 * @returns {Promise<boolean>}
 */
async function checkFinancialPermission(userId, tenantId, permission, userRole) {
  try {
    // Check for explicit override in financial_permissions table
    const explicit = await db.query(`
      SELECT granted FROM financial_permissions
      WHERE tenant_id = $1 AND user_id = $2 AND permission = $3
      LIMIT 1
    `, [tenantId, userId, permission]);

    if (explicit.rows.length > 0) {
      return explicit.rows[0].granted === true;
    }

    // Fall back to role-based defaults
    const rolePerms = ROLE_DEFAULT_PERMISSIONS[userRole] || ROLE_DEFAULT_PERMISSIONS['employee'];
    return rolePerms.has(permission);

  } catch (err) {
    console.error(`[FinancialPermission] Error checking permission "${permission}":`, err.message);
    return false; // Fail secure
  }
}

/**
 * Express middleware factory — checks a single permission.
 *
 * @param {string} permission
 * @returns {Function} Express middleware
 */
const requirePermission = (permission) => async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Authentication required.' });
  }

  const hasPermission = await checkFinancialPermission(
    req.user.id,
    req.user.tenant_id,
    permission,
    req.user.role
  );

  if (!hasPermission) {
    return res.status(403).json({
      status: 'error',
      code: 'PERMISSION_DENIED',
      message: `Permission denied: "${permission}" is required for this action.`,
      required_permission: permission,
    });
  }

  next();
};

/**
 * Seed default financial permissions for a new tenant.
 * Called during tenant creation / onboarding.
 *
 * @param {Object} client - pg PoolClient (inside transaction)
 * @param {string} tenantId
 */
async function seedDefaultPermissions(client, tenantId) {
  // No explicit records needed — role defaults in ROLE_DEFAULT_PERMISSIONS handle it.
  // This function exists for future custom overrides during tenant setup.
  // e.g. grant specific users elevated permissions at onboarding time.
  console.log(`[FinancialPermission] Default permissions active for tenant ${tenantId} (role-based).`);
}

module.exports = { requirePermission, checkFinancialPermission, seedDefaultPermissions, ROLE_DEFAULT_PERMISSIONS };
