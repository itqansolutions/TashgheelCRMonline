const db = require('../config/db');

/**
 * Dashboard Query Service
 * Modular, tenant-scoped, and permission-aware business queries for TASHGHEEL Dashboard.
 * 
 * Rules:
 * 1. Every query strictly filters by tenant_id::text = $1::text.
 * 2. Real estate collections canonical source: finance_vouchers (receipts, non-cancelled).
 * 3. Real estate contractual installments canonical source: re_installments.
 * 4. Only execute queries for enabled modules.
 */

// Helper to format date bounds
const getDateBounds = (timeFilter) => {
    if (timeFilter === 'TODAY') {
        return {
            condition: (col) => `${col} >= CURRENT_DATE AND ${col} < CURRENT_DATE + INTERVAL '1 day'`,
            label: 'Today'
        };
    } else if (timeFilter === 'THIS_WEEK') {
        return {
            condition: (col) => `${col} >= date_trunc('week', CURRENT_DATE)`,
            label: 'This Week'
        };
    } else if (timeFilter === 'THIS_MONTH') {
        return {
            condition: (col) => `${col} >= date_trunc('month', CURRENT_DATE)`,
            label: 'This Month'
        };
    }
    // Default: This Month
    return {
        condition: (col) => `${col} >= date_trunc('month', CURRENT_DATE)`,
        label: 'This Month'
    };
};

/**
 * ---------------------------------------------------------------------------
 * GENERAL DASHBOARD SERVICE FUNCTIONS
 * ---------------------------------------------------------------------------
 */

/**
 * Get General Sales KPIs (Today, This Month) and Receivables/Payables
 */
async function getGeneralFinanceMetrics(tenantId, timeFilter, hasFinanceAccess) {
    if (!hasFinanceAccess) {
        return { accessible: false };
    }

    const { condition: timeCond } = getDateBounds(timeFilter);

    // 1. Sales Today & Sales This Month from non-cancelled invoices
    const salesKpiRes = await db.query(`
        SELECT 
            COALESCE(SUM(total_amount) FILTER (WHERE created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL '1 day'), 0) as sales_today,
            COALESCE(SUM(total_amount) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)), 0) as sales_this_month,
            COALESCE(SUM(total_amount) FILTER (WHERE ${timeCond('created_at')}), 0) as sales_filtered_period
        FROM invoices
        WHERE tenant_id::text = $1::text
        AND (status IS NULL OR status != 'cancelled')
    `, [tenantId]);

    // 2. Receivables (Invoices total - paid)
    const receivablesRes = await db.query(`
        SELECT 
            COALESCE(SUM(CASE WHEN status != 'paid' THEN total_amount ELSE 0 END), 0) as outstanding,
            COALESCE(SUM(CASE WHEN status != 'paid' AND due_date < CURRENT_DATE THEN total_amount ELSE 0 END), 0) as overdue,
            COALESCE(SUM(CASE WHEN status != 'paid' AND due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '7 days' THEN total_amount ELSE 0 END), 0) as due_soon
        FROM invoices
        WHERE tenant_id::text = $1::text
        AND (status IS NULL OR status != 'cancelled')
    `, [tenantId]);

    // 3. Payables from purchase invoices (if table exists and accessible)
    let payables = { outstanding: 0, overdue: 0 };
    try {
        const payablesRes = await db.query(`
            SELECT 
                COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) as outstanding,
                COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN (total_amount - COALESCE(paid_amount, 0)) ELSE 0 END), 0) as overdue
            FROM purchase_invoices
            WHERE tenant_id::text = $1::text
            AND (status IS NULL OR status != 'cancelled')
        `, [tenantId]);
        if (payablesRes.rows.length > 0) {
            payables = {
                outstanding: parseFloat(payablesRes.rows[0].outstanding) || 0,
                overdue: parseFloat(payablesRes.rows[0].overdue) || 0
            };
        }
    } catch (e) {
        // Table might be absent or empty in some environments
    }

    // 4. Sales performance trend over current selected filter period
    let trendIntervalCond = "created_at >= date_trunc('month', CURRENT_DATE)";
    let periodLabel = "This Month";
    if (timeFilter === 'TODAY') {
        trendIntervalCond = "created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL '1 day'";
        periodLabel = "Today";
    } else if (timeFilter === 'THIS_WEEK') {
        trendIntervalCond = "created_at >= date_trunc('week', CURRENT_DATE)";
        periodLabel = "This Week";
    } else if (timeFilter === 'YTD') {
        trendIntervalCond = "created_at >= date_trunc('year', CURRENT_DATE)";
        periodLabel = "Year to Date";
    }

    const performanceRes = await db.query(`
        SELECT 
            TO_CHAR(created_at, 'YYYY-MM-DD') as period_date,
            COALESCE(SUM(total_amount), 0) as total_sales,
            COUNT(*) as invoice_count
        FROM invoices
        WHERE tenant_id::text = $1::text
        AND (status IS NULL OR status != 'cancelled')
        AND ${trendIntervalCond}
        GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
        ORDER BY period_date ASC
    `, [tenantId]);

    return {
        accessible: true,
        salesToday: parseFloat(salesKpiRes.rows[0]?.sales_today) || 0,
        salesThisMonth: parseFloat(salesKpiRes.rows[0]?.sales_this_month) || 0,
        salesFiltered: parseFloat(salesKpiRes.rows[0]?.sales_filtered_period) || 0,
        periodLabel,
        receivables: {
            outstanding: parseFloat(receivablesRes.rows[0]?.outstanding) || 0,
            overdue: parseFloat(receivablesRes.rows[0]?.overdue) || 0,
            dueSoon: parseFloat(receivablesRes.rows[0]?.due_soon) || 0
        },
        payables,
        trend: performanceRes.rows.map(r => ({
            date: r.period_date,
            sales: parseFloat(r.total_sales) || 0,
            count: parseInt(r.invoice_count) || 0
        }))
    };
}


