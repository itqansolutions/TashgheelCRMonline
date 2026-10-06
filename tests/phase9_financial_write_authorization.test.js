const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');
const { requirePermission, checkFinancialPermission, getEffectiveFinancialPermissions } = require('../middleware/financialPermission');

// Save original db methods
const originalDbQuery = db.query;

test('Phase 9: Financial Write Authorization Hardening Suite', async (t) => {
  t.beforeEach(() => {
    db.query = async () => ({ rows: [] });
  });

  t.afterEach(() => {
    db.query = originalDbQuery;
  });

  // ---------------------------------------------------------------------------
  // 1. Role defaults & fail-closed behavior in checkFinancialPermission
  // ---------------------------------------------------------------------------
  await t.test('Role defaults: admin and manager are ALLOWED payment.create, employee is DENIED by default', async () => {
    const adminAllowed = await checkFinancialPermission(1, 't-1', 'payment.create', 'admin');
    const managerAllowed = await checkFinancialPermission(2, 't-1', 'payment.create', 'manager');
    const employeeAllowed = await checkFinancialPermission(3, 't-1', 'payment.create', 'employee');

    assert.equal(adminAllowed, true, 'Admin must have payment.create');
    assert.equal(managerAllowed, true, 'Manager must have payment.create');
    assert.equal(employeeAllowed, false, 'Employee must NOT have payment.create by default');
  });

  await t.test('Fail-closed: missing parameters or DB errors return false (deny)', async () => {
    // Missing role / tenant / user
    assert.equal(await checkFinancialPermission(null, 't-1', 'payment.create', 'admin'), false);
    assert.equal(await checkFinancialPermission(1, null, 'payment.create', 'admin'), false);
    assert.equal(await checkFinancialPermission(1, 't-1', null, 'admin'), false);
    assert.equal(await checkFinancialPermission(1, 't-1', 'payment.create', null), false);

    // DB Error simulation (e.g. database down during query)
    db.query = async () => { throw new Error('Database connection failure'); };
    const res = await checkFinancialPermission(1, 't-1', 'payment.create', 'admin');
    assert.equal(res, false, 'Must fail-closed to false on DB error');
  });

  await t.test('Individual DB overrides in financial_permissions table are respected', async () => {
    // Employee granted payment.create explicitly
    db.query = async (sql, params) => {
      if (sql.includes('FROM financial_permissions') && params[1] === 10) {
        return { rows: [{ granted: true }] };
      }
      if (sql.includes('FROM financial_permissions') && params[1] === 11) {
        return { rows: [{ granted: false }] };
      }
      return { rows: [] };
    };

    const employeeWithGrant = await checkFinancialPermission(10, 't-1', 'payment.create', 'employee');
    assert.equal(employeeWithGrant, true, 'Explicit true override should allow employee');

    const managerWithRevocation = await checkFinancialPermission(11, 't-1', 'payment.create', 'manager');
    assert.equal(managerWithRevocation, false, 'Explicit false override should deny manager');
  });

  await t.test('Voucher cancellation permission (voucher.cancel) is restricted to admin only', async () => {
    const adminCancel = await checkFinancialPermission(1, 't-1', 'voucher.cancel', 'admin');
    const managerCancel = await checkFinancialPermission(2, 't-1', 'voucher.cancel', 'manager');
    const employeeCancel = await checkFinancialPermission(3, 't-1', 'voucher.cancel', 'employee');

    assert.equal(adminCancel, true, 'Admin must have voucher.cancel');
    assert.equal(managerCancel, false, 'Manager must NOT have voucher.cancel');
    assert.equal(employeeCancel, false, 'Employee must NOT have voucher.cancel');
  });

  // ---------------------------------------------------------------------------
  // 2. getEffectiveFinancialPermissions helper
  // ---------------------------------------------------------------------------
  await t.test('getEffectiveFinancialPermissions returns array containing permissions and applies overrides', async () => {
    // Default manager
    const managerPerms = await getEffectiveFinancialPermissions(2, 't-1', 'manager');
    assert.ok(Array.isArray(managerPerms));
    assert.ok(managerPerms.includes('payment.create'));
    assert.ok(!managerPerms.includes('voucher.cancel'));

    // Default employee
    const employeePerms = await getEffectiveFinancialPermissions(3, 't-1', 'employee');
    assert.ok(Array.isArray(employeePerms));
    assert.ok(!employeePerms.includes('payment.create'));

    // Employee with DB override
    db.query = async () => ({ rows: [{ permission: 'payment.create', granted: true }] });
    const employeeGranted = await getEffectiveFinancialPermissions(3, 't-1', 'employee');
    assert.ok(employeeGranted.includes('payment.create'), 'Overridden employee must have payment.create');
  });

  // ---------------------------------------------------------------------------
  // 3. requirePermission middleware execution
  // ---------------------------------------------------------------------------
  await t.test('requirePermission middleware responds with 401 when unauthenticated', async () => {
    const mw = requirePermission('payment.create');
    let statusSent = null;
    let jsonSent = null;
    let nextCalled = false;

    const req = {};
    const res = {
      status(code) { statusSent = code; return this; },
      json(data) { jsonSent = data; return this; }
    };
    const next = () => { nextCalled = true; };

    await mw(req, res, next);
    assert.equal(statusSent, 401);
    assert.equal(nextCalled, false);
  });

  await t.test('requirePermission middleware responds with 403 when user lacks permission', async () => {
    const mw = requirePermission('payment.create');
    let statusSent = null;
    let jsonSent = null;
    let nextCalled = false;

    const req = {
      user: { id: 3, tenant_id: 't-1', role: 'employee' }
    };
    const res = {
      status(code) { statusSent = code; return this; },
      json(data) { jsonSent = data; return this; }
    };
    const next = () => { nextCalled = true; };

    await mw(req, res, next);
    assert.equal(statusSent, 403);
    assert.equal(jsonSent?.code, 'PERMISSION_DENIED');
    assert.equal(jsonSent?.required_permission, 'payment.create');
    assert.equal(nextCalled, false);
  });

  await t.test('requirePermission middleware calls next() when user has permission (manager or admin)', async () => {
    const mw = requirePermission('payment.create');
    let nextCalled = false;

    const req = {
      user: { id: 2, tenant_id: 't-1', role: 'manager' }
    };
    const res = {
      status(code) { throw new Error(`Unexpected status ${code}`); },
      json() { throw new Error('Unexpected json'); }
    };
    const next = () => { nextCalled = true; };

    await mw(req, res, next);
    assert.equal(nextCalled, true);
  });

  // ---------------------------------------------------------------------------
  // 4. Route stack inspection: verify requirePermission is wired on all money-write endpoints
  // ---------------------------------------------------------------------------
  await t.test('Route Stack Verification: all in-scope write routes contain requirePermission middleware', async () => {
    // Helper to find route handlers in an Express Router
    const findRouteHandlers = (router, path, method) => {
      for (const layer of router.stack) {
        if (layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]) {
          return layer.route.stack;
        }
      }
      return null;
    };

    // 1. reInstallmentRoutes: POST /:id/pay
    const reInstallmentRoutes = require('../routes/reInstallmentRoutes');
    const payInstallmentStack = findRouteHandlers(reInstallmentRoutes, '/:id/pay', 'POST');
    assert.ok(payInstallmentStack, 'POST /:id/pay must exist in reInstallmentRoutes');
    assert.ok(
      payInstallmentStack.some(layer => layer.name === '' || layer.handle.name === ''),
      'POST /:id/pay must have middleware'
    );
    assert.equal(payInstallmentStack.length >= 2, true, 'Must have at least 2 handlers (guard + controller)');

    // 2. financeRoutes: POST /payments, POST /invoices/:id/payments, POST /vouchers, POST /expenses, POST /vendors/:id/payments
    const financeRoutes = require('../routes/financeRoutes');
    
    const postPayments = findRouteHandlers(financeRoutes, '/payments', 'POST');
    assert.ok(postPayments, 'POST /payments must exist in financeRoutes');
    assert.ok(postPayments.length >= 2, 'POST /payments must have guard middleware');

    const postInvPayments = findRouteHandlers(financeRoutes, '/invoices/:id/payments', 'POST');
    assert.ok(postInvPayments, 'POST /invoices/:id/payments must exist in financeRoutes');
    assert.ok(postInvPayments.length >= 2, 'POST /invoices/:id/payments must have guard middleware');

    const postVouchers = findRouteHandlers(financeRoutes, '/vouchers', 'POST');
    assert.ok(postVouchers, 'POST /vouchers must exist in financeRoutes');
    assert.ok(postVouchers.length >= 2, 'POST /vouchers must have guard middleware');

    const postExpenses = findRouteHandlers(financeRoutes, '/expenses', 'POST');
    assert.ok(postExpenses, 'POST /expenses must exist in financeRoutes');
    assert.ok(postExpenses.length >= 2, 'POST /expenses must have guard middleware');

    const postVendorPayments = findRouteHandlers(financeRoutes, '/vendors/:id/payments', 'POST');
    assert.ok(postVendorPayments, 'POST /vendors/:id/payments must exist in financeRoutes');
    assert.ok(postVendorPayments.length >= 2, 'POST /vendors/:id/payments must have guard middleware');

    // 3. invoiceRoutes: POST /:id/payments
    const invoiceRoutes = require('../routes/invoiceRoutes');
    const invPayments = findRouteHandlers(invoiceRoutes, '/:id/payments', 'POST');
    assert.ok(invPayments, 'POST /:id/payments must exist in invoiceRoutes');
    assert.ok(invPayments.length >= 2, 'POST /:id/payments must have guard middleware');

    // 4. purchaseRoutes: POST /vendors/:id/payments
    const purchaseRoutes = require('../routes/purchaseRoutes');
    const purchVendorPayments = findRouteHandlers(purchaseRoutes, '/vendors/:id/payments', 'POST');
    assert.ok(purchVendorPayments, 'POST /vendors/:id/payments must exist in purchaseRoutes');
    assert.ok(purchVendorPayments.length >= 2, 'POST /vendors/:id/payments must have guard middleware');

    // 5. reCommissionRoutes: POST /:id/pay
    const reCommissionRoutes = require('../routes/reCommissionRoutes');
    const commPay = findRouteHandlers(reCommissionRoutes, '/:id/pay', 'POST');
    assert.ok(commPay, 'POST /:id/pay must exist in reCommissionRoutes');
    assert.ok(commPay.length >= 2, 'POST /:id/pay must have guard middleware');

    // 6. expenseRoutes: POST /, PUT /:id, DELETE /:id
    const expenseRoutes = require('../routes/expenseRoutes');
    const expPost = findRouteHandlers(expenseRoutes, '/', 'POST');
    assert.ok(expPost, 'POST / must exist in expenseRoutes');
    assert.ok(expPost.length >= 2, 'POST / must have guard middleware');

    const expPut = findRouteHandlers(expenseRoutes, '/:id', 'PUT');
    assert.ok(expPut, 'PUT /:id must exist in expenseRoutes');
    assert.ok(expPut.length >= 2, 'PUT /:id must have guard middleware');

    const expDelete = findRouteHandlers(expenseRoutes, '/:id', 'DELETE');
    assert.ok(expDelete, 'DELETE /:id must exist in expenseRoutes');
    assert.ok(expDelete.length >= 2, 'DELETE /:id must have guard middleware');

    // 7. treasury routes: POST /treasury/accounts, PUT /treasury/accounts/:id
    const postTreasury = findRouteHandlers(financeRoutes, '/treasury/accounts', 'POST');
    assert.ok(postTreasury, 'POST /treasury/accounts must exist in financeRoutes');
    assert.ok(postTreasury.length >= 2, 'POST /treasury/accounts must have guard middleware');

    const putTreasury = findRouteHandlers(financeRoutes, '/treasury/accounts/:id', 'PUT');
    assert.ok(putTreasury, 'PUT /treasury/accounts/:id must exist in financeRoutes');
    assert.ok(putTreasury.length >= 2, 'PUT /treasury/accounts/:id must have guard middleware');

    // 8. rePaymentRoutes: PUT /:id, DELETE /:id
    const rePaymentRoutes = require('../routes/rePaymentRoutes');
    const putRePayment = findRouteHandlers(rePaymentRoutes, '/:id', 'PUT');
    assert.ok(putRePayment, 'PUT /:id must exist in rePaymentRoutes');
    assert.ok(putRePayment.length >= 2, 'PUT /:id must have guard middleware');

    const deleteRePayment = findRouteHandlers(rePaymentRoutes, '/:id', 'DELETE');
    assert.ok(deleteRePayment, 'DELETE /:id must exist in rePaymentRoutes');
    assert.ok(deleteRePayment.length >= 2, 'DELETE /:id must have guard middleware');
  });

  // ---------------------------------------------------------------------------
  // 5. Behavioral Authorization Test with Mock DB
  // ---------------------------------------------------------------------------
  await t.test('Behavioral Authorization: newly protected route allows admin/manager but blocks employee with 403 and zero DB mutation', async () => {
    let dbMutations = 0;
    db.query = async (sql, params) => {
      // Intercept permission override queries
      if (sql.includes('FROM financial_permissions')) {
        return { rows: [] };
      }
      // Count any mutation queries
      if (/insert|update|delete/i.test(sql)) {
        dbMutations++;
        return { rows: [{ id: 99, status: 'deleted' }] };
      }
      return { rows: [{ id: 99, tenant_id: 't-1' }] };
    };

    const expensesController = require('../controllers/expensesController');
    const guardMw = requirePermission('payment.create');

    // Case 1: Employee attempts expense deletion
    let employeeStatus = null;
    let employeeJson = null;
    let employeeNextCalled = false;
    const employeeReq = {
      user: { id: 101, tenant_id: 't-1', role: 'employee' },
      params: { id: 99 }
    };
    const employeeRes = {
      status(code) { employeeStatus = code; return this; },
      json(data) { employeeJson = data; return this; }
    };
    await guardMw(employeeReq, employeeRes, () => {
      employeeNextCalled = true;
      return expensesController.deleteExpense(employeeReq, employeeRes);
    });

    assert.equal(employeeStatus, 403, 'Employee must be blocked with 403');
    assert.equal(employeeNextCalled, false, 'Controller must not be called');
    assert.equal(dbMutations, 0, 'Zero DB mutations must occur for denied employee');

    // Case 2: Manager executes expense deletion
    let managerStatus = null;
    let managerJson = null;
    let managerNextCalled = false;
    const managerReq = {
      user: { id: 102, tenant_id: 't-1', role: 'manager' },
      params: { id: 99 }
    };
    const managerRes = {
      status(code) { managerStatus = code; return this; },
      json(data) { managerJson = data; return this; }
    };
    await guardMw(managerReq, managerRes, async () => {
      managerNextCalled = true;
      await expensesController.deleteExpense(managerReq, managerRes);
    });

    assert.equal(managerNextCalled, true, 'Manager must pass through guard to controller');
    assert.equal(dbMutations, 1, 'Manager must be permitted to mutate database');
    assert.equal(managerJson?.status, 'success', 'Manager deletion must succeed');
  });
});
