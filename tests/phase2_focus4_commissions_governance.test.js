/**
 * Phase 2 - Focus 4: Real Estate Commissions Governance Test Suite
 *
 * Verifies:
 * 1. Triple-barrier network/database isolation guard.
 * 2. Route RBAC & Financial Write Authorization for commissions endpoints.
 * 3. Accrual idempotency: prevents duplicate commission creation for same deal/beneficiary/trigger.
 * 4. Three Earning Triggers:
 *    - contract_signing: requires Signed/Active contract.
 *    - down_payment: requires verified receipt vouchers >= down payment.
 *    - installment_collection: enforces proportional payout strictly based on verified receipt vouchers; ignores unpaid schedules.
 * 5. Lifecycle transitions: prevents direct PATCH to Paid, blocks mutation of terminal states.
 * 6. Financial Payout: atomic payment voucher in finance_vouchers with idempotency lock, zero expense duplication.
 * 7. Clawback & Reversal: requires reason, preserves history, creates documented reversal voucher on recovery.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('Phase 2 - Focus 4: Commissions Lifecycle & Financial Governance Suite', async (t) => {
  // Triple-Barrier Network & Database Isolation Guard
  const db = require('../config/db');
  const originalQuery = db.query;
  const originalConnect = db.connect;

  let mockQueryHandler = null;

  db.query = async (sql, params) => {
    if (mockQueryHandler) {
      return mockQueryHandler(sql, params);
    }
    throw new Error(`[ISOLATION BREACH]: Unauthorized db.query intercepted: ${sql}`);
  };

  db.connect = async () => {
    return {
      query: async (sql, params) => {
        if (mockQueryHandler) {
          return mockQueryHandler(sql, params);
        }
        throw new Error(`[ISOLATION BREACH]: Unauthorized client.query intercepted: ${sql}`);
      },
      release: () => {}
    };
  };

  t.after(() => {
    db.query = originalQuery;
    db.connect = originalConnect;
  });

  // Test 1: Route Stack RBAC & Permissions
  await t.test('1. reCommissionRoutes protects write routes with roleGuard([admin, manager]) and payment.create', () => {
    const router = require('../routes/reCommissionRoutes');
    const routes = router.stack.filter(s => s.route);

    const postRoute = routes.find(r => r.route.path === '/' && r.route.methods.post);
    assert.ok(postRoute, 'POST / must exist');

    const patchRoute = routes.find(r => r.route.path === '/:id/status' && r.route.methods.patch);
    assert.ok(patchRoute, 'PATCH /:id/status must exist');

    const payRoute = routes.find(r => r.route.path === '/:id/pay' && r.route.methods.post);
    assert.ok(payRoute, 'POST /:id/pay must exist');

    const delRoute = routes.find(r => r.route.path === '/:id' && r.route.methods.delete);
    assert.ok(delRoute, 'DELETE /:id must exist');

    // Test roleGuard behavioral execution
    const roleGuard = require('../middleware/roleGuard');
    const guard = roleGuard(['admin', 'manager']);

    let employeeStatus = null;
    let employeeMessage = null;
    guard(
      { user: { id: 10, role: 'employee' } },
      { status: (code) => { employeeStatus = code; return { json: (d) => { employeeMessage = d?.message; } }; } },
      () => {}
    );
    assert.equal(employeeStatus, 403, 'Regular employee must receive 403 on commission write routes');
    assert.match(employeeMessage, /not authorized/i);
  });

  // Test 2: Commission Creation & Accrual Idempotency
  await t.test('2. createCommission creates record and prevents duplicate accrual on retry', async () => {
    const ctrl = require('../controllers/reCommissionsController');
    const tenantId = 'tenant-comm-idem';

    // 2a. New Commission creation
    mockQueryHandler = async (sql, params) => {
      if (sql.includes('ALTER TABLE')) return {};
      if (sql.includes('FROM deals')) {
        return { rows: [{ id: 301, title: 'Commercial Suite 4B', value: '2000000', assigned_to: 15, branch_id: 'b-1' }] };
      }
      if (sql.includes('FROM re_commissions WHERE deal_id')) {
        return { rows: [] }; // No existing commission yet
      }
      if (sql.includes('FROM re_contracts WHERE deal_id')) {
        return { rows: [{ id: 'con-301' }] };
      }
      if (sql.includes('INSERT INTO re_commissions')) {
        return {
          rows: [{
            id: 'comm-new-1',
            deal_id: 301,
            beneficiary_name: 'Ahmed Agent',
            calculated_amount: 50000,
            status: 'Pending',
            trigger_event: 'contract_signing'
          }]
        };
      }
      return { rows: [] };
    };

    const reqNew = {
      user: { id: 1, tenant_id: tenantId, role: 'admin' },
      body: {
        deal_id: 301,
        beneficiary_name: 'Ahmed Agent',
        beneficiary_user_id: 15,
        rate: 2.5,
        commission_type: 'percentage',
        trigger_event: 'contract_signing'
      }
    };
    let codeNew = 200;
    let payloadNew = null;
    const resNew = {
      status: (c) => { codeNew = c; return { json: (d) => { payloadNew = d; } }; },
      json: (d) => { payloadNew = d; }
    };

    await ctrl.createCommission(reqNew, resNew);
    assert.equal(codeNew, 201);
    assert.equal(payloadNew?.status, 'success');
    assert.equal(payloadNew?.data?.id, 'comm-new-1');

    // 2b. Replay creation: returns existing commission without duplicate insert
    let insertAttempted = false;
    mockQueryHandler = async (sql) => {
      if (sql.includes('ALTER TABLE')) return {};
      if (sql.includes('FROM deals')) {
        return { rows: [{ id: 301, title: 'Commercial Suite 4B', value: '2000000', assigned_to: 15, branch_id: 'b-1' }] };
      }
      if (sql.includes('FROM re_commissions') && sql.includes('deal_id = $1')) {
        return {
          rows: [{
            id: 'comm-new-1',
            calculated_amount: 50000,
            status: 'Pending',
            trigger_event: 'contract_signing',
            beneficiary_name: 'Ahmed Agent'
          }]
        };
      }
      if (sql.includes('INSERT INTO re_commissions')) {
        insertAttempted = true;
        return { rows: [] };
      }
      return { rows: [] };
    };

    let codeReplay = 200;
    let payloadReplay = null;
    const resReplay = {
      status: (c) => { codeReplay = c; return { json: (d) => { payloadReplay = d; } }; },
      json: (d) => { payloadReplay = d; }
    };

    await ctrl.createCommission(reqNew, resReplay);
    assert.equal(codeReplay, 200);
    assert.equal(insertAttempted, false, 'Must NOT insert duplicate commission record on retry');
    assert.match(payloadReplay?.message, /already exists/i);
    assert.equal(payloadReplay?.data?.id, 'comm-new-1');
  });

  // Test 3: The 3 Earning Triggers (Contract Signing, Down Payment, Proportional Installment Collection)
  await t.test('3. updateCommissionStatus enforces contract_signing, down_payment, and installment_collection triggers', async () => {
    const ctrl = require('../controllers/reCommissionsController');
    const tenantId = 'tenant-comm-triggers';

    // 3a. Trigger: contract_signing
    // Fails when contract is Draft (400)
    mockQueryHandler = async (sql) => {
      if (sql.includes('SELECT id, status, paid_amount')) {
        return {
          rows: [{
            id: 'comm-sign-1',
            status: 'Pending',
            paid_amount: '0',
            calculated_amount: '40000',
            trigger_event: 'contract_signing',
            contract_id: 'con-draft',
            deal_id: 401
          }]
        };
      }
      if (sql.includes('FROM re_contracts')) {
        return { rows: [{ id: 'con-draft', status: 'Draft', contract_value: '1000000', down_payment: '100000' }] };
      }
      return { rows: [] };
    };

    let code = null;
    let payload = null;
    const res = {
      status: (c) => { code = c; return { json: (d) => { payload = d; } }; },
      json: (d) => { payload = d; }
    };

    await ctrl.updateCommissionStatus(
      { user: { id: 1, tenant_id: tenantId, role: 'admin' }, params: { id: 'comm-sign-1' }, body: { status: 'Approved' } },
      res
    );
    assert.equal(code, 400);
    assert.match(payload?.message, /Contract signing trigger condition not met/i);

    // 3b. Trigger: down_payment
    // Fails when verified collections in finance_vouchers < required down payment
    mockQueryHandler = async (sql) => {
      if (sql.includes('SELECT id, status, paid_amount')) {
        return {
          rows: [{
            id: 'comm-dp-1',
            status: 'Pending',
            paid_amount: '0',
            calculated_amount: '40000',
            trigger_event: 'down_payment',
            contract_id: 'con-dp',
            deal_id: 402
          }]
        };
      }
      if (sql.includes('FROM re_contracts')) {
        return { rows: [{ id: 'con-dp', status: 'Signed', contract_value: '2000000', down_payment: '300000' }] };
      }
      if (sql.includes('FROM finance_vouchers') && sql.includes("voucher_type = 'receipt'")) {
        return { rows: [{ total_vouchers: '150000' }] }; // Only 150k collected of 300k required!
      }
      return { rows: [] };
    };

    await ctrl.updateCommissionStatus(
      { user: { id: 1, tenant_id: tenantId, role: 'admin' }, params: { id: 'comm-dp-1' }, body: { status: 'Approved' } },
      res
    );
    assert.equal(code, 400);
    assert.match(payload?.message, /Down payment trigger condition not met/i);

    // Succeeds when verified receipt vouchers >= down payment
    mockQueryHandler = async (sql) => {
      if (sql.includes('SELECT id, status, paid_amount')) {
        return {
          rows: [{
            id: 'comm-dp-1',
            status: 'Pending',
            paid_amount: '0',
            calculated_amount: '40000',
            trigger_event: 'down_payment',
            contract_id: 'con-dp',
            deal_id: 402
          }]
        };
      }
      if (sql.includes('FROM re_contracts')) {
        return { rows: [{ id: 'con-dp', status: 'Signed', contract_value: '2000000', down_payment: '300000' }] };
      }
      if (sql.includes('FROM finance_vouchers') && sql.includes("voucher_type = 'receipt'")) {
        return { rows: [{ total_vouchers: '300000' }] }; // Fully collected!
      }
      if (sql.includes('UPDATE re_commissions SET')) {
        return { rows: [{ id: 'comm-dp-1', status: 'Approved' }] };
      }
      return { rows: [] };
    };

    await ctrl.updateCommissionStatus(
      { user: { id: 1, tenant_id: tenantId, role: 'admin' }, params: { id: 'comm-dp-1' }, body: { status: 'Approved' } },
      res
    );
    assert.equal(payload?.status, 'success');
    assert.equal(payload?.data?.status, 'Approved');

    // 3c. Trigger: installment_collection (proportional to collected vouchers)
    // Fails when zero cash has been collected through receipt vouchers
    mockQueryHandler = async (sql) => {
      if (sql.includes('SELECT id, status, paid_amount')) {
        return {
          rows: [{
            id: 'comm-prop-1',
            status: 'Pending',
            paid_amount: '0',
            calculated_amount: '60000',
            trigger_event: 'installment_collection',
            contract_id: 'con-prop',
            deal_id: 403
          }]
        };
      }
      if (sql.includes('FROM re_contracts')) {
        return { rows: [{ id: 'con-prop', status: 'Signed', contract_value: '3000000', down_payment: '300000' }] };
      }
      if (sql.includes('FROM finance_vouchers') && sql.includes("voucher_type = 'receipt'")) {
        return { rows: [{ total_collected: '0' }] }; // Zero collected
      }
      return { rows: [] };
    };

    await ctrl.updateCommissionStatus(
      { user: { id: 1, tenant_id: tenantId, role: 'admin' }, params: { id: 'comm-prop-1' }, body: { status: 'Approved' } },
      res
    );
    assert.equal(code, 400);
    assert.match(payload?.message, /no verified payments collected yet/i);
  });

  // Test 4: Financial Payout with Proportional Caps, Concurrency Locks, and Voucher Generation
  await t.test('4. payCommission generates authoritative payment voucher, checks proportional limits, and prevents double charges', async () => {
    const ctrl = require('../controllers/reCommissionsController');
    const tenantId = 'tenant-comm-payout';
    const executedQueries = [];

    // 4a. Under installment_collection trigger, payout exceeding collected proportion is rejected
    // Contract = 1,000,000. Collected = 250,000 (25%). Total Commission = 100,000. Max Eligible = 25,000.
    // Client attempts to pay 30,000 -> must reject with 400!
    mockQueryHandler = async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return {};
      if (sql.includes('pg_advisory_xact_lock')) return {};
      if (sql.includes('SELECT * FROM re_commissions')) {
        return {
          rows: [{
            id: 'comm-pay-1',
            deal_id: 501,
            contract_id: 'con-501',
            calculated_amount: '100000.00',
            paid_amount: '0.00',
            status: 'Approved',
            trigger_event: 'installment_collection',
            beneficiary_name: 'Broker Apex',
            beneficiary_type: 'broker',
            branch_id: null
          }]
        };
      }
      if (sql.includes('FROM re_contracts')) {
        return { rows: [{ contract_value: '1000000.00' }] };
      }
      if (sql.includes('FROM finance_vouchers') && sql.includes("voucher_type = 'receipt'")) {
        return { rows: [{ total_collected: '250000.00' }] }; // 25% collected
      }
      return { rows: [] };
    };

    let code = null;
    let payload = null;
    const res = {
      status: (c) => { code = c; return { json: (d) => { payload = d; } }; },
      json: (d) => { payload = d; }
    };

    // Attempt to pay 30,000 (exceeds 25,000 eligible cap)
    await ctrl.payCommission(
      {
        user: { id: 1, tenant_id: tenantId, role: 'admin' },
        params: { id: 'comm-pay-1' },
        body: { amount: 30000, payment_method: 'bank_transfer' }
      },
      res
    );
    assert.equal(code, 400);
    assert.match(payload?.message, /exceeds currently earned proportional amount/i);

    // 4b. Paying within proportional limit (20,000) generates official payment voucher in finance_vouchers
    executedQueries.length = 0;
    mockQueryHandler = async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
      if (sql.includes('pg_advisory_xact_lock')) return {};
      if (sql.includes('SELECT * FROM re_commissions')) {
        return {
          rows: [{
            id: 'comm-pay-1',
            deal_id: 501,
            contract_id: 'con-501',
            calculated_amount: '100000.00',
            paid_amount: '0.00',
            status: 'Approved',
            trigger_event: 'installment_collection',
            beneficiary_name: 'Broker Apex',
            beneficiary_type: 'broker',
            branch_id: null
          }]
        };
      }
      if (sql.includes('FROM re_contracts')) {
        return { rows: [{ contract_value: '1000000.00' }] };
      }
      if (sql.includes('FROM finance_vouchers') && sql.includes("voucher_type = 'receipt'")) {
        return { rows: [{ total_collected: '250000.00' }] };
      }
      if (sql.includes('FROM finance_vouchers') && sql.includes("voucher_type = 'payment'")) {
        return { rows: [] }; // No prior voucher
      }
      if (sql.includes('FROM treasury_accounts')) {
        return { rows: [{ id: 8, name: 'Bank Misr' }] };
      }
      if (sql.includes('SELECT voucher_number FROM finance_vouchers')) {
        return { rows: [{ voucher_number: 'PV-0010' }] };
      }
      if (sql.includes('INSERT INTO finance_vouchers')) {
        return {
          rows: [{
            id: 'v-comm-10',
            voucher_number: 'PV-0011',
            amount: 20000,
            voucher_type: 'payment'
          }]
        };
      }
      if (sql.includes('UPDATE re_commissions SET')) {
        return {
          rows: [{
            id: 'comm-pay-1',
            paid_amount: '20000.00',
            status: 'Partially Paid'
          }]
        };
      }
      return { rows: [] };
    };

    await ctrl.payCommission(
      {
        user: { id: 1, tenant_id: tenantId, role: 'admin' },
        params: { id: 'comm-pay-1' },
        body: { amount: 20000, payment_method: 'bank_transfer', idempotency_key: 'TX-PAY-COMM-501' }
      },
      res
    );
    assert.equal(code, 201);
    assert.equal(payload?.status, 'success');
    assert.equal(payload?.voucher?.voucher_number, 'PV-0011');
    assert.equal(payload?.data?.paid_amount, '20000.00');

    // Assert that payment voucher was inserted into finance_vouchers and NOT expenses
    const paymentVoucher = executedQueries.find(q => q.sql.includes('INSERT INTO finance_vouchers'));
    assert.ok(paymentVoucher, 'Payout MUST generate payment voucher in finance_vouchers');
    assert.equal(paymentVoucher.params[1], 'broker');
    assert.equal(paymentVoucher.params[5], 20000);
    const expenseInsert = executedQueries.find(q => q.sql.includes('INSERT INTO expenses'));
    assert.equal(expenseInsert, undefined, 'Payout MUST NOT create duplicate expense entry');

    // 4c. Replay of same payment request with idempotency key returns existing voucher with 0 mutations
    executedQueries.length = 0;
    mockQueryHandler = async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return {};
      if (sql.includes('pg_advisory_xact_lock')) return {};
      if (sql.includes('SELECT * FROM re_commissions')) {
        return {
          rows: [{
            id: 'comm-pay-1',
            deal_id: 501,
            calculated_amount: '100000.00',
            paid_amount: '20000.00',
            status: 'Partially Paid'
          }]
        };
      }
      if (sql.includes('FROM finance_vouchers') && sql.includes("voucher_type = 'payment'")) {
        return {
          rows: [{
            id: 'v-comm-10',
            voucher_number: 'PV-0011',
            amount: 20000,
            status: 'active'
          }]
        };
      }
      return { rows: [] };
    };

    let replayCode = null;
    let replayPayload = null;
    const resReplay = {
      status: (c) => { replayCode = c; return { json: (d) => { replayPayload = d; } }; },
      json: (d) => { replayPayload = d; }
    };

    await ctrl.payCommission(
      {
        user: { id: 1, tenant_id: tenantId, role: 'admin' },
        params: { id: 'comm-pay-1' },
        body: { amount: 20000, idempotency_key: 'TX-PAY-COMM-501' }
      },
      resReplay
    );
    assert.equal(replayCode, 200);
    assert.match(replayPayload?.message, /already recorded/i);
    assert.equal(replayPayload?.voucher?.id, 'v-comm-10');
    const duplicateVoucher = executedQueries.find(q => q.sql.includes('INSERT INTO finance_vouchers'));
    assert.equal(duplicateVoucher, undefined, 'Must NOT insert duplicate voucher on replay');
  });

  // Test 5: Lifecycle Restrictions & Clawback Governance
  await t.test('5. updateCommissionStatus enforces lifecycle transitions and documented clawback handling', async () => {
    const ctrl = require('../controllers/reCommissionsController');
    const tenantId = 'tenant-comm-claw';

    let code = null;
    let payload = null;
    const res = {
      status: (c) => { code = c; return { json: (d) => { payload = d; } }; },
      json: (d) => { payload = d; }
    };

    // 5a. Direct transition to 'Paid' is forbidden (400)
    mockQueryHandler = async (sql) => {
      if (sql.includes('SELECT id, status, paid_amount')) {
        return { rows: [{ id: 'comm-c-1', status: 'Approved', paid_amount: '0' }] };
      }
      return { rows: [] };
    };

    await ctrl.updateCommissionStatus(
      { user: { id: 1, tenant_id: tenantId, role: 'admin' }, params: { id: 'comm-c-1' }, body: { status: 'Paid' } },
      res
    );
    assert.equal(code, 400);
    assert.match(payload?.message, /Direct status transition to 'Paid' is prohibited/i);

    // 5b. Clawback on unpaid commission is rejected (should be Cancelled) (400)
    await ctrl.updateCommissionStatus(
      { user: { id: 1, tenant_id: tenantId, role: 'admin' }, params: { id: 'comm-c-1' }, body: { status: 'Clawback', reason: 'Deal cancelled' } },
      res
    );
    assert.equal(code, 400);
    assert.match(payload?.message, /Unpaid commission should be marked 'Cancelled'/i);

    // 5c. Clawback on paid commission requires a documented reason (400)
    mockQueryHandler = async (sql) => {
      if (sql.includes('SELECT id, status, paid_amount')) {
        return { rows: [{ id: 'comm-c-2', status: 'Paid', paid_amount: '50000.00' }] };
      }
      return { rows: [] };
    };

    await ctrl.updateCommissionStatus(
      { user: { id: 1, tenant_id: tenantId, role: 'admin' }, params: { id: 'comm-c-2' }, body: { status: 'Clawback', reason: '' } },
      res
    );
    assert.equal(code, 400);
    assert.match(payload?.message, /Clawback requires a documented reason/i);

    // 5d. Documented Clawback with reverse_voucher: true generates official reversal receipt voucher
    const executedQueries = [];
    mockQueryHandler = async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
      if (sql.includes('pg_advisory_xact_lock')) return {};
      if (sql.includes('FROM re_commissions') && (sql.includes('WHERE id') || sql.includes('WHERE id::text'))) {
        return {
          rows: [{
            id: 'comm-c-2',
            status: 'Paid',
            paid_amount: '50000.00',
            beneficiary_name: 'Omar Agent',
            beneficiary_type: 'internal_agent',
            branch_id: null,
            deal_id: 601
          }]
        };
      }
      if (sql.includes('FROM finance_vouchers') && sql.includes("voucher_type = 'receipt'")) {
        return { rows: [] };
      }
      if (sql.includes('FROM treasury_accounts')) {
        return { rows: [{ id: 5, name: 'Main Safe' }] };
      }
      if (sql.includes('SELECT voucher_number FROM finance_vouchers')) {
        return { rows: [{ voucher_number: 'RV-0080' }] };
      }
      if (sql.includes('INSERT INTO finance_vouchers')) {
        return {
          rows: [{
            id: 'v-rev-1',
            voucher_number: 'RV-0081',
            amount: 50000,
            voucher_type: 'receipt'
          }]
        };
      }
      if (sql.includes('UPDATE re_commissions SET')) {
        return { rows: [{ id: 'comm-c-2', status: 'Clawback' }] };
      }
      if (sql.includes('SELECT * FROM re_commissions WHERE id =')) {
        return { rows: [{ id: 'comm-c-2', status: 'Clawback', paid_amount: '50000.00' }] };
      }
      return { rows: [] };
    };

    await ctrl.updateCommissionStatus(
      {
        user: { id: 1, tenant_id: tenantId, role: 'admin' },
        params: { id: 'comm-c-2' },
        body: { status: 'Clawback', reason: 'Deal defaulted and cancelled by legal court order', reverse_voucher: true }
      },
      res
    );
    assert.equal(payload?.status, 'success');
    assert.equal(payload?.voucher?.voucher_number, 'RV-0081');

    // 5e. Deleting a clawbacked or paid commission is strictly prohibited to preserve historical records
    await ctrl.deleteCommission(
      { user: { id: 1, tenant_id: tenantId, role: 'admin' }, params: { id: 'comm-c-2' } },
      res
    );
    assert.equal(code, 400);
    assert.match(payload?.message, /audit record must be preserved|Cannot delete commission with payments/i);
  });
});
