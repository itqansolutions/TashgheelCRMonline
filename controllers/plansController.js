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
                -- Check if trial or active subscription expired
                CASE
                    WHEN (s.status = 'trial' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at < NOW())
                      OR (s.expires_at IS NOT NULL AND s.expires_at < NOW())
                    THEN TRUE
                    ELSE FALSE
                END as is_expired
            FROM subscriptions s
            JOIN plans p ON s.plan_id = p.id
            WHERE s.tenant_id::text = $1::text
        `, [tenant_id]);

        // The access guard has already resolved manual technical entitlements.
        // Commercial plan metadata must never grant technical module access.
        const effectiveModules = req.modules && typeof req.modules === 'object' ? req.modules : {};
        const effectiveLimits = req.planLimits || {};

        if (result.rows.length === 0) {
            // Fallback for tenants without subscription (legacy)
            return res.json({
                status: 'success',
                data: {
                    plan_name: 'basic',
                    display_name: 'Basic',
                    status: 'active',
                    modules: effectiveModules,
                    max_users: effectiveLimits.max_users ?? 10,
                    max_branches: effectiveLimits.max_branches ?? 1,
                    trial_days_left: null,
                    is_expired: false
                }
            });
        }

        const sub = result.rows[0];

        // Auto-expire subscription if time has passed
        if (sub.is_expired && sub.status !== 'expired' && sub.status !== 'cancelled') {
            await db.query(`UPDATE subscriptions SET status = 'expired', updated_at = NOW() WHERE tenant_id::text = $1::text`, [tenant_id]);
            sub.status = 'expired';
        }

        sub.modules = { ...effectiveModules };
        if (effectiveLimits.max_users !== undefined) sub.max_users = effectiveLimits.max_users;
        if (effectiveLimits.max_branches !== undefined) sub.max_branches = effectiveLimits.max_branches;

        res.json({ status: 'success', data: sub });
    } catch (err) {
        console.error('getMySubscription:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to load subscription.' });
    }
};