/**
 * Get General CRM Sales Pipeline
 */
async function getGeneralPipeline(tenantId) {
    const pipelineStages = ['discovery', 'proposal', 'negotiation', 'won', 'lost'];
    const res = await db.query(`
        SELECT 
            LOWER(COALESCE(pipeline_stage, 'discovery')) as stage,
            COUNT(*) as deal_count,
            COALESCE(SUM(value), 0) as total_value
        FROM deals
        WHERE tenant_id::text = $1::text
        GROUP BY LOWER(COALESCE(pipeline_stage, 'discovery'))
    `, [tenantId]);

    const counts = {};
    const values = {};
    pipelineStages.forEach(s => { counts[s] = 0; values[s] = 0; });

    res.rows.forEach(r => {
        const stage = r.stage;
        counts[stage] = parseInt(r.deal_count) || 0;
        values[stage] = parseFloat(r.total_value) || 0;
    });

    return {
        stages: pipelineStages,
        counts,
        values
    };
}

/**
 * Get Procurement Status (Only when Purchasing module enabled)
 */
async function getGeneralProcurementMetrics(tenantId, hasPurchasingAccess) {
    if (!hasPurchasingAccess) {
        return { accessible: false };
    }

    try {
        const [prRes, rfqRes, poRes] = await Promise.all([
            db.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE status = 'submitted') as pending_requests,
                    COUNT(*) as total_requests
                FROM purchase_requests
                WHERE tenant_id::text = $1::text
            `, [tenantId]),
            db.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE status = 'sent') as pending_rfqs,
                    COUNT(*) as total_rfqs
                FROM rfqs
                WHERE tenant_id::text = $1::text
            `, [tenantId]),
            db.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE status IN ('draft', 'approved', 'sent_to_vendor')) as pending_orders,
                    COUNT(*) as total_orders
                FROM purchase_orders
                WHERE tenant_id::text = $1::text
            `, [tenantId])
        ]);

        return {
            accessible: true,
            pendingPurchaseRequests: parseInt(prRes.rows[0]?.pending_requests) || 0,
            totalPurchaseRequests: parseInt(prRes.rows[0]?.total_requests) || 0,
            pendingRfqs: parseInt(rfqRes.rows[0]?.pending_rfqs) || 0,
            totalRfqs: parseInt(rfqRes.rows[0]?.total_rfqs) || 0,
            pendingPurchaseOrders: parseInt(poRes.rows[0]?.pending_orders) || 0,
            totalPurchaseOrders: parseInt(poRes.rows[0]?.total_orders) || 0
        };
    } catch (e) {
        return { accessible: false, error: e.message };
    }
}

/**
 * Get Inventory Health (Only when Inventory module enabled)
 */
async function getGeneralInventoryMetrics(tenantId, hasInventoryAccess) {
    if (!hasInventoryAccess) {
        return { accessible: false };
    }

    try {
        // Query current stock levels per product using stock_movements
        const stockRes = await db.query(`
            WITH product_stock AS (
                SELECT 
                    p.id,
                    p.name,
                    p.cost_price,
                    COALESCE(SUM(
                        CASE 
                            WHEN m.type IN ('in', 'adjustment') THEN m.quantity
                            WHEN m.type = 'transfer' THEN m.quantity
                            ELSE 0 
                        END
                    ), 0) -
                    COALESCE(SUM(
                        CASE 
                            WHEN m.type IN ('out', 'adjustment') THEN m.quantity
                            WHEN m.type = 'transfer' THEN m.quantity
                            ELSE 0 
                        END
                    ), 0) as current_qty
                FROM products p
                LEFT JOIN stock_movements m ON p.id = m.product_id AND m.tenant_id::text = p.tenant_id::text AND m.status = 'approved'
                WHERE p.tenant_id::text = $1::text
                GROUP BY p.id, p.name, p.cost_price
            )
            SELECT 
                COUNT(*) as total_products,
                COUNT(*) FILTER (WHERE current_qty <= 0) as out_of_stock,
                COUNT(*) FILTER (WHERE current_qty > 0 AND current_qty <= 10) as low_stock,
                COALESCE(SUM(CASE WHEN current_qty > 0 THEN current_qty * COALESCE(cost_price, 0) ELSE 0 END), 0) as stock_value
            FROM product_stock
        `, [tenantId]);

        return {
            accessible: true,
            totalProducts: parseInt(stockRes.rows[0]?.total_products) || 0,
            outOfStock: parseInt(stockRes.rows[0]?.out_of_stock) || 0,
            lowStock: parseInt(stockRes.rows[0]?.low_stock) || 0,
            stockValue: parseFloat(stockRes.rows[0]?.stock_value) || 0
        };
    } catch (e) {
        return { accessible: false, error: e.message };
    }
}

/**
 * Get HR Overview (Only when HR module enabled)
 */
async function getGeneralHrMetrics(tenantId, hasHrAccess) {
    if (!hasHrAccess) {
        return { accessible: false };
    }

    try {
        const attRes = await db.query(`
            SELECT 
                COUNT(DISTINCT user_id) as present_today
            FROM hr_attendance
            WHERE tenant_id::text = $1::text
            AND DATE(check_in) = CURRENT_DATE
        `, [tenantId]);

        return {
            accessible: true,
            employeesPresentToday: parseInt(attRes.rows[0]?.present_today) || 0
        };
    } catch (e) {
        return { accessible: false, error: e.message };
    }
}

/**
 * Get User Pending Actions (Tasks, approvals)
 */
async function getUserPendingActions(tenantId, userId, role) {
    try {
        // Pending tasks assigned to user
        const tasksRes = await db.query(`
            SELECT id, title, priority, due_date
            FROM tasks
            WHERE tenant_id::text = $1::text
            AND assigned_to::text = $2::text
            AND status != 'completed'
            ORDER BY created_at DESC
            LIMIT 5
        `, [tenantId, String(userId)]);

        // Quotations requiring follow-up (draft/pending)
        const quotesRes = await db.query(`
            SELECT id, total_amount, valid_until, status
            FROM quotations
            WHERE tenant_id::text = $1::text
            AND status IN ('draft', 'sent', 'pending')
            ORDER BY created_at DESC
            LIMIT 5
        `, [tenantId]);

        return {
            tasks: tasksRes.rows,
            pendingQuotations: quotesRes.rows
        };
    } catch (e) {
        return { tasks: [], pendingQuotations: [] };
    }
}

/**
 * ---------------------------------------------------------------------------
 * REAL ESTATE DASHBOARD SERVICE FUNCTIONS
 * ---------------------------------------------------------------------------
 */

/**
 * Real Estate KPI Cards & Unit Status
 */
async function getRealEstateUnitsOverview(tenantId) {
    const unitStatsRes = await db.query(`
        SELECT 
            COUNT(*) as total_units,
            COUNT(*) FILTER (WHERE status = 'Available') as available,
            COUNT(*) FILTER (WHERE status = 'Reserved') as reserved,
            COUNT(*) FILTER (WHERE status = 'Sold') as sold
        FROM re_units
        WHERE tenant_id::text = $1::text
    `, [tenantId]);

    const row = unitStatsRes.rows[0] || {};
    return {
        total: parseInt(row.total_units) || 0,
        available: parseInt(row.available) || 0,
        reserved: parseInt(row.reserved) || 0,
        sold: parseInt(row.sold) || 0
    };
}

/**
 * Real Estate Canonical Pipeline
 * Stages: Lead, Interested, Site Visit, Negotiation, Closed
 */
async function getRealEstatePipeline(tenantId) {
    const stages = ['Lead', 'Interested', 'Site Visit', 'Negotiation', 'Closed'];
    const res = await db.query(`
        SELECT 
            pipeline_stage,
            COUNT(*) as count,
            COALESCE(SUM(value), 0) as total_value
        FROM deals
        WHERE tenant_id::text = $1::text
        GROUP BY pipeline_stage
    `, [tenantId]);

    const counts = { 'Lead': 0, 'Interested': 0, 'Site Visit': 0, 'Negotiation': 0, 'Closed': 0 };
    const values = { 'Lead': 0, 'Interested': 0, 'Site Visit': 0, 'Negotiation': 0, 'Closed': 0 };
    let activeDealsCount = 0;

    res.rows.forEach(r => {
        const raw = (r.pipeline_stage || '').trim().toLowerCase();
        let targetKey = null;

        if (raw === 'lead' || raw === 'discovery') targetKey = 'Lead';
        else if (raw === 'interested' || raw === 'qualification') targetKey = 'Interested';
        else if (raw === 'site visit' || raw === 'site_visit') targetKey = 'Site Visit';
        else if (raw === 'negotiation' || raw === 'proposal') targetKey = 'Negotiation';
        else if (raw === 'closed' || raw === 'won') targetKey = 'Closed';

        if (targetKey) {
            counts[targetKey] += parseInt(r.count) || 0;
            values[targetKey] += parseFloat(r.total_value) || 0;
            if (targetKey !== 'Closed') {
                activeDealsCount += parseInt(r.count) || 0;
            }
        }
    });

    return {
        stages,
        counts,
        values,
        activeDealsCount
    };
}

/**
 * Real Estate Expiring Reservations
 */
async function getRealEstateExpiringReservations(tenantId) {
    const res = await db.query(`
        SELECT 
            ru.id as unit_id,
            ru.unit_number,
            ru.project_name,
            ru.status as unit_status,
            ru.price as unit_price,
            ru.reservation_expires_at,
            d.id as deal_id,
            d.title as deal_title,
            c.id as customer_id,
            c.name as customer_name,
            c.phone as customer_phone
        FROM re_units ru
        LEFT JOIN deals d ON ru.id::text = d.unit_id::text AND d.tenant_id::text = ru.tenant_id::text
        LEFT JOIN customers c ON d.client_id::text = c.id::text AND c.tenant_id::text = ru.tenant_id::text
        WHERE ru.tenant_id::text = $1::text
        AND ru.status = 'Reserved'
        ORDER BY ru.reservation_expires_at ASC NULLS LAST
        LIMIT 6
    `, [tenantId]);

    const now = new Date();
    return res.rows.map(row => {
        let remainingMinutes = null;
        let isExpired = false;
        if (row.reservation_expires_at) {
            const exp = new Date(row.reservation_expires_at);
            const diffMs = exp.getTime() - now.getTime();
            remainingMinutes = Math.round(diffMs / 60000);
            isExpired = diffMs <= 0;
        }

        return {
            unitId: row.unit_id,
            unitNumber: row.unit_number || `Unit #${row.unit_id}`,
            projectName: row.project_name || 'N/A',
            unitPrice: parseFloat(row.unit_price) || 0,
            dealId: row.deal_id,
            dealTitle: row.deal_title || 'Direct Reservation',
            customerName: row.customer_name || 'Anonymous Client',
            customerPhone: row.customer_phone || '',
            expiresAt: row.reservation_expires_at,
            remainingMinutes,
            isExpired
        };
    });
}

