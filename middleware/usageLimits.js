const db = require('../config/db');
const tenantEntitlementService = require('../services/tenantEntitlementService');

/**
 * 🛡️ Usage Limits Guard Middleware
 * Enforces server-side operational resource limits (e.g. max_users, max_branches)
 * based on the tenant's explicit technical entitlements.
 * 
 * Usage in routes:
 *   router.post('/', usageLimits('users'), userController.create);
 *   router.post('/', usageLimits('branches'), branchController.create);
 * 
 * Rules:
 *   -1  = Unlimited capacity
 *    0  = Zero capacity (blocked)
 *    N  = Maximum permitted capacity
 * 
 * Fail-Closed Policy:
 *   - Unconfigured limits reject creation.
 *   - Database/infrastructure errors return HTTP 503 instead of bypassing.
 */

const SYSTEM_DEFAULT_TENANT = '00000000-0000-0000-0000-000000000000';

module.exports = (limitType) => async (req, res, next) => {
    const tenant_id = req.user?.tenant_id || req.tenant_id;
    if (!tenant_id) return next();

    // System super-admin tenant is always exempt
    if (tenant_id === SYSTEM_DEFAULT_TENANT) {
        return next();
    }

    try {
        // 1. Resolve effective limits (from request context if attached, else from entitlement service)
        let limits = req.planLimits;
        if (!limits || limits.max_users === undefined || limits.max_branches === undefined) {
            const entitlements = await tenantEntitlementService.getTenantEntitlements(tenant_id, db);
            if (!entitlements || !entitlements.isConfigured) {
                return res.status(403).json({
                    status: 'error',
                    code: 'USAGE_LIMITS_NOT_CONFIGURED',
                    message: 'Usage limits are not configured for this organization.'
                });
            }
            limits = entitlements.limits;
        }

        const maxUsers = limits.max_users !== undefined ? Number(limits.max_users) : 0;
        const maxBranches = limits.max_branches !== undefined ? Number(limits.max_branches) : 0;

        // 2. Enforce User Seat Limit
        if (limitType === 'users') {
            // Inactive user creation does not consume an active seat
            if (req.body && req.body.is_working === false) {
                return next();
            }

            // -1 = Unlimited
            if (maxUsers === -1) {
                return next();
            }

            // 0 = Zero capacity
            if (maxUsers === 0) {
                return res.status(403).json({
                    status: 'usage_limit',
                    code: 'USER_LIMIT_ZERO',
                    limit_type: 'users',
                    current: 0,
                    max: 0,
                    message: 'User creation is disabled for this organization (Limit: 0). Contact ITQAN administration.'
                });
            }

            const countRes = await db.query(
                `SELECT COUNT(*) FROM users WHERE tenant_id::text = $1::text AND COALESCE(is_working, true) = true`,
                [tenant_id]
            );
            const currentCount = parseInt(countRes.rows[0].count, 10);

            if (currentCount >= maxUsers) {
                return res.status(403).json({
                    status: 'usage_limit',
                    code: 'USER_LIMIT_EXCEEDED',
                    limit_type: 'users',
                    current: currentCount,
                    max: maxUsers,
                    message: `User limit reached (${currentCount}/${maxUsers} active users). Contact ITQAN administration to increase capacity.`
                });
            }
        }

        // 3. Enforce Branch Limit
        if (limitType === 'branches') {
            // -1 = Unlimited
            if (maxBranches === -1) {
                return next();
            }

            // 0 = Zero capacity
            if (maxBranches === 0) {
                return res.status(403).json({
                    status: 'usage_limit',
                    code: 'BRANCH_LIMIT_ZERO',
                    limit_type: 'branches',
                    current: 0,
                    max: 0,
                    message: 'Branch creation is disabled for this organization (Limit: 0). Contact ITQAN administration.'
                });
            }

            const countRes = await db.query(
                `SELECT COUNT(*) FROM branches WHERE tenant_id::text = $1::text AND COALESCE(is_active, true) = true`,
                [tenant_id]
            );
            const currentCount = parseInt(countRes.rows[0].count, 10);

            if (currentCount >= maxBranches) {
                return res.status(403).json({
                    status: 'usage_limit',
                    code: 'BRANCH_LIMIT_EXCEEDED',
                    limit_type: 'branches',
                    current: currentCount,
                    max: maxBranches,
                    message: `Branch limit reached (${currentCount}/${maxBranches} active branches). Contact ITQAN administration to increase capacity.`
                });
            }
        }

        next();

    } catch (err) {
        console.error('[usageLimits] Error:', err.message);
        // FAIL-CLOSED: Infrastructure/DB failure returns HTTP 503 instead of bypassing limit checks
        return res.status(503).json({
            status: 'error',
            code: 'USAGE_LIMITS_CHECK_FAILED',
            message: 'Service temporarily unavailable. Unable to verify organization usage limits.'
        });
    }
};
