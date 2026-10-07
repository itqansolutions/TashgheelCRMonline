const db = require('../config/db');

// @desc    Get Top Selling Products (Analytics)
// @route   GET /api/reports/top-products
// @access  Private (Admin, Manager)
exports.getTopProducts = async (req, res) => {
    const tenant_id = req.tenant_id || req.user?.tenant_id;
    const branch_id = req.branchId || req.user?.branch_id;
    if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'Tenant context missing' });
    }
    try {
        const result = await db.query(`
            SELECT 
                p.name, 
                p.category, 
                COALESCE(SUM(ii.quantity), 0) as total_sold, 
                COALESCE(SUM(ii.subtotal), 0) as total_revenue
            FROM invoice_items ii
            JOIN products p 
                ON ii.product_id::text = p.id::text 
                AND COALESCE(ii.tenant_id::text, $1::text) = p.tenant_id::text
            WHERE COALESCE(ii.tenant_id::text, $1::text) = $1::text
              AND ($2::text IS NULL OR COALESCE(ii.branch_id::text, $2::text) = $2::text)
            GROUP BY p.id, p.name, p.category
            ORDER BY total_revenue DESC
            LIMIT 10
        `, [tenant_id, branch_id || null]);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('[REPORTS] Top Products Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to aggregate product metrics' });
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
                SELECT TO_CHAR(voucher_date, 'YYYY-MM') as month, SUM(amount) as revenue
                FROM finance_vouchers
                WHERE tenant_id::text = $1::text
                AND voucher_type = 'receipt'
                AND (COALESCE(status, 'active') != 'cancelled')
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

