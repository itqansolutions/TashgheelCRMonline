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
            JOIN products p ON .product_id::text = .id::text AND .tenant_id::text = .tenant_id::text
            WHERE ii.tenant_id::text = $1::text
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
        const tenantRes = await db.query('SELECT template_name FROM tenants WHERE id::text = $1::text', [tenant_id]);
        const templateName = tenantRes.rows[0]?.template_name;

        let revenueResult;
        if (templateName === 'real_estate') {
            revenueResult = await db.query(`
                SELECT TO_CHAR(created_at, 'YYYY-MM') as month, SUM(paid_amount) as revenue
                FROM re_payments_mvp
                WHERE tenant_id::text = $1::text
                GROUP BY month
                ORDER BY month ASC
            `, [tenant_id]);
        } else {
            revenueResult = await db.query(`
                SELECT TO_CHAR(created_at, 'YYYY-MM') as month, SUM(total_amount) as revenue
                FROM invoices
                WHERE tenant_id::text = $1::text
                GROUP BY month
                ORDER BY month ASC
            `, [tenant_id]);
        }

        const expenseResult = await db.query(`
            SELECT TO_CHAR(expense_date, 'YYYY-MM') as month, SUM(amount) as expenses
            FROM expenses
            WHERE tenant_id::text = $1::text
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
            JOIN invoices i ON c.id::text = i.client_id::text
            WHERE i.tenant_id::text = $1::text
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
