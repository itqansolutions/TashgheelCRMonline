const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');
const dashboardController = require('../controllers/dashboardController');
const dashboardService = require('../services/dashboardService');

const originalDbQuery = db.query;

test('Dashboard Redesign: Tenant Scoping, Template Isolation & Permission Verification', async (t) => {
  t.beforeEach(() => {
    db.query = originalDbQuery;
  });

  t.afterEach(() => {
    db.query = originalDbQuery;
  });

  // ---------------------------------------------------------------------------
  // TEST 1: Tenant Isolation across queries
  // ---------------------------------------------------------------------------
  await t.test('1. Strict Tenant Isolation: All queries must enforce tenant_id', async () => {
    const executedQueries = [];
    db.query = async (sql, params) => {
      executedQueries.push({ sql, params });
      return { rows: [] };
    };

    const tenantA = '11111111-1111-1111-1111-111111111111';
    
    // Call services directly with tenant A
    await dashboardService.getGeneralFinanceMetrics(tenantA, 'THIS_MONTH', true);
    await dashboardService.getGeneralPipeline(tenantA);
    await dashboardService.getRealEstateUnitsOverview(tenantA);
    await dashboardService.getRealEstateCollectionsFlow(tenantA, true);

    assert.ok(executedQueries.length > 0, 'Should have executed queries');
    for (const q of executedQueries) {
      assert.ok(
        q.sql.includes('tenant_id::text = $1::text') || q.sql.includes('WHERE tenant_id::text = $1::text'),
        `Query must be strictly tenant-scoped. Query was: ${q.sql}`
      );
      assert.equal(q.params[0], tenantA, 'First query parameter must always be the authenticated tenant ID');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Cross-Tenant Data Leakage Prevention (Tenant A vs Tenant B)
  // ---------------------------------------------------------------------------
  await t.test('2. Multi-Tenant Leakage Check: Tenant B cannot see Tenant A collections or units', async () => {
    const mockStorage = {
      'tenant-a': {
        vouchers: 500000,
        units: 25
      },
      'tenant-b': {
        vouchers: 10000,
        units: 2
      }
    };

    db.query = async (sql, params) => {
      const tenantParam = params?.[0];
      if (sql.includes('finance_vouchers') && sql.includes('voucher_type = \'receipt\'')) {
        const amt = mockStorage[tenantParam]?.vouchers || 0;
        return { rows: [{ actual_collected: amt }] };
      }
      if (sql.includes('FROM re_units')) {
        const count = mockStorage[tenantParam]?.units || 0;
        return { rows: [{ total_units: count, available: count, reserved: 0, sold: 0 }] };
      }
      if (sql.includes('FROM re_contracts')) {
        return { rows: [{ total_contracted: 1000000 }] };
      }
      if (sql.includes('FROM re_installments')) {
        return { rows: [{ overdue: 0, total_uncollected: 0 }] };
      }
      return { rows: [] };
    };

    const resA = await dashboardService.getRealEstateCollectionsFlow('tenant-a', true);
    const resB = await dashboardService.getRealEstateCollectionsFlow('tenant-b', true);

    assert.equal(resA.collectedAmount, 500000);
    assert.equal(resB.collectedAmount, 10000);
    assert.notEqual(resA.collectedAmount, resB.collectedAmount);

    const unitsA = await dashboardService.getRealEstateUnitsOverview('tenant-a');
    const unitsB = await dashboardService.getRealEstateUnitsOverview('tenant-b');

    assert.equal(unitsA.total, 25);
    assert.equal(unitsB.total, 2);
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Canonical Source for Collections (finance_vouchers, not re_payments_mvp)
  // ---------------------------------------------------------------------------
  await t.test('3. Canonical Source Rule: Real Estate collection must query finance_vouchers', async () => {
    let queriedVouchers = false;
    let queriedPaymentsMvp = false;

    db.query = async (sql, params) => {
      if (sql.includes('finance_vouchers')) queriedVouchers = true;
      if (sql.includes('re_payments_mvp')) queriedPaymentsMvp = true;
      return { rows: [{ actual_collected: 75000, total_contracted: 200000 }] };
    };

    await dashboardService.getRealEstateCollectionsFlow('test-tenant', true);

    assert.equal(queriedVouchers, true, 'Collections query MUST target finance_vouchers');
    assert.equal(queriedPaymentsMvp, false, 'Collections query MUST NEVER target legacy re_payments_mvp');
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Module Entitlement & Permission Guards (Finance, Purchasing, Inventory, HR)
  // ---------------------------------------------------------------------------
  await t.test('4. Module & Permission Lockdown: Disabled modules return accessible: false and skip DB queries', async () => {
    let attemptedPurchasingQuery = false;
    let attemptedInventoryQuery = false;
    let attemptedFinanceQuery = false;

    db.query = async (sql, params) => {
      if (sql.includes('purchase_requests') || sql.includes('rfqs') || sql.includes('purchase_orders')) {
        attemptedPurchasingQuery = true;
      }
      if (sql.includes('stock_movements')) {
        attemptedInventoryQuery = true;
      }
      if (sql.includes('invoices')) {
        attemptedFinanceQuery = true;
      }
      return { rows: [] };
    };

    const finRes = await dashboardService.getGeneralFinanceMetrics('tenant-1', 'THIS_MONTH', false);
    const procRes = await dashboardService.getGeneralProcurementMetrics('tenant-1', false);
    const invRes = await dashboardService.getGeneralInventoryMetrics('tenant-1', false);
    const hrRes = await dashboardService.getGeneralHrMetrics('tenant-1', false);

    assert.equal(finRes.accessible, false);
    assert.equal(procRes.accessible, false);
    assert.equal(invRes.accessible, false);
    assert.equal(hrRes.accessible, false);

    assert.equal(attemptedPurchasingQuery, false, 'No purchasing queries should run when module disabled');
    assert.equal(attemptedInventoryQuery, false, 'No inventory queries should run when module disabled');
    assert.equal(attemptedFinanceQuery, false, 'No invoice queries should run when finance permission missing');
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Controller Template Awareness (General vs Real Estate payload)
  // ---------------------------------------------------------------------------
  await t.test('5. Template Isolation: General tenants get General payload; RE tenants get RE payload', async () => {
    db.query = async (sql, params) => {
      if (sql.includes('SELECT template_name FROM tenants')) {
        const id = params[0];
        return { rows: [{ template_name: id.includes('re') ? 'real_estate' : 'general' }] };
      }
      return { rows: [] };
    };

    // Case A: Real Estate Tenant
    let reResponse = null;
    const reqRE = {
      user: { id: 1, tenant_id: 'tenant-re-uuid', role: 'admin' },
      query: { timeFilter: 'THIS_MONTH' },
      modules: { finance: true, crm: true }
    };
    const resRE = {
      json: (data) => { reResponse = data; return resRE; },
      status: () => resRE
    };

    await dashboardController.getDashboardSummary(reqRE, resRE);

    assert.equal(reResponse.status, 'success');
    assert.equal(reResponse.template, 'real_estate');
    assert.ok(reResponse.data.unitsOverview !== undefined);
    assert.ok(reResponse.data.contractsAndInstallments !== undefined);
    assert.ok(reResponse.data.collectionsFlow !== undefined);

    // Case B: General Tenant
    let genResponse = null;
    const reqGen = {
      user: { id: 2, tenant_id: 'tenant-general-uuid', role: 'admin' },
      query: { timeFilter: 'THIS_MONTH' },
      modules: { finance: true, crm: true, purchasing: true, inventory: true, hr: true }
    };
    const resGen = {
      json: (data) => { genResponse = data; return resGen; },
      status: () => resGen
    };

    await dashboardController.getDashboardSummary(reqGen, resGen);

    assert.equal(genResponse.status, 'success');
    assert.equal(genResponse.template, 'general');
    assert.ok(genResponse.data.financeMetrics !== undefined);
    assert.ok(genResponse.data.procurement !== undefined);
    assert.ok(genResponse.data.inventory !== undefined);
    assert.ok(genResponse.data.pendingActions !== undefined);
  });
});
