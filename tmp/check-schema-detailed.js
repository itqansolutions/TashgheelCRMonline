const db = require('../config/db');

async function check() {
    console.log('--- CUSTOMERS TABLE ---');
    const cust = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'customers'");
    console.table(cust.rows);

    console.log('\n--- RE_UNITS TABLE ---');
    const units = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 're_units'");
    console.table(units.rows);

    process.exit(0);
}

check();
