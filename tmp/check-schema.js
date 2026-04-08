const db = require('../config/db');

async function checkSchema() {
    try {
        console.log('Checking Customers table columns...');
        const result = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'customers'
        `);
        console.log('Columns in Customers table:');
        result.rows.forEach(row => console.log(`- ${row.column_name} (${row.data_type})`));
    } catch (err) {
        console.error('FAILED with error:', err.message);
    } finally {
        process.exit();
    }
}

checkSchema();