/**
 * Real Estate Contracts & Installments
 */
async function getRealEstateContractsAndInstallments(tenantId) {
    // 1. Contracts summary
    const contractsRes = await db.query(`
        SELECT 
            COUNT(*) as total_contracts,
            COUNT(*) FILTER (WHERE contract_date >= date_trunc('month', CURRENT_DATE)) as contracts_this_month,
            COALESCE(SUM(contract_value), 0) as total_contract_value,
            COALESCE(SUM(contract_value) FILTER (WHERE contract_date >= date_trunc('month', CURRENT_DATE)), 0) as contracted_value_this_month
        FROM re_contracts
        WHERE tenant_id::text = $1::text
        AND (status IS NULL OR status != 'Cancelled')
    `, [tenantId]);

    // 2. Installments summary (Source of truth: re_installments)
    const installmentsRes = await db.query(`
        SELECT 
            COALESCE(SUM(amount - paid_amount) FILTER (WHERE due_date = CURRENT_DATE AND (status IS NULL OR status != 'Paid')), 0) as due_today,
            COALESCE(SUM(amount - paid_amount) FILTER (WHERE due_date >= date_trunc('week', CURRENT_DATE) AND due_date < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days' AND (status IS NULL OR status != 'Paid')), 0) as due_this_week,
            COALESCE(SUM(amount - paid_amount) FILTER (WHERE due_date < CURRENT_DATE AND (status IS NULL OR status != 'Paid')), 0) as overdue,
            COALESCE(SUM(paid_amount), 0) as total_installment_paid,
            COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND (status IS NULL OR status != 'Paid')) as overdue_count
        FROM re_installments
        WHERE tenant_id::text = $1::text
    `, [tenantId]);

    const cRow = contractsRes.rows[0] || {};
    const iRow = installmentsRes.rows[0] || {};

    return {
        contracts: {
            totalContracts: parseInt(cRow.total_contracts) || 0,
            contractsThisMonth: parseInt(cRow.contracts_this_month) || 0,
            totalContractedValue: parseFloat(cRow.total_contract_value) || 0,
            contractedValueThisMonth: parseFloat(cRow.contracted_value_this_month) || 0
        },
        installments: {
            dueToday: parseFloat(iRow.due_today) || 0,
            dueThisWeek: parseFloat(iRow.due_this_week) || 0,
            overdue: parseFloat(iRow.overdue) || 0,
            overdueCount: parseInt(iRow.overdue_count) || 0,
            totalPaidInSchedules: parseFloat(iRow.total_installment_paid) || 0
        }
    };
}

