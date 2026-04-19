const db = require('../config/db');

async function testQuery() {
    try {
        console.log('Testing api/deals query...');
        await db.query(`
            SELECT 
                d.*, 
                c.name as client_name, 
                c.company_name as client_company,
                p.name as product_name,
                u.name as assigned_to_name,
                ru.project_name as unit_project,
                ru.unit_number as unit_number,
                rp.next_payment_date,
                rp.status as payment_status,
                rp.paid_amount,
                rp.total_amount as payment_total
            FROM deals d
            LEFT JOIN customers c ON d.client_id::text = c.id::text
            LEFT JOIN products p ON d.product_id::text = p.id::text
            LEFT JOIN users u ON d.assigned_to::text = u.id::text
            LEFT JOIN re_units ru ON d.unit_id::text = ru.id::text
            LEFT JOIN re_payments_mvp rp ON d.id::text = rp.deal_id::text
            LIMIT 1
        `);
        console.log('✅ Deals query successful');
    } catch (e) {
        console.error('❌ Deals query failed:', e.message);
    }
    
    try {
        console.log('\nTesting api/reports/top-products ...');
        await db.query(`
            SELECT p.name, p.category, SUM(ii.quantity) as total_sold, SUM(ii.subtotal) as total_revenue
            FROM invoice_items ii
            JOIN products p ON ii.product_id::text = p.id::text
            GROUP BY p.id, p.name, p.category
        `);
        console.log('✅ Reports query successful');
    } catch (e) {
        console.error('❌ Reports query failed:', e.message);
    }
    
    try {
        console.log('\nTesting invoices query from financeController ...');
        await db.query(`
            SELECT 
                i.*,
                COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id::text = i.id::text), 0) as total_paid,
                (i.total_amount - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id::text = i.id::text), 0)) as remaining_balance,
                c.name as customer_name
            FROM invoices i
            LEFT JOIN deals d ON i.deal_id::text = d.id::text 
            LEFT JOIN customers c ON i.client_id::text = c.id::text
            LIMIT 1
        `);
        console.log('✅ Invoices query successful');
    } catch(e) {
        console.error('❌ Invoices query failed:', e.message);
    }
    
    process.exit();
}

testQuery();
