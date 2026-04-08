const db = require('../config/db');

async function checkInvoicesSchema() {
    try {
        console.log('Checking Invoices table columns...');
        const result = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'invoices'
        `);
        console.log('Columns in Invoices table:');
        result.rows.forEach(row => console.log(`- ${row.column_name} (${row.data_type})`));
    } catch (err) {
        console.error('FAILED with error:', err.message);
    } finally {
        process.exit();
    }
}

checkInvoicesSchema();
