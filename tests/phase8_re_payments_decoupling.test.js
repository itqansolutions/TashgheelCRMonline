const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');

// Save original db methods
const originalDbQuery = db.query;
const originalDbConnect = db.connect;
const originalPoolConnect = db.pool.connect;

test('Phase 8: Decoupled Architecture - Closed Real Estate Flow & Authoritative Money Sources', async (t) => {
  t.beforeEach(() => {
    db.query = async () => ({ rows: [] });
  });

  t.afterEach(() => {
    db.query = originalDbQuery;
    db.connect = originalDbConnect;
    db.pool.connect = originalPoolConnect;
  });

  // ---------------------------------------------------------------------------
  // 1. DASHBOARD: Real Estate revenue reads from finance_vouchers
  // ---------------------------------------------------------------------------
  await t.test('dashboardController.getBranchSummary calculates RE revenue from finance_vouchers', async () => {
    const dashboardController = require('../controllers/dashboardController');
    const tenantId = 'tenant-re-1';

    const recordedQueries = [];
    db.query = async (sql, params) => {
      recordedQueries.push({ sql, params });
      if (sql.includes('SELECT template_name FROM tenants')) {
        return { rows: [{ template_name: 'real_estate' }] };
      }
      if (sql.includes('FROM finance_vouchers') && sql.includes("voucher_type = 'receipt'")) {
        // Assert tenant scoping and cancellation filtering
        assert.ok(sql.includes("tenant_id::text = $1::text"), 'Must be tenant scoped');
        assert.ok(sql.includes("status, 'active') != 'cancelled'"), 'Must exclude cancelled vouchers');
        assert.ok(!sql.includes('re_payments_mvp'), 'Must NOT read from re_payments_mvp');
        return { rows: [{ total: '750000.00' }] };
      }
      if (sql.includes('FROM expenses')) {
        return { rows: [{ total: '50000.00' }] };
      }
      if (sql.includes('FROM deals')) {
        return { rows: [{ won_count: 5, total_count: 10 }] };
      }
      if (sql.includes('FROM tasks')) {
        return { rows: [{ completed_count: 8, total_count: 10 }] };
      }
      if (sql.includes('FROM re_units')) {
        return { rows: [{ total_units: 20, available: 10, reserved: 5, sold: 5 }] };
      }
      if (sql.includes('FROM re_installments') && sql.includes('expected')) {
        assert.ok(sql.includes("tenant_id::text = $1::text"), 'Forecast must be tenant scoped');
        assert.ok(sql.includes("status, 'Pending') != 'Paid'"), 'Forecast must exclude Paid installments');
        assert.ok(!sql.includes('re_payments_mvp'), 'Forecast must NOT query re_payments_mvp');
        return { rows: [{ expected: '250000.00' }] };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 1, tenant_id: tenantId, role: 'admin' },
      branchId: 'branch-1',
      query: { viewMode: 'ALL', timeFilter: 'YTD' }
    };

    let responsePayload = null;
    const res = {
      json: (data) => { responsePayload = data; }
    };

    await dashboardController.getBranchSummary(req, res);

    assert.equal(responsePayload?.status, 'success');
    assert.equal(responsePayload?.data?.revenue, 750000);
    assert.equal(responsePayload?.data?.industrySpecific?.collectionForecast, 250000);
  });

  // ---------------------------------------------------------------------------
  // 2. DASHBOARD: Excludes cancelled vouchers and isolates tenants
  // ---------------------------------------------------------------------------
  await t.test('dashboardController enforces voucher status and tenant isolation', async () => {
    const dashboardController = require('../controllers/dashboardController');
    const tenantA = 'tenant-a-uuid';

    let voucherQueryInspected = false;
    db.query = async (sql, params) => {
      if (sql.includes('SELECT template_name FROM tenants')) {
        return { rows: [{ template_name: 'real_estate' }] };
      }
      if (sql.includes('FROM finance_vouchers')) {
        voucherQueryInspected = true;
        assert.equal(params[0], tenantA, 'Tenant A parameter must be passed');
        assert.ok(sql.includes("status, 'active') != 'cancelled'"), 'Must strictly filter out cancelled vouchers');
        return { rows: [{ total: '120000.00' }] };
      }
      if (sql.includes('FROM expenses') || sql.includes('FROM deals') || sql.includes('FROM tasks') || sql.includes('FROM re_units') || sql.includes('FROM re_installments')) {
        return { rows: [{ total: 0, won_count: 0, total_count: 0, completed_count: 0, total_units: 0, expected: 0 }] };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 2, tenant_id: tenantA, role: 'manager' },
      branchId: 'branch-1',
      query: { viewMode: 'ALL', timeFilter: 'THIS_MONTH' }
    };

    let responsePayload = null;
    const res = {
      json: (data) => { responsePayload = data; }
    };

    await dashboardController.getBranchSummary(req, res);
    assert.ok(voucherQueryInspected, 'finance_vouchers query was executed');
    assert.equal(responsePayload?.data?.revenue, 120000);
  });

  // ---------------------------------------------------------------------------
  // 3. REPORTS: getFinancialTrends calculates RE revenue from finance_vouchers
  // ---------------------------------------------------------------------------
  await t.test('reportsController.getFinancialTrends calculates RE revenue from finance_vouchers', async () => {
    const reportsController = require('../controllers/reportsController');
    const tenantId = 'tenant-re-reports';

    let voucherReportExecuted = false;
    db.query = async (sql, params) => {
      if (sql.includes('SELECT template_name FROM tenants')) {
        return { rows: [{ template_name: 'real_estate' }] };
      }
      if (sql.includes('FROM finance_vouchers') && sql.includes("voucher_type = 'receipt'")) {
        voucherReportExecuted = true;
        assert.equal(params[0], tenantId);
        assert.ok(sql.includes("status, 'active') != 'cancelled'"), 'Must exclude cancelled');
        assert.ok(!sql.includes('re_payments_mvp'), 'Reports must NOT read from re_payments_mvp');
        return {
          rows: [
            { month: '2026-08', revenue: '300000' },
            { month: '2026-09', revenue: '450000' }
          ]
        };
      }
      if (sql.includes('FROM expenses')) {
        return {
          rows: [
            { month: '2026-08', expenses: '50000' }
          ]
        };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 10, tenant_id: tenantId }
    };

    let jsonResult = null;
    const res = {
      json: (data) => { jsonResult = data; },
      status: () => res
    };

    await reportsController.getFinancialTrends(req, res);
    assert.ok(voucherReportExecuted, 'Report queried finance_vouchers');
    assert.equal(jsonResult?.status, 'success');
    assert.equal(jsonResult?.data?.revenue?.length, 2);
    assert.equal(jsonResult?.data?.revenue[0].revenue, '300000');
  });

  // ---------------------------------------------------------------------------
  // 4. DEALS: getDeals and getDealById derive paid_amount from finance_vouchers
  // ---------------------------------------------------------------------------
  await t.test('dealsController derives paid_amount from finance_vouchers even when re_payments_mvp is absent', async () => {
    const dealsController = require('../controllers/dealsController');
    const tenantId = 'tenant-re-deals';

    db.query = async (sql, params) => {
      if (sql.includes('information_schema.columns') || sql.includes('ALTER TABLE deals')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT template_name FROM tenants')) {
        return { rows: [{ template_name: 'real_estate' }] };
      }
      if (sql.includes('FROM deals d') && sql.includes('finance_vouchers')) {
        // Assert that paid_amount is derived using COALESCE(fv.actual_paid, rp.paid_amount, 0)
        assert.ok(sql.includes('COALESCE(fv.actual_paid, rp.paid_amount, 0) as paid_amount'));
        assert.ok(sql.includes("voucher_type = 'receipt'"));
        assert.ok(sql.includes("status, 'active') != 'cancelled'"));
        return {
          rows: [
            {
              id: 'deal-closed-1',
              title: 'Closed Deal Unit 101',
              pipeline_stage: 'Closed',
              value: 1000000,
              payment_status: null,
              paid_amount: '350000.00', // Came from finance_vouchers fv.actual_paid!
              payment_total: null
            }
          ]
        };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 5, tenant_id: tenantId, role: 'admin' },
      branchId: 'branch-1',
      params: { id: 'deal-closed-1' }
    };

    let resultPayload = null;
    let statusCode = 200;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { resultPayload = data; }
        };
      },
      json: (data) => { resultPayload = data; }
    };

    await dealsController.getDealById(req, res);
    assert.equal(statusCode, 200);
    assert.equal(resultPayload?.status, 'success');
    assert.equal(resultPayload?.data?.id, 'deal-closed-1');
    assert.equal(resultPayload?.data?.paid_amount, '350000.00');
  });

  // ---------------------------------------------------------------------------
  // 5. INSTALLMENTS: recordPayment creates voucher and upserts cache safely
  // ---------------------------------------------------------------------------
  await t.test('reInstallmentsController.recordPayment creates receipt voucher and safely handles legacy cache absence', async () => {
    const reInstallmentsController = require('../controllers/reInstallmentsController');
    const tenantId = 'tenant-re-inst';

    const executedSql = [];
    const mockClient = {
      query: async (sql, params) => {
        executedSql.push({ sql, params });
        if (sql.includes('BEGIN') || sql.includes('COMMIT')) return { rows: [] };
        if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
        if (sql.includes('ALTER TABLE')) return { rows: [] };

        if (sql.includes('FROM re_installments') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 'inst-1',
              contract_id: 'contract-1',
              deal_id: 'deal-closed-99',
              installment_number: 1,
              amount: '50000.00',
              paid_amount: '0.00',
              due_date: '2026-10-15',
              status: 'Pending',
              contract_value: '500000.00'
            }]
          };
        }

        if (sql.includes('SELECT voucher_number FROM finance_vouchers')) {
          return { rows: [{ voucher_number: 'RV-0010' }] };
        }
        if (sql.includes('SELECT id FROM finance_vouchers WHERE')) {
          return { rows: [] };
        }

        if (sql.includes('FROM deals d')) {
          return { rows: [{ id: 'deal-closed-99', title: 'Closed Deal 99', client_id: 'cust-1', customer_name: 'Ahmed Ali' }] };
        }

        if (sql.includes('INSERT INTO finance_vouchers')) {
          return { rows: [{ id: 'voucher-rec-1', voucher_number: 'RV-0011' }] };
        }

        if (sql.includes('UPDATE re_installments')) {
          return {
            rows: [{
              id: 'inst-1',
              paid_amount: '50000.00',
              status: 'Paid',
              last_voucher_id: 'voucher-rec-1'
            }]
          };
        }

        if (sql.includes('SELECT id, total_amount, paid_amount FROM re_payments_mvp')) {
          // Simulate Closed deal where re_payments_mvp row DOES NOT EXIST
          return { rows: [] };
        }

        if (sql.includes('INSERT INTO re_payments_mvp')) {
          // Idempotent cache creation occurred
          return { rows: [] };
        }

        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;
    if (db.pool) db.pool.connect = async () => mockClient;

    const req = {
      user: { id: 'user-agent-1', tenant_id: tenantId, role: 'admin' },
      branchId: 'branch-1',
      params: { id: 'inst-1' },
      body: {
        amount: 50000,
        payment_method: 'bank_transfer',
        notes: 'Full payment for installment 1'
      }
    };

    let resultBody = null;
    let statusCode = 200;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { resultBody = data; }
        };
      },
      json: (data) => { resultBody = data; }
    };

    await reInstallmentsController.recordPayment(req, res);

    assert.equal(resultBody?.status, 'success');
    assert.equal(resultBody?.data?.status, 'Paid');

    // Verify voucher insertion happened
    const voucherInsert = executedSql.find(q => q.sql.includes('INSERT INTO finance_vouchers'));
    assert.ok(voucherInsert, 'finance_vouchers row was created');
    assert.equal(voucherInsert.params[6], 50000, 'Voucher amount is 50000');

    // Verify re_payments_mvp was NOT blindly updated with 0-rows, but instead upserted as cache
    const cacheInsert = executedSql.find(q => q.sql.includes('INSERT INTO re_payments_mvp'));
    assert.ok(cacheInsert, 're_payments_mvp was populated safely for the closed deal');
  });
});