/**
 * Real Estate Financial Collections
 * Canonical Rule:
 * Actual Collected = finance_vouchers (receipts, non-cancelled)
 * Total Contractual Obligations = re_contracts.contract_value OR re_installments scheduled amounts
 */
async function getRealEstateCollectionsFlow(tenantId, hasFinanceAccess) {
    if (!hasFinanceAccess) {
        return { accessible: false };
    }

    // 1. Actual collected money from canonical finance_vouchers
    const vouchersRes = await db.query(`
        SELECT COALESCE(SUM(amount), 0) as actual_collected
        FROM finance_vouchers
        WHERE tenant_id::text = $1::text
        AND voucher_type = 'receipt'
        AND (status IS NULL OR status != 'cancelled')
    `, [tenantId]);

    const actualCollected = parseFloat(vouchersRes.rows[0]?.actual_collected) || 0;

    // 2. Total contracted value from re_contracts
    const contractsRes = await db.query(`
        SELECT COALESCE(SUM(contract_value), 0) as total_contracted
        FROM re_contracts
        WHERE tenant_id::text = $1::text
        AND (status IS NULL OR status != 'Cancelled')
    `, [tenantId]);

    const totalContracted = parseFloat(contractsRes.rows[0]?.total_contracted) || 0;

    // 3. Outstanding and Overdue from contractual re_installments schedule
    const installmentDueRes = await db.query(`
        SELECT 
            COALESCE(SUM(amount - paid_amount) FILTER (WHERE due_date < CURRENT_DATE AND (status IS NULL OR status != 'Paid')), 0) as overdue,
            COALESCE(SUM(amount - paid_amount) FILTER (WHERE (status IS NULL OR status != 'Paid')), 0) as total_uncollected
        FROM re_installments
        WHERE tenant_id::text = $1::text
    `, [tenantId]);

    const overdue = parseFloat(installmentDueRes.rows[0]?.overdue) || 0;
    const outstanding = Math.max(0, totalContracted - actualCollected);

    return {
        accessible: true,
        contractedValue: totalContracted,
        collectedAmount: actualCollected,
        outstandingAmount: outstanding,
        overdueAmount: overdue
    };
}

