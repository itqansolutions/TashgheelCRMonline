const db = require('../config/db');

// @desc    Get Dashboard Statistics (KPIs)
// @route   GET /api/dashboard/stats
// @access  Private
exports.getStats = async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  try {
    // 1. Total Customers (Lead/Client)
    const customerQuery = role === 'admin' 
        ? 'SELECT COUNT(*) FROM customers' 
        : 'SELECT COUNT(*) FROM customers WHERE assigned_to = $1';
    const customerParams = role === 'admin' ? [] : [userId];
    const customerRes = await db.query(customerQuery, customerParams);

    // 2. Total Deals (By Pipeline Stage)
    const dealsQuery = role === 'admin'
        ? 'SELECT pipeline_stage, COUNT(*) FROM deals GROUP BY pipeline_stage'
        : 'SELECT pipeline_stage, COUNT(*) FROM deals WHERE assigned_to = $1 GROUP BY pipeline_stage';
    const dealsParams = role === 'admin' ? [] : [userId];
    const dealsRes = await db.query(dealsQuery, dealsParams);

    // 3. Pending Tasks
    const taskQuery = role === 'admin'
        ? "SELECT COUNT(*) FROM tasks WHERE status != 'completed'"
        : "SELECT COUNT(*) FROM tasks WHERE assigned_to = $1 AND status != 'completed'";
    const taskParams = role === 'admin' ? [] : [userId];
    const taskRes = await db.query(taskQuery, taskParams);

    // 4. Financial Summary (Total Income - Cash Basis)
    // For simplicity, Financials are usually Admin/Manager only or global
    const incomeRes = await db.query('SELECT SUM(amount) as total FROM payments');
    const expensesRes = await db.query('SELECT SUM(amount) as total FROM expenses');

    res.json({
      status: 'success',
      data: {
        customers_count: parseInt(customerRes.rows[0].count),
        pending_tasks: parseInt(taskRes.rows[0].count),
        deals_pipeline: dealsRes.rows,
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
    try {
        const result = await db.query(`
            SELECT u.name, COUNT(d.id) as total_deals, SUM(d.deal_value) as total_value
            FROM users u
            LEFT JOIN deals d ON u.id = d.assigned_to
            GROUP BY u.id, u.name
            ORDER BY total_value DESC
        `);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};
