/**
 * Phase 4.2.6-D — Commercial Contracts Ledger & Atomic Transaction Hardening Test Suite
 * 
 * Verifies:
 * 1. Contract Creation & Field Validation (value >= 0, dates, currency default).
 * 2. Multi-Contract Historical Preservation (older contracts are never overwritten).
 * 3. Contract Update & Audit Trail (previous data preserved with SELECT ... FOR UPDATE).
 * 4. Contract Ownership Security (contract_id must belong to tenant_id).
 * 5. Dynamic Status Calculation (Active, Expiring Soon, Expired, Upcoming).
 * 6. Overlapping Date Detection (soft warning, no silent overwrite).
 * 7. Super Admin Authorization Guard.
 * 8. Error Handling: Graceful fallback ONLY for PostgreSQL 42P01; other errors return HTTP 500.
 * 9. Separation from Technical Entitlements: Expired contract has zero runtime impact.
 * 10. ATOMICITY & ROLLBACK:
 *     - Successful CREATE commits contract and audit records in single transaction.
 *     - Audit insertion failure triggers complete ROLLBACK of contract write.
 *     - Successful UPDATE locks row with FOR UPDATE, updates, audits, and commits.
 *     - Audit insertion failure triggers complete ROLLBACK of contract update.
 *     - Client is always released in finally block under all outcomes.
 */

// ============================================================================
// CANONICAL TEST SAFETY ENFORCEMENT (Phase S)
// Strictly mandates DATABASE_URL_TEST and prevents execution against PROD_HOST
// ============================================================================
const { initTestContext } = require('./helpers/testDb');
initTestContext();

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const contractsCtrl = require('../controllers/tenantContractsController');
const adminPlanRoutes = require('../routes/adminPlanRoutes');
const tenantEntitlementService = require('../services/tenantEntitlementService');
const db = require('../config/db');

/**
 * Mock Client Helper for testing atomic transactions
 */
function createMockClient(queryHandler) {
    let clientReleased = false;
    let transactionState = 'NONE'; // 'NONE' | 'BEGIN' | 'COMMITTED' | 'ROLLED_BACK'
    const queries = [];

    const client = {
        query: async (sql, params) => {
            queries.push({ sql, params });
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
            return queryHandler(sql, params);
        },
        release: () => {
            clientReleased = true;
        },
        getTransactionState: () => transactionState,
        isReleased: () => clientReleased,
        getQueries: () => queries
    };
    return client;
}

