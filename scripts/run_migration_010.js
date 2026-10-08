const fs = require('fs');
const path = require('path');
const db = require('../config/db');

async function runMigration010() {
  try {
    const sqlPath = path.join(__dirname, '..', 'migrations', '010_reconcile_re_units_status_constraint.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('[Migration 010] Executing SQL...');
    await db.query(sql);
    console.log('[Migration 010] Success!');

    const res = await db.query(`
      SELECT status, COUNT(*) as count 
      FROM re_units 
      GROUP BY status
    `);
    console.log('[Migration 010] Post-migration statuses:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error('[Migration 010] Error:', err.message);
    process.exit(1);
  }
}

runMigration010();
