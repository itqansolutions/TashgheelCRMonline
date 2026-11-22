const fs = require('fs');
const path = require('path');

let _db = null;
function getDefaultDb() {
  if (!_db) _db = require('../config/db');
  return _db;
}

const MIGRATION_NAME = '029_create_request_idempotency.sql';
const SQL_PATH = path.join(__dirname, '..', 'migrations', MIGRATION_NAME);

async function runMigration029(options = {}) {
    const isDryRun = options.dryRun || process.argv.includes('--dry-run');
    const customDb = options.db || getDefaultDb();
    
    console.log(`\n===============================================================`);
    console.log(`🚀 [Migration 029 Runner] Request Idempotency Ledger Schema`);
    console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (Simulation - No Changes)' : '⚡ LIVE EXECUTION'}`);
    console.log(`===============================================================\n`);

    if (!fs.existsSync(SQL_PATH)) {
        throw new Error(`[Preflight Failure] Migration SQL file not found at: ${SQL_PATH}`);
    }
    const sqlContent = fs.readFileSync(SQL_PATH, 'utf8');

    let pingClient;
    try {
        pingClient = await (customDb.connect ? customDb.connect() : customDb.pool.connect());
        await pingClient.query('SELECT 1 as ping');
        console.log(`✅ [Preflight] Database connectivity verified.`);
    } catch (connErr) {
        throw new Error(`[Preflight Failure] Unable to connect to database: ${connErr.message}`);
    } finally {
        if (pingClient) pingClient.release();
    }

    await customDb.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    `);

    const historyRes = await customDb.query(
        `SELECT name, applied_at FROM schema_migrations WHERE name = $1`,
        [MIGRATION_NAME]
    );

    if (historyRes.rows.length > 0) {
        const appliedAt = historyRes.rows[0].applied_at;
        console.log(`\n⚠️  [SKIPPED] Migration '${MIGRATION_NAME}' was ALREADY applied on: ${appliedAt}`);
        return { status: 'skipped', reason: 'already_applied', applied_at: appliedAt };
    }

    if (isDryRun) {
        console.log(`\n🔍 [DRY RUN COMPLETE] Preflight passed. DDL was NOT executed.`);
        return { status: 'dry_run_passed', migration: MIGRATION_NAME };
    }

    const client = await (customDb.connect ? customDb.connect() : customDb.pool.connect());
    try {
        await client.query('BEGIN');
        await client.query(sqlContent);
        await client.query(`
            INSERT INTO schema_migrations (name, applied_at)
            VALUES ($1, CURRENT_TIMESTAMP)
            ON CONFLICT (name) DO NOTHING;
        `, [MIGRATION_NAME]);
        await client.query('COMMIT');
        console.log(`✅ [Execution] Migration 029 committed successfully.`);
    } catch (execErr) {
        await client.query('ROLLBACK');
        console.error(`❌ [Execution Failure] Migration 029 rolled back: ${execErr.message}`);
        throw execErr;
    } finally {
        client.release();
    }

    return { status: 'success', migration: MIGRATION_NAME };
}

if (require.main === module) {
    runMigration029()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Fatal error:', err);
            process.exit(1);
        });
}

module.exports = { runMigration029 };
