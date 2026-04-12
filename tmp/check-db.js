const db = require('../config/db');

async function checkDB() {
  const tables = ['tenants', 'users', 'branches', 'lead_sources', 'plans', 'subscriptions'];
  console.log('--- Database Integrity Check ---');
  
  for (const table of tables) {
    try {
      const res = await db.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`✅ Table [${table}] exists. Count: ${res.rows[0].count}`);
    } catch (err) {
      console.log(`❌ Table [${table}] Error: ${err.message}`);
    }
  }

  try {
    const plans = await db.query('SELECT name FROM plans');
    console.log('Available Plans:', plans.rows.map(p => p.name));
  } catch (err) {
    console.log('Plans check failed:', err.message);
  }

  process.exit();
}

checkDB();
