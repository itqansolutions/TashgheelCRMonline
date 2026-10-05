const db = require('../config/db');

// @desc    Get Profit/Loss Summary (Cash Basis)
// @route   GET /api/accounting/profit-loss
// @access  Private
exports.getProfitLoss = async (req, res) => {
  const tenant_id = req.user?.tenant_id;
  const { startDate, endDate } = req.query;
  
  let incomeConditions = ["tenant_id::text = $1::text", "(COALESCE(status, 'active') != 'cancelled')"];
  let incomeParams = [tenant_id];
  let expenseConditions = ['tenant_id::text = $1::text'];
  let expenseParams = [tenant_id];
  
  if (startDate && endDate) {
    incomeConditions.push('payment_date BETWEEN $2 AND $3');
    incomeParams.push(startDate, endDate);

    expenseConditions.push('expense_date BETWEEN $2 AND $3');
    expenseParams.push(startDate, endDate);
  }

  try {
    // 1. Calculate Total Income (from payments)
    const incomeResult = await db.query(
      `SELECT SUM(amount) as total_income FROM payments WHERE ${incomeConditions.join(' AND ')}`,
      incomeParams
    );
    const totalIncome = parseFloat(incomeResult.rows[0]?.total_income || 0);

    // 2. Calculate Total Expenses
    const expenseResult = await db.query(
      `SELECT SUM(amount) as total_expenses FROM expenses WHERE ${expenseConditions.join(' AND ')}`,
      expenseParams
    );
    const totalExpenses = parseFloat(expenseResult.rows[0]?.total_expenses || 0);

    // 3. Calculate Profit
    const profit = totalIncome - totalExpenses;

    res.json({
      status: 'success',
      data: {
        total_income: totalIncome,
        total_expenses: totalExpenses,
        net_profit: profit,
        currency: 'EGP',
        period: {
          start: startDate || 'all time',
          end: endDate || 'all time'
        }
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get Financial Summary by Category
// @route   GET /api/accounting/summary-categories
// @access  Private
exports.getSummaryByCategories = async (req, res) => {
  const tenant_id = req.user?.tenant_id;
  try {
    const expenseCategories = await db.query(
      'SELECT category, SUM(amount) as total FROM expenses WHERE tenant_id::text = $1::text GROUP BY category',
      [tenant_id]
    );
    
    // We could also group income by customer or source if needed
    
    res.json({
      status: 'success',
      data: {
        expenses_by_category: expenseCategories.rows
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
