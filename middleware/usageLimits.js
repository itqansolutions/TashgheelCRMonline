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
            SELECT p.max_users, p.max_branches, p.modules, p.name as plan_name
            FROM subscriptions s
            JOIN plans p ON s.plan_id = p.id
            WHERE s.tenant_id = $1
        `, [tenant_id]);

        if (subRes.rows.length === 0) return next(); // No subscription = no limits

        const plan = subRes.rows[0];

        if (limitType === 'users') {
            // -1 = unlimited
            if (plan.max_users === -1) return next();

            const countRes = await db.query(
                `SELECT COUNT(*) FROM users WHERE tenant_id = $1`, [tenant_id]
            );
            const currentCount = parseInt(countRes.rows[0].count);

            if (currentCount >= plan.max_users) {
                return res.status(403).json({
                    status: 'usage_limit',
                    limit_type: 'users',
                    current: currentCount,
                    max: plan.max_users,
                    plan: plan.plan_name,
                    message: `User limit reached (${currentCount}/${plan.max_users}). Upgrade your plan to add more users.`,
                    upgrade_url: '/pricing'
                });
            }
        }

        if (limitType === 'branches') {
            if (plan.max_branches === -1) return next();

            const countRes = await db.query(
                `SELECT COUNT(*) FROM branches WHERE tenant_id = $1`, [tenant_id]
            );
            const currentCount = parseInt(countRes.rows[0].count);

            if (currentCount >= plan.max_branches) {
                return res.status(403).json({
                    status: 'usage_limit',
                    limit_type: 'branches',
                    current: currentCount,
                    max: plan.max_branches,
                    plan: plan.plan_name,
                    message: `Branch limit reached (${currentCount}/${plan.max_branches}). Upgrade your plan to add more branches.`,
                    upgrade_url: '/pricing'
                });
            }
        }

        next();
    } catch (err) {
        console.error('[usageLimits] Error:', err.message);
        next(); // Fail-open
    }
};
