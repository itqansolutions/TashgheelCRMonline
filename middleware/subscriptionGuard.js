const db = require('../config/db');

/**
 * 🛡️ Subscription Guard Middleware (Phase D+ Upgrade)
 * Now supports per-tenant overrides (tenant_overrides table).
 * 
 * Resolution order for modules/limits:
 *   tenant_overrides > plan defaults
 */
const SYSTEM_DEFAULT_TENANT = '00000000-0000-0000-0000-000000000000';

module.exports = async (req, res, next) => {
    const openPaths = ['/api/auth', '/api/plans'];
    if (openPaths.some(p => req.path.startsWith(p))) return next();

    const tenant_id = req.user?.tenant_id;
    if (!tenant_id) return next();

    try {
        // 0. Check tenant status first (Super Admin tenant is always exempt from suspension)
        const tenantRes = await db.query(
            `SELECT status FROM tenants WHERE id::text = $1::text LIMIT 1`,
            [tenant_id]
        );

        if (tenantRes.rows.length > 0 && tenant_id !== SYSTEM_DEFAULT_TENANT) {
            const tenantStatus = (tenantRes.rows[0].status || 'active').toLowerCase();
            if (['suspended', 'inactive', 'disabled'].includes(tenantStatus)) {
                return res.status(403).json({
                    status: 'tenant_suspended',
                    message: 'Your organization account is currently suspended. Please contact platform support.',
                    code: 'TENANT_SUSPENDED'
                });
            }
        }

        // 1. Load subscription + plan + per-tenant override in a single type-safe query
        const result = await db.query(`
            SELECT 
                s.status, s.trial_ends_at, s.expires_at,
                p.modules as plan_modules,
                p.max_users, p.max_branches,
                p.name as plan_name,
                o.modules as override_modules,
                o.limits as override_limits
            FROM subscriptions s
            JOIN plans p ON s.plan_id = p.id
            LEFT JOIN tenant_overrides o ON o.tenant_id::text = s.tenant_id::text
            WHERE s.tenant_id::text = $1::text
        `, [tenant_id]);

        if (result.rows.length === 0) {
            // Legacy tenant without subscription row — still honor tenant_overrides if present
            const overrideRes = await db.query(
                `SELECT modules, limits FROM tenant_overrides WHERE tenant_id::text = $1::text`,
                [tenant_id]
            );
            const ov = overrideRes.rows[0];
            if (ov) {
                const defaultModules = { crm: true, finance: true, hr: false, inventory: false, automation: false, reports: true };
                const ovMods = typeof ov.modules === 'string' ? JSON.parse(ov.modules) : (ov.modules || {});
                const ovLimits = typeof ov.limits === 'string' ? JSON.parse(ov.limits) : (ov.limits || {});
                req.modules = { ...defaultModules, ...ovMods };
                req.planName = 'basic';
                req.planLimits = {
                    max_users: ovLimits.max_users ?? 10,
                    max_branches: ovLimits.max_branches ?? 1
                };
            }
            return next();
        }

        const sub = result.rows[0];

        // 2. Check suspended subscription
        if (sub.status === 'suspended' && tenant_id !== SYSTEM_DEFAULT_TENANT) {
            return res.status(403).json({
                status: 'tenant_suspended',
                message: 'Your subscription is currently suspended. Please contact support.',
                code: 'SUBSCRIPTION_SUSPENDED'
            });
        }

        // 3. Check trial expiry OR active subscription expiry
        const now = new Date();
        const isTrialExpired = sub.status === 'trial' && sub.trial_ends_at && new Date(sub.trial_ends_at) < now;
        const isSubExpired = sub.expires_at && new Date(sub.expires_at) < now && sub.status !== 'expired' && sub.status !== 'cancelled';

        if ((isTrialExpired || isSubExpired) && tenant_id !== SYSTEM_DEFAULT_TENANT) {
            await db.query(`UPDATE subscriptions SET status = 'expired', updated_at = NOW() WHERE tenant_id::text = $1::text`, [tenant_id]);
            sub.status = 'expired';
        }

        if (['expired', 'cancelled'].includes(sub.status) && tenant_id !== SYSTEM_DEFAULT_TENANT) {
            return res.status(402).json({
                status: 'subscription_expired',
                message: isTrialExpired
                    ? 'Your 14-day free trial has ended. Please upgrade to continue.'
                    : 'Your subscription has expired. Please renew to regain access.',
                upgrade_url: '/pricing'
            });
        }

        // 4. Merge: override takes precedence over plan defaults
        const rawPlanModules = typeof sub.plan_modules === 'string'
            ? JSON.parse(sub.plan_modules)
            : (sub.plan_modules || {});

        // Ensure complete module map defaults for all modules
        const planModules = {
            reports: true,
            sales: true,
            purchasing: rawPlanModules.purchasing ?? rawPlanModules.inventory ?? false,
            marketing: rawPlanModules.marketing ?? rawPlanModules.crm ?? true,
            real_estate: rawPlanModules.real_estate ?? true,
            ...rawPlanModules
        };

        const overrideModules = sub.override_modules
            ? (typeof sub.override_modules === 'string' ? JSON.parse(sub.override_modules) : sub.override_modules)
            : {};

        const overrideLimits = sub.override_limits
            ? (typeof sub.override_limits === 'string' ? JSON.parse(sub.override_limits) : sub.override_limits)
            : {};

        // Final effective access: plan + overrides merged
        req.modules = { ...planModules, ...overrideModules };
        req.planName = sub.plan_name;
        req.planLimits = {
            max_users: overrideLimits.max_users ?? sub.max_users,
            max_branches: overrideLimits.max_branches ?? sub.max_branches
        };

        next();
    } catch (err) {
        console.error('[subscriptionGuard] Error:', err.message);
        next();
    }
};
