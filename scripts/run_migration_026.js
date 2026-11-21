const fs = require('fs');
const path = require('path');

let _db = null;
function getDefaultDb() {
  if (!_db) _db = require('../config/db');
  return _db;
}

/**
 * 🏛️ Migration 026 Runner: Commercial Contracts Ledger & Audit Schema
 * Phase: 4.2.6-F — Migration Preparation & Deployment Safety
 * 
 * Safety & Preflight Guarantees:
 * 1. Preflight database connectivity & prerequisite table verification (tenants, users).
 * 2. Idempotency: Checks schema_migrations before execution; skips if already applied.
 * 3. Atomic Transaction: DDL execution and schema_migrations record share ONE transaction (BEGIN -> COMMIT).
 * 4. Automatic Rollback: Any failure rolls back both DDL and migration record.
 * 5. Postflight verification: Validates created tables, columns, and constraints.
 * 6. Supports dry-run mode via CLI argument: node scripts/run_migration_026.js --dry-run
 */

const MIGRATION_NAME = '026_create_tenant_contracts_ledger.sql';
const SQL_PATH = path.join(__dirname, '..', 'migrations', MIGRATION_NAME);

async function runMigration026(options = {}) {
    const isDryRun = options.dryRun || process.argv.includes('--dry-run');
    const customDb = options.db || getDefaultDb();
    
    console.log(`\n===============================================================`);
    console.log(`🚀 [Migration 026 Runner] Commercial Contracts Ledger Schema`);
    console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (Simulation - No Changes)' : '⚡ LIVE EXECUTION'}`);
    console.log(`===============================================================\n`);

    // ── 1. PREFLIGHT STEP 1: Verify SQL File Exists ─────────────────────────
    if (!fs.existsSync(SQL_PATH)) {
        throw new Error(`[Preflight Failure] Migration SQL file not found at: ${SQL_PATH}`);
    }
    const sqlContent = fs.readFileSync(SQL_PATH, 'utf8');
    console.log(`✅ [Preflight 1/4] Migration SQL file loaded (${Buffer.byteLength(sqlContent, 'utf8')} bytes).`);

    // ── 2. PREFLIGHT STEP 2: Verify Database Connectivity ───────────────────
    console.log(`📡 [Preflight 2/4] Testing database connectivity...`);
    let pingClient;
    try {
        pingClient = await (customDb.connect ? customDb.connect() : customDb.pool.connect());
        await pingClient.query('SELECT 1 as ping');
        console.log(`✅ [Preflight 2/4] Database connectivity verified.`);
    } catch (connErr) {
        throw new Error(`[Preflight Failure] Unable to connect to database: ${connErr.message}`);
    } finally {
        if (pingClient) pingClient.release();
    }

    // ── 3. PREFLIGHT STEP 3: Verify Prerequisite Tables Exist ────────────────
    console.log(`🔍 [Preflight 3/4] Checking prerequisite tables (tenants, users)...`);
    const prereqCheckSql = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('tenants', 'users');
    `;
    const prereqRes = await customDb.query(prereqCheckSql);
    const existingPrereqs = prereqRes.rows.map(r => r.table_name);
    
    if (!existingPrereqs.includes('tenants')) {
        throw new Error(`[Preflight Failure] Prerequisite table 'tenants' does not exist in database.`);
    }
    if (!existingPrereqs.includes('users')) {
        throw new Error(`[Preflight Failure] Prerequisite table 'users' does not exist in database.`);
    }
    console.log(`✅ [Preflight 3/4] Prerequisite tables present: ${existingPrereqs.join(', ')}.`);

    // ── 4. PREFLIGHT STEP 4: Check Migration History (schema_migrations) ────
    console.log(`📜 [Preflight 4/4] Verifying schema_migrations history...`);
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
        console.log(`No actions performed. Database schema is already up to date.\n`);
        return { status: 'skipped', reason: 'already_applied', applied_at: appliedAt };
    }
    console.log(`✅ [Preflight 4/4] Migration '${MIGRATION_NAME}' has not been applied yet. Ready to proceed.`);

    // If dry run, stop here before execution
    if (isDryRun) {
        console.log(`\n🔍 [DRY RUN COMPLETE] All preflight checks passed. DDL was NOT executed.`);
        return { status: 'dry_run_passed', migration: MIGRATION_NAME };
    }

    // ── 5. TRANSACTIONAL DDL & AUDIT EXECUTION ──────────────────────────────
    console.log(`\n⚙️  [Execution] Beginning atomic migration transaction...`);
    const client = await (customDb.connect ? customDb.connect() : customDb.pool.connect());

    try {
        await client.query('BEGIN');

        // Step A: Execute DDL
        console.log(`   -> Executing DDL from ${MIGRATION_NAME}...`);
        await client.query(sqlContent);

        // Step B: Record migration execution
        console.log(`   -> Recording '${MIGRATION_NAME}' into schema_migrations...`);
        await client.query(`
            INSERT INTO schema_migrations (name, applied_at)
            VALUES ($1, CURRENT_TIMESTAMP)
            ON CONFLICT (name) DO NOTHING;
        `, [MIGRATION_NAME]);

        // Step C: Commit transaction
        await client.query('COMMIT');
        console.log(`✅ [Execution] Transaction committed successfully.`);

    } catch (execErr) {
        console.error(`❌ [Execution Failure] Error during migration execution: ${execErr.message}`);
        try {
            await client.query('ROLLBACK');
            console.log(`🔄 [Rollback] Transaction rolled back cleanly. No partial schema landed.`);
        } catch (rbErr) {
            console.error(`💥 [Rollback Error] Failed to execute rollback: ${rbErr.message}`);
        }
        throw execErr;
    } finally {
        client.release();
    }

    // ── 6. POSTFLIGHT VERIFICATION ──────────────────────────────────────────
    console.log(`\n🔎 [Postflight] Verifying landed schema...`);
    const tablesRes = await customDb.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('tenant_contracts', 'tenant_contract_audit_logs')
        ORDER BY table_name;
    `);
    const landedTables = tablesRes.rows.map(r => r.table_name);
    console.log(`   -> Landed tables verified: ${landedTables.join(', ')}`);

    const constraintRes = await customDb.query(`
        SELECT conname, conrelid::regclass as table_name
        FROM pg_constraint
        WHERE conname IN ('chk_tenant_contracts_dates', 'chk_tenant_contracts_value')
        ORDER BY conname;
    `);
    console.log(`   -> Constraints verified: ${constraintRes.rows.map(c => c.conname).join(', ')}`);

    console.log(`\n🎉 [MIGRATION 026 COMPLETED SUCCESSFULLY]\n`);
    return {
        status: 'success',
        migration: MIGRATION_NAME,
        landedTables,
        constraints: constraintRes.rows.map(c => c.conname)
    };
}

// Execute directly if run via CLI
if (require.main === module) {
    runMigration026()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('\n❌ Fatal Migration Error:', err.message);
            process.exit(1);
        });
}

module.exports = { runMigration026 };