describe('🏛️ Commercial Contracts Ledger & Atomic Transactions (Phase 4.2.6-D)', () => {

    // ── 1. Dynamic Status Calculation ───────────────────────────
    describe('1. Dynamic Status Calculation', () => {
        const { _calculateContractStatus, _detectOverlaps } = contractsCtrl;

        it('should classify current date within interval as active', () => {
            const today = new Date();
            const start = new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString().slice(0, 10);
            const end = new Date(today.getFullYear(), today.getMonth() + 6, 1).toISOString().slice(0, 10);

            const status = _calculateContractStatus(start, end);
            assert.equal(status.code, 'active');
            assert.ok(status.daysRemaining > 30);
        });

        it('should classify contract expiring within 30 days as expiring_soon', () => {
            const today = new Date();
            const start = new Date(today.getFullYear(), today.getMonth() - 5, 1).toISOString().slice(0, 10);
            const end = new Date(today.getTime() + (15 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);

            const status = _calculateContractStatus(start, end);
            assert.equal(status.code, 'expiring_soon');
            assert.ok(status.daysRemaining <= 30 && status.daysRemaining >= 0);
        });

        it('should classify past end date as expired', () => {
            const start = '2023-01-01';
            const end = '2023-12-31';

            const status = _calculateContractStatus(start, end);
            assert.equal(status.code, 'expired');
            assert.equal(status.daysRemaining, 0);
            assert.ok(status.daysExpiredAgo > 0);
        });

        it('should classify future start date as upcoming', () => {
            const today = new Date();
            const start = new Date(today.getFullYear() + 1, 0, 1).toISOString().slice(0, 10);
            const end = new Date(today.getFullYear() + 1, 11, 31).toISOString().slice(0, 10);

            const status = _calculateContractStatus(start, end);
            assert.equal(status.code, 'upcoming');
            assert.ok(status.daysRemaining > 0);
        });

        it('should detect overlapping contract intervals', () => {
            const overlappingContracts = [
                { id: 'c1', start_date: '2026-01-01', end_date: '2026-12-31' },
                { id: 'c2', start_date: '2026-06-01', end_date: '2027-05-31' }
            ];
            assert.equal(_detectOverlaps(overlappingContracts), true);

            const nonOverlapping = [
                { id: 'c1', start_date: '2025-01-01', end_date: '2025-12-31' },
                { id: 'c2', start_date: '2026-01-01', end_date: '2026-12-31' }
            ];
            assert.equal(_detectOverlaps(nonOverlapping), false);
        });
    });

    // ── 2. Controller Input Validation & Business Rules ─────────
    describe('2. Controller Input Validation & Business Rules', () => {

        it('should reject non-numeric or negative contract value on creation', async () => {
            const mockReq = {
                params: { tenant_id: '00000000-0000-0000-0000-000000000001' },
                body: { contract_value: -500, start_date: '2026-01-01', end_date: '2026-12-31' },
                user: { id: 1 }
            };
            let responseStatus = null;
            let responseBody = null;
            const mockRes = {
                status: (s) => { responseStatus = s; return mockRes; },
                json: (b) => { responseBody = b; return mockRes; }
            };

            const origQuery = db.query;
            db.query = async (sql, params) => {
                if (sql.includes('SELECT id, name FROM tenants')) {
                    return { rows: [{ id: params[0], name: 'Alpha Corp' }] };
                }
                return { rows: [] };
            };

            try {
                await contractsCtrl.createTenantContract(mockReq, mockRes);
                assert.equal(responseStatus, 400);
                assert.match(responseBody.message, /non-negative number/i);
            } finally {
                db.query = origQuery;
            }
        });

        it('should reject invalid dates where end_date < start_date', async () => {
            const mockReq = {
                params: { tenant_id: '00000000-0000-0000-0000-000000000001' },
                body: { contract_value: 45000, start_date: '2026-12-31', end_date: '2026-01-01' },
                user: { id: 1 }
            };
            let responseStatus = null;
            let responseBody = null;
            const mockRes = {
                status: (s) => { responseStatus = s; return mockRes; },
                json: (b) => { responseBody = b; return mockRes; }
            };

            const origQuery = db.query;
            db.query = async (sql, params) => {
                if (sql.includes('SELECT id, name FROM tenants')) {
                    return { rows: [{ id: params[0], name: 'Alpha Corp' }] };
                }
                return { rows: [] };
            };

            try {
                await contractsCtrl.createTenantContract(mockReq, mockRes);
                assert.equal(responseStatus, 400);
                assert.match(responseBody.message, /greater than or equal to start date/i);
            } finally {
                db.query = origQuery;
            }
        });

        it('should default currency to EGP when unspecified', async () => {
            let insertedCurrency = null;
            const mockReq = {
                params: { tenant_id: '00000000-0000-0000-0000-000000000001' },
                body: { contract_value: 50000, start_date: '2026-01-01', end_date: '2026-12-31' },
                user: { id: 1 }
            };
            const mockRes = {
                status: () => mockRes,
                json: () => mockRes
            };

            const mockClient = createMockClient((sql, params) => {
                if (sql.includes('INSERT INTO tenant_contracts')) {
                    insertedCurrency = params[2]; // currency is 3rd param
                    return {
                        rows: [{
                            id: 'c-uuid-1',
                            tenant_id: params[0],
                            contract_value: params[1],
                            currency: params[2],
                            start_date: params[3],
                            end_date: params[4]
                        }]
                    };
                }
                return { rows: [] };
            });

            const origQuery = db.query;
            const origConnect = db.connect;
            db.query = async (sql, params) => {
                if (sql.includes('SELECT id, name FROM tenants')) {
                    return { rows: [{ id: params[0], name: 'Alpha Corp' }] };
                }
                return { rows: [] };
            };
            db.connect = async () => mockClient;

            try {
                await contractsCtrl.createTenantContract(mockReq, mockRes);
                assert.equal(insertedCurrency, 'EGP');
                assert.equal(mockClient.getTransactionState(), 'COMMITTED');
                assert.equal(mockClient.isReleased(), true);
            } finally {
                db.query = origQuery;
                db.connect = origConnect;
            }
        });

        it('should reject update if contract does not belong to specified tenant', async () => {
            const mockReq = {
                params: { 
                    tenant_id: '00000000-0000-0000-0000-000000000001',
                    contract_id: 'c-uuid-different-tenant'
                },
                body: { contract_value: 60000, start_date: '2026-01-01', end_date: '2026-12-31' },
                user: { id: 1 }
            };
            let responseStatus = null;
            let responseBody = null;
            const mockRes = {
                status: (s) => { responseStatus = s; return mockRes; },
                json: (b) => { responseBody = b; return mockRes; }
            };

            const mockClient = createMockClient((sql) => {
                if (sql.includes('SELECT * FROM tenant_contracts')) {
                    return { rows: [] }; // Not found for this tenant
                }
                return { rows: [] };
            });

            const origConnect = db.connect;
            db.connect = async () => mockClient;

            try {
                await contractsCtrl.updateTenantContract(mockReq, mockRes);
                assert.equal(responseStatus, 404);
                assert.match(responseBody.message, /contract not found/i);
                assert.equal(mockClient.getTransactionState(), 'ROLLED_BACK');
                assert.equal(mockClient.isReleased(), true);
            } finally {
                db.connect = origConnect;
            }
        });
    });

    // ── 3. Multi-Contract History & Chronological Listing ────────
    describe('3. Multi-Contract History Preservation', () => {

        it('should preserve multiple contracts chronologically and never overwrite', async () => {
            const mockReq = {
                params: { tenant_id: 'tenant-123' }
            };
            let responseBody = null;
            const mockRes = {
                json: (b) => { responseBody = b; return mockRes; }
            };

            const historicalRows = [
                { id: 'c2', tenant_id: 'tenant-123', contract_value: '50000.00', currency: 'EGP', start_date: '2026-01-01', end_date: '2026-12-31' },
                { id: 'c1', tenant_id: 'tenant-123', contract_value: '35000.00', currency: 'EGP', start_date: '2025-01-01', end_date: '2025-12-31' }
            ];

            const origQuery = db.query;
            db.query = async (sql) => {
                if (sql.includes('SELECT id, name FROM tenants')) {
                    return { rows: [{ id: 'tenant-123', name: 'Beta Ltd' }] };
                }
                if (sql.includes('FROM tenant_contracts')) {
                    return { rows: historicalRows };
                }
                return { rows: [] };
            };

            try {
                await contractsCtrl.getTenantContracts(mockReq, mockRes);
                assert.equal(responseBody.status, 'success');
                assert.equal(responseBody.data.contracts.length, 2);
                assert.equal(responseBody.data.contracts[0].id, 'c2');
                assert.equal(responseBody.data.contracts[1].id, 'c1');
            } finally {
                db.query = origQuery;
            }
        });
    });

    // ── 4. Atomic Transaction Hardening & Rollback Guarantees ────
    describe('4. Atomic Transactions & Rollback Guarantees (Phase 4.2.6-D)', () => {

        it('should execute CREATE inside a single transaction and commit both contract and audit', async () => {
            let contractInserted = false;
            let auditInserted = false;

            const mockReq = {
                params: { tenant_id: 'tenant-abc' },
                body: { contract_value: 45000, currency: 'EGP', start_date: '2026-01-01', end_date: '2026-12-31', reason: 'Initial agreement' },
                user: { id: 5 },
                ip: '10.0.0.1'
            };
            let responseStatus = null;
            const mockRes = {
                status: (s) => { responseStatus = s; return mockRes; },
                json: () => mockRes
            };

            const mockClient = createMockClient((sql, params) => {
                if (sql.includes('INSERT INTO tenant_contracts')) {
                    contractInserted = true;
                    return {
                        rows: [{
                            id: 'c-uuid-10',
                            tenant_id: 'tenant-abc',
                            contract_value: 45000,
                            currency: 'EGP',
                            start_date: '2026-01-01',
                            end_date: '2026-12-31'
                        }]
                    };
                }
                if (sql.includes('INSERT INTO tenant_contract_audit_logs')) {
                    auditInserted = true;
                    return { rows: [{ id: 'audit-uuid-1' }] };
                }
                return { rows: [] };
            });

            const origQuery = db.query;
            const origConnect = db.connect;
            db.query = async (sql) => {
                if (sql.includes('SELECT id, name FROM tenants')) {
                    return { rows: [{ id: 'tenant-abc', name: 'Acme Corp' }] };
                }
                return { rows: [] };
            };
            db.connect = async () => mockClient;

            try {
                await contractsCtrl.createTenantContract(mockReq, mockRes);
                assert.equal(responseStatus, 201);
                assert.equal(contractInserted, true);
                assert.equal(auditInserted, true);
                assert.equal(mockClient.getTransactionState(), 'COMMITTED');
                assert.equal(mockClient.isReleased(), true);
            } finally {
                db.query = origQuery;
                db.connect = origConnect;
            }
        });

        it('should ROLLBACK contract creation completely if audit insertion fails', async () => {
            const mockReq = {
                params: { tenant_id: 'tenant-abc' },
                body: { contract_value: 45000, currency: 'EGP', start_date: '2026-01-01', end_date: '2026-12-31' },
                user: { id: 5 }
            };
            let responseStatus = null;
            let responseBody = null;
            const mockRes = {
                status: (s) => { responseStatus = s; return mockRes; },
                json: (b) => { responseBody = b; return mockRes; }
            };

            const mockClient = createMockClient((sql) => {
                if (sql.includes('INSERT INTO tenant_contracts')) {
                    return {
                        rows: [{
                            id: 'c-uuid-10',
                            tenant_id: 'tenant-abc',
                            contract_value: 45000,
                            currency: 'EGP',
                            start_date: '2026-01-01',
                            end_date: '2026-12-31'
                        }]
                    };
                }
                if (sql.includes('INSERT INTO tenant_contract_audit_logs')) {
                    const err = new Error('Disk full or audit constraint failed');
                    err.code = '54000';
                    throw err;
                }
                return { rows: [] };
            });

            const origQuery = db.query;
            const origConnect = db.connect;
            db.query = async (sql) => {
                if (sql.includes('SELECT id, name FROM tenants')) {
                    return { rows: [{ id: 'tenant-abc', name: 'Acme Corp' }] };
                }
                return { rows: [] };
            };
            db.connect = async () => mockClient;

            try {
                await contractsCtrl.createTenantContract(mockReq, mockRes);
                // Must return error (500) and transaction MUST be rolled back!
                assert.equal(responseStatus, 500);
                assert.match(responseBody.message, /Disk full/);
                assert.equal(mockClient.getTransactionState(), 'ROLLED_BACK');
                assert.equal(mockClient.isReleased(), true);
            } finally {
                db.query = origQuery;
                db.connect = origConnect;
            }
        });

        it('should execute UPDATE inside a single transaction with SELECT FOR UPDATE and commit both', async () => {
            let forUpdateCalled = false;
            let updateCalled = false;
            let auditCalled = false;

            const existingContract = {
                id: 'c-test-1',
                tenant_id: 'tenant-123',
                contract_value: '40000.00',
                currency: 'EGP',
                start_date: '2026-01-01',
                end_date: '2026-12-31',
                notes: 'Original agreement'
            };

            const mockReq = {
                params: { tenant_id: 'tenant-123', contract_id: 'c-test-1' },
                body: { 
                    contract_value: 48000,
                    currency: 'EGP',
                    start_date: '2026-01-01',
                    end_date: '2026-12-31',
                    notes: 'Amended contract value',
                    reason: 'Approved addition of branches'
                },
                user: { id: 99 },
                ip: '127.0.0.1'
            };
            const mockRes = {
                json: () => mockRes,
                status: () => mockRes
            };

            const mockClient = createMockClient((sql, params) => {
                if (sql.includes('FOR UPDATE')) {
                    forUpdateCalled = true;
                    return { rows: [existingContract] };
                }
                if (sql.includes('UPDATE tenant_contracts SET')) {
                    updateCalled = true;
                    return {
                        rows: [{
                            ...existingContract,
                            contract_value: params[0],
                            notes: params[4]
                        }]
                    };
                }
                if (sql.includes('INSERT INTO tenant_contract_audit_logs')) {
                    auditCalled = true;
                    return { rows: [] };
                }
                return { rows: [] };
            });

            const origConnect = db.connect;
            db.connect = async () => mockClient;

            try {
                await contractsCtrl.updateTenantContract(mockReq, mockRes);
                assert.equal(forUpdateCalled, true);
                assert.equal(updateCalled, true);
                assert.equal(auditCalled, true);
                assert.equal(mockClient.getTransactionState(), 'COMMITTED');
                assert.equal(mockClient.isReleased(), true);
            } finally {
                db.connect = origConnect;
            }
        });

        it('should ROLLBACK contract update completely if audit insertion fails', async () => {
            const existingContract = {
                id: 'c-test-1',
                tenant_id: 'tenant-123',
                contract_value: '40000.00',
                currency: 'EGP',
                start_date: '2026-01-01',
                end_date: '2026-12-31'
            };

            const mockReq = {
                params: { tenant_id: 'tenant-123', contract_id: 'c-test-1' },
                body: { contract_value: 50000, start_date: '2026-01-01', end_date: '2026-12-31' },
                user: { id: 99 }
            };
            let responseStatus = null;
            let responseBody = null;
            const mockRes = {
                status: (s) => { responseStatus = s; return mockRes; },
                json: (b) => { responseBody = b; return mockRes; }
            };

            const mockClient = createMockClient((sql, params) => {
                if (sql.includes('FOR UPDATE')) {
                    return { rows: [existingContract] };
                }
                if (sql.includes('UPDATE tenant_contracts SET')) {
                    return { rows: [{ ...existingContract, contract_value: params[0] }] };
                }
                if (sql.includes('INSERT INTO tenant_contract_audit_logs')) {
                    const err = new Error('Audit table write failed');
                    throw err;
                }
                return { rows: [] };
            });

            const origConnect = db.connect;
            db.connect = async () => mockClient;

            try {
                await contractsCtrl.updateTenantContract(mockReq, mockRes);
                assert.equal(responseStatus, 500);
                assert.match(responseBody.message, /Audit table write failed/);
                assert.equal(mockClient.getTransactionState(), 'ROLLED_BACK');
                assert.equal(mockClient.isReleased(), true);
            } finally {
                db.connect = origConnect;
            }
        });
    });

    // ── 5. Error Handling: Graceful Fallback ONLY for 42P01 ─────
    describe('5. Strict Error Handling & Fallback Behavior', () => {

        it('should return graceful notice ONLY when PostgreSQL error code is 42P01 on read', async () => {
            const mockReq = { params: { tenant_id: 'tenant-123' } };
            let responseBody = null;
            const mockRes = {
                json: (b) => { responseBody = b; return mockRes; }
            };

            const origQuery = db.query;
            db.query = async (sql) => {
                if (sql.includes('SELECT id, name FROM tenants')) {
                    return { rows: [{ id: 'tenant-123', name: 'Test Org' }] };
                }
                const err = new Error('relation "tenant_contracts" does not exist');
                err.code = '42P01';
                throw err;
            };

            try {
                await contractsCtrl.getTenantContracts(mockReq, mockRes);
                assert.equal(responseBody.status, 'success');
                assert.deepEqual(responseBody.data.contracts, []);
                assert.match(responseBody.notice, /42P01/);
            } finally {
                db.query = origQuery;
            }
        });

        it('should NOT hide connection errors as pending migration on read', async () => {
            const mockReq = { params: { tenant_id: 'tenant-123' } };
            let responseStatus = null;
            let responseBody = null;
            const mockRes = {
                status: (s) => { responseStatus = s; return mockRes; },
                json: (b) => { responseBody = b; return mockRes; }
            };

            const origQuery = db.query;
            db.query = async (sql) => {
                if (sql.includes('SELECT id, name FROM tenants')) {
                    return { rows: [{ id: 'tenant-123', name: 'Test Org' }] };
                }
                const err = new Error('Connection terminated unexpectedly');
                err.code = 'ECONNRESET';
                throw err;
            };

            try {
                await contractsCtrl.getTenantContracts(mockReq, mockRes);
                assert.equal(responseStatus, 500);
                assert.equal(responseBody.status, 'error');
                assert.match(responseBody.message, /Connection terminated/);
            } finally {
                db.query = origQuery;
            }
        });

        it('should return 503 TABLE_NOT_MIGRATED and rollback on write if table is 42P01', async () => {
            const mockReq = {
                params: { tenant_id: 'tenant-abc' },
                body: { contract_value: 45000, start_date: '2026-01-01', end_date: '2026-12-31' },
                user: { id: 1 }
            };
            let responseStatus = null;
            let responseBody = null;
            const mockRes = {
                status: (s) => { responseStatus = s; return mockRes; },
                json: (b) => { responseBody = b; return mockRes; }
            };

            const mockClient = createMockClient((sql) => {
                if (sql.includes('INSERT INTO tenant_contracts')) {
                    const err = new Error('relation "tenant_contracts" does not exist');
                    err.code = '42P01';
                    throw err;
                }
                return { rows: [] };
            });

            const origQuery = db.query;
            const origConnect = db.connect;
            db.query = async (sql) => {
                if (sql.includes('SELECT id, name FROM tenants')) {
                    return { rows: [{ id: 'tenant-abc', name: 'Test Org' }] };
                }
                return { rows: [] };
            };
            db.connect = async () => mockClient;

            try {
                await contractsCtrl.createTenantContract(mockReq, mockRes);
                assert.equal(responseStatus, 503);
                assert.equal(responseBody.code, 'TABLE_NOT_MIGRATED');
                assert.equal(mockClient.getTransactionState(), 'ROLLED_BACK');
                assert.equal(mockClient.isReleased(), true);
            } finally {
                db.query = origQuery;
                db.connect = origConnect;
            }
        });
    });

    // ── 6. Super Admin Authorization & Route Guarding ───────────
    describe('6. Super Admin Authorization Guard', () => {

        it('should block non-super-admin user from accessing contracts routes with 403', () => {
            const req = {
                user: {
                    id: 10,
                    role: 'admin',
                    tenant_id: 'regular-tenant-uuid'
                }
            };
            let status = null;
            let body = null;
            const res = {
                status: (s) => { status = s; return res; },
                json: (b) => { body = b; return res; }
            };

            adminPlanRoutes.superAdminOnly(req, res, () => {});
            assert.equal(status, 403);
            assert.match(body.message, /Super Admin access required/i);
        });

        it('should permit authorized ITQAN Super Admin user', () => {
            const req = {
                user: {
                    id: 1,
                    role: 'admin',
                    tenant_id: '00000000-0000-0000-0000-000000000000'
                }
            };
            let nextCalled = false;
            adminPlanRoutes.superAdminOnly(req, {}, () => { nextCalled = true; });
            assert.equal(nextCalled, true);
        });

        it('should NOT expose any ordinary DELETE endpoint for tenant contracts', () => {
            const deleteRoutes = adminPlanRoutes.stack
                .filter(r => r.route && r.route.methods.delete)
                .map(r => r.route.path);

            const hasContractDelete = deleteRoutes.some(p => p.includes('contracts'));
            assert.equal(hasContractDelete, false, 'Ordinary DELETE route for contracts must NOT be exposed');
        });
    });

    // ── 7. Complete Separation from Technical Entitlements ──────
    describe('7. Zero Coupling with Technical Entitlements', () => {

        it('should prove tenantEntitlementService does not depend on contracts table or dates', async () => {
            const mockDb = {
                query: async (sql, params) => {
                    if (sql.includes('FROM tenant_overrides')) {
                        return {
                            rows: [{
                                tenant_id: params[0],
                                modules: JSON.stringify({ crm: true, real_estate: true, sales: true }),
                                limits: JSON.stringify({ max_users: 15, max_branches: 3 }),
                                notes: 'Manual entitlement'
                            }]
                        };
                    }
                    throw new Error('Unexpected query to non-overrides table');
                }
            };

            const entitlements = await tenantEntitlementService.getTenantEntitlements('tenant-xyz', mockDb);
            assert.equal(entitlements.isConfigured, true);
            assert.equal(entitlements.modules.crm, true);
            assert.equal(entitlements.modules.real_estate, true);
            assert.equal(entitlements.limits.max_users, 15);
            assert.equal(entitlements.limits.max_branches, 3);
        });
    });
});
