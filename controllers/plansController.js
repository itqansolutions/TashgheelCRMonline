const db = require('../config/db');

// @desc    Get all active plans (public - for registration)
// @route   GET /api/plans
exports.getPlans = async (req, res) => {
    try {
        const result = await db.query(`SELECT * FROM plans WHERE is_active = TRUE ORDER BY sort_order ASC`);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to load plans.' });
    }
};

// @desc    Get current tenant subscription + module access map
// @route   GET /api/me/subscription
// @access  Private
exports.getMySubscription = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    try {
        const result = await db.query(`
            SELECT 
                s.*,
                p.name as plan_name,
                p.display_name,
                p.price_monthly,
                p.max_users,
                p.max_branches,
                p.modules,
                -- Calculate days left in trial
                CASE 
                    WHEN s.status = 'trial' 
                    THEN GREATEST(0, EXTRACT(DAY FROM (s.trial_ends_at - NOW())))
                    ELSE NULL 
                END as trial_days_left,
                -- Check if trial expired
                CASE
                    WHEN s.status = 'trial' AND s.trial_ends_at < NOW() THEN TRUE
                    ELSE FALSE
                END as is_expired
            FROM subscriptions s
            JOIN plans p ON s.plan_id = p.id
            WHERE s.tenant_id::text = $1::text
        `, [tenant_id]);

        // Load per-tenant override (if any)
        const overrideRes = await db.query(
            `SELECT modules, limits FROM tenant_overrides WHERE tenant_id::text = $1::text`, [tenant_id]
        );
        const override = overrideRes.rows[0] || null;
        const overrideModules = override?.modules
            ? (typeof override.modules === 'string' ? JSON.parse(override.modules) : override.modules)
            : {};
        const overrideLimits = override?.limits
            ? (typeof override.limits === 'string' ? JSON.parse(override.limits) : override.limits)
            : {};

        if (result.rows.length === 0) {
            // Fallback for tenants without subscription (legacy)
            const defaultModules = { crm: true, finance: true, hr: false, inventory: false, automation: false };
            const effectiveModules = { ...defaultModules, ...overrideModules };

            return res.json({
                status: 'success',
                data: {
                    plan_name: 'basic',
                    display_name: 'Basic',
                    status: 'active',
                    modules: effectiveModules,
                    max_users: overrideLimits.max_users ?? 10,
                    max_branches: overrideLimits.max_branches ?? 1,
                    trial_days_left: null,
                    is_expired: false
                }
            });
        }

        const sub = result.rows[0];

        // Auto-expire trial if time has passed
        if (sub.is_expired && sub.status === 'trial') {
            await db.query(`UPDATE subscriptions SET status = 'expired' WHERE tenant_id::text = $1::text`, [tenant_id]);
            sub.status = 'expired';
        }

        // Merge plan modules with tenant overrides (overrides take precedence)
        const planModules = typeof sub.modules === 'string'
            ? JSON.parse(sub.modules)
            : (sub.modules || {});

        sub.modules = { ...planModules, ...overrideModules };
        if (overrideLimits.max_users !== undefined) sub.max_users = overrideLimits.max_users;
        if (overrideLimits.max_branches !== undefined) sub.max_branches = overrideLimits.max_branches;

        res.json({ status: 'success', data: sub });
    } catch (err) {
        console.error('getMySubscription:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to load subscription.' });
    }
};
