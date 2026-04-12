const db = require('../config/db');

// In-Memory Cache for BI Dashboard (TTL: 5 Minutes)
const dashboardCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Helper to generate a consistent cache key
const generateCacheKey = (tenantId, branchId, viewMode, role) => {
    return `dashboard:${tenantId}:${branchId || 'ALL'}:${viewMode}:${role}`;
};

/**
 * BI Intelligence Engine: Get Branch Summary (Revenue, Expenses, Profit, WinRate, Tasks)
 * Handles both "Global Mode" and "Single Branch Mode" with Role restrictions.
 */
// @desc    Get Branch Summary Analytics
// @route   GET /api/dashboard/branch-summary
// @access  Private
exports.getBranchSummary = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const role = req.user.role;
    
    // View Mode parameters from Frontend Query
    let { viewMode = 'SINGLE', targetBranchId = req.branchId, timeFilter = 'YTD' } = req.query;

    // --- Role Protection Enforcement ---
    if (role === 'employee') {
        // Employees are strictly locked to their single context branch
        viewMode = 'SINGLE';
        targetBranchId = req.branchId; 
    }

    const cacheKey = generateCacheKey(`${tenant_id}:${timeFilter}`, targetBranchId, viewMode, role);
    
    // 1. Check Cache
    const cachedData = dashboardCache.get(cacheKey);
    if (cachedData && cachedData.expiresAt > Date.now()) {
        console.log('[BI-CACHE HIT]', cacheKey);
        return res.json({ status: 'success', data: cachedData.data, cached: true });
    }

    try {
        console.log(`[BI-ENGINE] Running Aggregations | Mode: ${viewMode} | Target: ${targetBranchId} | Time: ${timeFilter}`);
        
        // Define filters based on time filter
        const timeFilterLogic = (col) => {
            if (timeFilter === 'THIS_MONTH') {
                return `${col} >= date_trunc('month', CURRENT_DATE)`;
            } else if (timeFilter === 'LAST_MONTH') {
                return `${col} >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND ${col} < date_trunc('month', CURRENT_DATE)`;
            }
            // YTD Default
            return `${col} > NOW() - INTERVAL '1 year'`;
        };

        let queryParams = [tenant_id];
        let branchFilter = '';
        
        if (viewMode === 'SINGLE') {
            branchFilter = `AND branch_id = $2`;
            queryParams.push(targetBranchId);
        } // If ALL, no branch filter, aggregates everything for the tenant

        // --- Execute Optimized Queries ---
        
        // 1. Revenue
        const revRes = await db.query(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM payments 
            WHERE tenant_id = $1 ${branchFilter}
            AND ${timeFilterLogic('payment_date')}
        `, queryParams);
        const revenue = parseFloat(revRes.rows[0].total);

        // 2. Expenses
        const expRes = await db.query(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM expenses 
            WHERE tenant_id = $1 ${branchFilter}
            AND ${timeFilterLogic('expense_date')}
        `, queryParams);
        const expenses = parseFloat(expRes.rows[0].total);

        // 3. Deals (Win Rate & Total Pipeline)
        const dealsRes = await db.query(`
            SELECT 
                COUNT(*) FILTER (WHERE pipeline_stage = 'won') as won_count,
                COUNT(*) as total_count
            FROM deals 
            WHERE tenant_id = $1 ${branchFilter}
            AND ${timeFilterLogic('created_at')}
        `, queryParams);
        
        const wonDeals = parseInt(dealsRes.rows[0].won_count);
        const totalDeals = parseInt(dealsRes.rows[0].total_count);
        const winRate = totalDeals > 0 ? ((wonDeals / totalDeals) * 100).toFixed(1) : 0;

        // 4. Tasks (Completion Rate)
        const tasksRes = await db.query(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
                COUNT(*) as total_count
            FROM tasks
            WHERE tenant_id = $1 ${branchFilter}
            AND ${timeFilterLogic('created_at')}
        `, queryParams);
        
        const completedTasks = parseInt(tasksRes.rows[0].completed_count);
        const totalTasks = parseInt(tasksRes.rows[0].total_count);
        const taskCompletion = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : 0;

        // --- BI Insight Engine (Previous Period calculation) ---
        const prevTimeFilterLogic = (col) => {
            if (timeFilter === 'THIS_MONTH') {
                return `${col} >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND ${col} < date_trunc('month', CURRENT_DATE)`;
            } else if (timeFilter === 'LAST_MONTH') {
                return `${col} >= date_trunc('month', CURRENT_DATE - INTERVAL '2 month') AND ${col} < date_trunc('month', CURRENT_DATE - INTERVAL '1 month')`;
            }
            // YTD Previous
            return `${col} > NOW() - INTERVAL '2 year' AND ${col} <= NOW() - INTERVAL '1 year'`;
        };

        const prevRevRes = await db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE tenant_id = $1 ${branchFilter} AND ${prevTimeFilterLogic('payment_date')}`, queryParams);
        const prevExpRes = await db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE tenant_id = $1 ${branchFilter} AND ${prevTimeFilterLogic('expense_date')}`, queryParams);
        
        const prevRevenue = parseFloat(prevRevRes.rows[0].total);
        const prevExpenses = parseFloat(prevExpRes.rows[0].total);
        const prevProfit = prevRevenue - prevExpenses;

        // -- Rule Processing
        const insights = [];
        
        // Rule 1: Revenue increased > 15%
        if (prevRevenue > 0) {
            const revGrowth = ((revenue - prevRevenue) / prevRevenue) * 100;
            if (revGrowth > 15) {
                insights.push({ type: 'success', message: `Outstanding! Revenue increased by ${revGrowth.toFixed(1)}% compared to the previous period.` });
            }
        } else if (revenue > 0 && prevRevenue === 0) {
             insights.push({ type: 'success', message: `Outstanding! Revenue jumped to ${revenue.toLocaleString()} EGP from 0 in the previous period.` });
        }

        // Rule 2: Expenses increased > 20%
        if (prevExpenses > 0) {
            const expGrowth = ((expenses - prevExpenses) / prevExpenses) * 100;
            if (expGrowth > 20) {
                insights.push({ type: 'warning', message: `Warning: Expenses surged by ${expGrowth.toFixed(1)}% compared to the previous period.` });
            }
        }

        // Rule 3: Profit decreased
        if (profit < prevProfit) {
            insights.push({ type: 'critical', message: `Critical Alert: Net Profit is lower than the previous period (${profit.toLocaleString()} vs ${prevProfit.toLocaleString()} EGP). Action required.` });
        }

        const payload = {
            revenue,
            expenses,
            profit,
            profitMargin,
            winRate,
            wonDeals,
            totalDeals,
            taskCompletion,
            completedTasks,
            totalTasks,
            viewMode,
            insights,
            branchContext: viewMode === 'SINGLE' ? targetBranchId : 'ALL'
        };

        // 5. Update Cache
        dashboardCache.set(cacheKey, {
            data: payload,
            expiresAt: Date.now() + CACHE_TTL_MS
        });

        res.json({
            status: 'success',
            data: payload,
            cached: false
        });

    } catch (err) {
        console.error('CRITICAL BI ENGINE ERROR:', err.message);
        res.status(500).json({ status: 'error', message: 'Intelligence aggregation failed.' });
    }
};

// @desc    Get Branch Comparison & Leaderboard (BI Engine)
// @route   GET /api/dashboard/branch-comparison
// @access  Private (Admin/Manager)
exports.getComparison = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const { timeFilter = 'YTD' } = req.query;
    
    const cacheKey = `dashboard:comparison:${tenant_id}:${timeFilter}`;

    // 1. Check Cache
    const cachedData = dashboardCache.get(cacheKey);
    if (cachedData && cachedData.expiresAt > Date.now()) {
        console.log('[BI-CACHE HIT] Comparison');
        return res.json({ status: 'success', data: cachedData.data, cached: true });
    }

    try {
        console.log(`[BI-ENGINE] Running Branch Comparison/Leaderboard Query | Time: ${timeFilter}`);
        
        // Define filters based on time filter
        const timeFilterLogic = (col) => {
            if (timeFilter === 'THIS_MONTH') {
                return `${col} >= date_trunc('month', CURRENT_DATE)`;
            } else if (timeFilter === 'LAST_MONTH') {
                return `${col} >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND ${col} < date_trunc('month', CURRENT_DATE)`;
            }
            return `${col} > NOW() - INTERVAL '1 year'`;
        };

        // CTEs to calculate branch-level aggregations safely
        const query = `
            WITH branch_metrics AS (
                SELECT 
                    b.id as branch_id,
                    b.name as branch_name,
                    COALESCE((SELECT SUM(amount) FROM payments p WHERE p.branch_id = b.id AND p.tenant_id = b.tenant_id AND ${timeFilterLogic('p.payment_date')}), 0) as revenue,
                    COALESCE((SELECT SUM(amount) FROM expenses e WHERE e.branch_id = b.id AND e.tenant_id = b.tenant_id AND ${timeFilterLogic('e.expense_date')}), 0) as expenses,
                    
                    COALESCE((SELECT COUNT(*) FROM deals d WHERE d.branch_id = b.id AND d.tenant_id = b.tenant_id AND d.pipeline_stage = 'won' AND ${timeFilterLogic('d.created_at')}), 0) as won_deals,
                    COALESCE((SELECT COUNT(*) FROM deals d WHERE d.branch_id = b.id AND d.tenant_id = b.tenant_id AND ${timeFilterLogic('d.created_at')}), 0) as total_deals,
                    
                    COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.branch_id = b.id AND t.tenant_id = b.tenant_id AND t.status = 'completed' AND ${timeFilterLogic('t.created_at')}), 0) as completed_tasks,
                    COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.branch_id = b.id AND t.tenant_id = b.tenant_id AND ${timeFilterLogic('t.created_at')}), 0) as total_tasks
                FROM branches b
                WHERE b.tenant_id = $1
            )
            SELECT 
                branch_id,
                branch_name,
                revenue,
                expenses,
                (revenue - expenses) as profit,
                CASE WHEN total_deals > 0 THEN (won_deals::float / total_deals::float * 100) ELSE 0 END as win_rate,
                CASE WHEN total_tasks > 0 THEN (completed_tasks::float / total_tasks::float * 100) ELSE 0 END as task_completion
            FROM branch_metrics
        `;

        const result = await db.query(query, [tenant_id]);

        // 3. Process Smart Score in Memory
        // Normalize profit so it can be combined reasonably with percentages (WinRate 0-100, Task 0-100)
        let maxProfit = Math.max(...result.rows.map(r => parseFloat(r.profit)), 1);

        const leaderboard = result.rows.map(row => {
            const profit = parseFloat(row.profit);
            const winRate = parseFloat(row.win_rate);
            const taskCompletion = parseFloat(row.task_completion);
            
            // Profit ratio relative to highest performing branch
            const normalizedProfit = maxProfit > 0 ? (profit / maxProfit) * 100 : 0;

            // Score definition: (Profit * 0.6) + (WinRate * 0.2) + (TaskCompletion * 0.2)
            const score = (normalizedProfit * 0.6) + (winRate * 0.2) + (taskCompletion * 0.2);

            return {
                ...row,
                revenue: parseFloat(row.revenue),
                expenses: parseFloat(row.expenses),
                profit,
                winRate: parseFloat(winRate.toFixed(1)),
                taskCompletion: parseFloat(taskCompletion.toFixed(1)),
                score: parseFloat(score.toFixed(2))
            };
        }).sort((a, b) => b.score - a.score); // Order by Score DESC

        dashboardCache.set(cacheKey, {
            data: leaderboard,
            expiresAt: Date.now() + CACHE_TTL_MS
        });

        res.json({ status: 'success', data: leaderboard, cached: false });

    } catch (err) {
        console.error('CRITICAL BI ENGINE COMPARISON ERROR:', err.message);
        res.status(500).json({ status: 'error', message: 'Intelligence Dashboard Comparison failed.' });
    }
};
