const db = require('../config/db');

/**
 * Elite SaaS Insights Service
 * Responsibilities: Data Aggregation, Business Intelligence, Health Score Calculation
 */

const PLAN_PRICES = {
    trial: 0,
    basic: 29,
    pro: 79,
    enterprise: 199
};

exports.getPlatformInsights = async () => {
    try {
        // 1. Fetch Core Data
        const tenantsRes = await db.query(`
            SELECT id, name, plan, status, created_at, subscription_end 
            FROM tenants
        `);
        const tenants = tenantsRes.rows;
        const total = tenants.length;

        if (total === 0) {
            return {
                metrics: { totalTenants: 0, activeTenants: 0, paidTenants: 0, mrr: 0, healthScore: 0 },
                alerts: [],
                topPlans: []
            };
        }

        // 2. Metric Calculations
        const activeTenants = tenants.filter(t => t.status === 'active');
        const paidTenants = tenants.filter(t => t.plan !== 'trial' && t.status === 'active');
        
        // Real-world MRR Logic
        const mrr = tenants.reduce((sum, t) => {
            if (t.status === 'active') {
                return sum + (PLAN_PRICES[t.plan] || 0);
            }
            return sum;
        }, 0);

        const conversionRate = total > 0 ? ((paidTenants.length / total) * 100).toFixed(1) : 0;

        // 3. Growth Velocity (7-day window)
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        const fourteenDaysAgo = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));

        const recentSignups = tenants.filter(t => new Date(t.created_at) >= sevenDaysAgo).length;
        const prevSignups = tenants.filter(t => new Date(t.created_at) >= fourteenDaysAgo && new Date(t.created_at) < sevenDaysAgo).length;

        const growthVelocity = prevSignups > 0 
            ? (((recentSignups - prevSignups) / prevSignups) * 100).toFixed(1)
            : (recentSignups > 0 ? 100 : 0);

        // 4. Churn Risk (Subscriptions expiring in < 7 days)
        const churnRiskTenants = tenants.filter(t => 
            t.status === 'active' && 
            t.subscription_end && 
            new Date(t.subscription_end) < new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000))
        );

        // 5. Elite Strategic Alerts (with Level and Actions)
        const alerts = [];

        if (parseFloat(conversionRate) < 15 && total > 3) {
            alerts.push({
                type: 'warning',
                level: 'medium',
                message: `Low Conversion Detected (${conversionRate}%)`,
                suggestion: 'Try optimizing the Demo experience or offer a limited-time Pro discount.',
                action: 'Improve Onboarding'
            });
        }

        if (churnRiskTenants.length > 0) {
            alerts.push({
                type: 'critical',
                level: 'high',
                message: `${churnRiskTenants.length} Workspaces expiring this week`,
                suggestion: 'Reach out with a retention offer or automated renewal reminder.',
                action: 'Retargeting Campaign'
            });
        }

        if (parseFloat(growthVelocity) > 25) {
            alerts.push({
                type: 'success',
                level: 'low',
                message: `Viral Momentum! Signups up by ${growthVelocity}%`,
                suggestion: 'High growth detected. Monitor server capacity and provide stellar support.',
                action: 'Scale Support'
            });
        }

        // 6. System Health Score Algorithm
        // Weights: Conversion (40%), Growth (30%), Churn Protection (30%)
        const conversionScore = Math.min((parseFloat(conversionRate) / 25) * 40, 40);
        const growthScore = Math.min((parseFloat(growthVelocity) / 50) * 30, 30);
        const churnPenalty = (churnRiskTenants.length / Math.max(activeTenants.length, 1)) * 30;
        const healthScore = Math.max(0, Math.min(100, (conversionScore + growthScore + (30 - churnPenalty)))).toFixed(0);

        // 7. Plan Distribution
        const planCounts = tenants.reduce((acc, t) => {
            acc[t.plan] = (acc[t.plan] || 0) + 1;
            return acc;
        }, {});
        const topPlans = Object.entries(planCounts).map(([plan, count]) => ({ plan, count })).sort((a,b) => b.count - a.count);

        return {
            metrics: {
                totalTenants: total,
                activeTenants: activeTenants.length,
                paidTenants: paidTenants.length,
                mrr: parseFloat(mrr),
                conversionRate: parseFloat(conversionRate),
                growthVelocity: parseFloat(growthVelocity),
                churnRiskCount: churnRiskTenants.length,
                healthScore: parseInt(healthScore)
            },
            alerts,
            topPlans,
            generatedAt: new Date()
        };

    } catch (err) {
        throw new Error(`InsightsEngine Failure: ${err.message}`);
    }
};
