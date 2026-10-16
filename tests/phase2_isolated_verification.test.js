/**
 * Phase 2 Isolated Verification Suite
 *
 * Validates:
 * 1. Network & Database isolation barrier (Mock-only, zero live DB connection).
 * 2. Cancellation creation RBAC (admin/manager allowed, employee denied).
 * 3. Refund authorization RBAC (payment.create required; employee denied).
 * 4. Official payment voucher generation in finance_vouchers with single transaction.
 * 5. Idempotency & Replay Protection: already processed refunds return existing voucher with ZERO state mutation.
 * 6. Guard against zero/negative refundable_amount and unauthorized treasury account.
 * 7. Non-duplicating consolidated totalPaid calculation (tested across all numeric permutations).
 * 8. Real Estate payment controller: separation of administrative adjustment vs actual cash collection recording.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const pg = require('pg');

// -----------------------------------------------------------------------------
// TRIPLE-BARRIER ISOLATION SETUP
// -----------------------------------------------------------------------------
delete process.env.DATABASE_URL;
delete process.env.PGHOST;
delete process.env.PGUSER;
delete process.env.PGDATABASE;
delete process.env.PGPASSWORD;
delete process.env.PGPORT;

const realPoolConnect = pg.Pool.prototype.connect;
const realClientConnect = pg.Client.prototype.connect;

pg.Pool.prototype.connect = function () {
  throw new Error('FATAL ISOLATION VIOLATION: pg.Pool.connect() invoked in isolated test.');
};
pg.Client.prototype.connect = function () {
  throw new Error('FATAL ISOLATION VIOLATION: pg.Client.connect() invoked in isolated test.');
};

test.after(() => {
  pg.Pool.prototype.connect = realPoolConnect;
  pg.Client.prototype.connect = realClientConnect;
});

// Mock database query harness
let mockQueryHandler = async () => ({ rows: [] });

const mockDb = {
  query: async (...args) => mockQueryHandler(...args),
  connect: async () => ({
    query: async (...args) => mockQueryHandler(...args),
    release: () => {}
  }),
  pool: {
    connect: async () => ({
      query: async (...args) => mockQueryHandler(...args),
      release: () => {}
    })
  }
};

const dbPath = require.resolve('../config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: mockDb
};

// -----------------------------------------------------------------------------
// TEST SUITE
// -----------------------------------------------------------------------------
test('Phase 2: Cancellation Governance & Payment Synchronization Suite', async (t) => {

  // Test 1: Network & Database Isolation Guard
  await t.test('1. Environment and Database isolation barrier is strictly enforced', () => {
    assert.equal(process.env.DATABASE_URL, undefined);
    assert.throws(() => {
      const p = new pg.Pool();
      p.connect();
    }, /FATAL ISOLATION VIOLATION/);
  });

  // Test 2: Role Guard on Cancellation Creation (POST /api/re-cancellations)
  await t.test('2. Cancellation creation requires admin or manager role', async () => {
    const roleGuard = require('../middleware/roleGuard');
    const guard = roleGuard(['admin', 'manager']);

    // 2a. Employee denied (403)
    let statusCode = null;
    let jsonBody = null;
    const reqEmployee = { user: { id: 101, role: 'employee', tenant_id: 't-1' } };
    const resEmployee = {
      status: (code) => { statusCode = code; return { json: (d) => { jsonBody = d; } }; },
      json: (d) => { jsonBody = d; }
    };
    let nextCalled = false;
    guard(reqEmployee, resEmployee, () => { nextCalled = true; });

    assert.equal(statusCode, 403);
    assert.equal(nextCalled, false);
    assert.match(jsonBody?.message, /Access denied/);

    // 2b. Manager allowed (calls next)
    nextCalled = false;
    const reqManager = { user: { id: 102, role: 'manager', tenant_id: 't-1' } };
    guard(reqManager, resEmployee, () => { nextCalled = true; });
    assert.equal(nextCalled, true);

    // 2c. Admin allowed (calls next)
    nextCalled = false;
    const reqAdmin = { user: { id: 103, role: 'admin', tenant_id: 't-1' } };
    guard(reqAdmin, resEmployee, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  // Test 3: Financial Permission on Refund Processing (PATCH /api/re-cancellations/:id/refund)
  await t.test('3. Refund authorization requires payment.create financial permission', async () => {
    const { requirePermission } = require('../middleware/financialPermission');
    const refundGuard = requirePermission('payment.create');

    // 3a. Employee lacking payment.create is rejected with 403
    mockQueryHandler = async () => ({ rows: [] }); // No DB overrides
    let statusCode = null;
    let jsonPayload = null;
    let nextCalled = false;

    const reqEmployee = {
      user: { id: 201, role: 'employee', tenant_id: 'tenant-perm-1' }
    };
    const res = {
      status: (code) => { statusCode = code; return { json: (d) => { jsonPayload = d; } }; },
      json: (d) => { jsonPayload = d; }
    };

    await refundGuard(reqEmployee, res, () => { nextCalled = true; });
    assert.equal(statusCode, 403);
    assert.equal(nextCalled, false);
    assert.equal(jsonPayload?.code, 'PERMISSION_DENIED');

    // 3b. Finance Manager with payment.create is allowed through
    nextCalled = false;
    statusCode = null;
    const reqFinanceManager = {
      user: { id: 202, role: 'finance_manager', tenant_id: 'tenant-perm-1' }
    };
    await refundGuard(reqFinanceManager, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  // Test 4: Official Payment Voucher Generation upon Processed Refund with Treasury Account
  await t.test('4. Processed refund generates authoritative payment voucher and validates treasury account', async () => {
    const ctrl = require('../controllers/reCancellationsController');
    const tenantId = 'tenant-refund-1';
    const cancellationId = 'cancel-uuid-1';

    const executedQueries = [];
    mockQueryHandler = async (sql, params) => {
      executedQueries.push({ sql, params });

      // SELECT rc.*
      if (sql.includes('SELECT rc.*')) {
        return {
          rows: [{
            id: cancellationId,
            deal_id: 501,
            contract_id: 'contract-501',
            refundable_amount: '150000.00',
            refund_status: 'Pending',
            branch_id: 'branch-cairo',
            deal_branch_id: 'branch-cairo'
          }]
        };
      }

      // Treasury account validation query
      if (sql.includes('FROM treasury_accounts') && sql.includes('is_active = true')) {
        return {
          rows: [{ id: 88, name: 'CIB Operations Bank', branch_id: 'branch-cairo' }]
        };
      }

      // Lock cancellation FOR UPDATE
      if (sql.includes('FOR UPDATE')) {
        return {
          rows: [{
            id: cancellationId,
            deal_id: 501,
            refundable_amount: '150000.00',
            refund_status: 'Pending'
          }]
        };
      }

      // Check existing voucher (idempotency)
      if (sql.includes('SELECT id, voucher_number, amount, status FROM finance_vouchers')) {
        return { rows: [] }; // No prior voucher
      }

      // Deal and customer info
      if (sql.includes('SELECT d.title as deal_title')) {
        return {
          rows: [{
            deal_title: 'Unit 404 Deal',
            client_id: 'cust-909',
            customer_name: 'Mahmoud Hassan'
          }]
        };
      }

      // Voucher numbering lock and sequence lookups
      if (sql.includes('pg_advisory_xact_lock')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT voucher_number FROM finance_vouchers')) {
        return { rows: [{ voucher_number: 'PV-0005' }] };
      }
      if (sql.includes('SELECT id FROM finance_vouchers WHERE')) {
        return { rows: [] };
      }

      // INSERT INTO finance_vouchers
      if (sql.includes('INSERT INTO finance_vouchers')) {
        return {
          rows: [{
            id: 'voucher-refund-1',
            voucher_number: 'PV-0006',
            voucher_type: 'payment',
            amount: 150000,
            reference_no: `REFUND-CANCEL-${cancellationId}`
          }]
        };
      }

      // UPDATE re_cancellations
      if (sql.includes('UPDATE re_cancellations SET')) {
        return {
          rows: [{
            id: cancellationId,
            refund_status: 'Processed',
            refundable_amount: '150000.00',
            refund_date: '2026-10-16'
          }]
        };
      }

      return { rows: [] };
    };

    const req = {
      user: { id: 10, username: 'finance_lead', tenant_id: tenantId, role: 'finance_manager' },
      branchId: 'branch-cairo',
      params: { id: cancellationId },
      body: {
        refund_status: 'Processed',
        treasury_account_id: 88,
        payment_method: 'bank_transfer',
        notes: 'Approved customer refund'
      }
    };

    let resultJson = null;
    let statusCode = 200;
    const res = {
      status: (code) => { statusCode = code; return { json: (d) => { resultJson = d; } }; },
      json: (d) => { resultJson = d; }
    };

    await ctrl.updateRefundStatus(req, res);

    assert.equal(statusCode, 200);
    assert.equal(resultJson?.status, 'success');
    assert.equal(resultJson?.data?.refund_status, 'Processed');
    assert.equal(resultJson?.voucher?.voucher_number, 'PV-0006');

    // Verify finance voucher was inserted with payment type and linked to treasury
    const voucherInsert = executedQueries.find(q => q.sql.includes('INSERT INTO finance_vouchers'));
    assert.ok(voucherInsert, 'finance_vouchers payment voucher was inserted');
    assert.equal(voucherInsert.params[1], 'Mahmoud Hassan'); // customer name
    assert.equal(voucherInsert.params[5], 150000); // amount
    assert.equal(voucherInsert.params[8], 88); // validated treasury_account_id
    assert.equal(voucherInsert.params[9], `REFUND-CANCEL-${cancellationId}`); // reference_no

    // Verify NO duplicate expense insert occurred (treasury directly accounts for payment vouchers)
    const expenseInsert = executedQueries.find(q => q.sql.includes('INSERT INTO expenses'));
    assert.equal(expenseInsert, undefined, 'Must not duplicate deduction in expenses table');
  });

  // Test 5: Idempotency Protection on Duplicate Refund Calls & Status Replay
  await t.test('5. Replay of already processed refund returns existing voucher with ZERO state mutation', async () => {
    const ctrl = require('../controllers/reCancellationsController');
    const tenantId = 'tenant-refund-replay';
    const cancellationId = 'cancel-uuid-replay';

    const executedQueries = [];
    mockQueryHandler = async (sql, params) => {
      executedQueries.push({ sql, params });

      if (sql.includes('SELECT rc.*')) {
        return {
          rows: [{
            id: cancellationId,
            deal_id: 502,
            refundable_amount: '80000.00',
            refund_status: 'Processed', // Already processed!
            refund_date: '2026-10-10',
            branch_id: null
          }]
        };
      }

      // Existing voucher lookup
      if (sql.includes('SELECT id, voucher_number, amount, status FROM finance_vouchers')) {
        return {
          rows: [{
            id: 'voucher-existing-88',
            voucher_number: 'PV-0088',
            amount: 80000,
            status: 'active'
          }]
        };
      }

      return { rows: [] };
    };

    const req = {
      user: { id: 10, tenant_id: tenantId, role: 'admin' },
      params: { id: cancellationId },
      body: { refund_status: 'Processed', refund_date: '2026-10-16' }
    };

    let resultJson = null;
    let statusCode = 200;
    const res = {
      status: (code) => { statusCode = code; return { json: (d) => { resultJson = d; } }; },
      json: (d) => { resultJson = d; }
    };

    await ctrl.updateRefundStatus(req, res);

    assert.equal(statusCode, 200);
    assert.equal(resultJson?.status, 'success');
    assert.match(resultJson?.message, /already processed/);
    assert.equal(resultJson?.voucher?.voucher_number, 'PV-0088');

    // Assert that NO UPDATE was executed on re_cancellations and NO INSERT on finance_vouchers
    const cancellationUpdate = executedQueries.find(q => q.sql.includes('UPDATE re_cancellations'));
    assert.equal(cancellationUpdate, undefined, 'Must NOT touch re_cancellations on idempotent replay');
    const voucherInsert = executedQueries.find(q => q.sql.includes('INSERT INTO finance_vouchers'));
    assert.equal(voucherInsert, undefined, 'Must NOT create new vouchers on replay');
  });

  // Test 6: Ineligible refund & Unauthorized Treasury Account Guards
  await t.test('6. updateRefundStatus rejects zero-amount refunds and foreign branch treasury accounts', async () => {
    const ctrl = require('../controllers/reCancellationsController');
    const tenantId = 'tenant-guard-test';

    // 6a. Zero refundable amount cannot transition to Processed
    mockQueryHandler = async (sql) => {
      if (sql.includes('SELECT rc.*')) {
        return {
          rows: [{
            id: 'cancel-zero-1',
            deal_id: 503,
            refundable_amount: '0.00',
            refund_status: 'No Refund',
            branch_id: null
          }]
        };
      }
      return { rows: [] };
    };

    const reqZero = {
      user: { id: 1, tenant_id: tenantId, role: 'admin' },
      params: { id: 'cancel-zero-1' },
      body: { refund_status: 'Processed' }
    };
    let statusCode = null;
    let resPayload = null;
    const res = {
      status: (code) => { statusCode = code; return { json: (d) => { resPayload = d; } }; },
      json: (d) => { resPayload = d; }
    };

    await ctrl.updateRefundStatus(reqZero, res);
    assert.equal(statusCode, 400);
    assert.match(resPayload?.message, /zero or not eligible/);

    // 6b. Treasury account belonging to a different branch is rejected with 403
    mockQueryHandler = async (sql) => {
      if (sql.includes('SELECT rc.*')) {
        return {
          rows: [{
            id: 'cancel-branch-1',
            deal_id: 504,
            refundable_amount: '50000.00',
            refund_status: 'Pending',
            branch_id: 'branch-alex'
          }]
        };
      }
      if (sql.includes('FROM treasury_accounts') && sql.includes('is_active = true')) {
        return {
          rows: [{ id: 99, name: 'Cairo Cashbox', branch_id: 'branch-cairo' }] // different branch!
        };
      }
      return { rows: [] };
    };

    const reqForeignTreasury = {
      user: { id: 2, tenant_id: tenantId, role: 'manager' },
      branchId: 'branch-alex',
      params: { id: 'cancel-branch-1' },
      body: { refund_status: 'Processed', treasury_account_id: 99 }
    };

    await ctrl.updateRefundStatus(reqForeignTreasury, res);
    assert.equal(statusCode, 403);
    assert.match(resPayload?.message, /Unauthorized access to the selected treasury/);
  });

  // Test 7: Rigorous Numeric Verification of totalPaid Across All Real-World Permutations
  await t.test('7. processCancellation totalPaid: verified across vouchers, mixed, legacy, and edge cases', async () => {
    const ctrl = require('../controllers/reCancellationsController');
    const tenantId = 'tenant-calc-proof';

    // Mock dealPermission middleware
    const dealPermPath = require.resolve('../middleware/dealPermission');
    require.cache[dealPermPath] = {
      id: dealPermPath,
      loaded: true,
      exports: { checkDealPermission: async () => true }
    };

    // Helper to run cancellation with mock database outputs
    const runCalc = async ({ vouchersTotal, voucheredInstallments, installmentsPaid, contractDp, mvpPaid }) => {
      let recordedTotal = null;
      mockQueryHandler = async (sql, params) => {
        if (sql.includes('SELECT id, title, value')) {
          return { rows: [{ id: 999, title: 'Proof Deal', value: '1000000', unit_id: 'unit-9', branch_id: null }] };
        }
        if (sql.includes('SELECT id FROM re_cancellations WHERE deal_id')) return { rows: [] };
        if (sql.includes('FROM re_contracts WHERE deal_id')) {
          return { rows: [{ id: 'contract-9', contract_number: 'CNT-9', down_payment: contractDp }] };
        }
        if (sql.includes('FROM finance_vouchers') && sql.includes("voucher_type = 'receipt'")) {
          return {
            rows: [{
              total_vouchers: String(vouchersTotal),
              vouchered_installments: String(voucheredInstallments)
            }]
          };
        }
        if (sql.includes('FROM re_installments')) {
          return { rows: [{ sum_paid: String(installmentsPaid) }] };
        }
        if (sql.includes('FROM re_payments_mvp')) {
          return { rows: [{ paid_amount: String(mvpPaid) }] };
        }
        if (sql.includes('INSERT INTO re_cancellations')) {
          recordedTotal = params[4];
          return { rows: [{ id: 'c-calc', total_paid_amount: recordedTotal, refundable_amount: recordedTotal }] };
        }
        return { rows: [] };
      };

      const req = {
        user: { id: 1, tenant_id: tenantId, role: 'admin', username: 'admin' },
        body: { deal_id: 999, cancellation_reason: 'Audit calculation check' }
      };
      let resJson = null;
      const res = { status: () => res, json: (d) => { resJson = d; } };
      await ctrl.processCancellation(req, res);
      return recordedTotal;
    };

    // Case 7.1: Modern vouchers only (Down payment $100k + Installment $50k = $150k vouchered)
    // Both vouchers linked: vouchersTotal = 150k, voucheredInstallments = 150k, installmentsPaid = 150k
    // Expected: 150k (NO double-counting to 300k!)
    const total1 = await runCalc({
      vouchersTotal: 150000,
      voucheredInstallments: 150000,
      installmentsPaid: 150000,
      contractDp: 100000,
      mvpPaid: 150000
    });
    assert.equal(total1, 150000, 'Modern vouchers with matching installments must equal exactly 150,000');

    // Case 7.2: Mixed Overlap (Direct reservation voucher $20k + Vouchered Installment $50k + Legacy unvouchered installment $30k)
    // vouchersTotal = 70k, voucheredInstallments = 50k, installmentsPaid = 80k
    // Expected: 20k (direct) + 50k (vouchered) + 30k (legacy) = 100k!
    const total2 = await runCalc({
      vouchersTotal: 70000,
      voucheredInstallments: 50000,
      installmentsPaid: 80000,
      contractDp: 0,
      mvpPaid: 80000
    });
    assert.equal(total2, 100000, 'Mixed scenario must correctly combine direct voucher, vouchered installment, and unvouchered installment without loss or duplication');

    // Case 7.3: Pure Legacy (No vouchers in system; 3 legacy installments of 30k = 90k)
    const total3 = await runCalc({
      vouchersTotal: 0,
      voucheredInstallments: 0,
      installmentsPaid: 90000,
      contractDp: 0,
      mvpPaid: 90000
    });
    assert.equal(total3, 90000, 'Pure legacy installments must equal 90,000');

    // Case 7.4: Pure Legacy Down Payment (No installments yet; contract down_payment = 40k)
    const total4 = await runCalc({
      vouchersTotal: 0,
      voucheredInstallments: 0,
      installmentsPaid: 0,
      contractDp: 40000,
      mvpPaid: 40000
    });
    assert.equal(total4, 40000, 'Legacy contract down payment fallback must equal 40,000');
  });

  // Test 8: Separation of Administrative Cache Adjustment vs Actual Cash Collection Recording
  await t.test('8. rePaymentsController cleanly separates administrative cache adjustments from cash collection recording', async () => {
    const rePaymentsCtrl = require('../controllers/rePaymentsController');
    const tenantId = 'tenant-re-pay-clean';
    const paymentId = 'pay-uuid-88';

    // 8a. Administrative Adjustment: updates metadata, does NOT insert voucher, guards against invalid lowering
    let executedQueries = [];
    mockQueryHandler = async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('SELECT rp.*, d.title as deal_title')) {
        return {
          rows: [{
            id: paymentId,
            deal_id: 801,
            paid_amount: '100000.00',
            total_amount: '500000.00',
            branch_id: null
          }]
        };
      }
      if (sql.includes('FROM finance_vouchers') && sql.includes("voucher_type = 'receipt'")) {
        return { rows: [{ total_vouchers: '100000.00' }] };
      }
      if (sql.includes('UPDATE re_payments_mvp SET')) {
        return {
          rows: [{
            id: paymentId,
            paid_amount: params[0],
            next_payment_date: params[2],
            remaining_amount: 500000 - params[0]
          }]
        };
      }
      return { rows: [] };
    };

    // Client sends an administrative update of next_payment_date with attempted reduction of paid_amount to 40k
    const reqAdmin = {
      user: { id: 1, tenant_id: tenantId, role: 'admin' },
      params: { id: paymentId },
      body: {
        paid_amount: 40000,
        next_payment_date: '2026-12-01'
      }
    };
    let adminPayload = null;
    const resAdmin = { json: (d) => { adminPayload = d; }, status: () => resAdmin };

    await rePaymentsCtrl.updatePayment(reqAdmin, resAdmin);
    assert.equal(adminPayload?.status, 'success');
    // Guard ensured paid_amount did not drop below 100,000 verified vouchers
    assert.equal(adminPayload?.data?.paid_amount, 100000);
    // Verified NO voucher was generated for administrative metadata adjustment
    const adminVoucher = executedQueries.find(q => q.sql.includes('INSERT INTO finance_vouchers'));
    assert.equal(adminVoucher, undefined, 'Administrative adjustment must NOT insert receipt vouchers');

    // 8b. Actual Cash Collection Recording (record_collection: true)
    executedQueries = [];
    mockQueryHandler = async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('SELECT rp.*, d.title as deal_title')) {
        return {
          rows: [{
            id: paymentId,
            deal_id: 801,
            client_id: 'cust-77',
            paid_amount: '100000.00',
            total_amount: '500000.00',
            branch_id: 'branch-main'
          }]
        };
      }
      if (sql.includes('SELECT name FROM customers')) {
        return { rows: [{ name: 'Kareem Tarek' }] };
      }
      if (sql.includes('SELECT id, name FROM treasury_accounts')) {
        return { rows: [{ id: 12, name: 'Main Cashbox' }] };
      }
      if (sql.includes('SELECT voucher_number FROM finance_vouchers')) {
        return { rows: [{ voucher_number: 'RV-0020' }] };
      }
      if (sql.includes('SELECT id FROM finance_vouchers WHERE')) return { rows: [] };

      if (sql.includes('INSERT INTO finance_vouchers')) {
        return {
          rows: [{
            id: 'v-new-col',
            voucher_number: 'RV-0021',
            amount: 25000,
            voucher_type: 'receipt'
          }]
        };
      }
      if (sql.includes('UPDATE re_payments_mvp SET')) {
        return {
          rows: [{
            id: paymentId,
            paid_amount: params[0],
            status: params[1],
            remaining_amount: 500000 - params[0]
          }]
        };
      }
      return { rows: [] };
    };

    const reqCollection = {
      user: { id: 2, tenant_id: tenantId, role: 'manager' },
      branchId: 'branch-main',
      params: { id: paymentId },
      body: {
        record_collection: true,
        amount: 25000,
        payment_method: 'cash',
        notes: 'Direct cash deposit from customer'
      }
    };
    let collectPayload = null;
    let collectStatus = 200;
    const resCollect = {
      status: (code) => { collectStatus = code; return { json: (d) => { collectPayload = d; } }; },
      json: (d) => { collectPayload = d; }
    };

    await rePaymentsCtrl.updatePayment(reqCollection, resCollect);
    assert.equal(collectStatus, 201);
    assert.equal(collectPayload?.status, 'success');
    assert.equal(collectPayload?.voucher?.voucher_number, 'RV-0021');
    assert.equal(collectPayload?.data?.paid_amount, 125000); // 100k + 25k

    // Assert that an official receipt voucher was created in finance_vouchers
    const collectionVoucher = executedQueries.find(q => q.sql.includes('INSERT INTO finance_vouchers'));
    assert.ok(collectionVoucher, 'Cash collection recording MUST generate official receipt voucher');
    assert.equal(collectionVoucher.params[4], 25000);
    assert.equal(collectionVoucher.params[1], 'Kareem Tarek');
  });

  // Test 9: Collection Recording Idempotency Protection against Replay
  await t.test('9. rePaymentsController record_collection prevents duplicate vouchers and double-increment on replay', async () => {
    const rePaymentsCtrl = require('../controllers/rePaymentsController');
    const tenantId = 'tenant-re-pay-idem';
    const paymentId = 'pay-uuid-idem-99';

    const executedQueries = [];
    mockQueryHandler = async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('SELECT rp.*, d.title as deal_title')) {
        return {
          rows: [{
            id: paymentId,
            deal_id: 802,
            paid_amount: '125000.00',
            total_amount: '500000.00',
            branch_id: null
          }]
        };
      }
      // Simulate existing voucher found for this idempotency key
      if (sql.includes('SELECT id, voucher_number, amount, status FROM finance_vouchers') && sql.includes("voucher_type = 'receipt'")) {
        return {
          rows: [{
            id: 'v-existing-idem',
            voucher_number: 'RV-0021',
            amount: 25000,
            status: 'active'
          }]
        };
      }
      return { rows: [] };
    };

    // Client replays the exact same payment request with idempotency_key
    const reqReplay = {
      user: { id: 2, tenant_id: tenantId, role: 'manager' },
      params: { id: paymentId },
      body: {
        record_collection: true,
        idempotency_key: 'CLIENT-TX-UNIQUE-99',
        amount: 25000,
        payment_method: 'cash'
      }
    };

    let replayPayload = null;
    let replayStatus = 200;
    const resReplay = {
      status: (code) => { replayStatus = code; return { json: (d) => { replayPayload = d; } }; },
      json: (d) => { replayPayload = d; }
    };

    await rePaymentsCtrl.updatePayment(reqReplay, resReplay);

    assert.equal(replayStatus, 200);
    assert.equal(replayPayload?.status, 'success');
    assert.match(replayPayload?.message, /already recorded/);
    assert.equal(replayPayload?.voucher?.id, 'v-existing-idem');

    // Crucial: Assert that NO INSERT into finance_vouchers and NO UPDATE on re_payments_mvp occurred
    const insertQuery = executedQueries.find(q => q.sql.includes('INSERT INTO finance_vouchers'));
    assert.equal(insertQuery, undefined, 'Must NOT insert a second voucher on duplicate collection request');
    const updateCacheQuery = executedQueries.find(q => q.sql.includes('UPDATE re_payments_mvp'));
    assert.equal(updateCacheQuery, undefined, 'Must NOT increment paid_amount cache on duplicate collection request');

    // 9b. Two distinct requests without explicit idempotency_key receive distinct unique reference tokens
    executedQueries.length = 0;
    mockQueryHandler = async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('SELECT rp.*, d.title as deal_title')) {
        return { rows: [{ id: paymentId, deal_id: 802, paid_amount: '125000.00', total_amount: '500000.00', branch_id: null }] };
      }
      if (sql.includes('SELECT id, voucher_number, amount, status FROM finance_vouchers')) return { rows: [] };
      if (sql.includes('SELECT id, name FROM treasury_accounts')) return { rows: [{ id: 10, name: 'Cash' }] };
      if (sql.includes('SELECT voucher_number FROM finance_vouchers')) return { rows: [{ voucher_number: 'RV-0050' }] };
      if (sql.includes('INSERT INTO finance_vouchers')) return { rows: [{ id: 'v-new', voucher_number: 'RV-0051', amount: 5000, voucher_type: 'receipt' }] };
      if (sql.includes('UPDATE re_payments_mvp SET')) return { rows: [{ id: paymentId, paid_amount: 130000, status: 'partially_paid' }] };
      return { rows: [] };
    };

    const reqDistinct1 = {
      user: { id: 2, tenant_id: tenantId, role: 'manager' },
      params: { id: paymentId },
      body: { record_collection: true, amount: 5000, payment_method: 'cash' }
    };
    const reqDistinct2 = {
      user: { id: 2, tenant_id: tenantId, role: 'manager' },
      params: { id: paymentId },
      body: { record_collection: true, amount: 5000, payment_method: 'cash' }
    };
    let dummyRes = { status: () => dummyRes, json: () => {} };
    await rePaymentsCtrl.updatePayment(reqDistinct1, dummyRes);
    const voucherQuery1 = executedQueries.find(q => q.sql.includes('INSERT INTO finance_vouchers'));
    const ref1 = voucherQuery1.params[8]; // reference_no parameter ($9)

    executedQueries.length = 0;
    await rePaymentsCtrl.updatePayment(reqDistinct2, dummyRes);
    const voucherQuery2 = executedQueries.find(q => q.sql.includes('INSERT INTO finance_vouchers'));
    const ref2 = voucherQuery2.params[8]; // reference_no parameter ($9)

    assert.ok(ref1 && ref2, 'Both payments must have generated reference numbers');
    assert.notEqual(ref1, ref2, 'Two separate payments without idempotency key MUST have unique tokens to avoid collision');
  });

  // Test 10: Fail-Closed Protection on finance_vouchers Query Error in processCancellation
  await t.test('10. processCancellation safely fails closed and rolls back if finance_vouchers query fails', async () => {
    const ctrl = require('../controllers/reCancellationsController');
    const tenantId = 'tenant-fail-closed-test';

    const executedActions = [];
    mockQueryHandler = async (sql) => {
      executedActions.push(sql);
      if (sql.includes('BEGIN')) return { rows: [] };
      if (sql.includes('ROLLBACK')) return { rows: [] };
      if (sql.includes('SELECT id, title, value')) {
        return { rows: [{ id: 901, title: 'Fail Closed Deal', value: '1000000', unit_id: 'unit-fail', branch_id: null }] };
      }
      if (sql.includes('SELECT id FROM re_cancellations WHERE deal_id')) return { rows: [] };
      if (sql.includes('FROM re_contracts WHERE deal_id')) return { rows: [] };

      // Simulate transient DB error on querying finance_vouchers
      if (sql.includes('FROM finance_vouchers')) {
        throw new Error('DATABASE CONNECTION TIMEOUT ON FINANCIAL VOUCHERS TABLE');
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 1, tenant_id: tenantId, role: 'admin', username: 'admin' },
      body: { deal_id: 901, cancellation_reason: 'Testing fail-closed integrity' }
    };

    let statusCode = null;
    let resJson = null;
    const res = {
      status: (code) => { statusCode = code; return { json: (d) => { resJson = d; } }; },
      json: (d) => { resJson = d; }
    };

    await ctrl.processCancellation(req, res);

    // Assert that the request aborted with 500, triggered ROLLBACK, and did NOT create cancellation with corrupt totals
    assert.equal(statusCode, 500);
    assert.match(resJson?.message, /DATABASE CONNECTION TIMEOUT/);
    assert.ok(executedActions.some(sql => sql.includes('ROLLBACK')), 'Must ROLLBACK transaction on financial vouchers error');
    assert.ok(!executedActions.some(sql => sql.includes('INSERT INTO re_cancellations')), 'Must NOT insert cancellation record when vouchers query fails');
  });

});
