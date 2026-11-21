const db = require('../config/db');
const tenantEntitlementService = require('../services/tenantEntitlementService');

/**
 * 🛡️ Tenant Access Guard Middleware (Refactored subscriptionGuard)
 * 
 * Enforces explicit, manually configured technical entitlements from tenant_overrides.
 * Commercial contracts and predefined plans (Basic/Pro/Enterprise) do NOT dictate technical access.
 * 
 * Fail-Closed Policy:
 * - Unconfigured tenants are strictly blocked (HTTP 403 ENTITLEMENTS_NOT_CONFIGURED).
 * - Database or infrastructure lookup errors return HTTP 503 ACCESS_CHECK_UNAVAILABLE.
 * - Suspended/inactive tenants are halted (HTTP 403 TENANT_SUSPENDED).
 */

const SYSTEM_DEFAULT_TENANT = '00000000-0000-0000-0000-000000000000';

module.exports = async (req, res, next) => {
    // 1. Open/Public paths exempt from tenant entitlement checking
    const openPaths = ['/api/auth', '/api/plans', '/api/health'];
    if (openPaths.some(p => req.path.startsWith(p))) {
        return next();
    }

    const tenant_id = req.user?.tenant_id || req.tenant_id;
    if (!tenant_id) {
        return next();
    }

    try {
        // 2. System Default Super Admin Tenant is always exempt with full access
        if (tenant_id === SYSTEM_DEFAULT_TENANT) {
            const allModules = {};
            for (const m of tenantEntitlementService.CANONICAL_MODULES) {
                allModules[m] = true;
            }
            req.modules = allModules;
            req.planLimits = { max_users: -1, max_branches: -1 };
            req.isSystemAdminTenant = true;
            return next();
        }

        // 3. Check Tenant Operational Status in tenants table
        const tenantRes = await db.query(
            `SELECT status, template_name FROM tenants WHERE id::text = $1::text LIMIT 1`,
            [tenant_id]
        );

        if (tenantRes.rows.length === 0) {
            return res.status(403).json({
                status: 'error',
                code: 'TENANT_NOT_FOUND',
                message: 'Organization account not found.'
            });
        }

        const tenantStatus = (tenantRes.rows[0].status || 'active').toLowerCase();
        if (['suspended', 'inactive', 'disabled'].includes(tenantStatus)) {
            return res.status(403).json({
                status: 'tenant_suspended',
                code: 'TENANT_SUSPENDED',
                message: 'Your organization account is currently suspended. Please contact platform support.'
            });
        }

        // 4. Fetch Authoritative Manual Entitlements from tenant_overrides
        const entitlements = await tenantEntitlementService.getTenantEntitlements(tenant_id, db);

        if (!entitlements || !entitlements.isConfigured) {
            // FAIL-CLOSED: No entitlement profile configured for this tenant
            return res.status(403).json({
                status: 'error',
                code: 'ENTITLEMENTS_NOT_CONFIGURED',
                message: 'Tenant access profile is not configured. Please contact ITQAN administration.'
            });
        }

        // 5. Attach Entitlements to Request Context
        req.modules = entitlements.modules;
        req.planLimits = entitlements.limits;
        req.entitlementsNotes = entitlements.notes;
        req.isExplicitlyEntitled = true;

        next();

    } catch (err) {
        console.error('[tenantAccessGuard / subscriptionGuard] Critical Error:', err.message);
        // FAIL-CLOSED: Infrastructure/DB failure returns HTTP 503 instead of bypassing security
        return res.status(503).json({
            status: 'error',
            code: 'ACCESS_CHECK_UNAVAILABLE',
            message: 'Access verification service is temporarily unavailable. Please retry.'
        });
    }
};
