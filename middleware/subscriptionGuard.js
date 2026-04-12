const db = require('../config/db');

/**
 * 🛡️ Subscription Guard Middleware (Phase D+ Upgrade)
 * Now supports per-tenant overrides (tenant_overrides table).
 * 
 * Resolution order for modules/limits:
 *   tenant_overrides > plan defaults
 */
module.exports = async (req, res, next) => {
    const openPaths = ['/api/auth', '/api/plans'];
    if (openPaths.some(p => req.path.startsWith(p))) return next();

    const tenant_id = req.user?.tenant_id;
    if (!tenant_id) return next();

    try {
        // 1. Load subscription + plan
        const result = await db.query(`
            SELECT 
                s.status, s.trial_ends_at, s.expires_at,
                p.modules as plan_modules,
                p.max_users, p.max_branches,
                p.name as plan_name
            FROM subscriptions s
            JOIN plans p ON s.plan_id = p.id
            WHERE s.tenant_id = $1
        `, [tenant_id]);

        if (result.rows.length === 0) return next(); // Legacy tenant, no subscription

        const sub = result.rows[0];

        // 2. Check trial expiry
        if (sub.status === 'trial' && new Date(sub.trial_ends_at) < new Date()) {
            await db.query(`UPDATE subscriptions SET status = 'expired' WHERE tenant_id = $1`, [tenant_id]);
            return res.status(402).json({
                status: 'subscription_expired',
                message: 'Your 14-day free trial has ended. Please upgrade to continue.',
                upgrade_url: '/pricing'
            });
        }

        if (['expired', 'cancelled'].includes(sub.status)) {
            return res.status(402).json({
                status: 'subscription_expired',
                message: 'Your subscription has expired. Please renew to regain access.',
                upgrade_url: '/pricing'
            });
        }

        // 3. Load per-tenant override (if any)
        const overrideRes = await db.query(
            `SELECT modules, limits FROM tenant_overrides WHERE tenant_id = $1`, [tenant_id]
        );

        const override = overrideRes.rows[0] || null;

        // 4. Merge: override takes precedence over plan defaults
        const planModules = typeof sub.plan_modules === 'string'
            ? JSON.parse(sub.plan_modules)
            : (sub.plan_modules || {});

        const overrideModules = override?.modules
            ? (typeof override.modules === 'string' ? JSON.parse(override.modules) : override.modules)
            : {};

        const overrideLimits = override?.limits
            ? (typeof override.limits === 'string' ? JSON.parse(override.limits) : override.limits)
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
        next(); // Fail-open
    }
};
