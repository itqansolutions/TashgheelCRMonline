/**
 * dealPermission.js — Granular Deal Permission Middleware & Helper Utilities
 *
 * Provides fine-grained authorization for deal lifecycle operations:
 * - deal.view: View deals in list / detail views
 * - deal.update_stage: Move deal between pipeline stages
 * - deal.log_activity: Add activity notes / call logs to deals
 * - deal.edit_details: Edit commercial fields (title, value, client, product, project, terms)
 * - deal.delete: Delete deals / cancel deals
 * - deal.reassign: Change deal owner / assigned salesperson
 * - deal.extend_sla: Extend reservation / deal SLAs
 * - deal.view_overdue: Filter or view stalled / overdue deals
 *
 * Permissions are stored per user in the `user_access` table with `can_access = true`.
 * If no explicit deal permissions exist for a user in `user_access`, safe role defaults apply.
 */

const db = require('../config/db');

const DEAL_PERMISSIONS = [
  'deal.view',
  'deal.update_stage',
  'deal.log_activity',
  'deal.edit_details',
  'deal.delete',
  'deal.reassign',
  'deal.extend_sla',
  'deal.view_overdue',
];

// Baseline defaults per role when no explicit deal permission rows exist in user_access
const ROLE_DEFAULT_DEAL_PERMISSIONS = {
  admin: new Set(DEAL_PERMISSIONS),
  manager: new Set([
    'deal.view',
    'deal.update_stage',
    'deal.log_activity',
    'deal.edit_details',
    'deal.reassign',
    'deal.extend_sla',
    'deal.view_overdue',
  ]),
  supervisor: new Set([
    'deal.view',
    'deal.update_stage',
    'deal.log_activity',
    'deal.edit_details',
    'deal.view_overdue',
  ]),
  sales: new Set([
    'deal.view',
    'deal.update_stage',
    'deal.log_activity',
    'deal.edit_details',
  ]),
  employee: new Set([
    'deal.view',
    'deal.update_stage',
    'deal.log_activity',
    'deal.edit_details',
  ]),
  user: new Set([
    'deal.view',
    'deal.update_stage',
    'deal.log_activity',
  ]),
};

/**
 * Check if a user possesses a specific deal permission.
 * - Admin role always has all deal permissions.
 * - Explicit user_access entries take precedence if present for deal.*.
 * - Otherwise falls back to role-based baseline.
 * - Fails closed on missing parameters or DB errors.
 *
 * @param {string|number} userId
 * @param {string} tenantId
 * @param {string} permission
 * @param {string} userRole
 * @returns {Promise<boolean>}
 */
async function checkDealPermission(userId, tenantId, permission, userRole) {
  if (!userId || !tenantId || !permission || !userRole) {
    return false;
  }

  // Superuser override
  if (userRole === 'admin') {
    return true;
  }

  try {
    // Check if explicit deal permissions are configured in user_access for this user
    const configuredRes = await db.query(
      `SELECT page_path, can_access 
       FROM user_access 
       WHERE user_id = $1 AND page_path LIKE 'deal.%'`,
      [userId]
    );

    if (configuredRes.rows.length > 0) {
      const match = configuredRes.rows.find(r => r.page_path === permission);
      return match ? match.can_access === true : false;
    }

    // Fall back to role-based baseline
    const rolePerms = ROLE_DEFAULT_DEAL_PERMISSIONS[userRole] || ROLE_DEFAULT_DEAL_PERMISSIONS.employee;
    return rolePerms.has(permission);

  } catch (err) {
    console.error(`[DealPermission] Error checking permission "${permission}":`, err.message);
    return false; // Fail closed
  }
}

/**
 * Returns effective list of deal permissions for a user.
 *
 * @param {string|number} userId
 * @param {string} tenantId
 * @param {string} userRole
 * @returns {Promise<string[]>}
 */
async function getEffectiveDealPermissions(userId, tenantId, userRole) {
  if (!userRole) return [];

  if (userRole === 'admin') {
    return [...DEAL_PERMISSIONS];
  }

  if (!userId || !tenantId) {
    const rolePerms = ROLE_DEFAULT_DEAL_PERMISSIONS[userRole] || ROLE_DEFAULT_DEAL_PERMISSIONS.employee;
    return Array.from(rolePerms);
  }

  try {
    const configuredRes = await db.query(
      `SELECT page_path, can_access 
       FROM user_access 
       WHERE user_id = $1 AND page_path LIKE 'deal.%'`,
      [userId]
    );

    if (configuredRes.rows.length > 0) {
      return configuredRes.rows
        .filter(r => r.can_access === true)
        .map(r => r.page_path);
    }

    const rolePerms = ROLE_DEFAULT_DEAL_PERMISSIONS[userRole] || ROLE_DEFAULT_DEAL_PERMISSIONS.employee;
    return Array.from(rolePerms);

  } catch (err) {
    console.error('[DealPermission] Error resolving effective permissions:', err.message);
    const rolePerms = ROLE_DEFAULT_DEAL_PERMISSIONS[userRole] || ROLE_DEFAULT_DEAL_PERMISSIONS.employee;
    return Array.from(rolePerms);
  }
}

/**
 * Express middleware factory to require a specific deal permission.
 *
 * @param {string} permission
 * @returns {Function} Express middleware
 */
const requireDealPermission = (permission) => async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Authentication required.' });
  }

  const allowed = await checkDealPermission(
    req.user.id,
    req.user.tenant_id,
    permission,
    req.user.role
  );

  if (!allowed) {
    return res.status(403).json({
      status: 'error',
      code: 'PERMISSION_DENIED',
      message: `Permission denied: "${permission}" is required for this action.`,
      required_permission: permission,
    });
  }

  next();
};

module.exports = {
  checkDealPermission,
  getEffectiveDealPermissions,
  requireDealPermission,
  ROLE_DEFAULT_DEAL_PERMISSIONS,
  DEAL_PERMISSIONS,
};
