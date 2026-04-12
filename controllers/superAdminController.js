const db = require('../config/db');

// @desc    Get SaaS System Insights (Strategic Analytics)
// @route   GET /api/super-admin/insights
// @access  Private (System Admin Only)
exports.getInsights = async (req, res) => {
    // SECURITY: System Admin Only (Tenant ID: 0000-...)
    const SYSTEM_DEFAULT_TENANT = '00000000-0000-0000-0000-000000000000';
    if (req.user.tenant_id !== SYSTEM_DEFAULT_TENANT) {
        return res.status(403).json({ status: 'error', message: 'Strategic intelligence is restricted to system administrators.' });
    }

    try {
        // 1. Core Metrics Aggregation
        const metricsRes = await db.query(`
            SELECT 
                COUNT(*) as total_tenants,
                COUNT(*) FILTER (WHERE status = 'active') as active_tenants,
                COUNT(*) FILTER (WHERE plan = 'trial') as trial_tenants,
                COUNT(*) FILTER (WHERE plan != 'trial' AND status = 'active') as paid_tenants
            FROM tenants
        `);
        
        const { total_tenants, active_tenants, trial_tenants, paid_tenants } = metricsRes.rows[0];
        
        // 2. Conversion Analytics
        const total = parseInt(total_tenants) || 0;
        const paid = parseInt(paid_tenants) || 0;
        const conversionRate = total > 0 ? ((paid / total) * 100).toFixed(1) : 0;

        // 3. Risk Engine (Subscriptions expiring in < 7 days)
        const riskRes = await db.query(`
            SELECT id, name, subscription_end 
            FROM tenants 
            WHERE status = 'active' 
            AND subscription_end IS NOT NULL 
            AND subscription_end < CURRENT_TIMESTAMP + INTERVAL '7 days'
        `);
        const churnRiskCount = riskRes.rows.length;

        // 4. Growth Momentum (Signups in last 7 days vs previous 7)
        const growthRes = await db.query(`
            SELECT 
                COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days') as recent_signups,
                COUNT(*) FILTER (WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '7 days' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '14 days') as prev_signups
            FROM tenants
        `);
        const { recent_signups, prev_signups } = growthRes.rows[0];
        const signupGrowth = parseInt(prev_signups) > 0 
            ? (((parseInt(recent_signups) - parseInt(prev_signups)) / parseInt(prev_signups)) * 100).toFixed(1) 
            : (parseInt(recent_signups) > 0 ? 100 : 0);

        // 5. Strategic Alert Generation
        const alerts = [];
        
        if (parseFloat(conversionRate) < 15 && total > 5) {
            alerts.push({ 
                type: 'warning', 
                message: `Low Conversion detected (${conversionRate}%). Optimize the demo experience to convert more trials.` 
            });
        }
        
        if (churnRiskCount > 0) {
            alerts.push({ 
                type: 'critical', 
                message: `${churnRiskCount} Workspaces are close to expiry. Immediate retention action required.` 
            });
        }
        
        if (parseFloat(signupGrowth) > 20) {
            alerts.push({ 
                type: 'success', 
                message: `High Growth Momentum! Signups increased by ${signupGrowth}% this week. Scaling capacity may be needed.` 
            });
        } else if (parseInt(recent_signups) === 0 && total > 0) {
            alerts.push({ 
                type: 'info', 
                message: 'Stagnant Signup Week: No new workspaces registered in the last 7 days.' 
            });
        }

        // 6. Plan Distribution
        const plansRes = await db.query(`
            SELECT plan, COUNT(*) as count 
            FROM tenants 
            GROUP BY plan 
            ORDER BY count DESC
        `);

        res.json({
            status: 'success',
            data: {
                metrics: {
                    totalTenants: total,
                    activeTenants: parseInt(active_tenants),
                    paidTenants: paid,
                    conversionRate: parseFloat(conversionRate),
                    churnRiskCount,
                    signupGrowth: parseFloat(signupGrowth)
                },
                alerts,
                topPlans: plansRes.rows,
                generatedAt: new Date()
            }
        });

    } catch (err) {
        console.error('SYSTEM INSIGHT ERROR:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to generate system intelligence reports.' });
    }
};
