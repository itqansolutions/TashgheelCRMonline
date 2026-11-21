/**
 * re_lifecycle_audit_remediation.test.js
 *
 * Comprehensive Automated Regression Test Suite for Real Estate Lifecycle Audit & Controlled Remediation:
 * - DEF-RE-01 (P0): Installment Plan Generation (FOR UPDATE OF rc, schedule math, duplicate prevention, rollback)
 * - DEF-RE-01 (P0): Handover Inspection Start (FOR UPDATE OF rh, state transitions, concurrency safety, rollback)
 * - OBS-RE-02 (P1): Reservation Integrity (Ownership distinction, duplicate rejection, expiration auto-release)
 * - OBS-RE-06 (P1): Dashboard Reconciliation (Pipeline normalization, active deals agreement)
 * - OBS-RE-07 (P2): Finance Module Guard & Products Isolation (403 graceful suppression)
 * - Tenant & Branch Scoping Integrity
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { initTestContext } = require('./helpers/testDb');
initTestContext();

test('Real Estate Lifecycle Audit & Controlled Remediation Test Suite', async (t) => {
  const db = require('../config/db');
  const originalQuery = db.query;
  const originalConnect = db.connect;

  let queryLog = [];
  let mockQueryHandler = null;

  db.query = async (sql, params = []) => {
    queryLog.push({ sql: String(sql), params });
    if (mockQueryHandler) {
      return mockQueryHandler(sql, params);
    }
    return { rows: [] };
  };

  db.connect = async () => {
    const clientLog = [];
    return {
      query: async (sql, params = []) => {
        clientLog.push({ sql: String(sql), params });
        queryLog.push({ sql: String(sql), params });
        if (mockQueryHandler) {
          return mockQueryHandler(sql, params);
        }
        return { rows: [] };
      },
      release: () => {}
    };
  };

  t.after(() => {
    db.query = originalQuery;
    db.connect = originalConnect;
  });

  // =========================================================================
  // SECTION 1: DEF-RE-01 (P0) — Installment Schedule Generation
  // =========================================================================
  await t.test('1.1 generateSchedule uses FOR UPDATE OF rc to prevent outer join locking error', async () => {
    const installmentsController = require('../controllers/reInstallmentsController');

    let capturedLockSql = null;
    let advisoryLockCalled = false;
    let rollbackCalled = false;
    let commitCalled = false;

    mockQueryHandler = async (sql, params) => {
      const s = String(sql);
      if (s.includes('pg_advisory_xact_lock')) {
        advisoryLockCalled = true;
        return { rows: [] };
      }
      if (s.includes('FROM re_contracts rc') && s.includes('FOR UPDATE')) {
        capturedLockSql = s;
        return {
          rows: [{
            id: 'REC-2026-00001',
            deal_id: 2022,
            branch_id: null,
            contract_value: 1000000,
            down_payment: 200000,
            status: 'Draft',
            deal_branch_id: null
          }]
        };
      }
      if (s.includes('COUNT(*)')) {
        return { rows: [{ count: '0' }] };
      }
      if (s.includes('INSERT INTO re_installments')) {
        return {
          rows: [{
            id: 'inst-1',
            contract_id: 'REC-2026-00001',
            installment_number: 1,
            amount: 200000,
            due_date: '2026-12-01',
            status: 'Pending'
          }]
        };
      }
      if (s.includes('UPDATE re_contracts SET') || s.includes('DELETE FROM re_installments')) {
        return { rows: [] };
      }
      if (s === 'COMMIT') {
        commitCalled = true;
        return { rows: [] };
      }
      if (s === 'ROLLBACK') {
        rollbackCalled = true;
        return { rows: [] };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 1, tenant_id: 'tenant-qa-1', role: 'admin' },
      body: {
        contract_id: 'REC-2026-00001',
        down_payment: 200000,
        number_of_installments: 4,
        frequency: 'quarterly',
        start_date: '2026-12-01'
      }
    };

    let responseData = null;
    let responseStatus = 200;
    const res = {
      status: (code) => { responseStatus = code; return res; },
      json: (data) => { responseData = data; return res; }
    };

    await installmentsController.generateSchedule(req, res);

    assert.ok(capturedLockSql, 'Contract row-lock query must be executed');
    assert.match(
      capturedLockSql,
      /FOR\s+UPDATE\s+OF\s+rc/i,
      'Query must specify FOR UPDATE OF rc to avoid PostgreSQL 42P10 nullable side outer join error'
    );
    assert.doesNotMatch(
      capturedLockSql,
      /FOR\s+UPDATE\s*$/i,
      'Query must not use bare FOR UPDATE without table qualification when joining deals'
    );
    assert.ok(advisoryLockCalled, 'Advisory transaction lock must be acquired to serialize operations');
    assert.ok(commitCalled, 'Transaction must commit on success');
    assert.equal(rollbackCalled, false, 'Transaction must not rollback on success');
    assert.equal(responseStatus, 201, 'Should return HTTP 201 Created');
    assert.equal(responseData?.status, 'success');
  });

  await t.test('1.2 generateSchedule calculates 4 quarterly installments correctly (1M value, 200k DP -> 4 x 200k)', async () => {
    const installmentsController = require('../controllers/reInstallmentsController');

    const createdInstallments = [];
    mockQueryHandler = async (sql, params) => {
      const s = String(sql);
      if (s.includes('FROM re_contracts rc') && s.includes('FOR UPDATE')) {
        return {
          rows: [{
            id: 'REC-2026-00001',
            deal_id: 2022,
            contract_value: 1000000,
            down_payment: 200000,
            status: 'Draft'
          }]
        };
      }
      if (s.includes('COUNT(*)')) {
        return { rows: [{ count: '0' }] };
      }
      if (s.includes('INSERT INTO re_installments')) {
        createdInstallments.push({
          num: params[2],
          amount: params[4],
          dueDate: params[3]
        });
        return {
          rows: [{ id: `inst-${params[2]}`, amount: params[4], due_date: params[3] }]
        };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 1, tenant_id: 'tenant-qa-1', role: 'admin' },
      body: {
        contract_id: 'REC-2026-00001',
        down_payment: 200000,
        number_of_installments: 4,
        frequency: 'quarterly',
        start_date: '2027-01-01'
      }
    };

    let responseStatus = 200;
    const res = {
      status: (c) => { responseStatus = c; return res; },
      json: () => res
    };

    await installmentsController.generateSchedule(req, res);

    assert.equal(createdInstallments.length, 5, 'Must create 1 down payment installment (#0) + 4 periodic installments (#1..4)');
    assert.equal(createdInstallments[0].amount, 200000, 'Down payment installment (#0) must be 200,000');
    assert.equal(createdInstallments[1].amount, 200000, 'Periodic installment 1 must be 200,000');
    assert.equal(createdInstallments[2].amount, 200000, 'Periodic installment 2 must be 200,000');
    assert.equal(createdInstallments[3].amount, 200000, 'Periodic installment 3 must be 200,000');
    assert.equal(createdInstallments[4].amount, 200000, 'Periodic installment 4 must be 200,000');
    const totalScheduled = createdInstallments.reduce((acc, i) => acc + i.amount, 0);
    assert.equal(totalScheduled, 1000000, 'Total scheduled installments must equal full contract value (1,000,000)');
  });

  await t.test('1.3 generateSchedule rolls back and returns clean user-safe error on failure', async () => {
    const installmentsController = require('../controllers/reInstallmentsController');

    let rollbackExecuted = false;
    mockQueryHandler = async (sql) => {
      const s = String(sql);
      if (s.includes('FROM re_contracts rc') && s.includes('FOR UPDATE')) {
        throw new Error('Database connection reset during lock');
      }
      if (s === 'ROLLBACK') {
        rollbackExecuted = true;
        return { rows: [] };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 1, tenant_id: 'tenant-qa-1', role: 'admin' },
      body: { contract_id: 'REC-2026-00001', number_of_installments: 4 }
    };

    let responseData = null;
    let responseCode = 200;
    const res = {
      status: (c) => { responseCode = c; return res; },
      json: (d) => { responseData = d; return res; }
    };

    await installmentsController.generateSchedule(req, res);

    assert.ok(rollbackExecuted, 'Transaction must execute ROLLBACK on error');
    assert.equal(responseCode, 500);
    assert.equal(responseData?.status, 'error');
    assert.doesNotMatch(responseData?.message, /syntax error|FOR UPDATE|connection reset/i, 'Raw database internal errors must not be exposed to UI');
    assert.equal(responseData?.message, 'Failed to generate installment schedule. Please try again or contact support.');
  });

  await t.test('1.4 recordPayment uses FOR UPDATE OF ri to prevent outer join locking error', async () => {
    const installmentsController = require('../controllers/reInstallmentsController');

    let capturedPaymentLockSql = null;
    mockQueryHandler = async (sql) => {
      const s = String(sql);
      if (s.includes('FROM re_installments ri') && s.includes('FOR UPDATE')) {
        capturedPaymentLockSql = s;
        return {
          rows: [{
            id: 'inst-1',
            tenant_id: 'tenant-qa-1',
            amount: 200000,
            paid_amount: 0,
            status: 'Pending',
            deal_id: 2022
          }]
        };
      }
      if (s.includes('INSERT INTO finance_vouchers')) {
        return { rows: [{ id: 101, voucher_number: 'REC-2026-V001' }] };
      }
      if (s.includes('UPDATE re_installments SET')) {
        return { rows: [{ id: 'inst-1', status: 'Paid', paid_amount: 200000 }] };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 1, tenant_id: 'tenant-qa-1', role: 'admin' },
      params: { id: 'inst-1' },
      body: { amount: 200000, payment_date: '2026-11-21' }
    };

    const res = {
      status: () => res,
      json: () => res
    };

    await installmentsController.recordPayment(req, res);

    assert.ok(capturedPaymentLockSql, 'Installment lock query must be executed');
    assert.match(
      capturedPaymentLockSql,
      /FOR\s+UPDATE\s+OF\s+ri/i,
      'recordPayment must specify FOR UPDATE OF ri'
    );
  });

  // =========================================================================
  // SECTION 2: DEF-RE-01 (P0) — Handover Inspection Start
  // =========================================================================
  await t.test('2.1 updateHandoverStatus uses FOR UPDATE OF rh to prevent outer join locking error', async () => {
    const handoversController = require('../controllers/reHandoversController');

    let capturedHoLockSql = null;
    let commitCalled = false;

    mockQueryHandler = async (sql, params) => {
      const s = String(sql);
      if (s.includes('FROM re_handovers rh') && s.includes('FOR UPDATE')) {
        capturedHoLockSql = s;
        return {
          rows: [{
            id: 'ho-100',
            tenant_id: 'tenant-qa-1',
            deal_id: 2022,
            contract_id: 'REC-2026-00001',
            unit_id: 'unit-u102',
            status: 'Scheduled',
            branch_id: null,
            deal_branch_id: null
          }]
        };
      }
      if (s.includes('UPDATE re_handovers SET')) {
        return {
          rows: [{ id: 'ho-100', status: 'Inspection' }]
        };
      }
      if (s === 'COMMIT') {
        commitCalled = true;
        return { rows: [] };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 1, tenant_id: 'tenant-qa-1', role: 'admin' },
      params: { id: 'ho-100' },
      body: { status: 'Inspection' }
    };

    let responseData = null;
    let responseStatus = 200;
    const res = {
      status: (c) => { responseStatus = c; return res; },
      json: (d) => { responseData = d; return res; }
    };

    await handoversController.updateHandoverStatus(req, res);

    assert.ok(capturedHoLockSql, 'Handover lock query must be executed');
    assert.match(
      capturedHoLockSql,
      /FOR\s+UPDATE\s+OF\s+rh/i,
      'updateHandoverStatus must specify FOR UPDATE OF rh to prevent outer join error'
    );
    assert.doesNotMatch(
      capturedHoLockSql,
      /FOR\s+UPDATE\s*$/i,
      'Query must not use bare FOR UPDATE without table qualification'
    );
    assert.ok(commitCalled, 'Handover state transition must commit transaction');
    assert.equal(responseStatus, 200);
    assert.equal(responseData?.data?.status, 'Inspection', 'Status must successfully transition to Inspection');
  });

  await t.test('2.2 updateHandoverStatus sanitizes error on failure and rolls back', async () => {
    const handoversController = require('../controllers/reHandoversController');

    let rollbackCalled = false;
    mockQueryHandler = async (sql) => {
      const s = String(sql);
      if (s.includes('FROM re_handovers rh') && s.includes('FOR UPDATE')) {
        throw new Error('Deadlock detected during lock');
      }
      if (s === 'ROLLBACK') {
        rollbackCalled = true;
        return { rows: [] };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 1, tenant_id: 'tenant-qa-1', role: 'admin' },
      params: { id: 'ho-100' },
      body: { status: 'Inspection' }
    };

    let responseData = null;
    let responseStatus = 200;
    const res = {
      status: (c) => { responseStatus = c; return res; },
      json: (d) => { responseData = d; return res; }
    };

    await handoversController.updateHandoverStatus(req, res);

    assert.ok(rollbackCalled, 'ROLLBACK must be called when handover status update fails');
    assert.equal(responseStatus, 500);
    assert.equal(responseData?.message, 'Failed to update handover status. Please try again or contact support.');
  });

  // =========================================================================
  // SECTION 3: OBS-RE-02 (P1) — Reservation Integrity & Ownership
  // =========================================================================
  await t.test('3.1 reserveDealUnit rejects double active reservation on an already reserved unit', async () => {
    const dealsController = require('../controllers/dealsController');

    mockQueryHandler = async (sql) => {
      const s = String(sql);
      if (s.includes('SELECT * FROM deals WHERE') && s.includes('FOR UPDATE')) {
        return {
          rows: [{
            id: 2023,
            tenant_id: 'tenant-qa-1',
            unit_id: 'unit-u102',
            pipeline_stage: 'negotiation',
            custom_fields: {}
          }]
        };
      }
      if (s.includes('SELECT * FROM re_units WHERE') && s.includes('FOR UPDATE')) {
        return {
          rows: [{
            id: 'unit-u102',
            tenant_id: 'tenant-qa-1',
            status: 'Reserved', // Already reserved by Deal 2022
            unit_number: 'U-102'
          }]
        };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 2, tenant_id: 'tenant-qa-1', role: 'agent' },
      params: { id: 2023 },
      body: {}
    };

    let responseCode = 200;
    let responseBody = null;
    const res = {
      status: (c) => { responseCode = c; return res; },
      json: (d) => { responseBody = d; return res; }
    };

    await dealsController.reserveDealUnit(req, res);

    assert.equal(responseCode, 409, 'Must reject concurrent reservation with 409 Conflict');
    assert.equal(responseBody?.code, 'UNIT_NOT_AVAILABLE');
  });

  await t.test('3.2 scanAndReleaseExpiredReservations auto-releases expired unit to Available and updates reserving deal', async () => {
    const { scanAndReleaseExpiredReservations } = require('../services/reservationService');

    let unitUpdatedToAvailable = false;
    let dealUpdated = false;

    mockQueryHandler = async (sql, params) => {
      const s = String(sql);
      if (s.includes('FROM re_units') && s.includes('reservation_expires_at < CURRENT_TIMESTAMP')) {
        return {
          rows: [{ id: 'unit-u102', tenant_id: 'tenant-qa-1', branch_id: null }]
        };
      }
      if (s.includes('SELECT id FROM deals') && s.includes('IN (\'closed\', \'won\')')) {
        return { rows: [] }; // No finalized deal
      }
      if (s.includes('SELECT id, contract_number, status FROM re_contracts')) {
        return { rows: [] }; // No active contract
      }
      if (s.includes('custom_fields') && s.includes('FROM deals') && s.includes('NOT IN')) {
        return {
          rows: [{
            id: 2022,
            pipeline_stage: 'reserved',
            custom_fields: { is_unit_reservation: true }
          }]
        };
      }
      if (s.includes('UPDATE re_units') && s.includes("'Available'")) {
        unitUpdatedToAvailable = true;
        return { rows: [] };
      }
      if (s.includes('UPDATE deals') && s.includes('pipeline_stage = $2')) {
        dealUpdated = true;
        assert.equal(params[1], 'negotiation', 'Reserving deal in reserved stage should transition to negotiation');
        const cf = JSON.parse(params[2]);
        assert.equal(cf.is_unit_reservation, false, 'is_unit_reservation flag must be cleared');
        assert.ok(cf.reservation_expired_at, 'reservation_expired_at timestamp must be recorded');
        return { rows: [] };
      }
      return { rows: [] };
    };

    const result = await scanAndReleaseExpiredReservations();

    assert.ok(unitUpdatedToAvailable, 'Unit must be released back to Available');
    assert.ok(dealUpdated, 'Reserving deal reservation flag must be expired');
    assert.equal(result.releasedCount, 1);
  });

  // =========================================================================
  // SECTION 4: OBS-RE-06 (P1) — Dashboard Reconciliation
  // =========================================================================
  await t.test('4.1 getRealEstatePipeline normalizes Closed Won deals into Closed and excludes from activeDealsCount', async () => {
    const dashboardService = require('../services/dashboardService');

    mockQueryHandler = async (sql) => {
      const s = String(sql);
      if (s.includes('FROM deals') && s.includes('GROUP BY pipeline_stage')) {
        return {
          rows: [
            { pipeline_stage: 'Lead', count: '1', total_value: '1000000' },
            { pipeline_stage: 'Negotiation', count: '1', total_value: '2000000' },
            { pipeline_stage: 'Closed Won', count: '1', total_value: '1000000' } // Deal 2022 Closed Won
          ]
        };
      }
      return { rows: [] };
    };

    const pipeline = await dashboardService.getRealEstatePipeline('tenant-qa-1');

    assert.equal(pipeline.activeDealsCount, 2, 'Main RE Dashboard must count exactly 2 Active Deals (excluding Closed Won)');
    assert.equal(pipeline.counts['Lead'], 1);
    assert.equal(pipeline.counts['Negotiation'], 1);
    assert.equal(pipeline.counts['Closed'], 1, 'Closed Won must be normalized into Closed');
    assert.equal(pipeline.values['Closed'], 1000000);
    const activePipelineValue = (pipeline.values['Lead'] || 0) + (pipeline.values['Negotiation'] || 0);
    assert.equal(activePipelineValue, 3000000, 'Active pipeline value must be EGP 3,000,000');
  });

  await t.test('4.2 salesManagement.getOverview reconciles with Main Dashboard by excluding Closed Won from open_deals', async () => {
    const salesManagementController = require('../controllers/salesManagementController');

    mockQueryHandler = async (sql) => {
      const s = String(sql);
      if (s.includes('GROUP BY d.pipeline_stage')) {
        return {
          rows: [
            { pipeline_stage: 'Lead', count: 1, total_value: 1000000 },
            { pipeline_stage: 'Negotiation', count: 1, total_value: 2000000 },
            { pipeline_stage: 'Closed Won', count: 1, total_value: 1000000 }
          ]
        };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 1, tenant_id: 'tenant-qa-1', role: 'admin' },
      query: { period: '2026-11' }
    };

    let responseData = null;
    const res = {
      status: () => res,
      json: (d) => { responseData = d; return res; }
    };

    await salesManagementController.getOverview(req, res);

    const kpis = responseData?.data?.kpis;
    assert.equal(kpis?.open_deals_count, 2, 'Sales Management open_deals_count must equal 2 (reconciled with Main Dashboard)');
    assert.equal(kpis?.open_deals_value, 3000000, 'Sales Management open_deals_value must equal EGP 3,000,000 (reconciled with Main Dashboard)');
  });

  // =========================================================================
  // SECTION 5: OBS-RE-07 (P2) — Finance Products Loading & Module Isolation
  // =========================================================================
  await t.test('5.1 /api/products preserves moduleGuard(inventory)', () => {
    const moduleGuard = require('../middleware/moduleGuard');
    assert.equal(typeof moduleGuard, 'function');

    const reqWithoutInventory = {
      user: { tenant_id: 'tenant-qa-1' },
      tenantModules: { crm: true, real_estate: true, finance: true } // inventory not present
    };

    let nextCalled = false;
    let statusCode = 200;
    let responseBody = null;
    const res = {
      status: (c) => { statusCode = c; return res; },
      json: (d) => { responseBody = d; return res; }
    };

    const guardMiddleware = moduleGuard('inventory');
    guardMiddleware(reqWithoutInventory, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'Tenant without inventory module must NOT pass moduleGuard');
    assert.equal(statusCode, 403, 'Must return HTTP 403 Forbidden');
    assert.equal(responseBody?.code, 'MODULE_ACCESS_DENIED');
  });

  // =========================================================================
  // SECTION 6: Multi-Tenant & Branch Isolation Integrity
  // =========================================================================
  await t.test('6.1 generateSchedule strictly enforces tenant isolation', async () => {
    const installmentsController = require('../controllers/reInstallmentsController');

    let queryTenantParam = null;
    mockQueryHandler = async (sql, params) => {
      const s = String(sql);
      if (s.includes('FROM re_contracts rc') && s.includes('FOR UPDATE')) {
        queryTenantParam = params[1];
        return { rows: [] }; // Contract not found for this tenant
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 1, tenant_id: 'tenant-attacker', role: 'admin' },
      body: { contract_id: 'REC-2026-00001', number_of_installments: 4 }
    };

    let responseCode = 200;
    const res = {
      status: (c) => { responseCode = c; return res; },
      json: () => res
    };

    await installmentsController.generateSchedule(req, res);

    assert.equal(queryTenantParam, 'tenant-attacker', 'Query must scope to calling tenant');
    assert.equal(responseCode, 404, 'Must return 404 when contract belongs to a different tenant');
  });

  await t.test('6.2 updateHandoverStatus strictly enforces tenant isolation', async () => {
    const handoversController = require('../controllers/reHandoversController');

    let queryTenantParam = null;
    mockQueryHandler = async (sql, params) => {
      const s = String(sql);
      if (s.includes('FROM re_handovers rh') && s.includes('FOR UPDATE')) {
        queryTenantParam = params[1];
        return { rows: [] }; // Handover not found for attacker tenant
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 1, tenant_id: 'tenant-attacker', role: 'admin' },
      params: { id: 'ho-100' },
      body: { status: 'Inspection' }
    };

    let responseCode = 200;
    const res = {
      status: (c) => { responseCode = c; return res; },
      json: () => res
    };

    await handoversController.updateHandoverStatus(req, res);

    assert.equal(queryTenantParam, 'tenant-attacker', 'Handover lock query must scope to calling tenant');
    assert.equal(responseCode, 404, 'Must return 404 when handover belongs to different tenant');
  });
});
