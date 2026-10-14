const fs = require('fs');
const path = require('path');
const db = require('../config/db');

async function runMigration021() {
  try {
    const sqlPath = path.join(__dirname, '..', 'migrations', '021_add_item_type_classification.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('[Migration 021] Executing SQL...');
    await db.query(sql);
    // Ensure migration is recorded in schema_migrations
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO schema_migrations (name, applied_at)
      VALUES ('021_add_item_type_classification.sql', CURRENT_TIMESTAMP)
      ON CONFLICT (name) DO NOTHING;
    `);

    // Post-migration checks
    const colRes = await db.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name IN ('sales_order_items', 'quotation_items')
        AND column_name = 'item_type'
      ORDER BY table_name;
    `);
    console.log('[Migration 021] Columns verified:', colRes.rows);

    const conRes = await db.query(`
      SELECT conname, conrelid::regclass as table_name, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conname IN ('chk_soi_item_type', 'chk_qi_item_type')
      ORDER BY conname;
    `);
    console.log('[Migration 021] Constraints verified:', conRes.rows);

    process.exit(0);
  } catch (err) {
    console.error('[Migration 021] Error applying migration:', err.message);
    process.exit(1);
  }
}

runMigration021();
