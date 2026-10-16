/**
 * PHASE 1 ISOLATED VERIFICATION TEST SUITE
 * 
 * Strict Triple-Barrier Isolation:
 * 1. Sanitizes and neutralizes all database environment variables.
 * 2. Hard-blocks pg.Client.prototype.connect and pg.Pool.prototype.connect.
 * 3. Pre-injects a deterministic Query Dispatcher into require.cache before requiring application modules.
 * 
 * NO network requests, NO socket connections, NO live DB dependencies.
 */

const assert = require('assert');

// ============================================================================
// BARRIER 1: Neutralize Database Environment Variables
// ============================================================================
const DB_ENV_KEYS = [
    'DATABASE_URL', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_PORT', 'DB_NAME',
    'PGHOST', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGPORT'
];
DB_ENV_KEYS.forEach(key => delete process.env[key]);
process.env.DATABASE_URL = 'postgres://isolation_blocked:isolation_blocked@127.0.0.1:5432/isolation_blocked';

// ============================================================================
// BARRIER 2: Hard-Block pg Driver Connection Prototypes
// ============================================================================
const pg = require('pg');
pg.Pool.prototype.connect = function() {
    throw new Error('CRITICAL VIOLATION: pg.Pool.prototype.connect called during isolated test!');
};
pg.Client.prototype.connect = function() {
    throw new Error('CRITICAL VIOLATION: pg.Client.prototype.connect called during isolated test!');
};

// ============================================================================
// BARRIER 3: Inject Deterministic Query Dispatcher into require.cache
// ============================================================================
const executedQueries = [];
let queryDispatcher = (sql, params) => {
    throw new Error(`Unexpected query in isolated harness: ${sql}`);
};

const mockDb = {
    query: async (sql, params) => {
        executedQueries.push({ sql, params });
        return queryDispatcher(sql, params);
    },
    connect: async () => {
        throw new Error('CRITICAL VIOLATION: db.connect called during isolated test!');
    },
    pool: {
        query: async (sql, params) => {
            executedQueries.push({ sql, params });
            return queryDispatcher(sql, params);
        }
    }
};

const dbModulePath = require.resolve('../config/db');
require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: mockDb
};

// Verify module resolution cache injection
assert.strictEqual(require('../config/db'), mockDb, 'Mock DB must be returned from require("../config/db")');

// Now load modules safely
const dashboardController = require('../controllers/dashboardController');
const dashboardService = require('../services/dashboardService');
const reTargetService = require('../services/reTargetService');

// Helper to create mock Express response
function createMockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        }
    };
}

