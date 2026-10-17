const db = require('../config/db');

/**
 * 🛡️ Usage Limits Guard Middleware
 * Blocks actions that exceed the tenant's plan limits.
 * 
 * Usage: mount before specific create routes
 *   router.post('/', usageLimits('users'), userController.create);
 */
module.exports = (limitType) => async (req, res, next) => {
    const tenant_id = req.user?.tenant_id;
    if (!tenant_id) return next();

    try {
        const subRes = await db.query(`
            SELECT 
                p.max_users, p.max_branches, p.modules, p.name as plan_name,
                o.limits as override_limits
            FROM subscriptions s
            JOIN plans p ON s.plan_id = p.id
            LEFT JOIN tenant_overrides o ON o.tenant_id::text = s.tenant_id::text
            WHERE s.tenant_id::text = $1::text
        `, [tenant_id]);

        let maxUsers = 10;
        let maxBranches = 1;
        let planName = 'basic';

        if (subRes.rows.length > 0) {
            const row = subRes.rows[0];
            const ovLimits = row.override_limits
                ? (typeof row.override_limits === 'string' ? JSON.parse(row.override_limits) : row.override_limits)
                : {};
            maxUsers = ovLimits.max_users !== undefined && ovLimits.max_users !== null ? Number(ovLimits.max_users) : row.max_users;
            maxBranches = ovLimits.max_branches !== undefined && ovLimits.max_branches !== null ? Number(ovLimits.max_branches) : row.max_branches;
            planName = row.plan_name;
        } else {
            // Check if there is a standalone override for a legacy tenant
            const ovRes = await db.query(
                `SELECT limits FROM tenant_overrides WHERE tenant_id::text = $1::text`,
                [tenant_id]
            );
            if (ovRes.rows.length === 0) return next();
            const ovLimits = typeof ovRes.rows[0].limits === 'string' ? JSON.parse(ovRes.rows[0].limits) : (ovRes.rows[0].limits || {});
            maxUsers = ovLimits.max_users !== undefined && ovLimits.max_users !== null ? Number(ovLimits.max_users) : -1;
            maxBranches = ovLimits.max_branches !== undefined && ovLimits.max_branches !== null ? Number(ovLimits.max_branches) : -1;
        }

        if (limitType === 'users') {
            // If user is explicitly being created as inactive (is_working === false), it does not consume an active seat
            if (req.body && req.body.is_working === false) return next();

            // -1 = unlimited
            if (maxUsers === -1) return next();

            const countRes = await db.query(
                `SELECT COUNT(*) FROM users WHERE tenant_id::text = $1::text AND COALESCE(is_working, true) = true`,
                [tenant_id]
            );
            const currentCount = parseInt(countRes.rows[0].count, 10);

            if (currentCount >= maxUsers) {
                return res.status(403).json({
                    status: 'usage_limit',
                    limit_type: 'users',
                    current: currentCount,
                    max: maxUsers,
                    plan: planName,
                    message: `User limit reached (${currentCount}/${maxUsers} active users). Upgrade your plan to add more users.`,
                    upgrade_url: '/pricing'
                });
            }
        }

        if (limitType === 'branches') {
            if (maxBranches === -1) return next();

            const countRes = await db.query(
                `SELECT COUNT(*) FROM branches WHERE tenant_id::text = $1::text AND COALESCE(is_active, true) = true`,
                [tenant_id]
            );
            const currentCount = parseInt(countRes.rows[0].count, 10);

            if (currentCount >= maxBranches) {
                return res.status(403).json({
                    status: 'usage_limit',
                    limit_type: 'branches',
                    current: currentCount,
                    max: maxBranches,
                    plan: planName,
                    message: `Branch limit reached (${currentCount}/${maxBranches}). Upgrade your plan to add more branches.`,
                    upgrade_url: '/pricing'
                });
            }
        }

        next();
    } catch (err) {
        console.error('[usageLimits] Error:', err.message);
        next();
    }
};
