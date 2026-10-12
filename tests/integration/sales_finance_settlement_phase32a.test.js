const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config({ path: '.env.test' });

// ============================================================================
// CRITICAL SAFETY GATE: STRICT EXECUTION AGAINST ISOLATED TEST POSTGRESQL ONLY
// ============================================================================
function verifySafetyGate() {
  const testDbUrl = process.env.DATABASE_URL_TEST;
  if (!testDbUrl) {
    throw new Error('SAFETY GATE: DATABASE_URL_TEST is not configured in .env.test. Aborting!');
  }
  if (testDbUrl.includes('reseau.proxy.rlwy.net')) {
    throw new Error('SAFETY GATE VIOLATION: DATABASE_URL_TEST points to PRODUCTION. Aborting immediately!');
  }
  return testDbUrl;
}

const connectionString = verifySafetyGate();
process.env.DATABASE_URL = connectionString;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const financeController = require('../../controllers/financeController');
const invoicesController = require('../../controllers/invoicesController');

// Mock Express Request & Response Helper
function createMockReqRes({ user, body = {}, params = {}, query = {}, branchId = null }) {
  const req = {
    user,
    body,
    params,
    query,
    branchId,
    headers: { 'x-forwarded-for': '127.0.0.1' },
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' }
  };
  let responseData = null;
  let statusCode = 200;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };

  return { req, res, getStatus: () => statusCode, getData: () => responseData };
}

