const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');

// Preserve original methods
const originalDbQuery = db.query;
const originalDbConnect = db.connect;
const originalPoolConnect = db.pool.connect;

test('Phase G-4: Customer Account & Finance Vouchers Reconciliation Test Suite', async (t) => {
  t.beforeEach(() => {
    db.query = async () => ({ rows: [] });
  });

  t.afterEach(() => {
    db.query = originalDbQuery;
    db.connect = originalDbConnect;
    db.pool.connect = originalPoolConnect;
  });

  const financeController = require('../controllers/financeController');
  const customersController = require('../controllers/customersController');

  await t.test('1. Invoice + Invoice-Linked Receipt Voucher: Exactly Single Credit & Zero Double Count', async () => {
    // Mock DB queries for getCustomerStatement in financeController
    db.query = async (sql, params) => {
      // 1. Customer verification
      if (sql.includes('FROM customers WHERE id::text = $1::text')) {
        return { rows: [{ id: 1, name: 'ACME Corp', phone: '123456', email: 'acme@test.com' }] };
      }
      // 2. Invoices query
      if (sql.includes('FROM invoices i') && sql.includes("'Invoice'")) {
        return {
          rows: [
            {
              txn_date: '2026-03-01',
              txn_type: 'Invoice',
              reference: 'INV-2026-0001',
              debit: 1000.00,
              credit: 0,
              due_date: '2026-03-31',
              status: 'partial',
              source_id: 10
            }
          ]
        };
      }
      // 3. Payments (Invoice-linked)
      if (sql.includes('FROM payments p') && sql.includes('JOIN invoices i')) {
        return {
          rows: [
            {
              txn_date: '2026-03-05',
              txn_type: 'Receipt',
              reference: 'RV-2026-001',
              debit: 0,
              credit: 400.00,
              linked_invoice: 'INV-2026-0001',
              payment_method: 'bank_transfer',
              source_id: 50
            }
          ]
        };
      }
      // 3B. On-Account vouchers
      if (sql.includes('FROM finance_vouchers fv') && sql.includes('invoice_id IS NULL')) {
        return { rows: [] };
      }
      // 5. Summary totals
      if (sql.includes('COALESCE(SUM(i.total_amount), 0)') && sql.includes('FROM invoices i')) {
        return {
          rows: [
            {
              total_invoiced: '1000.00',
              total_paid: '400.00',
              outstanding: '600.00',
              overdue: '0.00'
            }
          ]
        };
      }
      // 6. On-account sum in summary
      if (sql.includes('COALESCE(SUM(amount), 0)') && sql.includes('FROM finance_vouchers')) {
        return { rows: [{ total_on_account: '0.00' }] };
      }
      return { rows: [] };
    };

    let responseData = null;
    const req = {
      user: { tenant_id: 'tenant-1' },
      branchId: 'branch-1',
      params: { id: '1' },
      query: {}
    };
    const res = {
      json: (data) => { responseData = data; },
      status: () => res
    };

    await financeController.getCustomerStatement(req, res);

    assert.equal(responseData.status, 'success');
    assert.equal(responseData.statement.length, 2);
    // Txn 1: Invoice debit 1000, balance 1000
    assert.equal(responseData.statement[0].debit, 1000);
    assert.equal(responseData.statement[0].balance, 1000);
    // Txn 2: Receipt credit 400, balance 600
    assert.equal(responseData.statement[1].credit, 400);
    assert.equal(responseData.statement[1].balance, 600);
    assert.equal(responseData.statement[1].linked_invoice, 'INV-2026-0001');

    // Summary checks
    assert.equal(responseData.summary.total_invoiced, 1000);
    assert.equal(responseData.summary.total_paid, 400);
    assert.equal(responseData.summary.outstanding, 600);
  });

  await t.test('2. On-Account Receipt Voucher: Successfully credits Customer Balance in Statement and Accounts', async () => {
    // Customer has NO invoice yet, but deposited 500 On-Account
    db.query = async (sql, params) => {
      if (sql.includes('FROM customers WHERE id::text = $1::text')) {
        return { rows: [{ id: 2, name: 'Beta Ltd', phone: '987654', email: 'beta@test.com' }] };
      }
      if (sql.includes('FROM invoices i') && sql.includes("'Invoice'")) {
        return { rows: [] };
      }
      if (sql.includes('FROM payments p') && sql.includes('JOIN invoices i')) {
        return { rows: [] };
      }
      // On-Account Voucher
      if (sql.includes('FROM finance_vouchers') && sql.includes('invoice_id IS NULL')) {
        if (sql.includes('COALESCE(SUM(amount), 0)')) {
          return { rows: [{ total_on_account: '500.00' }] };
        }
        return {
          rows: [
            {
              txn_date: '2026-03-02',
              txn_type: 'On-Account Receipt',
              reference: 'RV-2026-002',
              debit: 0,
              credit: 500.00,
              linked_invoice: null,
              payment_method: 'cash',
              source_id: 51
            }
          ]
        };
      }
      if (sql.includes('COALESCE(SUM(i.total_amount), 0)') && sql.includes('FROM invoices i')) {
        return {
          rows: [{ total_invoiced: '0.00', total_paid: '0.00', outstanding: '0.00', overdue: '0.00' }]
        };
      }
      return { rows: [] };
    };

    let responseData = null;
    const req = {
      user: { tenant_id: 'tenant-1' },
      branchId: 'branch-1',
      params: { id: '2' },
      query: {}
    };
    const res = {
      json: (data) => { responseData = data; },
      status: () => res
    };

    await financeController.getCustomerStatement(req, res);

    assert.equal(responseData.status, 'success');
    assert.equal(responseData.statement.length, 1);
    assert.equal(responseData.statement[0].txn_type, 'On-Account Receipt');
    assert.equal(responseData.statement[0].credit, 500);
    assert.equal(responseData.statement[0].balance, -500); // Customer is in credit

    assert.equal(responseData.summary.total_invoiced, 0);
    assert.equal(responseData.summary.total_paid, 500);
    assert.equal(responseData.summary.outstanding, 0);
  });

  await t.test('3. Mixed Transactions: Invoice (1000) + Payment (300) + On-Account Receipt (200) → Correct Balance (500)', async () => {
    db.query = async (sql, params) => {
      if (sql.includes('FROM customers WHERE id::text = $1::text')) {
        return { rows: [{ id: 3, name: 'Gamma Corp' }] };
      }
      if (sql.includes('FROM invoices i') && sql.includes("'Invoice'")) {
        return {
          rows: [
            {
              txn_date: '2026-03-01',
              txn_type: 'Invoice',
              reference: 'INV-1',
              debit: 1000.00,
              credit: 0,
              source_id: 10
            }
          ]
        };
      }
      if (sql.includes('FROM payments p') && sql.includes('JOIN invoices i')) {
        return {
          rows: [
            {
              txn_date: '2026-03-02',
              txn_type: 'Receipt',
              reference: 'RV-1',
              debit: 0,
              credit: 300.00,
              linked_invoice: 'INV-1',
              source_id: 11
            }
          ]
        };
      }
      if (sql.includes('FROM finance_vouchers') && sql.includes('invoice_id IS NULL')) {
        if (sql.includes('COALESCE(SUM(amount), 0)')) {
          return { rows: [{ total_on_account: '200.00' }] };
        }
        return {
          rows: [
            {
              txn_date: '2026-03-03',
              txn_type: 'On-Account Receipt',
              reference: 'RV-2',
              debit: 0,
              credit: 200.00,
              linked_invoice: null,
              source_id: 12
            }
          ]
        };
      }
      if (sql.includes('COALESCE(SUM(i.total_amount), 0)') && sql.includes('FROM invoices i')) {
        return {
          rows: [{ total_invoiced: '1000.00', total_paid: '300.00', outstanding: '700.00', overdue: '0.00' }]
        };
      }
      return { rows: [] };
    };

    let responseData = null;
    const req = {
      user: { tenant_id: 'tenant-1' },
      branchId: 'branch-1',
      params: { id: '3' },
      query: {}
    };
    const res = {
      json: (data) => { responseData = data; },
      status: () => res
    };

    await financeController.getCustomerStatement(req, res);

    assert.equal(responseData.statement.length, 3);
    assert.equal(responseData.statement[0].balance, 1000);
    assert.equal(responseData.statement[1].balance, 700);
    assert.equal(responseData.statement[2].balance, 500); // 1000 - 300 - 200 = 500

    assert.equal(responseData.summary.total_invoiced, 1000);
    assert.equal(responseData.summary.total_paid, 500); // 300 + 200
    assert.equal(responseData.summary.outstanding, 500); // 700 - 200
  });

  await t.test('4. Treasury Reconciliation: Treasury accounts sum payments + on-account vouchers with ZERO double counting', async () => {
    let capturedQuery = null;
    db.query = async (sql, params) => {
      if (sql.includes('SELECT 1 FROM treasury_accounts')) {
        return { rows: [{ 1: 1 }] };
      }
      if (sql.includes('FROM treasury_accounts ta')) {
        capturedQuery = sql;
        return {
          rows: [
            {
              id: 'TA-1',
              name: 'Main Bank Account',
              type: 'bank',
              account_number: '1234',
              opening_balance: '1000.00',
              current_balance: '2500.00',
              total_incoming: '1500.00', // 1000 (payment) + 500 (on-account voucher)
              total_outgoing: '0.00',
              currency: 'SAR',
              status: 'active'
            }
          ]
        };
      }
      return { rows: [] };
    };

    let responseData = null;
    const req = {
      user: { tenant_id: 'tenant-1' },
      branchId: 'branch-1',
      query: {}
    };
    const res = {
      json: (data) => { responseData = data; },
      status: () => res
    };

    await financeController.getTreasuryAccounts(req, res);

    assert.equal(responseData.status, 'success');
    assert.ok(capturedQuery.includes('p.amount'), 'Query should include invoice payment amounts');
    assert.ok(capturedQuery.includes('fv.amount'), 'Query should include on-account voucher amounts');
    assert.ok(capturedQuery.includes('fv.invoice_id IS NULL'), 'Query must strictly ensure invoice_id IS NULL for on-account receipts');
    assert.ok(capturedQuery.includes("fv.voucher_type = 'receipt'"), 'Query must strictly filter for receipt vouchers');
    assert.ok(capturedQuery.includes("fv.status, 'active') != 'cancelled'"), 'Query must exclude cancelled vouchers');
  });

  await t.test('5. Customer Accounts Listing: Correctly aggregates both invoice-linked and on-account receipts', async () => {
    let capturedQuery = null;
    db.query = async (sql, params) => {
      if (sql.includes('FROM customers c') && sql.includes('LEFT JOIN invoices i')) {
        capturedQuery = sql;
        return {
          rows: [
            {
              customer_id: 'CUST-1',
              customer_name: 'Customer With Credit',
              phone: '111',
              email: 'c1@test.com',
              invoice_count: 1,
              total_invoiced: 2000,
              total_paid: 1500, // 1000 invoice payment + 500 on-account
              on_account_paid: 500,
              outstanding: 500,
              account_status: 'partial'
            }
          ]
        };
      }
      return { rows: [] };
    };

    let responseData = null;
    const req = {
      user: { tenant_id: 'tenant-1' },
      branchId: 'branch-1',
      query: {}
    };
    const res = {
      json: (data) => { responseData = data; },
      status: () => res
    };

    await financeController.getCustomerAccounts(req, res);

    assert.equal(responseData.status, 'success');
    assert.ok(capturedQuery.includes('LEFT JOIN invoices i'), 'Must left join invoices so on-account customers are not dropped');
    assert.ok(capturedQuery.includes('v_agg.on_account_paid'), 'Must join on-account voucher aggregates');
    assert.ok(capturedQuery.includes('fv.invoice_id IS NULL'), 'Must filter invoice_id IS NULL for on-account vouchers');
  });

  await t.test('6. ContactsCustomers Statement API: Aligns direct invoices and on-account receipts with UI expectations', async () => {
    db.query = async (sql, params) => {
      // 1. Verify customer
      if (sql.includes('FROM customers WHERE id = $1')) {
        return { rows: [{ id: 'CUST-10', name: 'Direct Customer', phone: '05555' }] };
      }
      // 2. Deals
      if (sql.includes('FROM deals d')) {
        return { rows: [] };
      }
      // 3. Invoices (Direct or SO)
      if (sql.includes('FROM invoices inv')) {
        return {
          rows: [
            {
              id: 101,
              invoice_number: 'INV-DIRECT-01',
              total_amount: 1500.00,
              status: 'partial',
              due_date: '2026-04-01',
              deal_title: null
            }
          ]
        };
      }
      // 4. Payments
      if (sql.includes('FROM payments p') && sql.includes('JOIN invoices inv')) {
        return {
          rows: [
            {
              id: 201,
              amount: 500.00,
              payment_method: 'card',
              payment_date: '2026-03-10',
              notes: 'Card payment',
              invoice_number: 'INV-DIRECT-01',
              voucher_number: 'RV-2026-100'
            }
          ]
        };
      }
      // 4B. On-account vouchers
      if (sql.includes('FROM finance_vouchers fv') && sql.includes('invoice_id IS NULL')) {
        return {
          rows: [
            {
              id: 301,
              amount: 200.00,
              payment_method: 'cash',
              payment_date: '2026-03-11',
              notes: 'Advance deposit',
              invoice_number: 'RV-2026-101',
              voucher_number: 'RV-2026-101'
            }
          ]
        };
      }
      return { rows: [] };
    };

    let responseData = null;
    const req = {
      user: { tenant_id: 'tenant-1' },
      branchId: 'branch-1',
      params: { id: 'CUST-10' }
    };
    const res = {
      json: (data) => { responseData = data; },
      status: () => res
    };

    await customersController.getCustomerStatement(req, res);

    assert.equal(responseData.status, 'success');
    assert.equal(responseData.data.invoices.length, 1);
    assert.equal(responseData.data.payments.length, 2); // 1 linked payment + 1 on-account receipt
    assert.equal(responseData.data.summary.total_invoiced, 1500);
    assert.equal(responseData.data.summary.total_paid, 700); // 500 + 200
    assert.equal(responseData.data.summary.balance, 800); // 1500 - 700
  });
});
