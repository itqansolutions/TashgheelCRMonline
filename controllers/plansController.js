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

        if (result.rows.length === 0) {
            // Fallback for tenants without subscription (legacy)
            return res.json({
                status: 'success',
                data: {
                    plan_name: 'basic',
                    display_name: 'Basic',
                    status: 'active',
                    modules: { crm: true, finance: true, hr: false, inventory: false, automation: false },
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

        res.json({ status: 'success', data: sub });
    } catch (err) {
        console.error('getMySubscription:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to load subscription.' });
    }
};