test('Phase 3.2A: Treasury & Payments Settlement Integrity Test Suite', async (t) => {
  const tenantAId = crypto.randomUUID();
  const tenantBId = crypto.randomUUID();
  const branch1Id = crypto.randomUUID();
  const branch2Id = crypto.randomUUID();

  let cashAccountId, bankAccountId, inactiveAccountId, tenantBAccountId, branch2CashAccountId;
  let customerId;
  let invoice1Id, invoice2Id, invoice3Id, invoice4Id, invoiceBranch2Id;

  const userTenantA = { id: 991, tenant_id: tenantAId, role: 'admin', permissions: ['payment.create', 'all'] };
  const userTenantB = { id: 992, tenant_id: tenantBId, role: 'admin', permissions: ['payment.create', 'all'] };

  // Setup Fixtures
  await t.test('Setup: Create isolated tenant, branches, customer, treasury accounts, and invoices', async () => {
    try {
      // 1. Tenants & Branches
      await pool.query(
        `INSERT INTO tenants (id, name, slug, plan, status) VALUES 
         ($1, 'Tenant Phase 3.2A', $2, 'enterprise', 'active'),
         ($3, 'Tenant B Phase 3.2A', $4, 'enterprise', 'active')`,
        [tenantAId, `slug-${tenantAId.slice(0, 8)}`, tenantBId, `slug-${tenantBId.slice(0, 8)}`]
      );
      await pool.query(`INSERT INTO branches (id, tenant_id, name) VALUES ($1, $2, 'Main Branch')`, [branch1Id, tenantAId]);
      await pool.query(`INSERT INTO branches (id, tenant_id, name) VALUES ($1, $2, 'Secondary Branch')`, [branch2Id, tenantAId]);

      // Users
      const uRes = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, tenant_id, branch_id)
         VALUES ('Admin User', $1, 'hashed_pw', 'admin', $2, $3)
         RETURNING id`,
        [`admin-${tenantAId.slice(0, 8)}@test.com`, tenantAId, branch1Id]
      );
      userTenantA.id = uRes.rows[0].id;

      // 2. Customer
      const custRes = await pool.query(
        `INSERT INTO customers (tenant_id, branch_id, name, phone, email, status)
         VALUES ($1, $2, 'شركة الأمل للتجارة', '0501234567', 'alamal@example.com', 'customer')
         RETURNING id`,
        [tenantAId, branch1Id]
      );
      customerId = custRes.rows[0].id;

      // 3. Treasury Accounts in Tenant A
      const cashRes = await pool.query(
        `INSERT INTO treasury_accounts (tenant_id, branch_id, name, type, opening_balance, is_default, is_active, created_at)
         VALUES ($1, $2, 'الخزينة النقدية الرئيسية', 'cash', 1000.00, true, true, NOW())
         RETURNING id`,
        [tenantAId, branch1Id]
      );
      cashAccountId = cashRes.rows[0].id;

      const bankRes = await pool.query(
        `INSERT INTO treasury_accounts (tenant_id, branch_id, name, type, bank_name, account_number, opening_balance, is_default, is_active, created_at)
         VALUES ($1, $2, 'حساب بنك الراجحي', 'bank', 'مصرف الراجحي', 'SA1234567890', 5000.00, true, true, NOW())
         RETURNING id`,
        [tenantAId, branch1Id]
      );
      bankAccountId = bankRes.rows[0].id;

      const inactiveRes = await pool.query(
        `INSERT INTO treasury_accounts (tenant_id, branch_id, name, type, opening_balance, is_default, is_active, created_at)
         VALUES ($1, $2, 'خزينة معطلة', 'cash', 0.00, false, false, NOW())
         RETURNING id`,
        [tenantAId, branch1Id]
      );
      inactiveAccountId = inactiveRes.rows[0].id;

      // Treasury Account in Tenant B
      const tenantBAccRes = await pool.query(
        `INSERT INTO treasury_accounts (tenant_id, branch_id, name, type, opening_balance, is_default, is_active, created_at)
         VALUES ($1, NULL, 'خزينة مستأجر ب', 'cash', 500.00, true, true, NOW())
         RETURNING id`,
        [tenantBId]
      );
      tenantBAccountId = tenantBAccRes.rows[0].id;

      // Treasury Account in Branch 2 (Tenant A, NOT default)
      const branch2CashRes = await pool.query(
        `INSERT INTO treasury_accounts (tenant_id, branch_id, name, type, opening_balance, is_default, is_active, created_at)
         VALUES ($1, $2, 'خزينة فرع 2 غير الافتراضية', 'cash', 0.00, false, true, NOW())
         RETURNING id`,
        [tenantAId, branch2Id]
      );
      branch2CashAccountId = branch2CashRes.rows[0].id;

      // 4. Invoices in Tenant A
      const custStr = String(customerId);
      const inv1Res = await pool.query(
        `INSERT INTO invoices (tenant_id, branch_id, invoice_number, total_amount, client_id, customer_id, status, created_at)
         VALUES ($1, $2, 'INV-TEST-001', 1500.00, $3, $4, 'unpaid', NOW())
         RETURNING id`,
        [tenantAId, branch1Id, custStr, custStr]
      );
      invoice1Id = inv1Res.rows[0].id;

      const inv2Res = await pool.query(
        `INSERT INTO invoices (tenant_id, branch_id, invoice_number, total_amount, client_id, customer_id, status, created_at)
         VALUES ($1, $2, 'INV-TEST-002', 800.00, $3, $4, 'unpaid', NOW())
         RETURNING id`,
        [tenantAId, branch1Id, custStr, custStr]
      );
      invoice2Id = inv2Res.rows[0].id;

      const inv3Res = await pool.query(
        `INSERT INTO invoices (tenant_id, branch_id, invoice_number, total_amount, client_id, customer_id, status, created_at)
         VALUES ($1, $2, 'INV-TEST-003', 600.00, $3, $4, 'unpaid', NOW())
         RETURNING id`,
        [tenantAId, branch1Id, custStr, custStr]
      );
      invoice3Id = inv3Res.rows[0].id;

      const inv4Res = await pool.query(
        `INSERT INTO invoices (tenant_id, branch_id, invoice_number, total_amount, client_id, customer_id, status, created_at)
         VALUES ($1, $2, 'INV-TEST-004', 1000.00, $3, $4, 'unpaid', NOW())
         RETURNING id`,
        [tenantAId, branch1Id, custStr, custStr]
      );
      invoice4Id = inv4Res.rows[0].id;

      const invBr2Res = await pool.query(
        `INSERT INTO invoices (tenant_id, branch_id, invoice_number, total_amount, client_id, customer_id, status, created_at)
         VALUES ($1, $2, 'INV-TEST-BR2-001', 500.00, $3, $4, 'unpaid', NOW())
         RETURNING id`,
        [tenantAId, branch2Id, custStr, custStr]
      );
      invoiceBranch2Id = invBr2Res.rows[0].id;

      assert.ok(cashAccountId, 'Cash account created');
      assert.ok(bankAccountId, 'Bank account created');
      assert.ok(invoice1Id, 'Invoice 1 created');
    } catch (err) {
      console.error('SETUP DETAIL ERROR:', err.message, err.stack);
      throw err;
    }
  });

  // Test 1: Explicit Treasury Account Payment & Balance Update via createPayment
  await t.test('1. financeController.createPayment: explicit treasury account updates payment, voucher, and treasury cashflow', async () => {
    // 1A. Partial Payment of 500
    const mock1 = createMockReqRes({
      user: userTenantA,
      branchId: branch1Id,
      body: {
        invoice_id: invoice1Id,
        amount: 500.00,
        payment_method: 'cash',
        treasury_account_id: cashAccountId,
        notes: 'دفعة نقدية أولى'
      }
    });

    await financeController.createPayment(mock1.req, mock1.res);
    assert.equal(mock1.getStatus(), 201, 'Payment should be registered with status 201');
    const data1 = mock1.getData();
    assert.equal(data1.status, 'success');
    assert.equal(parseFloat(data1.data.amount), 500.00);
    assert.equal(parseInt(data1.data.treasury_account_id, 10), cashAccountId);
    assert.equal(data1.invoiceStatus, 'partial');
    assert.ok(data1.voucher, 'Receipt voucher should be auto-created');
    assert.equal(parseInt(data1.voucher.treasury_account_id, 10), cashAccountId);
    assert.equal(data1.data.voucher_id, data1.voucher.id);

    // Verify in DB directly
    const invCheck1 = await pool.query('SELECT status FROM invoices WHERE id = $1', [invoice1Id]);
    assert.equal(invCheck1.rows[0].status, 'partial');

    // Verify treasury account balance increase
    const mockReports1 = createMockReqRes({
      user: userTenantA,
      branchId: branch1Id,
      query: {}
    });
    await financeController.getTreasuryAccounts(mockReports1.req, mockReports1.res);
    const treasuryData1 = mockReports1.getData();
    const cashAccReport1 = treasuryData1.data.find(a => a.id === cashAccountId);
    assert.equal(cashAccReport1.total_incoming, 500.00, 'Treasury cash account incoming should be 500.00');
    assert.equal(cashAccReport1.current_balance, 1500.00, 'Treasury cash account current_balance should be 1000 + 500 = 1500');

    // 1B. Full Settlement of remaining 1000
    const mock2 = createMockReqRes({
      user: userTenantA,
      branchId: branch1Id,
      body: {
        invoice_id: invoice1Id,
        amount: 1000.00,
        payment_method: 'cash',
        treasury_account_id: cashAccountId,
        notes: 'تسوية باقي الفاتورة'
      }
    });

    await financeController.createPayment(mock2.req, mock2.res);
    assert.equal(mock2.getStatus(), 201);
    const data2 = mock2.getData();
    assert.equal(data2.invoiceStatus, 'paid');

    const invCheck2 = await pool.query('SELECT status FROM invoices WHERE id = $1', [invoice1Id]);
    assert.equal(invCheck2.rows[0].status, 'paid');

    // Verify treasury cashflow after full settlement
    const mockReports2 = createMockReqRes({
      user: userTenantA,
      branchId: branch1Id,
      query: {}
    });
    await financeController.getTreasuryAccounts(mockReports2.req, mockReports2.res);
    const cashAccReport2 = mockReports2.getData().data.find(a => a.id === cashAccountId);
    assert.equal(cashAccReport2.total_incoming, 1500.00, 'Total incoming for cash account must be 1500.00');
    assert.equal(cashAccReport2.current_balance, 2500.00, 'Balance must be 1000 + 1500 = 2500.00');
  });

  // Test 2: Fallback to default Bank Treasury Account via createInvoicePaymentDirect
  await t.test('2. financeController.createInvoicePaymentDirect: bank payment without explicit treasury ID falls back to default bank account', async () => {
    const mock = createMockReqRes({
      user: userTenantA,
      branchId: branch1Id,
      params: { id: invoice2Id },
      body: {
        amount: 800.00,
        payment_method: 'bank_transfer',
        notes: 'تحويل بنكي'
      }
    });

    await financeController.createInvoicePaymentDirect(mock.req, mock.res);
    assert.equal(mock.getStatus(), 201);
    const data = mock.getData();
    assert.equal(data.status, 'success');
    assert.equal(parseInt(data.data.treasury_account_id, 10), bankAccountId, 'Must resolve to default bank account');
    assert.equal(parseInt(data.voucher.treasury_account_id, 10), bankAccountId, 'Voucher must have bank account ID');
    assert.equal(data.invoiceStatus, 'paid');

    // Check bank account balance
    const mockReports = createMockReqRes({
      user: userTenantA,
      branchId: branch1Id,
      query: {}
    });
    await financeController.getTreasuryAccounts(mockReports.req, mockReports.res);
    const bankAccReport = mockReports.getData().data.find(a => a.id === bankAccountId);
    assert.equal(bankAccReport.total_incoming, 800.00, 'Bank account incoming must be 800.00');
    assert.equal(bankAccReport.current_balance, 5800.00, 'Bank account current balance must be 5000 + 800 = 5800.00');
  });

  // Test 3: Unified Delegate in invoicesController.addPayment
  await t.test('3. invoicesController.addPayment delegates to unified engine, correctly populates treasury_account_id and updates treasury balance', async () => {
    const mock = createMockReqRes({
      user: userTenantA,
      branchId: branch1Id,
      params: { id: invoice3Id },
      body: {
        amount: 600.00,
        payment_method: 'cash',
        notes: 'سداد نقدي عبر invoicesController'
      }
    });

    await invoicesController.addPayment(mock.req, mock.res);
    assert.equal(mock.getStatus(), 200);
    const resData = mock.getData();
    assert.equal(resData.status, 'success');
    assert.equal(parseInt(resData.data.treasury_account_id, 10), cashAccountId, 'Payment must have cash account ID');
    assert.equal(parseInt(resData.voucher.treasury_account_id, 10), cashAccountId, 'Voucher must have cash account ID');
    assert.equal(resData.invoiceStatus, 'paid');

    const invCheck = await pool.query('SELECT status FROM invoices WHERE id = $1', [invoice3Id]);
    assert.equal(invCheck.rows[0].status, 'paid');

    // Verify cash account balance
    const mockReports = createMockReqRes({
      user: userTenantA,
      branchId: branch1Id,
      query: {}
    });
    await financeController.getTreasuryAccounts(mockReports.req, mockReports.res);
    const cashAccReport = mockReports.getData().data.find(a => a.id === cashAccountId);
    assert.equal(cashAccReport.total_incoming, 2100.00, 'Cash incoming must now be 1500 + 600 = 2100.00');
    assert.equal(cashAccReport.current_balance, 3100.00, 'Cash balance must now be 1000 + 2100 = 3100.00');
  });

  // Test 4: Rejection and 100% ACID rollback when no active treasury account exists
  await t.test('4. Rejection when no active treasury account exists (Zero Ghost Collections)', async () => {
    // Create isolated tenant with NO treasury accounts
    const emptyTenantId = crypto.randomUUID();
    const emptyBranchId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status) VALUES ($1, 'Empty Tenant', $2, 'enterprise', 'active')`,
      [emptyTenantId, `slug-${emptyTenantId.slice(0, 8)}`]
    );
    await pool.query(`INSERT INTO branches (id, tenant_id, name) VALUES ($1, $2, 'Empty Branch')`, [emptyBranchId, emptyTenantId]);

    const emptyInvRes = await pool.query(
      `INSERT INTO invoices (tenant_id, branch_id, invoice_number, total_amount, status, created_at)
       VALUES ($1, $2, 'INV-EMPTY-001', 500.00, 'unpaid', NOW())
       RETURNING id`,
      [emptyTenantId, emptyBranchId]
    );
    const emptyInvId = emptyInvRes.rows[0].id;

    const mock = createMockReqRes({
      user: { id: 993, tenant_id: emptyTenantId, role: 'admin', permissions: ['payment.create', 'all'] },
      branchId: emptyBranchId,
      body: {
        invoice_id: emptyInvId,
        amount: 200.00,
        payment_method: 'cash'
      }
    });

    await financeController.createPayment(mock.req, mock.res);
    assert.equal(mock.getStatus(), 400, 'Must reject with HTTP 400');
    assert.ok(mock.getData().message.includes('No active default cash treasury account found'), 'Must explain treasury account is missing');

    // Verify zero writes occurred
    const payCheck = await pool.query('SELECT COUNT(*) FROM payments WHERE invoice_id = $1', [emptyInvId]);
    assert.equal(parseInt(payCheck.rows[0].count, 10), 0, 'Zero payments must be inserted');

    const voucherCheck = await pool.query('SELECT COUNT(*) FROM finance_vouchers WHERE invoice_id = $1', [emptyInvId]);
    assert.equal(parseInt(voucherCheck.rows[0].count, 10), 0, 'Zero vouchers must be created');

    const invCheck = await pool.query('SELECT status FROM invoices WHERE id = $1', [emptyInvId]);
    assert.equal(invCheck.rows[0].status, 'unpaid', 'Invoice status must remain unpaid');

    // Clean up empty tenant
    await pool.query('DELETE FROM invoices WHERE tenant_id = $1', [emptyTenantId]);
    await pool.query('DELETE FROM branches WHERE tenant_id = $1', [emptyTenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [emptyTenantId]);
  });

  // Test 5: Rejection when specifying inactive treasury account
  await t.test('5. Rejection when specified treasury account is inactive', async () => {
    const mock = createMockReqRes({
      user: userTenantA,
      branchId: branch1Id,
      body: {
        invoice_id: invoice4Id,
        amount: 300.00,
        payment_method: 'cash',
        treasury_account_id: inactiveAccountId
      }
    });

    await financeController.createPayment(mock.req, mock.res);
    assert.equal(mock.getStatus(), 400, 'Must reject with HTTP 400');
    assert.ok(mock.getData().message.includes('inactive'), 'Error message must state account is inactive');

    const payCheck = await pool.query('SELECT COUNT(*) FROM payments WHERE invoice_id = $1', [invoice4Id]);
    assert.equal(parseInt(payCheck.rows[0].count, 10), 0, 'No payment written');
  });

  // Test 6: Cross-Tenant Isolation
  await t.test('6. Cross-Tenant Protection: cannot use another tenant treasury account or pay another tenant invoice', async () => {
    // 6A. Tenant A tries to use Tenant B's treasury account
    const mockCrossTreasury = createMockReqRes({
      user: userTenantA,
      branchId: branch1Id,
      body: {
        invoice_id: invoice4Id,
        amount: 200.00,
        payment_method: 'cash',
        treasury_account_id: tenantBAccountId
      }
    });

    await financeController.createPayment(mockCrossTreasury.req, mockCrossTreasury.res);
    assert.equal(mockCrossTreasury.getStatus(), 400);
    assert.ok(mockCrossTreasury.getData().message.includes('not found or unauthorized'));

    // 6B. Tenant B tries to pay Tenant A's invoice
    const mockCrossInvoice = createMockReqRes({
      user: userTenantB,
      body: {
        invoice_id: invoice4Id,
        amount: 200.00,
        payment_method: 'cash'
      }
    });

    await financeController.createPayment(mockCrossInvoice.req, mockCrossInvoice.res);
    assert.ok([400, 404].includes(mockCrossInvoice.getStatus()), 'Status must be 400 or 404');
    assert.ok(mockCrossInvoice.getData().message.includes('not found or unauthorized'));
  });

  // Test 7: Overpayment Rejection & Exact Remaining Balance Enforcement
  await t.test('7. Overpayment Rejection: Payment exceeding invoice total is rejected cleanly', async () => {
    const mock = createMockReqRes({
      user: userTenantA,
      branchId: branch1Id,
      body: {
        invoice_id: invoice4Id, // Total 1000.00
        amount: 1500.00,
        payment_method: 'cash',
        treasury_account_id: cashAccountId
      }
    });

    await financeController.createPayment(mock.req, mock.res);
    assert.equal(mock.getStatus(), 400);
    assert.ok(mock.getData().message.includes('exceeds remaining balance'));

    const payCheck = await pool.query('SELECT COUNT(*) FROM payments WHERE invoice_id = $1', [invoice4Id]);
    assert.equal(parseInt(payCheck.rows[0].count, 10), 0, 'Zero payments inserted');

    const invCheck = await pool.query('SELECT status FROM invoices WHERE id = $1', [invoice4Id]);
    assert.equal(invCheck.rows[0].status, 'unpaid');
  });

  // Test 8: Card and Check settlement policy
  await t.test('8. Card & Check Settlement Policy: Rejects auto-fallback without explicit treasury account, accepts with explicit account', async () => {
    // 8A. Card payment without treasury account -> rejected 400
    const mockCardNoAcc = createMockReqRes({
      user: userTenantA,
      branchId: branch1Id,
      body: {
        invoice_id: invoice4Id,
        amount: 250.00,
        payment_method: 'card'
      }
    });
    await financeController.createPayment(mockCardNoAcc.req, mockCardNoAcc.res);
    assert.equal(mockCardNoAcc.getStatus(), 400);
    assert.ok(mockCardNoAcc.getData().message.includes('requires explicit treasury_account_id selection'));

    // 8B. Check payment without treasury account -> rejected 400
    const mockCheckNoAcc = createMockReqRes({
      user: userTenantA,
      branchId: branch1Id,
      body: {
        invoice_id: invoice4Id,
        amount: 250.00,
        payment_method: 'check'
      }
    });
    await financeController.createPayment(mockCheckNoAcc.req, mockCheckNoAcc.res);
    assert.equal(mockCheckNoAcc.getStatus(), 400);
    assert.ok(mockCheckNoAcc.getData().message.includes('requires explicit treasury_account_id selection'));

    // 8C. Card payment WITH explicit valid treasury account -> accepted 201
    const mockCardWithAcc = createMockReqRes({
      user: userTenantA,
      branchId: branch1Id,
      body: {
        invoice_id: invoice4Id,
        amount: 250.00,
        payment_method: 'card',
        treasury_account_id: bankAccountId,
        notes: 'سداد بطاقة مع تحديد حساب بنكي صريح'
      }
    });
    await financeController.createPayment(mockCardWithAcc.req, mockCardWithAcc.res);
    assert.equal(mockCardWithAcc.getStatus(), 201);
    assert.equal(parseInt(mockCardWithAcc.getData().data.treasury_account_id, 10), bankAccountId);
    assert.equal(parseInt(mockCardWithAcc.getData().voucher.treasury_account_id, 10), bankAccountId);
  });

  // Test 9: Zero Double-Counting Mathematical Proof
  await t.test('9. Zero Double-Counting Proof: Receipt voucher does NOT duplicate payment amount in treasury registers', async () => {
    // Query direct sum of active payments on cashAccountId
    const paySumRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_payments FROM payments 
       WHERE treasury_account_id = $1 AND (COALESCE(status, 'active') != 'cancelled')`,
      [cashAccountId]
    );
    const expectedPaymentsSum = parseFloat(paySumRes.rows[0].total_payments);

    // Verify multiple invoice-linked receipt vouchers exist for cashAccountId
    const voucherCountRes = await pool.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS voucher_sum 
       FROM finance_vouchers 
       WHERE treasury_account_id = $1 AND invoice_id IS NOT NULL AND (COALESCE(status, 'active') != 'cancelled')`,
      [cashAccountId]
    );
    const voucherCount = parseInt(voucherCountRes.rows[0].count, 10);
    const voucherSum = parseFloat(voucherCountRes.rows[0].voucher_sum);
    assert.ok(voucherCount >= 2, 'Must have at least 2 invoice-linked vouchers');
    assert.equal(voucherSum, expectedPaymentsSum, 'Voucher sum matches payments sum exactly');

    // Query Treasury Report via Controller
    const mockRep = createMockReqRes({
      user: userTenantA,
      branchId: branch1Id,
      query: {}
    });
    await financeController.getTreasuryAccounts(mockRep.req, mockRep.res);
    const repData = mockRep.getData();
    const cashAcc = repData.data.find(a => a.id === cashAccountId);

    // Mathematical Proof:
    // If double counting existed, total_incoming would equal payments + vouchers (expectedPaymentsSum * 2).
    // Zero double counting proves total_incoming EQUALS expectedPaymentsSum exactly!
    assert.equal(cashAcc.total_incoming, expectedPaymentsSum, `Total incoming (${cashAcc.total_incoming}) must equal payments sum (${expectedPaymentsSum}), ZERO double-counting`);
    assert.notEqual(cashAcc.total_incoming, expectedPaymentsSum * 2, 'Must NOT be double counted');
  });

  // Test 10: Branch Mismatch Rejection
  await t.test('10. Branch Isolation: Reject payment when treasury account belongs to a different branch than the invoice', async () => {
    const mock = createMockReqRes({
      user: userTenantA,
      branchId: branch1Id,
      body: {
        invoice_id: invoice4Id, // Invoice belongs to branch1Id
        amount: 100.00,
        payment_method: 'cash',
        treasury_account_id: branch2CashAccountId // Treasury belongs to branch2Id
      }
    });

    await financeController.createPayment(mock.req, mock.res);
    assert.equal(mock.getStatus(), 400, 'Must reject with HTTP 400');
    assert.ok(mock.getData().message.includes('belongs to another branch'), 'Error must specify branch mismatch');

    // Verify zero writes
    const checkPayment = await pool.query(
      `SELECT COUNT(*) FROM payments WHERE invoice_id = $1 AND treasury_account_id = $2`,
      [invoice4Id, branch2CashAccountId]
    );
    assert.equal(parseInt(checkPayment.rows[0].count, 10), 0);
  });

  // Test 11: Rejection when no default account exists for branch/tenant (Zero random fallback)
  await t.test('11. Zero Random Selection: When is_default=false, system rejects cleanly without guessing accounts', async () => {
    // invoiceBranch2Id belongs to branch2Id.
    // branch2Id has an active cash account (branch2CashAccountId), but is_default = false!
    const mock = createMockReqRes({
      user: userTenantA,
      branchId: branch2Id,
      body: {
        invoice_id: invoiceBranch2Id,
        amount: 200.00,
        payment_method: 'cash'
        // No treasury_account_id provided
      }
    });

    await financeController.createPayment(mock.req, mock.res);
    assert.equal(mock.getStatus(), 400, 'Must reject with HTTP 400');
    assert.ok(mock.getData().message.includes('No active default cash treasury account found'), 'Must explain default account is missing');

    // Verify it did NOT randomly pick branch2CashAccountId!
    const checkPayment = await pool.query(
      `SELECT COUNT(*) FROM payments WHERE invoice_id = $1`,
      [invoiceBranch2Id]
    );
    assert.equal(parseInt(checkPayment.rows[0].count, 10), 0, 'Must NOT have created payment with random account');
  });

  // Teardown
  await t.test('Teardown: Clean up test fixtures', async () => {
    await pool.query('DELETE FROM payments WHERE tenant_id IN ($1, $2)', [tenantAId, tenantBId]);
    await pool.query('DELETE FROM finance_vouchers WHERE tenant_id IN ($1, $2)', [tenantAId, tenantBId]);
    await pool.query('DELETE FROM invoices WHERE tenant_id IN ($1, $2)', [tenantAId, tenantBId]);
    await pool.query('DELETE FROM treasury_accounts WHERE tenant_id IN ($1, $2)', [tenantAId, tenantBId]);
    await pool.query('DELETE FROM customers WHERE tenant_id IN ($1, $2)', [tenantAId, tenantBId]);
    await pool.query('DELETE FROM system_logs WHERE tenant_id::text IN ($1, $2)', [tenantAId, tenantBId]);
    await pool.query('DELETE FROM users WHERE tenant_id IN ($1, $2)', [tenantAId, tenantBId]);
    await pool.query('DELETE FROM branches WHERE tenant_id IN ($1, $2)', [tenantAId, tenantBId]);
    await pool.query('DELETE FROM tenants WHERE id IN ($1, $2)', [tenantAId, tenantBId]);
    await pool.end();
  });
});