/**
 * Real Estate Top Salesmen & Commissions
 */
async function getRealEstateCommissionsOverview(tenantId, hasFinanceAccess) {
    try {
        // Salesmen performance rankings by closed deals
        const topAgentsRes = await db.query(`
            SELECT 
                u.id as user_id,
                u.name as user_name,
                COUNT(d.id) as deals_count,
                COALESCE(SUM(d.value), 0) as total_deal_value
            FROM users u
            JOIN deals d ON d.assigned_to::text = u.id::text AND d.tenant_id::text = u.tenant_id::text
            WHERE u.tenant_id::text = $1::text
            AND LOWER(COALESCE(d.pipeline_stage, '')) IN ('won', 'closed')
            GROUP BY u.id, u.name
            ORDER BY total_deal_value DESC
            LIMIT 5
        `, [tenantId]);

        let commissionMetrics = null;
        const agentCommissionsMap = {};

        if (hasFinanceAccess) {
            const commRes = await db.query(`
                SELECT 
                    COALESCE(SUM(calculated_amount), 0) as total_calculated,
                    COALESCE(SUM(paid_amount), 0) as total_paid,
                    COALESCE(SUM(calculated_amount - COALESCE(paid_amount, 0)), 0) as outstanding
                FROM re_commissions
                WHERE tenant_id::text = $1::text
            `, [tenantId]);

            commissionMetrics = {
                totalCalculated: parseFloat(commRes.rows[0]?.total_calculated) || 0,
                totalPaid: parseFloat(commRes.rows[0]?.total_paid) || 0,
                outstanding: parseFloat(commRes.rows[0]?.outstanding) || 0
            };

            // Fetch per-agent commission totals safely
            const perAgentCommRes = await db.query(`
                SELECT 
                    beneficiary_user_id,
                    COALESCE(SUM(calculated_amount), 0) as agent_comm_amount,
                    COALESCE(SUM(paid_amount), 0) as agent_paid_amount,
                    COUNT(*) FILTER (WHERE status = 'Paid') as paid_count,
                    COUNT(*) as total_count
                FROM re_commissions
                WHERE tenant_id::text = $1::text
                AND beneficiary_user_id IS NOT NULL
                GROUP BY beneficiary_user_id
            `, [tenantId]);

            perAgentCommRes.rows.forEach(r => {
                const uid = String(r.beneficiary_user_id);
                const commAmt = parseFloat(r.agent_comm_amount) || 0;
                const paidAmt = parseFloat(r.agent_paid_amount) || 0;
                const isAllPaid = parseInt(r.paid_count) === parseInt(r.total_count);
                agentCommissionsMap[uid] = {
                    commissionAmount: commAmt,
                    commissionPaid: paidAmt,
                    status: isAllPaid ? 'Paid' : (paidAmt > 0 ? 'Partially Paid' : 'Pending')
                };
            });
        }

        return {
            topAgents: topAgentsRes.rows.map(a => {
                const commInfo = agentCommissionsMap[String(a.user_id)] || null;
                return {
                    userId: a.user_id,
                    name: a.user_name || 'Agent',
                    dealsCount: parseInt(a.deals_count) || 0,
                    dealValue: parseFloat(a.total_deal_value) || 0,
                    commissionAmount: commInfo ? commInfo.commissionAmount : null,
                    commissionStatus: commInfo ? commInfo.status : null
                };
            }),
            commissions: commissionMetrics
        };
    } catch (e) {
        return { topAgents: [], commissions: null };
    }
}

