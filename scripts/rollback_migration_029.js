const fs = require('fs');
const path = require('path');

let _db = null;
function getDefaultDb() {
  if (!_db) _db = require('../config/db');
  return _db;
}

const MIGRATION_NAME = '029_create_request_idempotency.sql';
const ROLLBACK_SQL_PATH = path.join(__dirname, '..', 'migrations', '029_rollback_request_idempotency.sql');

async function rollbackMigration029(options = {}) {
    const isDryRun = options.dryRun || process.argv.includes('--dry-run');
    const force = options.force || process.argv.includes('--force');
    const customDb = options.db || getDefaultDb();

    console.log(`\n===============================================================`);
    console.log(`🔄 [Rollback 029 Runner] Request Idempotency Ledger Rollback`);
    console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (Simulation - No Changes)' : '⚡ LIVE ROLLBACK'}`);
    console.log(`===============================================================\n`);

    if (!fs.existsSync(ROLLBACK_SQL_PATH)) {
        throw new Error(`[Preflight Failure] Rollback SQL file not found at: ${ROLLBACK_SQL_PATH}`);
    }
    const rollbackSql = fs.readFileSync(ROLLBACK_SQL_PATH, 'utf8');

    // Preflight: check if table exists and has live records
    const tableExistsRes = await customDb.query(`
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'request_idempotency'
        ) as exists;
    `);

    if (tableExistsRes.rows[0].exists) {
        const countRes = await customDb.query(`SELECT COUNT(*)::int as count FROM request_idempotency`);
        const liveCount = countRes.rows[0].count;
        if (liveCount > 0 && !force) {
            throw new Error(
                `[Rollback Safety Guard] request_idempotency contains ${liveCount} live records! ` +
                `Dropping this table in production would destroy historical deduplication guards. ` +
                `Rollback aborted. Use archival strategy or pass --force if pre-activation.`
            );
        }
    }

    if (isDryRun) {
        console.log(`\n🔍 [DRY RUN COMPLETE] Safety checks passed. DDL was NOT executed.`);
        return { status: 'dry_run_passed', migration: MIGRATION_NAME };
    }

    const client = await (customDb.connect ? customDb.connect() : customDb.pool.connect());
    try {
        await client.query('BEGIN');
        await client.query(rollbackSql);
        await client.query('COMMIT');
        console.log(`✅ [Execution] Rollback 029 committed successfully.`);
    } catch (execErr) {
        await client.query('ROLLBACK');
        console.error(`❌ [Execution Failure] Rollback 029 failed: ${execErr.message}`);
        throw execErr;
    } finally {
        client.release();
    }

    return { status: 'success', rolled_back: MIGRATION_NAME };
}

if (require.main === module) {
    rollbackMigration029()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Fatal error:', err.message);
            process.exit(1);
        });
}

module.exports = { rollbackMigration029 };
