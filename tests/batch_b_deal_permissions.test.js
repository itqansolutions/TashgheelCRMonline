const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');
const {
  checkDealPermission,
  getEffectiveDealPermissions,
  requireDealPermission,
  ROLE_DEFAULT_DEAL_PERMISSIONS,
  DEAL_PERMISSIONS,
} = require('../middleware/dealPermission');
const dealsController = require('../controllers/dealsController');
const activityController = require('../controllers/activityController');
const reCancellationsController = require('../controllers/reCancellationsController');
const usersController = require('../controllers/usersController');

const originalDbQuery = db.query;

test('Batch B: Deal Permissions & Server-Side Authorization', async (t) => {
  t.afterEach(() => {
    db.query = originalDbQuery;
  });

  // ── 1. checkDealPermission & Role Baseline Defaults ────────────────────────
  await t.test('1. Role defaults and explicit user_access overrides', async () => {
    // Admin role has all permissions unconditionally
    const adminCheck = await checkDealPermission(1, 't-1', 'deal.delete', 'admin');
    assert.equal(adminCheck, true);

    // Sales role default has view, update_stage, log_activity; lacks delete, reassign, edit_details, extend_sla, view_overdue
    db.query = async () => ({ rows: [] }); // No explicit user_access rows
    assert.equal(await checkDealPermission(2, 't-1', 'deal.view', 'sales'), true);
    assert.equal(await checkDealPermission(2, 't-1', 'deal.update_stage', 'sales'), true);
    assert.equal(await checkDealPermission(2, 't-1', 'deal.log_activity', 'sales'), true);
    assert.equal(await checkDealPermission(2, 't-1', 'deal.edit_details', 'sales'), false);
    assert.equal(await checkDealPermission(2, 't-1', 'deal.delete', 'sales'), false);
    assert.equal(await checkDealPermission(2, 't-1', 'deal.reassign', 'sales'), false);
    assert.equal(await checkDealPermission(2, 't-1', 'deal.extend_sla', 'sales'), false);
    assert.equal(await checkDealPermission(2, 't-1', 'deal.view_overdue', 'sales'), false);

    // Explicit override in user_access: granting deal.reassign to sales rep
    db.query = async (sql, params) => {
      if (sql.includes('user_access') && params[0] === 2) {
        return {
          rows: [
            { page_path: 'deal.view', can_access: true },
            { page_path: 'deal.update_stage', can_access: true },
            { page_path: 'deal.log_activity', can_access: true },
            { page_path: 'deal.reassign', can_access: true },
          ]
        };
      }
      return { rows: [] };
    };

    assert.equal(await checkDealPermission(2, 't-1', 'deal.reassign', 'sales'), true);
    // deal.delete still not in explicit configuration -> false
    assert.equal(await checkDealPermission(2, 't-1', 'deal.delete', 'sales'), false);

    // Fail closed: missing parameters or DB errors
    assert.equal(await checkDealPermission(null, 't-1', 'deal.view', 'sales'), false);
    assert.equal(await checkDealPermission(2, null, 'deal.view', 'sales'), false);
    assert.equal(await checkDealPermission(2, 't-1', null, 'sales'), false);
    assert.equal(await checkDealPermission(2, 't-1', 'deal.view', null), false);

    db.query = async () => { throw new Error('DB Connection Lost'); };
    assert.equal(await checkDealPermission(2, 't-1', 'deal.view', 'sales'), false);
  });

  // ── 2. getEffectiveDealPermissions Resolution ──────────────────────────────
  await t.test('2. getEffectiveDealPermissions returns accurate effective sets', async () => {
    // Admin gets all 8 permissions
    const adminPerms = await getEffectiveDealPermissions(1, 't-1', 'admin');
    assert.equal(adminPerms.length, 8);
    assert.deepEqual(adminPerms.sort(), [...DEAL_PERMISSIONS].sort());

    // Default sales rep
    db.query = async () => ({ rows: [] });
    const salesPerms = await getEffectiveDealPermissions(2, 't-1', 'sales');
    assert.deepEqual(salesPerms.sort(), ['deal.view', 'deal.update_stage', 'deal.log_activity'].sort());

    // Explicit customized user
    db.query = async () => ({
      rows: [
        { page_path: 'deal.view', can_access: true },
        { page_path: 'deal.extend_sla', can_access: true }
      ]
    });
    const customPerms = await getEffectiveDealPermissions(3, 't-1', 'sales');
    assert.deepEqual(customPerms.sort(), ['deal.view', 'deal.extend_sla'].sort());
  });

  // ── 3. requireDealPermission Route Middleware ──────────────────────────────
  await t.test('3. requireDealPermission middleware returns 401 unauth and 403 PERMISSION_DENIED', async () => {
    const middleware = requireDealPermission('deal.delete');

    // Case 3A: No auth
    let status401 = null;
    let body401 = null;
    const reqNoAuth = {};
    const resNoAuth = {
      status: (c) => { status401 = c; return resNoAuth; },
      json: (d) => { body401 = d; return resNoAuth; }
    };
    await middleware(reqNoAuth, resNoAuth, () => assert.fail('Should not call next'));
    assert.equal(status401, 401);

    // Case 3B: Sales rep denied deal.delete
    db.query = async () => ({ rows: [] });
    let status403 = null;
    let body403 = null;
    const reqSales = { user: { id: 10, tenant_id: 't-1', role: 'sales' } };
    const resSales = {
      status: (c) => { status403 = c; return resSales; },
      json: (d) => { body403 = d; return resSales; }
    };
    await middleware(reqSales, resSales, () => assert.fail('Should not call next'));
    assert.equal(status403, 403);
    assert.equal(body403.code, 'PERMISSION_DENIED');
    assert.equal(body403.required_permission, 'deal.delete');

    // Case 3C: Admin allowed
    let nextCalled = false;
    const reqAdmin = { user: { id: 1, tenant_id: 't-1', role: 'admin' } };
    await middleware(reqAdmin, {}, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  // ── 4. Controller Protection: getDeals overdue/stalled filter ───────────────
  await t.test('4. getDeals rejects ?overdue=true if user lacks deal.view_overdue', async () => {
    db.query = async () => ({ rows: [] });

    const reqSales = {
      user: { id: 10, tenant_id: 't-1', role: 'sales' },
      query: { overdue: 'true' }
    };
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (c) => { statusCode = c; return res; },
      json: (d) => { jsonBody = d; return res; }
    };

    await dealsController.getDeals(reqSales, res);
    assert.equal(statusCode, 403);
    assert.equal(jsonBody.code, 'PERMISSION_DENIED');
    assert.equal(jsonBody.required_permission, 'deal.view_overdue');

    // Admin allowed to view overdue deals
    const reqAdmin = {
      user: { id: 1, tenant_id: 't-1', role: 'admin' },
      query: { overdue: 'true' }
    };
    let statusCodeAdmin = null;
    let jsonBodyAdmin = null;
    const resAdmin = {
      status: (c) => { statusCodeAdmin = c; return resAdmin; },
      json: (d) => { jsonBodyAdmin = d; return resAdmin; }
    };

    await dealsController.getDeals(reqAdmin, resAdmin);
    assert.equal(statusCodeAdmin, null); // 200 OK
    assert.equal(jsonBodyAdmin.status, 'success');
  });

  // ── 5. Controller Protection: createDeal reassignment guard ────────────────
  await t.test('5. createDeal prevents assigning to another user without deal.reassign', async () => {
    db.query = async () => ({ rows: [] });

    // Sales rep trying to assign deal to user 99
    const reqSales = {
      user: { id: 10, tenant_id: 't-1', role: 'sales' },
      body: {
        title: 'New Enterprise Deal',
        value: 100000,
        assigned_to: 99
      }
    };
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (c) => { statusCode = c; return res; },
      json: (d) => { jsonBody = d; return res; }
    };

    await dealsController.createDeal(reqSales, res);
    assert.equal(statusCode, 403);
    assert.equal(jsonBody.code, 'PERMISSION_DENIED');
    assert.equal(jsonBody.required_permission, 'deal.reassign');
  });

  // ── 6. Controller Protection: updateDeal Mass Assignment Prevention ────────
  await t.test('6. updateDeal prevents privilege escalation via arbitrary payload fields', async () => {
    const existingDeal = {
      id: 50,
      title: 'Original Title',
      value: 10000,
      pipeline_stage: 'discovery',
      client_id: 5,
      product_id: null,
      project_id: null,
      assigned_to: 10,
      tenant_id: 't-1',
      branch_id: null,
      probability: 20,
      expected_close_date: null,
      custom_fields: {}
    };

    db.query = async (sql, params) => {
      if (sql.includes('SELECT * FROM deals WHERE')) {
        return { rows: [existingDeal] };
      }
      return { rows: [] };
    };

    // User only has default sales permissions (deal.view, deal.update_stage, deal.log_activity)
    // Payload tries to modify commercial details (value, title, client_id) alongside pipeline_stage
    const reqEscalation = {
      user: { id: 10, tenant_id: 't-1', role: 'sales' },
      params: { id: '50' },
      body: {
        title: 'Hacked Title',
        value: 9999999,
        pipeline_stage: 'negotiation'
      }
    };
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (c) => { statusCode = c; return res; },
      json: (d) => { jsonBody = d; return res; }
    };

    await dealsController.updateDeal(reqEscalation, res);
    assert.equal(statusCode, 403);
    assert.equal(jsonBody.code, 'PERMISSION_DENIED');
    assert.equal(jsonBody.required_permission, 'deal.edit_details');

    // Sales rep trying to change assigned_to without deal.reassign
    const reqReassign = {
      user: { id: 10, tenant_id: 't-1', role: 'sales' },
      params: { id: '50' },
      body: {
        assigned_to: 88
      }
    };
    let statusReassign = null;
    let bodyReassign = null;
    const resReassign = {
      status: (c) => { statusReassign = c; return resReassign; },
      json: (d) => { bodyReassign = d; return resReassign; }
    };

    await dealsController.updateDeal(reqReassign, resReassign);
    assert.equal(statusReassign, 403);
    assert.equal(bodyReassign.code, 'PERMISSION_DENIED');
    assert.equal(bodyReassign.required_permission, 'deal.reassign');
  });

  // ── 7. Activity Controller: deal.log_activity Guard ────────────────────────
  await t.test('7. createActivity on deal entity requires deal.log_activity', async () => {
    // Override db to simulate explicit user_access having only deal.view (revoked log_activity)
    db.query = async (sql, params) => {
      if (sql.includes('user_access')) {
        return { rows: [{ page_path: 'deal.view', can_access: true }] };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 12, tenant_id: 't-1', role: 'sales' },
      params: { entity_type: 'deal', entity_id: '101' },
      body: { action: 'called', note: 'Customer called back.' }
    };
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (c) => { statusCode = c; return res; },
      json: (d) => { jsonBody = d; return res; }
    };

    await activityController.createActivity(req, res);
    assert.equal(statusCode, 403);
    assert.equal(jsonBody.code, 'PERMISSION_DENIED');
    assert.equal(jsonBody.required_permission, 'deal.log_activity');
  });

  // ── 8. Cancellation Controller: deal.delete Guard ──────────────────────────
  await t.test('8. processCancellation requires deal.delete', async () => {
    db.query = async () => ({ rows: [] }); // Sales rep defaults: lacks deal.delete

    const req = {
      user: { id: 10, tenant_id: 't-1', role: 'sales' },
      body: { deal_id: 101, cancellation_reason: 'Client requested cancellation' }
    };
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (c) => { statusCode = c; return res; },
      json: (d) => { jsonBody = d; return res; }
    };

    await reCancellationsController.processCancellation(req, res);
    assert.equal(statusCode, 403);
    assert.equal(jsonBody.code, 'PERMISSION_DENIED');
    assert.equal(jsonBody.required_permission, 'deal.delete');
  });

  // ── 9. User Permissions Multi-Tenant Isolation ─────────────────────────────
  await t.test('9. usersController permission endpoints enforce tenant isolation', async () => {
    db.query = async (sql, params) => {
      // User 200 belongs to tenant-B
      if (sql.includes('SELECT id FROM users WHERE id = $1 AND tenant_id::text = $2::text')) {
        if (params[0] === '200' && params[1] === 'tenant-B') {
          return { rows: [{ id: 200 }] };
        }
        return { rows: [] };
      }
      return { rows: [] };
    };

    // Admin of tenant-A attempts to get permissions of user in tenant-B
    const reqGetCross = {
      user: { id: 1, tenant_id: 'tenant-A', role: 'admin' },
      params: { id: '200' }
    };
    let statusGet = null;
    let bodyGet = null;
    const resGet = {
      status: (c) => { statusGet = c; return resGet; },
      json: (d) => { bodyGet = d; return resGet; }
    };
    await usersController.getUserPermissions(reqGetCross, resGet);
    assert.equal(statusGet, 404);
    assert.match(bodyGet.message, /not found/i);

    // Admin of tenant-A attempts to update permissions of user in tenant-B
    const reqPostCross = {
      user: { id: 1, tenant_id: 'tenant-A', role: 'admin' },
      params: { id: '200' },
      body: { allowedPages: ['deal.view', 'deal.delete'] }
    };
    let statusPost = null;
    let bodyPost = null;
    const resPost = {
      status: (c) => { statusPost = c; return resPost; },
      json: (d) => { bodyPost = d; return resPost; }
    };
    await usersController.updateUserPermissions(reqPostCross, resPost);
    assert.equal(statusPost, 404);
    assert.match(bodyPost.message, /not found/i);
  });
});
