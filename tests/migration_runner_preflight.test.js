const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runMigration026 } = require('../scripts/run_migration_026');

/**
 * 🧪 Isolated Preflight & Migration Runner Test Suite
 * Phase 4.2.6-F — Migration Preparation & Deployment Safety
 * 
 * Verifies the safety invariants of run_migration_026:
 * - Preflight validation (connectivity, prerequisite tables)
 * - Idempotent skip when already recorded in schema_migrations
 * - Dry-run validation mode
 * - Transaction atomicity and rollback on error
 * - Zero production connections
 */

function createMockDb(handlers = {}) {
    let transactionState = 'NONE';
    let clientReleased = false;
    const executedQueries = [];

    const mockClient = {
        query: async (sql, params) => {
            executedQueries.push({ sql, params });
            if (sql === 'BEGIN') {
                transactionState = 'BEGIN';
                return { rows: [] };
            }
            if (sql === 'COMMIT') {
                transactionState = 'COMMITTED';
                return { rows: [] };
            }
            if (sql === 'ROLLBACK') {
                transactionState = 'ROLLED_BACK';
                return { rows: [] };
            }
            if (handlers.clientQuery) {
                return handlers.clientQuery(sql, params);
            }
            return { rows: [] };
        },
        release: () => {
            clientReleased = true;
        }
    };

    const mockDb = {
        query: async (sql, params) => {
            executedQueries.push({ sql, params, poolQuery: true });
            if (handlers.dbQuery) {
                return handlers.dbQuery(sql, params);
            }
            return { rows: [] };
        },
        connect: async () => mockClient,
        pool: {
            connect: async () => mockClient
        },
        _getTransactionState: () => transactionState,
        _isClientReleased: () => clientReleased,
        _getExecutedQueries: () => executedQueries
    };

    return mockDb;
}

describe('🛡️ Migration Runner Preflight & Deployment Safety (Phase 4.2.6-F)', () => {

    it('1. Preflight Failure: Should abort when database connectivity fails', async () => {
        const mockDb = {
            connect: async () => {
                throw new Error('ECONNREFUSED - connection refused');
            }
        };

        await assert.rejects(
            async () => {
                await runMigration026({ db: mockDb });
            },
            {
                message: /\[Preflight Failure\] Unable to connect to database/
            }
        );
    });

    it('2. Preflight Failure: Should abort when prerequisite table "tenants" is missing', async () => {
        const mockDb = createMockDb({
            dbQuery: async (sql) => {
                if (sql.includes('information_schema.tables')) {
                    // Only users exists, tenants is missing
                    return { rows: [{ table_name: 'users' }] };
                }
                return { rows: [] };
            }
        });

        await assert.rejects(
            async () => {
                await runMigration026({ db: mockDb });
            },
            {
                message: /Prerequisite table 'tenants' does not exist in database/
            }
        );
    });

    it('3. Preflight Failure: Should abort when prerequisite table "users" is missing', async () => {
        const mockDb = createMockDb({
            dbQuery: async (sql) => {
                if (sql.includes('information_schema.tables')) {
                    // Only tenants exists, users is missing
                    return { rows: [{ table_name: 'tenants' }] };
                }
                return { rows: [] };
            }
        });

        await assert.rejects(
            async () => {
                await runMigration026({ db: mockDb });
            },
            {
                message: /Prerequisite table 'users' does not exist in database/
            }
        );
    });

    it('4. Idempotency: Should SKIP execution if migration is already recorded in schema_migrations', async () => {
        const mockDb = createMockDb({
            dbQuery: async (sql, params) => {
                if (sql.includes('information_schema.tables')) {
                    return { rows: [{ table_name: 'tenants' }, { table_name: 'users' }] };
                }
                if (sql.includes('SELECT name, applied_at FROM schema_migrations')) {
                    return { rows: [{ name: '026_create_tenant_contracts_ledger.sql', applied_at: '2026-11-09T12:00:00Z' }] };
                }
                return { rows: [] };
            }
        });

        const result = await runMigration026({ db: mockDb });
        assert.equal(result.status, 'skipped');
        assert.equal(result.reason, 'already_applied');
        assert.equal(mockDb._getTransactionState(), 'NONE'); // Never initiated transaction
    });

    it('5. Dry-Run Mode: Should pass preflight and complete without executing DDL', async () => {
        const mockDb = createMockDb({
            dbQuery: async (sql) => {
                if (sql.includes('information_schema.tables')) {
                    return { rows: [{ table_name: 'tenants' }, { table_name: 'users' }] };
                }
                if (sql.includes('SELECT name, applied_at FROM schema_migrations')) {
                    return { rows: [] }; // Not yet applied
                }
                return { rows: [] };
            }
        });

        const result = await runMigration026({ db: mockDb, dryRun: true });
        assert.equal(result.status, 'dry_run_passed');
        assert.equal(result.migration, '026_create_tenant_contracts_ledger.sql');
        assert.equal(mockDb._getTransactionState(), 'NONE'); // Never called BEGIN
    });

    it('6. Transaction Atomicity: Should ROLLBACK completely if DDL execution fails', async () => {
        const mockDb = createMockDb({
            dbQuery: async (sql) => {
                if (sql.includes('information_schema.tables')) {
                    return { rows: [{ table_name: 'tenants' }, { table_name: 'users' }] };
                }
                if (sql.includes('SELECT name, applied_at FROM schema_migrations')) {
                    return { rows: [] };
                }
                return { rows: [] };
            },
            clientQuery: async (sql) => {
                if (sql.includes('CREATE TABLE IF NOT EXISTS tenant_contracts')) {
                    throw new Error('Permission denied: cannot create table in shared schema');
                }
                return { rows: [] };
            }
        });

        await assert.rejects(
            async () => {
                await runMigration026({ db: mockDb });
            },
            {
                message: /Permission denied: cannot create table in shared schema/
            }
        );

        assert.equal(mockDb._getTransactionState(), 'ROLLED_BACK');
        assert.equal(mockDb._isClientReleased(), true);
    });

    it('7. Transaction Success: Should execute DDL, record migration, and COMMIT atomically', async () => {
        let migrationRecorded = false;

        const mockDb = createMockDb({
            dbQuery: async (sql) => {
                if (sql.includes('information_schema.tables')) {
                    if (sql.includes('tenant_contracts')) {
                        return { rows: [{ table_name: 'tenant_contracts' }, { table_name: 'tenant_contract_audit_logs' }] };
                    }
                    return { rows: [{ table_name: 'tenants' }, { table_name: 'users' }] };
                }
                if (sql.includes('SELECT name, applied_at FROM schema_migrations')) {
                    return { rows: [] };
                }
                if (sql.includes('pg_constraint')) {
                    return { rows: [{ conname: 'chk_tenant_contracts_dates' }, { conname: 'chk_tenant_contracts_value' }] };
                }
                return { rows: [] };
            },
            clientQuery: async (sql, params) => {
                if (sql.includes('INSERT INTO schema_migrations')) {
                    migrationRecorded = true;
                    assert.equal(params[0], '026_create_tenant_contracts_ledger.sql');
                }
                return { rows: [] };
            }
        });

        const result = await runMigration026({ db: mockDb });
        assert.equal(result.status, 'success');
        assert.equal(migrationRecorded, true);
        assert.equal(mockDb._getTransactionState(), 'COMMITTED');
        assert.equal(mockDb._isClientReleased(), true);
        assert.deepEqual(result.landedTables, ['tenant_contracts', 'tenant_contract_audit_logs']);
    });

});
