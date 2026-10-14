/**
 * Comprehensive Automated Test Suite:
 * Phase A (Unit Lifecycle Protection) & Phase B (Branch Scope Enforcement)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');

// Controllers under test
const reUnitsController = require('../controllers/reUnitsController');
const reInstallmentsController = require('../controllers/reInstallmentsController');
const reHandoversController = require('../controllers/reHandoversController');
const reCancellationsController = require('../controllers/reCancellationsController');
const rePaymentsController = require('../controllers/rePaymentsController');

const originalDbQuery = db.query;
const originalDbConnect = db.connect;

function createMockRes() {
  return {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    }
  };
}

test('Phase A: Unit Lifecycle Protection Tests', async (t) => {
  t.beforeEach(() => {
    db.query = async () => ({ rows: [] });
  });

  t.afterEach(() => {
    db.query = originalDbQuery;
    db.connect = originalDbConnect;
  });

  await t.test('Rejects direct manual status transition Available -> Reserved (400 DIRECT_STATUS_CHANGE_PROHIBITED)', async () => {
    const res = createMockRes();
    db.query = async (sql) => {
      if (sql.includes('FROM re_units')) {
        return { rows: [{ id: '00000000-0000-0000-0000-000000000001', status: 'Available' }] };
      }
      return { rows: [] };
    };

    await reUnitsController.updateUnit(
      {
        params: { id: '00000000-0000-0000-0000-000000000001' },
        body: { status: 'Reserved' },
        user: { tenant_id: 't-1', role: 'admin' }
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.code, 'DIRECT_STATUS_CHANGE_PROHIBITED');
  });

  await t.test('Rejects direct manual status transition Reserved -> Contracted (400 DIRECT_STATUS_CHANGE_PROHIBITED)', async () => {
    const res = createMockRes();
    db.query = async (sql) => {
      if (sql.includes('FROM re_units')) {
        return { rows: [{ id: '00000000-0000-0000-0000-000000000001', status: 'Reserved' }] };
      }
      return { rows: [] };
    };

    await reUnitsController.updateUnit(
      {
        params: { id: '00000000-0000-0000-0000-000000000001' },
        body: { status: 'Contracted' },
        user: { tenant_id: 't-1', role: 'manager' }
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.code, 'DIRECT_STATUS_CHANGE_PROHIBITED');
  });

  await t.test('Rejects direct manual status transition Contracted -> Handed Over (400 DIRECT_STATUS_CHANGE_PROHIBITED)', async () => {
    const res = createMockRes();
    db.query = async (sql) => {
      if (sql.includes('FROM re_units')) {
        return { rows: [{ id: '00000000-0000-0000-0000-000000000001', status: 'Contracted' }] };
      }
      return { rows: [] };
    };

    await reUnitsController.updateUnit(
      {
        params: { id: '00000000-0000-0000-0000-000000000001' },
        body: { status: 'Handed Over' },
        user: { tenant_id: 't-1', role: 'admin' }
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.code, 'DIRECT_STATUS_CHANGE_PROHIBITED');
  });

  await t.test('Rejects placing unit Under Dispute by regular user/agent (403 UNAUTHORIZED_STATUS_CHANGE)', async () => {
    const res = createMockRes();
    db.query = async (sql) => {
      if (sql.includes('FROM re_units')) {
        return { rows: [{ id: '00000000-0000-0000-0000-000000000001', status: 'Available' }] };
      }
      return { rows: [] };
    };

    await reUnitsController.updateUnit(
      {
        params: { id: '00000000-0000-0000-0000-000000000001' },
        body: { status: 'Under Dispute', reason: 'Valid dispute reason' },
        user: { id: 'u-1', tenant_id: 't-1', role: 'sales_rep' }
      },
      res
    );

    assert.equal(res.statusCode, 403);
    assert.equal(res.data.code, 'UNAUTHORIZED_STATUS_CHANGE');
  });

  await t.test('Rejects placing unit Under Dispute without a reason (400 REASON_REQUIRED)', async () => {
    const res = createMockRes();
    db.query = async (sql) => {
      if (sql.includes('FROM re_units')) {
        return { rows: [{ id: '00000000-0000-0000-0000-000000000001', status: 'Available' }] };
      }
      return { rows: [] };
    };

    await reUnitsController.updateUnit(
      {
        params: { id: '00000000-0000-0000-0000-000000000001' },
        body: { status: 'Under Dispute', reason: '   ' },
        user: { id: 'u-1', tenant_id: 't-1', role: 'manager' }
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.code, 'REASON_REQUIRED');
  });

  await t.test('Allows admin/manager to place unit Under Dispute with mandatory reason', async () => {
    const res = createMockRes();
    db.query = async (sql, params) => {
      if (sql.includes('UPDATE re_units')) {
        return { rows: [{ id: '00000000-0000-0000-0000-000000000001', status: 'Under Dispute' }] };
      }
      if (sql.includes('FROM re_units')) {
        return { rows: [{ id: '00000000-0000-0000-0000-000000000001', status: 'Available' }] };
      }
      return { rows: [] };
    };

    await reUnitsController.updateUnit(
      {
        params: { id: '00000000-0000-0000-0000-000000000001' },
        body: { status: 'Under Dispute', reason: 'Legal ownership dispute filed by heir' },
        user: { id: 'u-admin', tenant_id: 't-1', role: 'admin' }
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.data.status, 'Under Dispute');
  });

  await t.test('Allows resolving unit from Under Dispute back to Available by manager with reason', async () => {
    const res = createMockRes();
    db.query = async (sql, params) => {
      if (sql.includes('UPDATE re_units')) {
        return { rows: [{ id: '00000000-0000-0000-0000-000000000001', status: 'Available' }] };
      }
      if (sql.includes('FROM re_units')) {
        return { rows: [{ id: '00000000-0000-0000-0000-000000000001', status: 'Under Dispute' }] };
      }
      return { rows: [] };
    };

    await reUnitsController.updateUnit(
      {
        params: { id: '00000000-0000-0000-0000-000000000001' },
        body: { status: 'Available', resolution_reason: 'Court ruling cleared title deeds' },
        user: { id: 'u-mgr', tenant_id: 't-1', role: 'manager' }
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.data.status, 'Available');
  });

  await t.test('Normal property attributes update succeeds without touching status', async () => {
    const res = createMockRes();
    db.query = async (sql, params) => {
      if (sql.includes('UPDATE re_units')) {
        assert.ok(!sql.includes('status ='));
        return { rows: [{ id: '00000000-0000-0000-0000-000000000001', name: 'Penthouse Deluxe', price: 2500000, status: 'Available' }] };
      }
      return { rows: [] };
    };

    await reUnitsController.updateUnit(
      {
        params: { id: '00000000-0000-0000-0000-000000000001' },
        body: { name: 'Penthouse Deluxe', price: 2500000 },
        user: { id: 'u-1', tenant_id: 't-1', role: 'agent' }
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.data.name, 'Penthouse Deluxe');
  });
});

test('Phase B: Branch Scope Enforcement Tests', async (t) => {
  t.beforeEach(() => {
    db.query = async () => ({ rows: [] });
  });

  t.afterEach(() => {
    db.query = originalDbQuery;
    db.connect = originalDbConnect;
  });

  // 1. Installments Branch Isolation
  await t.test('Installments: Non-admin query includes branch isolation filter', async () => {
    const res = createMockRes();
    let executedQuery = null;
    let queryParams = null;

    db.query = async (sql, params) => {
      executedQuery = sql;
      queryParams = params;
      return { rows: [] };
    };

    await reInstallmentsController.getInstallments(
      {
        query: {},
        user: { id: 'u-1', tenant_id: 'tenant-100', role: 'agent' },
        branchId: 'branch-cairo'
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.ok(executedQuery.includes('COALESCE(ri.branch_id, d.branch_id, rc.branch_id)::text'));
    assert.ok(queryParams.includes('branch-cairo'));
  });

  await t.test('Installments: Non-admin cannot record payment for out-of-branch installment (404)', async () => {
    const res = createMockRes();
    const mockClient = {
      query: async (sql, params) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return {};
        if (sql.includes('FROM re_installments ri')) {
          // Installment belongs to branch-alexandria
          return { rows: [{ id: 'inst-1', amount: 50000, paid_amount: 0, branch_id: 'branch-alexandria' }] };
        }
        return { rows: [] };
      },
      release: () => {}
    };
    db.connect = async () => mockClient;

    await reInstallmentsController.recordPayment(
      {
        params: { id: 'inst-1' },
        body: { amount: 10000 },
        user: { id: 'u-1', tenant_id: 'tenant-100', role: 'accountant' },
        branchId: 'branch-cairo'
      },
      res
    );

    assert.equal(res.statusCode, 404);
    assert.match(res.data.message, /not found or unauthorized/i);
  });

  await t.test('Installments: Non-admin cannot delete out-of-branch installment (404)', async () => {
    const res = createMockRes();
    db.query = async (sql) => {
      if (sql.includes('FROM re_installments ri')) {
        return { rows: [{ id: 'inst-99', paid_amount: 0, branch_id: 'branch-giza' }] };
      }
      return { rows: [] };
    };

    await reInstallmentsController.deleteInstallment(
      {
        params: { id: 'inst-99' },
        user: { id: 'u-1', tenant_id: 'tenant-100', role: 'agent' },
        branchId: 'branch-cairo'
      },
      res
    );

    assert.equal(res.statusCode, 404);
    assert.match(res.data.message, /not found or unauthorized/i);
  });

  await t.test('Installments: Non-admin cannot generate schedule on contract from another branch (404)', async () => {
    const res = createMockRes();
    const mockClient = {
      query: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return {};
        if (sql.includes('FROM re_contracts rc')) {
          return { rows: [{ id: 'c-1', contract_value: 1000000, branch_id: 'branch-mansoura' }] };
        }
        return { rows: [] };
      },
      release: () => {}
    };
    db.connect = async () => mockClient;

    await reInstallmentsController.generateSchedule(
      {
        body: { contract_id: 'c-1', number_of_installments: 12 },
        user: { id: 'u-1', tenant_id: 'tenant-100', role: 'agent' },
        branchId: 'branch-cairo'
      },
      res
    );

    assert.equal(res.statusCode, 404);
    assert.match(res.data.message, /not found or unauthorized/i);
  });

  // 2. Handovers Branch Isolation
  await t.test('Handovers: Non-admin query includes branch filter', async () => {
    const res = createMockRes();
    let executedQuery = null;
    let queryParams = null;

    db.query = async (sql, params) => {
      executedQuery = sql;
      queryParams = params;
      return { rows: [] };
    };

    await reHandoversController.getHandovers(
      {
        query: {},
        user: { id: 'u-1', tenant_id: 'tenant-100', role: 'agent' },
        branchId: 'branch-cairo'
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.ok(executedQuery.includes('COALESCE(rh.branch_id, d.branch_id)::text'));
    assert.ok(queryParams.includes('branch-cairo'));
  });

  await t.test('Handovers: Non-admin cannot create handover for deal in another branch (404)', async () => {
    const res = createMockRes();
    db.query = async (sql) => {
      if (sql.includes('FROM deals')) {
        return { rows: [{ id: 10, title: 'Luxury Villa', unit_id: 'u-1', branch_id: 'branch-alexandria' }] };
      }
      return { rows: [] };
    };

    await reHandoversController.createHandover(
      {
        body: { deal_id: 10 },
        user: { id: 'u-1', tenant_id: 'tenant-100', role: 'agent' },
        branchId: 'branch-cairo'
      },
      res
    );

    assert.equal(res.statusCode, 404);
    assert.match(res.data.message, /not found or unauthorized/i);
  });

  await t.test('Handovers: Non-admin cannot update status of handover in another branch (404)', async () => {
    const res = createMockRes();
    const mockClient = {
      query: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return {};
        if (sql.includes('FROM re_handovers rh')) {
          return { rows: [{ id: 'ho-1', branch_id: 'branch-alexandria' }] };
        }
        return { rows: [] };
      },
      release: () => {}
    };
    db.connect = async () => mockClient;

    await reHandoversController.updateHandoverStatus(
      {
        params: { id: 'ho-1' },
        body: { status: 'Inspection' },
        user: { id: 'u-1', tenant_id: 'tenant-100', role: 'agent' },
        branchId: 'branch-cairo'
      },
      res
    );

    assert.equal(res.statusCode, 404);
    assert.match(res.data.message, /not found or unauthorized/i);
  });

  // 3. Cancellations Branch Isolation
  await t.test('Cancellations: Non-admin query includes branch filter', async () => {
    const res = createMockRes();
    let executedQuery = null;
    let queryParams = null;

    db.query = async (sql, params) => {
      executedQuery = sql;
      queryParams = params;
      return { rows: [] };
    };

    await reCancellationsController.getCancellations(
      {
        query: {},
        user: { id: 'u-1', tenant_id: 'tenant-100', role: 'agent' },
        branchId: 'branch-cairo'
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.ok(executedQuery.includes('COALESCE(rc.branch_id, d.branch_id)::text'));
    assert.ok(queryParams.includes('branch-cairo'));
  });

  await t.test('Cancellations: Non-admin cannot process cancellation for deal in another branch (404)', async () => {
    const res = createMockRes();
    const mockClient = {
      query: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return {};
        if (sql.includes('FROM deals')) {
          return { rows: [{ id: 55, title: 'Commercial Shop', branch_id: 'branch-giza' }] };
        }
        return { rows: [] };
      },
      release: () => {}
    };
    db.connect = async () => mockClient;

    await reCancellationsController.processCancellation(
      {
        body: { deal_id: 55, cancellation_reason: 'Client relocated' },
        user: { id: 'u-1', tenant_id: 'tenant-100', role: 'agent' },
        branchId: 'branch-cairo'
      },
      res
    );

    assert.equal(res.statusCode, 404);
    assert.match(res.data.message, /not found or unauthorized/i);
  });

  // 4. Payments MVP Branch Isolation
  await t.test('Payments: Non-admin cannot view payment of a deal in another branch (404)', async () => {
    const res = createMockRes();
    db.query = async (sql) => {
      if (sql.includes('FROM deals')) {
        return { rows: [{ branch_id: 'branch-aswan' }] };
      }
      return { rows: [] };
    };

    await rePaymentsController.getPaymentByDeal(
      {
        params: { dealId: '123' },
        user: { id: 'u-1', tenant_id: 'tenant-100', role: 'agent' },
        branchId: 'branch-cairo'
      },
      res
    );

    assert.equal(res.statusCode, 404);
    assert.match(res.data.message, /not found or unauthorized/i);
  });

  await t.test('Payments: Non-admin cannot update payment record of another branch (404)', async () => {
    const res = createMockRes();
    db.query = async (sql) => {
      if (sql.includes('FROM re_payments_mvp')) {
        return { rows: [{ branch_id: 'branch-aswan' }] };
      }
      return { rows: [] };
    };

    await rePaymentsController.updatePayment(
      {
        params: { id: 77 },
        body: { paid_amount: 50000 },
        user: { id: 'u-1', tenant_id: 'tenant-100', role: 'agent' },
        branchId: 'branch-cairo'
      },
      res
    );

    assert.equal(res.statusCode, 404);
    assert.match(res.data.message, /not found or unauthorized/i);
  });

  await t.test('Payments: Admin has cross-branch access without restriction', async () => {
    const res = createMockRes();
    let branchParam = null;
    db.query = async (sql, params) => {
      if (sql.includes('FROM re_payments_mvp')) {
        branchParam = params[2];
        return { rows: [{ id: 88, deal_id: '123', total_amount: 100000, paid_amount: 50000, remaining_amount: 50000 }] };
      }
      return { rows: [] };
    };

    await rePaymentsController.getPaymentByDeal(
      {
        params: { dealId: '123' },
        query: {},
        user: { id: 'u-admin', tenant_id: 'tenant-100', role: 'admin' },
        branchId: 'branch-cairo'
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(branchParam, null); // admin with no branch_id query param allows cross-branch
    assert.equal(res.data.data.id, 88);
  });
});
