const db = require('../config/db');

// @desc    Get Dashboard Statistics (KPIs)
// @route   GET /api/dashboard/stats
// @access  Private
exports.getStats = async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;
  const tenant_id = req.user.tenant_id;

  try {
    // 1. Total Customers (Lead/Client)
    const customerQuery = role === 'admin' 
        ? 'SELECT COUNT(*) FROM customers WHERE tenant_id = $1' 
        : 'SELECT COUNT(*) FROM customers WHERE assigned_to = $1 AND tenant_id = $2';
    const customerParams = role === 'admin' ? [tenant_id] : [userId, tenant_id];
    const customerRes = await db.query(customerQuery, customerParams);

    // 2. Total Deals (By Pipeline Stage)
    const dealsQuery = role === 'admin'
        ? 'SELECT pipeline_stage, COUNT(*) FROM deals WHERE tenant_id = $1 GROUP BY pipeline_stage'
        : 'SELECT pipeline_stage, COUNT(*) FROM deals WHERE assigned_to = $1 AND tenant_id = $2 GROUP BY pipeline_stage';
    const dealsParams = role === 'admin' ? [tenant_id] : [userId, tenant_id];
    const dealsRes = await db.query(dealsQuery, dealsParams);

    // 3. Pending Tasks
    const taskQuery = role === 'admin'
        ? "SELECT COUNT(*) FROM tasks WHERE status != 'completed' AND tenant_id = $1"
        : "SELECT COUNT(*) FROM tasks WHERE assigned_to = $1 AND status != 'completed' AND tenant_id = $2";
    const taskParams = role === 'admin' ? [tenant_id] : [userId, tenant_id];
    const taskRes = await db.query(taskQuery, taskParams);

    // 4. Financial Summary (Total Income - Cash Basis)
    const incomeRes = await db.query('SELECT SUM(amount) as total FROM payments WHERE tenant_id = $1', [tenant_id]);
    const expensesRes = await db.query('SELECT SUM(amount) as total FROM expenses WHERE tenant_id = $1', [tenant_id]);

    // 5. Win Rate Calculation
    const winRateRes = await db.query(`
        SELECT 
            COUNT(*) FILTER (WHERE pipeline_stage = 'won') as won,
            COUNT(*) FILTER (WHERE pipeline_stage IN ('won', 'lost')) as total_closed
        FROM deals 
        WHERE tenant_id = $1`, [tenant_id]);
    
    const { won, total_closed } = winRateRes.rows[0];
    const winRate = total_closed > 0 ? (parseInt(won) / parseInt(total_closed) * 100).toFixed(1) : 0;

    // 6. Pipeline Value (Open Deals)
    const pipelineValueRes = await db.query(`
        SELECT SUM(value) as total_value 
        FROM deals 
        WHERE pipeline_stage NOT IN ('won', 'lost') AND tenant_id = $1`, [tenant_id]);

    res.json({
      status: 'success',
      data: {
        customers_count: parseInt(customerRes.rows[0].count),
        pending_tasks: parseInt(taskRes.rows[0].count),
        deals_pipeline: dealsRes.rows,
        win_rate: winRate,
        pipeline_value: parseFloat(pipelineValueRes.rows[0].total_value || 0),
        finance: {
            total_income: parseFloat(incomeRes.rows[0].total || 0),
            total_expenses: parseFloat(expensesRes.rows[0].total || 0),
            net_profit: parseFloat(incomeRes.rows[0].total || 0) - parseFloat(expensesRes.rows[0].total || 0)
        }
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get Deal Distribution per User (Admin only)
// @route   GET /api/dashboard/team-performance
// @access  Private (Admin)
exports.getTeamPerformance = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    try {
        const result = await db.query(`
            SELECT u.name, COUNT(d.id) as total_deals, SUM(d.value) as total_value
            FROM users u
            LEFT JOIN deals d ON u.id = d.assigned_to
            WHERE u.tenant_id = $1
            GROUP BY u.id, u.name
            ORDER BY total_value DESC
        `, [tenant_id]);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};
