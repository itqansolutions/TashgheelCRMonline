const db = require('../config/db');

async function test() {
    try {
        const tenant_id = '1823f592-3a72-4d2a-9908-910e7add6a26'; // example UUID
        const branch_id = '1'; // example numeric
        
        console.log('Testing re_units GET query...');
        const units = await db.query(`
            SELECT ru.*, 
                   c.name as vendor_name,
                   u.name as responsible_person_name
            FROM re_units ru
            LEFT JOIN customers c ON ru.vendor_id = c.id
            LEFT JOIN users u ON ru.responsible_person_id = u.id
            WHERE ru.tenant_id::text = $1::text AND ru.branch_id::text = $2::text
            ORDER BY ru.project_name DESC, ru.name ASC
        `, [tenant_id, branch_id]);
        console.log('re_units OK, rows:', units.rows.length);

    } catch (e) {
        console.error('ERROR in re_units query:', e.message);
    }

    try {
        console.log('Testing invoices GET query...');
        // Let's see deals query
        const deals = await db.query(`
            SELECT d.*, 
                   c.name as client_name, c.email as client_email,
                   u.name as assigned_to_name,
                   ru.name as unit_name, ru.project_name
            FROM deals d
            LEFT JOIN customers c ON d.client_id = c.id
            LEFT JOIN users u ON d.assigned_to = u.id
            LEFT JOIN re_units ru ON d.unit_id = ru.id
            WHERE d.tenant_id::text = $1::text AND d.branch_id::text = $2::text
            ORDER BY d.created_at DESC
        `, ['test', 'test']);
        console.log('deals OK:', deals.rows.length);
    } catch (e) {
        console.error('ERROR in deals query:', e.message);
    }

    try {
        console.log('Testing reports top-products query...');
        const top = await db.query(`
            SELECT p.name, SUM(ii.quantity) as sold, SUM(ii.total) as revenue
            FROM invoice_items ii
            JOIN invoices i ON ii.invoice_id = i.id
            JOIN products p ON ii.product_id = p.id
            WHERE i.tenant_id::text = $1::text 
            GROUP BY p.name
            ORDER BY sold DESC
            LIMIT 5
        `, ['test']);
        console.log('top-products OK:', top.rows.length);
    } catch(e) {
        console.error('ERROR in top-products:', e.message);
    }

    process.exit();
}

test();