// @desc    Get Funnel Analytics (Real Estate vs General)
// @route   GET /api/reports/funnel
// @access  Private (Admin, Manager)
exports.getFunnelReport = async (req, res) => {
    const tenant_id = req.tenant_id || req.user?.tenant_id;

    if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'Tenant context missing' });
    }

    try {
        const tenantRes = await db.query('SELECT template_name FROM tenants WHERE id::text = $1::text', [tenant_id]);
        const templateName = tenantRes.rows[0]?.template_name || 'general';

        if (templateName === 'real_estate') {
            // Real Estate Funnel: Lead -> Customer -> Requirement -> Deal -> Site Visit -> Reservation -> Contract -> Collection -> Commission -> Handover
            const [
                leadsRes,
                customersRes,
                requirementsRes,
                dealsRes,
                siteVisitsRes,
                reservationsRes,
                contractsRes,
                collectionsRes,
                commissionsRes,
                handoversRes
            ] = await Promise.all([
                db.query(`SELECT COUNT(*)::int as count FROM customers WHERE tenant_id::text = $1::text AND status = 'lead'`, [tenant_id]),
                db.query(`SELECT COUNT(*)::int as count FROM customers WHERE tenant_id::text = $1::text AND status = 'customer'`, [tenant_id]),
                db.query(`SELECT COUNT(*)::int as count FROM customers WHERE tenant_id::text = $1::text AND (budget_min IS NOT NULL OR budget_max IS NOT NULL OR preferred_location IS NOT NULL OR preferred_rooms IS NOT NULL)`, [tenant_id]),
                db.query(`SELECT COUNT(*)::int as count FROM deals WHERE tenant_id::text = $1::text`, [tenant_id]),
                db.query(`SELECT COUNT(*)::int as count FROM activities WHERE tenant_id::text = $1::text AND (type = 'site_visit' OR type = 'meeting' OR notes ILIKE '%visit%')`, [tenant_id]),
                db.query(`SELECT COUNT(*)::int as count FROM deals WHERE tenant_id::text = $1::text AND (pipeline_stage ILIKE '%reserv%' OR unit_id IS NOT NULL)`, [tenant_id]),
                db.query(`SELECT COUNT(*)::int as count FROM re_contracts WHERE tenant_id::text = $1::text AND status != 'Cancelled'`, [tenant_id]),
                db.query(`SELECT COUNT(DISTINCT COALESCE(deal_id, contract_id))::int as count FROM finance_vouchers WHERE tenant_id::text = $1::text AND voucher_type = 'receipt' AND (deal_id IS NOT NULL OR contract_id IS NOT NULL) AND (COALESCE(status, 'active') != 'cancelled')`, [tenant_id]),
                db.query(`SELECT COUNT(*)::int as count FROM re_commissions WHERE tenant_id::text = $1::text AND status IN ('Approved', 'Paid')`, [tenant_id]),
                db.query(`SELECT COUNT(*)::int as count FROM re_handovers WHERE tenant_id::text = $1::text`, [tenant_id])
            ]);

            const funnelStages = [
                { stage: 'lead', name: 'Lead', count: leadsRes.rows[0].count },
                { stage: 'customer', name: 'Customer', count: customersRes.rows[0].count },
                { stage: 'requirement', name: 'Requirement', count: requirementsRes.rows[0].count },
                { stage: 'deal', name: 'Deal', count: dealsRes.rows[0].count },
                { stage: 'site_visit', name: 'Site Visit', count: siteVisitsRes.rows[0].count },
                { stage: 'reservation', name: 'Reservation', count: reservationsRes.rows[0].count },
                { stage: 'contract', name: 'Contract', count: contractsRes.rows[0].count },
                { stage: 'collection', name: 'Collection', count: collectionsRes.rows[0].count },
                { stage: 'commission', name: 'Commission', count: commissionsRes.rows[0].count },
                { stage: 'handover', name: 'Handover', count: handoversRes.rows[0].count }
            ];

            return res.json({
                status: 'success',
                template: 'real_estate',
                funnel: funnelStages
            });
        } else {
            // General Funnel: Lead -> Customer -> Quotation -> Sales Order -> Delivery -> Invoice -> Collection
            const [
                leadsRes,
                customersRes,
                dealsRes,
                quotationsRes,
                salesOrdersRes,
                deliveriesRes,
                invoicesRes,
                collectionsRes
            ] = await Promise.all([
                db.query(`SELECT COUNT(*)::int as count FROM customers WHERE tenant_id::text = $1::text AND status = 'lead'`, [tenant_id]),
                db.query(`SELECT COUNT(*)::int as count FROM customers WHERE tenant_id::text = $1::text AND status = 'customer'`, [tenant_id]),
                db.query(`SELECT COUNT(*)::int as count FROM deals WHERE tenant_id::text = $1::text`, [tenant_id]),
                db.query(`SELECT COUNT(*)::int as count FROM quotations WHERE tenant_id::text = $1::text`, [tenant_id]),
                db.query(`SELECT COUNT(*)::int as count FROM sales_orders WHERE tenant_id::text = $1::text`, [tenant_id]),
                db.query(`SELECT COUNT(*)::int as count FROM delivery_notes WHERE tenant_id::text = $1::text`, [tenant_id]),
                db.query(`SELECT COUNT(*)::int as count FROM invoices WHERE tenant_id::text = $1::text`, [tenant_id]),
                db.query(`SELECT COUNT(DISTINCT customer_id)::int as count FROM finance_vouchers WHERE tenant_id::text = $1::text AND voucher_type = 'receipt' AND (COALESCE(status, 'active') != 'cancelled')`, [tenant_id])
            ]);

            const funnelStages = [
                { stage: 'lead', name: 'Lead', count: leadsRes.rows[0].count },
                { stage: 'customer', name: 'Customer', count: customersRes.rows[0].count },
                { stage: 'deal', name: 'Deal', count: dealsRes.rows[0].count },
                { stage: 'quotation', name: 'Quotation', count: quotationsRes.rows[0].count },
                { stage: 'sales_order', name: 'Sales Order', count: salesOrdersRes.rows[0].count },
                { stage: 'delivery', name: 'Delivery', count: deliveriesRes.rows[0].count },
                { stage: 'invoice', name: 'Invoice', count: invoicesRes.rows[0].count },
                { stage: 'collection', name: 'Collection', count: collectionsRes.rows[0].count }
            ];

            return res.json({
                status: 'success',
                template: 'general',
                funnel: funnelStages
            });
        }
    } catch (err) {
        console.error('[Funnel Report Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};