// ============================================================================
// TEST SUITE EXECUTION
// ============================================================================
async function runAllTests() {
    console.log('====================================================================');
    console.log('🚀 STARTING PHASE 1 ISOLATED VERIFICATION TEST SUITE');
    console.log('====================================================================\n');

    let passed = 0;
    let failed = 0;

    async function test(name, fn) {
        process.stdout.write(`• Testing: ${name} ... `);
        try {
            await fn();
            console.log('✅ PASSED');
            passed++;
        } catch (err) {
            console.log('❌ FAILED');
            console.error(err);
            failed++;
        }
    }

    // ------------------------------------------------------------------------
    // TEST 1: Isolation Guard Verification
    // ------------------------------------------------------------------------
    await test('Strict Network & Database Isolation Guard', async () => {
        let poolBlocked = false;
        try {
            const p = new pg.Pool();
            await p.connect();
        } catch (e) {
            if (e.message.includes('pg.Pool.prototype.connect called')) {
                poolBlocked = true;
            }
        }
        assert.strictEqual(poolBlocked, true, 'pg.Pool.prototype.connect must be unconditionally blocked');

        let clientBlocked = false;
        try {
            const c = new pg.Client();
            await c.connect();
        } catch (e) {
            if (e.message.includes('pg.Client.prototype.connect called')) {
                clientBlocked = true;
            }
        }
        assert.strictEqual(clientBlocked, true, 'pg.Client.prototype.connect must be unconditionally blocked');
    });

    // ------------------------------------------------------------------------
    // TEST 2: General CRM Revenue Like-for-Like Comparison & Cash Collected
    // ------------------------------------------------------------------------
    await test('General CRM Revenue Like-for-Like (Invoices vs Invoices) & Cash Collected', async () => {
        executedQueries.length = 0;

        queryDispatcher = async (sql, params) => {
            const normalized = sql.replace(/\s+/g, ' ').trim();

            if (normalized.includes('SELECT template_name FROM tenants')) {
                return { rows: [{ template_name: 'general' }] };
            }
            if (normalized.includes('FROM invoices') && normalized.includes("INTERVAL '1 month'")) {
                // Previous revenue: MUST be invoices, NOT payments!
                assert(normalized.includes("status != 'cancelled'"), 'Previous revenue must exclude cancelled invoices');
                return { rows: [{ total: '100000' }] };
            }
            if (normalized.includes('FROM invoices') && normalized.includes('created_at >=')) {
                // Current revenue: invoices
                assert(normalized.includes("status != 'cancelled'"), 'Current revenue must exclude cancelled invoices');
                return { rows: [{ total: '150000' }] };
            }
            if (normalized.includes('FROM payments') && normalized.includes('payment_date >=')) {
                // Cash collected: payments
                assert(normalized.includes("status, 'active') != 'cancelled'"), 'Cash collected must exclude cancelled payments');
                return { rows: [{ total: '120000' }] };
            }
            if (normalized.includes('FROM expenses') && !normalized.includes('INTERVAL')) {
                // Current expenses
                return { rows: [{ total: '50000' }] };
            }
            if (normalized.includes('FROM deals') && normalized.includes("pipeline_stage = 'won'")) {
                return { rows: [{ won_count: '5', total_count: '10' }] };
            }
            if (normalized.includes('FROM tasks') && normalized.includes("status = 'completed'")) {
                return { rows: [{ completed_count: '8', total_count: '10' }] };
            }
            if (normalized.includes('FROM invoices') && normalized.includes("INTERVAL '1 month'")) {
                // Previous revenue: MUST be invoices, NOT payments!
                assert(normalized.includes("status != 'cancelled'"), 'Previous revenue must exclude cancelled invoices');
                return { rows: [{ total: '100000' }] };
            }
            if (normalized.includes('FROM expenses') && normalized.includes("INTERVAL '1 month'")) {
                // Previous expenses
                return { rows: [{ total: '40000' }] };
            }

            throw new Error(`Unhandled query in Test 2: ${normalized}`);
        };

        const req = {
            user: { tenant_id: 'tenant-gen-1' },
            query: { timeFilter: 'THIS_MONTH', branchId: 'ALL' }
        };
        const res = createMockRes();

        await dashboardController.getBranchSummary(req, res);

        assert.strictEqual(res.statusCode, 200);
        const data = res.body.data;
        assert.strictEqual(data.revenue, 150000, 'Revenue must be 150,000 from invoices');
        assert.strictEqual(data.cash_collected, 120000, 'Cash collected must be 120,000 from payments');
        assert.strictEqual(data.expenses, 50000, 'Expenses must be 50,000');
        assert.strictEqual(data.profit, 100000, 'Profit must be 150,000 - 50,000 = 100,000');
        assert.strictEqual(data.profitMargin, '66.7', 'Profit margin must be 66.7%');

        // Check BI insight for like-for-like 50% revenue growth: (150,000 - 100,000) / 100,000 = +50%
        const revGrowthInsight = data.insights.find(i => i.message && i.message.includes('50.0%'));
        assert(revGrowthInsight, 'Must generate +50.0% growth insight computed like-for-like against invoices');
    });

    // ------------------------------------------------------------------------
    // TEST 3: Branch Comparison Leaderboard (Real Estate vs General CRM)
    // ------------------------------------------------------------------------
    await test('Branch Comparison Leaderboard Template-Aware Revenue Queries', async () => {
        // Part A: Real Estate Tenant
        executedQueries.length = 0;
        let realEstateQueryChecked = false;

        queryDispatcher = async (sql, params) => {
            const normalized = sql.replace(/\s+/g, ' ').trim();
            if (normalized.includes('SELECT template_name FROM tenants')) {
                return { rows: [{ template_name: 'real_estate' }] };
            }
            if (normalized.includes('WITH branch_metrics AS')) {
                assert(
                    normalized.includes('finance_vouchers') && normalized.includes("voucher_type = 'receipt'"),
                    'Real estate comparison must aggregate revenue from finance_vouchers receipts'
                );
                assert(
                    normalized.includes("status, 'active') != 'cancelled'"),
                    'Real estate comparison must exclude cancelled vouchers'
                );
                realEstateQueryChecked = true;
                return {
                    rows: [
                        {
                            branch_id: 'b1',
                            branch_name: 'New Cairo',
                            revenue: '500000',
                            expenses: '150000',
                            profit: '350000',
                            win_rate: '60.0',
                            task_completion: '85.0'
                        }
                    ]
                };
            }
            throw new Error(`Unhandled query in Test 3A: ${normalized}`);
        };

        const reqRE = {
            user: { tenant_id: 'tenant-re-1' },
            query: { timeFilter: 'THIS_MONTH' }
        };
        const resRE = createMockRes();
        await dashboardController.getComparison(reqRE, resRE);

        assert.strictEqual(resRE.statusCode, 200);
        assert.strictEqual(realEstateQueryChecked, true);
        assert.strictEqual(resRE.body.data[0].branch_name, 'New Cairo');
        assert.strictEqual(resRE.body.data[0].revenue, 500000);

        // Part B: General CRM Tenant
        executedQueries.length = 0;
        let generalQueryChecked = false;

        queryDispatcher = async (sql, params) => {
            const normalized = sql.replace(/\s+/g, ' ').trim();
            if (normalized.includes('SELECT template_name FROM tenants')) {
                return { rows: [{ template_name: 'general' }] };
            }
            if (normalized.includes('WITH branch_metrics AS')) {
                assert(
                    normalized.includes('FROM invoices inv') && normalized.includes("inv.status != 'cancelled'"),
                    'General comparison must aggregate revenue from non-cancelled invoices'
                );
                generalQueryChecked = true;
                return {
                    rows: [
                        {
                            branch_id: 'b2',
                            branch_name: 'Alexandria',
                            revenue: '200000',
                            expenses: '80000',
                            profit: '120000',
                            win_rate: '50.0',
                            task_completion: '75.0'
                        }
                    ]
                };
            }
            throw new Error(`Unhandled query in Test 3B: ${normalized}`);
        };

        const reqGen = {
            user: { tenant_id: 'tenant-gen-2' },
            query: { timeFilter: 'THIS_MONTH' }
        };
        const resGen = createMockRes();
        await dashboardController.getComparison(reqGen, resGen);

        assert.strictEqual(resGen.statusCode, 200);
        assert.strictEqual(generalQueryChecked, true);
        assert.strictEqual(resGen.body.data[0].branch_name, 'Alexandria');
        assert.strictEqual(resGen.body.data[0].revenue, 200000);
    });

    // ------------------------------------------------------------------------
    // TEST 4: Real Estate Target Deduplication & Reservation Cancellation Safety
    // ------------------------------------------------------------------------
    await test('Real Estate Cancellation Deduplication & Deal Reservation Isolation', async () => {
        let contractsSqlChecked = false;
        let cancelSqlChecked = false;

        const runner = {
            query: async (sql, params) => {
                const normalized = sql.replace(/\s+/g, ' ').trim();

                // 1. Contracts Query in calculateProgressForTarget
                if (normalized.includes('FROM re_contracts rc') && normalized.includes('canc.cancelled_at')) {
                    assert(
                        normalized.includes('LEFT JOIN LATERAL') && normalized.includes('MIN(c.created_at) AS cancelled_at'),
                        'contractsSql must use LEFT JOIN LATERAL on c.contract_id = rc.id with MIN(created_at)'
                    );
                    contractsSqlChecked = true;
                    return {
                        rows: [
                            // Contract 1: Active signed contract -> included
                            { id: 101, contract_value: '1000000', unit_id: 'u1', contract_status: 'Signed', cancelled_at: null },
                            // Contract 2: Cancelled in this period with explicit date (< endLocal) -> excluded
                            { id: 102, contract_value: '500000', unit_id: 'u2', contract_status: 'Cancelled', cancelled_at: '2026-03-15T10:00:00Z' },
                            // Contract 3: Cancelled with NULL date (missing cancellation record) -> strictly excluded (Prudent Rule)
                            { id: 103, contract_value: '300000', unit_id: 'u3', contract_status: 'Cancelled', cancelled_at: null },
                            // Contract 4: Cancelled in a future period (>= endLocal) -> preserved in historical closed period
                            { id: 104, contract_value: '400000', unit_id: 'u4', contract_status: 'Cancelled', cancelled_at: '2026-04-10T10:00:00Z' }
                        ]
                    };
                }

                // 2. Cancellations Query
                if (normalized.includes('FROM re_cancellations canc') && normalized.includes('canc.contract_id')) {
                    assert(normalized.includes('canc.contract_id'), 'cancelSql must select canc.contract_id');
                    cancelSqlChecked = true;
                    return {
                        rows: [
                            // Row A: Reservation cancellation at deal stage (NO contract_id)
                            {
                                id: 1,
                                contract_id: null,
                                deal_id: 50,
                                total_paid_amount: '20000',
                                deduction_amount: '0',
                                refundable_amount: '20000',
                                contract_value: null,
                                contract_date: null
                            },
                            // Row B: Contract cancellation from prior period
                            {
                                id: 2,
                                contract_id: 201,
                                deal_id: 51,
                                total_paid_amount: '100000',
                                deduction_amount: '10000',
                                refundable_amount: '90000',
                                contract_value: '400000',
                                contract_date: '2026-01-10T00:00:00Z' // Prior period (< 2026-03-01)
                            },
                            // Row C: Duplicate cancellation record for the EXACT SAME prior-period contract
                            {
                                id: 3,
                                contract_id: 201,
                                deal_id: 51,
                                total_paid_amount: '100000',
                                deduction_amount: '10000',
                                refundable_amount: '90000',
                                contract_value: '400000',
                                contract_date: '2026-01-10T00:00:00Z'
                            },
                            // Row D: Another prior-period contract cancellation
                            {
                                id: 4,
                                contract_id: 202,
                                deal_id: 52,
                                total_paid_amount: '50000',
                                deduction_amount: '5000',
                                refundable_amount: '45000',
                                contract_value: '200000',
                                contract_date: '2026-02-01T00:00:00Z'
                            }
                        ]
                    };
                }

                // 3. Installments
                if (normalized.includes('FROM re_installments ri')) {
                    return {
                        rows: [{
                            down_payment_installments: '100000',
                            periodic_installments: '50000',
                            total_installments_paid: '150000'
                        }]
                    };
                }

                // 4. Direct Finance Vouchers
                if (normalized.includes('FROM finance_vouchers fv')) {
                    return { rows: [{ direct_receipts: '50000' }] };
                }

                throw new Error(`Unhandled query in Test 4: ${normalized}`);
            }
        };

        const target = {
            tenant_id: 'tenant-re-1',
            branch_id: 1,
            user_id: 10,
            target_scope: 'individual',
            target_amount: 2000000,
            target_units: 5
        };
        const bounds = {
            startLocal: '2026-03-01T00:00:00Z',
            endLocal: '2026-03-31T23:59:59Z',
            timezone: 'UTC'
        };

        const result = await reTargetService.calculateProgressForTarget(
            target,
            bounds,
            runner
        );

        assert.strictEqual(contractsSqlChecked, true, 'contractsSql must have been validated');
        assert.strictEqual(cancelSqlChecked, true, 'cancelSql must have been validated');

        // Gross Contracts Value:
        // Contract 101 (1,000,000) is Signed -> included
        // Contract 102 (500,000) is Cancelled with date < endLocal -> excluded
        // Contract 103 (300,000) is Cancelled with null date -> strictly excluded (Prudent Rule)
        // Contract 104 (400,000) is Cancelled with date >= endLocal -> included (historical preservation)
        // Total Gross = 1,000,000 + 400,000 = 1,400,000
        assert.strictEqual(result.gross_contracts_value, 1400000, 'Gross contracted value must be 1,400,000');

        // Deduplications:
        // Contract 201 (400,000) has 2 cancellation rows -> must only be deducted ONCE!
        // Contract 202 (200,000) has 1 cancellation row -> deducted once.
        // Reservation cancellation (Row A, contract_id null) -> zero deduction.
        // Total Prior Deductions = 400,000 + 200,000 = 600,000.
        // Achieved Net Contracts Value = 1,400,000 - 600,000 = 800,000.
        assert.strictEqual(result.prior_cancellations_deduction_value, 600000, 'Prior period deductions must be 600,000 without double counting');
        assert.strictEqual(result.achieved_contracts_value, 800000, 'Net contracted value must accurately deduct 600,000 without double counting');
        assert.strictEqual(result.prior_cancellations_count, 2, 'Prior cancellations count must be 2 unique contracts');

        // Total cash collected = 150,000 (installments) + 50,000 (direct vouchers) = 200,000
        assert.strictEqual(result.achieved_collected_amount, 200000, 'Achieved collected amount must be 200,000');
        assert.strictEqual(result.achieved_units_count, 2, 'Active units count must be 2 (u1 and u4)');
        assert.strictEqual(result.contracts_achievement_pct, 40, 'Contracts quota achievement % must be accurately (800,000 / 2,000,000) * 100 = 40%');
        assert.strictEqual(result.units_achievement_pct, 40, 'Units quota achievement % must be accurately (2 / 5) * 100 = 40%');
    });

    // ------------------------------------------------------------------------
    // TEST 5: Top Agents Commissions Overview Period Filtering
    // ------------------------------------------------------------------------
    await test('Commissions Overview Period Filtering on re_contracts.contract_date', async () => {
        let topAgentsQueryChecked = false;

        queryDispatcher = async (sql, params) => {
            const normalized = sql.replace(/\s+/g, ' ').trim();

            if (normalized.includes('COUNT(rc.id) as deals_count') && normalized.includes('FROM users u')) {
                assert(
                    normalized.includes('JOIN re_contracts rc ON rc.deal_id = d.id'),
                    'topAgents query must join re_contracts rc ON rc.deal_id = d.id'
                );
                assert(
                    normalized.includes("rc.status != 'Cancelled'"),
                    'topAgents query must filter out cancelled contracts'
                );
                assert(
                    normalized.includes('rc.contract_date >=') && normalized.includes("INTERVAL '1 month'"),
                    'topAgents query must apply both lower bound and upper bound (< date_trunc + 1 month) on rc.contract_date'
                );
                topAgentsQueryChecked = true;
                return {
                    rows: [
                        {
                            user_id: 10,
                            user_name: 'Ahmed Sales',
                            deals_count: '3',
                            total_deal_value: '3500000'
                        }
                    ]
                };
            }

            if (normalized.includes('FROM re_commissions') && normalized.includes('total_calculated')) {
                return {
                    rows: [{
                        total_calculated: '105000',
                        total_paid: '50000',
                        outstanding: '55000'
                    }]
                };
            }

            if (normalized.includes('FROM re_commissions') && normalized.includes('beneficiary_user_id')) {
                return {
                    rows: [{
                        beneficiary_user_id: 10,
                        agent_comm_amount: '105000',
                        agent_paid_amount: '0',
                        paid_count: '0',
                        total_count: '1'
                    }]
                };
            }

            throw new Error(`Unhandled query in Test 5: ${normalized}`);
        };

        const result = await dashboardService.getRealEstateCommissionsOverview('tenant-re-1', true, 'THIS_MONTH');

        assert.strictEqual(topAgentsQueryChecked, true, 'topAgents query was verified with period filtering');
        assert.strictEqual(result.topAgents.length, 1);
        assert.strictEqual(result.topAgents[0].name, 'Ahmed Sales');
        assert.strictEqual(result.topAgents[0].dealsCount, 3);
        assert.strictEqual(result.topAgents[0].dealValue, 3500000);
        assert.strictEqual(result.topAgents[0].commissionAmount, 105000);
        assert.strictEqual(result.commissions.outstanding, 55000);
    });

    // ------------------------------------------------------------------------
    // TEST 6: Salesman Performance Detail Deduplication & Lateral Join
    // ------------------------------------------------------------------------
    await test('Salesman Performance Detail Deduplication & Lateral Join', async () => {
        let salesmanContractsLateralChecked = false;
        let salesmanCancelDedupChecked = false;

        const runner = {
            query: async (sql, params) => {
                const normalized = sql.replace(/\s+/g, ' ').trim();

                // 1. User
                if (normalized.includes('FROM users') && normalized.includes('WHERE id = $1')) {
                    return { rows: [{ id: 10, name: 'Mostafa Sales', email: 'mostafa@test.com', role: 'sales', department_id: 1 }] };
                }
                // 2. Target
                if (normalized.includes('FROM re_targets') && normalized.includes('LIMIT 1')) {
                    return { rows: [{ target_amount: '1000000', target_units: '2' }] };
                }
                // 3. Contracts
                if (normalized.includes('FROM re_contracts rc') && normalized.includes('canc.cancellation_reason')) {
                    assert(
                        normalized.includes('LEFT JOIN LATERAL') && normalized.includes('c.contract_id = rc.id'),
                        'getSalesmanPerformanceDetail must use LEFT JOIN LATERAL on c.contract_id = rc.id'
                    );
                    salesmanContractsLateralChecked = true;
                    return {
                        rows: [
                            {
                                id: 501,
                                contract_number: 'CNT-01',
                                contract_value: '800000',
                                down_payment: '80000',
                                contract_date: '2026-03-10T00:00:00Z',
                                contract_status: 'Signed',
                                customer_name: 'Client A',
                                customer_phone: '01000000000',
                                unit_number: 'U-10',
                                project_name: 'Project Alpha',
                                unit_type: 'Apartment',
                                cancelled_at: null,
                                cancellation_reason: null
                            },
                            // Contract 502: Cancelled with missing cancellation date -> strictly excluded
                            {
                                id: 502,
                                contract_number: 'CNT-02',
                                contract_value: '250000',
                                down_payment: '25000',
                                contract_date: '2026-03-12T00:00:00Z',
                                contract_status: 'Cancelled',
                                customer_name: 'Client B',
                                customer_phone: '01000000001',
                                unit_number: 'U-20',
                                project_name: 'Project Alpha',
                                unit_type: 'Studio',
                                cancelled_at: null,
                                cancellation_reason: null
                            },
                            // Contract 503: Cancelled in subsequent period (April) -> preserved in March achievement
                            {
                                id: 503,
                                contract_number: 'CNT-03',
                                contract_value: '350000',
                                down_payment: '35000',
                                contract_date: '2026-03-20T00:00:00Z',
                                contract_status: 'Cancelled',
                                customer_name: 'Client C',
                                customer_phone: '01000000002',
                                unit_number: 'U-30',
                                project_name: 'Project Alpha',
                                unit_type: 'Duplex',
                                cancelled_at: '2026-04-15T00:00:00Z',
                                cancellation_reason: 'Refunded in April'
                            }
                        ]
                    };
                }
                // 4. Reservations
                if (normalized.includes('FROM re_units') && normalized.includes("status = 'Reserved'")) {
                    return { rows: [] };
                }
                // 5. Installments
                if (normalized.includes('FROM re_installments ri')) {
                    return { rows: [] };
                }
                // 6. Finance Vouchers
                if (normalized.includes('FROM finance_vouchers fv')) {
                    return { rows: [] };
                }
                // 7. Cancellations
                if (normalized.includes('FROM re_cancellations canc') && normalized.includes('canc.cancellation_reason')) {
                    assert(normalized.includes('canc.contract_id'), 'cancel query must select canc.contract_id');
                    salesmanCancelDedupChecked = true;
                    return {
                        rows: [
                            // Duplicate cancellation records for the same prior-period contract
                            {
                                id: 1,
                                contract_id: 301,
                                deal_id: 80,
                                total_paid_amount: '50000',
                                deduction_amount: '5000',
                                refundable_amount: '45000',
                                cancellation_reason: 'Client relocated',
                                cancelled_at: '2026-03-05T00:00:00Z',
                                contract_number: 'CNT-OLD-1',
                                contract_value: '300000',
                                contract_date: '2026-01-15T00:00:00Z',
                                customer_name: 'Client B',
                                project_name: 'Project Beta',
                                unit_number: 'U-20'
                            },
                            {
                                id: 2,
                                contract_id: 301,
                                deal_id: 80,
                                total_paid_amount: '50000',
                                deduction_amount: '5000',
                                refundable_amount: '45000',
                                cancellation_reason: 'Client relocated',
                                cancelled_at: '2026-03-05T00:00:00Z',
                                contract_number: 'CNT-OLD-1',
                                contract_value: '300000',
                                contract_date: '2026-01-15T00:00:00Z',
                                customer_name: 'Client B',
                                project_name: 'Project Beta',
                                unit_number: 'U-20'
                            }
                        ]
                    };
                }

                throw new Error(`Unhandled query in Test 6: ${normalized}`);
            }
        };

        const detail = await reTargetService.getSalesmanPerformanceDetail({
            tenant_id: 'tenant-re-1',
            user_id: 10,
            period: '2026-03',
            branch_id: null,
            client: runner
        });

        assert.strictEqual(salesmanContractsLateralChecked, true, 'contracts lateral query verified');
        assert.strictEqual(salesmanCancelDedupChecked, true, 'cancel query with contract_id verified');
        // Gross = 800,000 (signed) + 350,000 (future-cancelled) = 1,150,000. Missing-date cancelled (250,000) excluded!
        // Prior deduction = 300,000 (deduplicated, NOT 600,000!).
        // Net Contract Value = 1,150,000 - 300,000 = 850,000.
        assert.strictEqual(detail.summary.gross_contract_value, 1150000, 'Gross contract value must be 1,150,000');
        assert.strictEqual(detail.summary.prior_cancellations_deduction_value, 300000, 'Prior period deduction must be 300,000 without duplication');
        assert.strictEqual(detail.summary.total_contract_value, 850000, 'Net contract value must be 850,000');
        assert.strictEqual(detail.summary.contracts_achievement_pct, 85, 'Contracts achievement % must be (850,000 / 1,000,000) * 100 = 85%');
        assert.strictEqual(detail.summary.units_achievement_pct, 100, 'Units achievement % must be (2 / 2) * 100 = 100%');
        assert.strictEqual(detail.contracts.length, 2, 'Active contributing contracts list contains exactly 2 contracts (501 and 503)');
        assert.strictEqual(detail.cancellations.length, 2, 'Cancellations list returns both audit records');
    });

    console.log('\n====================================================================');
    console.log(`🏁 TEST SUITE FINISHED: ${passed} Passed, ${failed} Failed`);
    console.log('====================================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error('Unhandled suite error:', err);
    process.exit(1);
});