/**
 * Real Estate Upcoming Handovers
 */
async function getRealEstateUpcomingHandovers(tenantId) {
    try {
        const res = await db.query(`
            SELECT 
                h.id as handover_id,
                h.scheduled_date,
                h.status as handover_status,
                h.snagging_notes,
                ru.unit_number,
                ru.project_name,
                c.name as customer_name,
                c.phone as customer_phone
            FROM re_handovers h
            LEFT JOIN re_units ru ON h.unit_id::text = ru.id::text AND ru.tenant_id::text = h.tenant_id::text
            LEFT JOIN customers c ON h.customer_id = c.id AND c.tenant_id::text = h.tenant_id::text
            WHERE h.tenant_id::text = $1::text
            AND (h.status IS NULL OR h.status != 'Handed Over')
            ORDER BY h.scheduled_date ASC NULLS LAST
            LIMIT 5
        `, [tenantId]);

        return res.rows.map(r => ({
            id: r.handover_id,
            scheduledDate: r.scheduled_date,
            status: r.handover_status || 'Pending Inspection',
            unitNumber: r.unit_number || 'Unit',
            projectName: r.project_name || 'Project',
            customerName: r.customer_name || 'Client',
            customerPhone: r.customer_phone || ''
        }));
    } catch (e) {
        return [];
    }
}

module.exports = {
    // General
    getGeneralFinanceMetrics,
    getGeneralPipeline,
    getGeneralProcurementMetrics,
    getGeneralInventoryMetrics,
    getGeneralHrMetrics,
    getUserPendingActions,

    // Real Estate
    getRealEstateUnitsOverview,
    getRealEstatePipeline,
    getRealEstateExpiringReservations,
    getRealEstateContractsAndInstallments,
    getRealEstateCollectionsFlow,
    getRealEstateCommissionsOverview,
    getRealEstateUpcomingHandovers
};
