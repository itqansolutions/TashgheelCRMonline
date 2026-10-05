const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');

// Save original methods
const originalDbQuery = db.query;
const originalDbConnect = db.connect;
const originalPoolConnect = db.pool.connect;

test('Voucher Cancellation & Balance Reversal Suite (deleteVoucher P1 hardening)', async (t) => {
  t.beforeEach(() => {
    // Default db.query to return empty arrays for DDL calls (ensureVouchersTable)
    db.query = async () => ({ rows: [] });
  });

  t.afterEach(() => {
    db.query = originalDbQuery;
    db.connect = originalDbConnect;
    db.pool.connect = originalPoolConnect;
  });

  const financeController = require('../controllers/financeController');

  await t.test('Validation: Rejects cancellation if reason is missing or empty with 400', async () => {
    const req = {
      params: { id: '101' },
      body: { reason: '   ' }, // empty reason
      user: { id: 'admin-1', tenant_id: 'tenant-1', role: 'admin' }
    };

    let responseCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseCode = code;
        return { json: (data) => { responseBody = data; } };
      }
    };

    await financeController.deleteVoucher(req, res);
    assert.equal(responseCode, 400);
    assert.match(responseBody.message, /reason is required/i);
  });

  await t.test('Cross-Tenant Isolation: Tenant B cannot cancel Tenant A voucher (returns 404)', async () => {
    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('ALTER TABLE') || sql.includes('CREATE TABLE')) return { rows: [] };
        if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return { rows: [] };

        // Voucher fetch scoped to tenant
        if (sql.includes('FROM finance_vouchers') && sql.includes('FOR UPDATE')) {
          const tenantParam = params[1];
          if (tenantParam === 'tenant-b') {
            return { rows: [] }; // Tenant B cannot see Tenant A voucher
          }
          return { rows: [{ id: 101, tenant_id: 'tenant-a' }] };
        }
        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;

    const req = {
      params: { id: '101' },
      body: { reason: 'Tenant B unauthorized cancel attempt' },
      user: { id: 'user-b', tenant_id: 'tenant-b', role: 'admin' }
    };

    let responseCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseCode = code;
        return { json: (data) => { responseBody = data; } };
      }
    };

    await financeController.deleteVoucher(req, res);
    assert.equal(responseCode, 404);
    assert.match(responseBody.message, /not found/i);
  });

  await t.test('Success (Real Estate): Cancels receipt voucher and sets installment to canonical Pending or Overdue', async () => {
    const executedQueries = [];

    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });

        if (sql.includes('ALTER TABLE') || sql.includes('CREATE TABLE')) return { rows: [] };
        if (sql.includes('BEGIN') || sql.includes('COMMIT')) return { rows: [] };

        if (sql.includes('FROM finance_vouchers') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 101,
              voucher_number: 'REC-001',
              voucher_type: 'receipt',
              amount: '50000.00',
              installment_id: 'inst-1',
              deal_id: 'deal-1',
              tenant_id: 'tenant-1',
              status: 'active'
            }]
          };
        }

        if (sql.includes('UPDATE finance_vouchers') && sql.includes('status = \'cancelled\'')) {
          return { rows: [], rowCount: 1 };
        }

        if (sql.includes('FROM re_installments') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 'inst-1',
              amount: '50000.00',
              paid_amount: '50000.00',
              due_date: '2026-12-31', // future due date -> Pending
              status: 'Paid'
            }]
          };
        }

        if (sql.includes('UPDATE re_installments')) return { rows: [], rowCount: 1 };
        if (sql.includes('UPDATE re_payments_mvp')) return { rows: [], rowCount: 1 };

        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;

    const req = {
      params: { id: '101' },
      body: { reason: 'Customer check bounced' },
      user: { id: 'admin-1', tenant_id: 'tenant-1', role: 'admin' }
    };

    let responseCode = 200;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseCode = code;
        return { json: (data) => { responseBody = data; } };
      },
      json: (data) => { responseBody = data; }
    };

    await financeController.deleteVoucher(req, res);

    assert.equal(responseCode, 200);
    assert.equal(responseBody.status, 'success');
    assert.equal(responseBody.data.status, 'cancelled');

    // Verify installment reverted to 'Pending' (0 paid, future due date)
    const instUpdate = executedQueries.find(q => q.sql.includes('UPDATE re_installments'));
    assert.ok(instUpdate);
    assert.equal(instUpdate.params[0], 0);
    assert.equal(instUpdate.params[1], 'Pending');
  });

  await t.test('Installment Status Overdue: Reverts installment to Overdue when due_date is in past', async () => {
    const executedQueries = [];

    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
        if (sql.includes('ALTER TABLE') || sql.includes('CREATE TABLE')) return { rows: [] };
        if (sql.includes('BEGIN') || sql.includes('COMMIT')) return { rows: [] };

        if (sql.includes('FROM finance_vouchers') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 102,
              voucher_number: 'REC-002',
              voucher_type: 'receipt',
              amount: '50000.00',
              installment_id: 'inst-2',
              tenant_id: 'tenant-1',
              status: 'active'
            }]
          };
        }

        if (sql.includes('UPDATE finance_vouchers')) return { rows: [], rowCount: 1 };

        if (sql.includes('FROM re_installments') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 'inst-2',
              amount: '50000.00',
              paid_amount: '50000.00',
              due_date: '2025-01-01', // Past due date -> Overdue
              status: 'Paid'
            }]
          };
        }

        if (sql.includes('UPDATE re_installments')) return { rows: [], rowCount: 1 };
        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;

    const req = {
      params: { id: '102' },
      body: { reason: 'Wrong account entered' },
      user: { id: 'admin-1', tenant_id: 'tenant-1', role: 'admin' }
    };

    const res = {
      status: () => ({ json: () => {} }),
      json: () => {}
    };

    await financeController.deleteVoucher(req, res);

    const instUpdate = executedQueries.find(q => q.sql.includes('UPDATE re_installments'));
    assert.ok(instUpdate);
    assert.equal(instUpdate.params[0], 0);
    assert.equal(instUpdate.params[1], 'Overdue');
  });

  await t.test('Success (General Template): Cancels invoice receipt voucher and updates invoice status', async () => {
    const executedQueries = [];

    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
        if (sql.includes('ALTER TABLE') || sql.includes('CREATE TABLE')) return { rows: [] };
        if (sql.includes('BEGIN') || sql.includes('COMMIT')) return { rows: [] };

        if (sql.includes('FROM finance_vouchers') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 103,
              voucher_number: 'REC-INV-001',
              voucher_type: 'receipt',
              amount: '1000.00',
              invoice_id: 55,
              tenant_id: 'tenant-1',
              status: 'active'
            }]
          };
        }

        if (sql.includes('UPDATE finance_vouchers')) return { rows: [], rowCount: 1 };
        if (sql.includes('FROM payments') && sql.includes('voucher_id')) return { rows: [{ id: 99 }] };
        if (sql.includes('UPDATE payments') && sql.includes("status = 'cancelled'")) return { rows: [{ id: 99 }] };

        if (sql.includes('FROM invoices') && sql.includes('FOR UPDATE')) {
          return { rows: [{ id: 55, total_amount: '1000.00' }] };
        }

        if (sql.includes('SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments')) {
          return { rows: [{ total_paid: 0 }] };
        }

        if (sql.includes('UPDATE invoices')) return { rows: [], rowCount: 1 };

        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;

    const req = {
      params: { id: '103' },
      body: { reason: 'Invoice payment returned' },
      user: { id: 'admin-1', tenant_id: 'tenant-1', role: 'admin' },
      headers: { 'x-forwarded-for': '127.0.0.1' },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' }
    };

    let responseCode = 200;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseCode = code;
        return { json: (data) => { responseBody = data; } };
      },
      json: (data) => { responseBody = data; }
    };

    await financeController.deleteVoucher(req, res);

    assert.equal(responseCode, 200);
    assert.equal(responseBody.status, 'success');

    // Verify payments row was soft-cancelled (NOT hard deleted) and invoice status set to unpaid
    const cancelPayment = executedQueries.find(q => q.sql.includes('UPDATE payments') && q.sql.includes("status = 'cancelled'"));
    assert.ok(cancelPayment, 'Payment row must be soft-cancelled upon invoice receipt cancellation');

    const updateInvoice = executedQueries.find(q => q.sql.includes('UPDATE invoices'));
    assert.ok(updateInvoice, 'Invoice status must be updated');
    assert.equal(updateInvoice.params[0], 'unpaid');
    assert.equal(updateInvoice.params[2], 'tenant-1');
  });

  await t.test('Unlinked Voucher: Rejects cancellation with 400 when payments row has no voucher_id match', async () => {
    let rollbackCalled = false;
    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('ALTER TABLE') || sql.includes('CREATE TABLE')) return { rows: [] };
        if (sql.includes('BEGIN')) return { rows: [] };
        if (sql.includes('ROLLBACK')) {
          rollbackCalled = true;
          return { rows: [] };
        }
        if (sql.includes('FROM finance_vouchers') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 104,
              voucher_number: 'REC-INV-LEGACY',
              voucher_type: 'receipt',
              amount: '500.00',
              invoice_id: 88,
              tenant_id: 'tenant-1',
              status: 'active'
            }]
          };
        }
        if (sql.includes('UPDATE finance_vouchers')) return { rows: [], rowCount: 1 };
        // Return NO linked payment row for voucher_id = 104
        if (sql.includes('FROM payments') && sql.includes('voucher_id')) return { rows: [] };

        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;

    const req = {
      params: { id: '104' },
      body: { reason: 'Cancelling legacy unlinked voucher' },
      user: { id: 'admin-1', tenant_id: 'tenant-1', role: 'admin' },
      headers: { 'x-forwarded-for': '127.0.0.1' },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' }
    };

    let responseCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseCode = code;
        return { json: (data) => { responseBody = data; } };
      }
    };

    await financeController.deleteVoucher(req, res);

    assert.equal(responseCode, 400);
    assert.match(responseBody.message, /no active payment record explicitly linked via voucher_id/i);
    assert.equal(rollbackCalled, true);
  });

  await t.test('Double Cancellation Guard: Rejects second attempt to cancel same voucher with 400', async () => {
    let rollbackCalled = false;

    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('ALTER TABLE') || sql.includes('CREATE TABLE')) return { rows: [] };
        if (sql.includes('BEGIN')) return { rows: [] };
        if (sql.includes('ROLLBACK')) {
          rollbackCalled = true;
          return { rows: [] };
        }
        if (sql.includes('FROM finance_vouchers') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 101,
              voucher_number: 'REC-001',
              status: 'cancelled',
              tenant_id: 'tenant-1'
            }]
          };
        }
        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;

    const req = {
      params: { id: '101' },
      body: { reason: 'Attempting duplicate cancellation' },
      user: { id: 'admin-1', tenant_id: 'tenant-1', role: 'admin' }
    };

    let responseCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseCode = code;
        return { json: (data) => { responseBody = data; } };
      }
    };

    await financeController.deleteVoucher(req, res);

    assert.equal(responseCode, 400);
    assert.match(responseBody.message, /already cancelled/i);
    assert.equal(rollbackCalled, true);
  });

  await t.test('Success (Purchases): Cancels payment voucher and updates purchase_invoices paid_amount and status', async () => {
    let rollbackCalled = false;
    let commitCalled = false;
    let updatedPaidAmount = null;
    let updatedStatus = null;

    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('ALTER TABLE') || sql.includes('CREATE TABLE')) return { rows: [] };
        if (sql.includes('BEGIN')) return { rows: [] };
        if (sql.includes('COMMIT')) { commitCalled = true; return { rows: [] }; }
        if (sql.includes('ROLLBACK')) { rollbackCalled = true; return { rows: [] }; }

        // Voucher fetch: Payment voucher linked to purchase_invoice 55
        if (sql.includes('FROM finance_vouchers') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 202,
              voucher_number: 'PV-001',
              voucher_type: 'payment',
              amount: '300.00',
              status: 'active',
              invoice_id: 55,
              tenant_id: 'tenant-1'
            }]
          };
        }

        // Voucher cancellation UPDATE
        if (sql.includes('UPDATE finance_vouchers')) return { rows: [] };

        // Purchase Invoice fetch FOR UPDATE: total 1000, currently paid 300
        if (sql.includes('FROM purchase_invoices') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 55,
              total_amount: '1000.00',
              paid_amount: '300.00'
            }]
          };
        }

        // Purchase Invoice status & paid_amount UPDATE
        if (sql.includes('UPDATE purchase_invoices')) {
          updatedPaidAmount = params[0];
          updatedStatus = params[1];
          return { rows: [] };
        }

        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;

    const req = {
      params: { id: '202' },
      body: { reason: 'Wrong supplier payment amount' },
      user: { id: 'admin-1', tenant_id: 'tenant-1', role: 'admin' }
    };

    let responseCode = 200;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseCode = code;
        return { json: (data) => { responseBody = data; } };
      },
      json: (data) => { responseBody = data; }
    };

    await financeController.deleteVoucher(req, res);

    assert.equal(responseCode, 200);
    assert.equal(commitCalled, true);
    assert.equal(rollbackCalled, false);
    assert.equal(updatedPaidAmount, 0);
    assert.equal(updatedStatus, 'pending'); // 0 paid -> pending
  });

  await t.test('Payment Voucher without linked invoice: Cancels cleanly without error', async () => {
    let commitCalled = false;

    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('ALTER TABLE') || sql.includes('CREATE TABLE')) return { rows: [] };
        if (sql.includes('BEGIN')) return { rows: [] };
        if (sql.includes('COMMIT')) { commitCalled = true; return { rows: [] }; }
        if (sql.includes('ROLLBACK')) return { rows: [] };

        // Standalone Payment voucher with invoice_id = null
        if (sql.includes('FROM finance_vouchers') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 203,
              voucher_number: 'PV-002',
              voucher_type: 'payment',
              amount: '500.00',
              status: 'active',
              invoice_id: null,
              tenant_id: 'tenant-1'
            }]
          };
        }
        if (sql.includes('UPDATE finance_vouchers')) return { rows: [] };
        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;

    const req = {
      params: { id: '203' },
      body: { reason: 'Direct general supplier payment cancelled' },
      user: { id: 'admin-1', tenant_id: 'tenant-1', role: 'admin' }
    };

    let responseCode = 200;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseCode = code;
        return { json: (data) => { responseBody = data; } };
      },
      json: (data) => { responseBody = data; }
    };

    await financeController.deleteVoucher(req, res);

    assert.equal(responseCode, 200);
    assert.equal(commitCalled, true);
    assert.equal(responseBody.status, 'success');
  });

  await t.test('Financial Permission Guard: requirePermission blocks unauthorized roles with 403', async () => {
    const { requirePermission } = require('../middleware/financialPermission');
    const middleware = requirePermission('voucher.cancel');

    // Case 1: Employee / Sales role -> 403 Forbidden
    let code1 = null;
    let body1 = null;
    let nextCalled1 = false;
    const req1 = {
      user: { id: 42, tenant_id: 'tenant-1', role: 'employee' }
    };
    const res1 = {
      status: (c) => { code1 = c; return { json: (d) => { body1 = d; } }; }
    };
    await middleware(req1, res1, () => { nextCalled1 = true; });

    assert.equal(code1, 403);
    assert.equal(body1.code, 'PERMISSION_DENIED');
    assert.equal(nextCalled1, false);

    // Case 2: Non-admin (manager / finance_manager) -> 403 Forbidden (Strict Admin-only)
    let code2 = null;
    let nextCalled2 = false;
    const req2 = {
      user: { id: 7, tenant_id: 'tenant-1', role: 'finance_manager' }
    };
    const res2 = {
      status: (c) => { code2 = c; return { json: () => {} }; }
    };
    await middleware(req2, res2, () => { nextCalled2 = true; });

    assert.equal(code2, 403);
    assert.equal(nextCalled2, false);

    // Case 3: Admin -> 200 / next() called
    let nextCalled3 = false;
    const req3 = {
      user: { id: 1, tenant_id: 'tenant-1', role: 'admin' }
    };
    const res3 = {
      status: (c) => ({ json: () => {} })
    };
    await middleware(req3, res3, () => { nextCalled3 = true; });

    assert.equal(nextCalled3, true);
  });
});
