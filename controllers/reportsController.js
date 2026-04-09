const db = require('../config/db');

// @desc    Get Top Selling Products (Analytics)
// @route   GET /api/reports/top-products
// @access  Private (Admin, Manager)
exports.getTopProducts = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    try {
        const result = await db.query(`
            SELECT p.name, p.category, SUM(ii.quantity) as total_sold, SUM(ii.subtotal) as total_revenue
            FROM invoice_items ii
            JOIN products p ON ii.product_id = p.id
            WHERE ii.tenant_id = $1
            GROUP BY p.id, p.name, p.category
            ORDER BY total_revenue DESC
            LIMIT 10
        `, [tenant_id]);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// @desc    Get Financial Trends (Monthly Revenue vs Expenses)
// @route   GET /api/reports/financial-trends
// @access  Private (Admin)
exports.getFinancialTrends = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    try {
        const revenueResult = await db.query(`
            SELECT TO_CHAR(payment_date, 'YYYY-MM') as month, SUM(amount) as revenue
            FROM payments
            WHERE tenant_id = $1
            GROUP BY month
            ORDER BY month ASC
        `, [tenant_id]);

        const expenseResult = await db.query(`
            SELECT TO_CHAR(expense_date, 'YYYY-MM') as month, SUM(amount) as expenses
            FROM expenses
            WHERE tenant_id = $1
            GROUP BY month
            ORDER BY month ASC
        `, [tenant_id]);

        res.json({
            status: 'success',
            data: {
                revenue: revenueResult.rows,
                expenses: expenseResult.rows
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// @desc    Get Sales by Customer (Analytics)
// @route   GET /api/reports/customer-rankings
// @access  Private (Admin, Manager)
exports.getCustomerRankings = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    try {
        const result = await db.query(`
            SELECT c.name, COUNT(i.id) as invoice_count, SUM(i.total_amount) as total_spent
            FROM customers c
            JOIN invoices i ON c.id = i.client_id
            WHERE i.tenant_id = $1
            GROUP BY c.id, c.name
            ORDER BY total_spent DESC
            LIMIT 10
        `, [tenant_id]);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};
