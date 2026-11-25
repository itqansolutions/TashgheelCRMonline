'use strict';
// Isolated synthetic Postgres only (tests/helpers/pgHarness.cjs). Never touches a live DB.
// Customer visibility mode (Ali 2026-11-25): per-tenant admin option, default 'scoped'.
//  scoped: rep own / team-manager his members / admin all - detail by direct id = 404 like deals.
//  shared: everyone in tenant/branch reads all customers (list + detail).
// Fail-on-base: at base f51ed01 there is no guard, so cross-owner detail reads return 200.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const h = require('./helpers/pgHarness.cjs');
(async () => {
  const env = await h.start(); const q = (...a) => env.pool.query(...a);
  const log = console.log;
  try {
    // Apply the shipped migration (validates it executes; harness schema predates the column)
    const mig = fs.readFileSync(path.join(__dirname, '..', 'ops', 'proposals', 'customer_visibility_mode.sql'), 'utf8').split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    for (const stmt of mig.split(';').map(s => s.trim()).filter(s => /^(ALTER|CREATE|INSERT|UPDATE)\b/i.test(s))) {
      await q(stmt);
    }
    log('PASS migration applies');

    const T = (await q("INSERT INTO tenants(name,slug,template_name) VALUES('t1','t1','real_estate') RETURNING id")).rows[0].id;
    const B = (await q("INSERT INTO branches(name,tenant_id) VALUES('b',$1) RETURNING id", [T])).rows[0].id;
    const D = (await q("INSERT INTO departments(name,tenant_id) VALUES('d',$1) RETURNING id", [T])).rows[0].id;
    const mkU = async (name, role, dept) => (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id,department_id) VALUES($1,$2,'x',$3,$4,$5,$6) RETURNING *", [name, name + '@x.io', role, T, B, dept])).rows[0];
    const repA = await mkU('repA', 'sales', null);
    const repB = await mkU('repB', 'sales', null);
    const mgr = await mkU('mgr', 'manager', null);           // team manager only, NO department
    const admin = await mkU('admin', 'admin', null);
    const team = (await q("INSERT INTO sales_teams(tenant_id,branch_id,department_id,name,manager_id) VALUES($1,$2,$3,'team',$4) RETURNING id", [T, B, D, mgr.id])).rows[0].id;
    await q("INSERT INTO sales_team_members(tenant_id,team_id,user_id) VALUES($1,$2,$3)", [T, team, repA.id]);
    const custs = require('../controllers/customersController');
    // tenantsController requires bcrypt (auth-only dep not needed here); stub it in the harness
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === 'bcrypt') return { hash: async () => 'x', compare: async () => true };
      return origLoad.apply(this, arguments);
    };
    const tenants = require('../controllers/tenantsController');
    Module._load = origLoad;
    const asReq = (u, params = {}) => ({ user: { ...u, tenant_id: T }, branchId: B, body: {}, params, query: {}, headers: {}, ip: '127.0.0.1' });
    const call = async (fn, req) => { const r = h.mockRes(); await fn(req, r); return r; };
    const mkCust = async (name, owner) => (await q("INSERT INTO customers(name,tenant_id,branch_id,assigned_to) VALUES($1,$2,$3,$4) RETURNING id", [name, T, B, owner])).rows[0].id;
    const cA = await mkCust('cust-A', repA.id), cB = await mkCust('cust-B', repB.id), cUn = await mkCust('cust-unassigned', null);

    // 1. SCOPED (default): rep detail on other rep's customer = 404 on all three routes (the leak)
    { const g = await call(custs.getCustomerById, asReq(repA, { id: String(cB) }));
      assert.equal(g.statusCode, 404, 'scoped: rep detail cross-owner must 404, got ' + g.statusCode);
      const g360 = await call(custs.getCustomer360, asReq(repA, { id: String(cB) }));
      assert.equal(g360.statusCode, 404, 'scoped: rep 360 cross-owner must 404');
      const gSt = await call(custs.getCustomerStatement, asReq(repA, { id: String(cB) }));
      assert.equal(gSt.statusCode, 404, 'scoped: rep statement cross-owner must 404'); }
    log('PASS scoped: cross-owner detail/360/statement all 404');

    // 2. SCOPED: rep own customer still 200; list shows own, hides other
    { const g = await call(custs.getCustomerById, asReq(repA, { id: String(cA) }));
      assert.equal(g.statusCode, 200, 'scoped: own customer must be 200: ' + JSON.stringify(g.body));
      const r = await call(custs.getCustomers, asReq(repA));
      const ids = r.body.data.map(x => x.id);
      assert.ok(ids.includes(cA), 'scoped list: own customer visible');
      assert.ok(!ids.includes(cB), 'scoped list: other rep customer hidden'); }
    log('PASS scoped: own customer 200, list hides other reps');

    // 3. SCOPED: team-only manager sees managed member's customer, not outsider's
    { const gA = await call(custs.getCustomerById, asReq(mgr, { id: String(cA) }));
      assert.equal(gA.statusCode, 200, 'manager detail on member customer must be 200');
      const gB = await call(custs.getCustomerById, asReq(mgr, { id: String(cB) }));
      assert.equal(gB.statusCode, 404, 'manager detail on outsider customer must 404');
      const r = await call(custs.getCustomers, asReq(mgr));
      const ids = r.body.data.map(x => x.id);
      assert.ok(ids.includes(cA) && !ids.includes(cB), 'manager list: member visible, outsider hidden'); }
    log('PASS scoped: team manager wiring consistent (list + detail)');

    // 4. SCOPED: admin reads any customer
    { const g = await call(custs.getCustomerById, asReq(admin, { id: String(cB) }));
      assert.equal(g.statusCode, 200, 'admin must read any customer in scoped mode'); }
    log('PASS scoped: admin unaffected');

    // 5. SHARED: everyone reads all customers (list + detail)
    { await q("UPDATE tenants SET customer_visibility_mode='shared' WHERE id=$1", [T]);
      const g = await call(custs.getCustomerById, asReq(repA, { id: String(cB) }));
      assert.equal(g.statusCode, 200, 'shared: cross-owner detail must be 200');
      const r = await call(custs.getCustomers, asReq(repA));
      const ids = r.body.data.map(x => x.id);
      assert.ok(ids.includes(cA) && ids.includes(cB) && ids.includes(cUn), 'shared list: all customers visible'); }
    log('PASS shared: cross-owner detail 200, list unscoped');

    // 6. Admin setting endpoints: validation + persistence + non-admin block
    { await q("UPDATE tenants SET customer_visibility_mode='scoped' WHERE id=$1", [T]);
      const bad = await call(tenants.updateCustomerVisibility, { ...asReq(admin), body: { customer_visibility_mode: 'bogus' } });
      assert.equal(bad.statusCode, 400, 'invalid mode must 400');
      const denied = await call(tenants.updateCustomerVisibility, { ...asReq(repA), body: { customer_visibility_mode: 'shared' } });
      assert.equal(denied.statusCode, 403, 'non-admin must 403');
      const ok = await call(tenants.updateCustomerVisibility, { ...asReq(admin), body: { customer_visibility_mode: 'shared' } });
      assert.equal(ok.statusCode, 200, 'admin set must 200: ' + JSON.stringify(ok.body));
      const got = await call(tenants.getCustomerVisibility, asReq(admin));
      assert.equal(got.body.data.customer_visibility_mode, 'shared', 'GET must reflect saved mode');
      await q("UPDATE tenants SET customer_visibility_mode='scoped' WHERE id=$1", [T]); }
    log('PASS admin setting endpoints: 400 invalid, 403 non-admin, persist + readback');

    // 7. SCOPED writes (reviewer blocker): repA PUT/DELETE on repB's customer = 404, row untouched;
    //    owner and admin still write; shared mode allows cross-owner write
    { await q("UPDATE tenants SET customer_visibility_mode='scoped' WHERE id=$1", [T]);
      const asReqBody = (u, params, body) => ({ user: { ...u, tenant_id: T }, branchId: B, body, params, query: {}, headers: {}, ip: '127.0.0.1' });
      const put = await call(custs.updateCustomer, asReqBody(repA, { id: String(cB) }, { name: 'HACKED', phone: '000' }));
      assert.equal(put.statusCode, 404, 'scoped: cross-owner PUT must 404, got ' + put.statusCode);
      const del = await call(custs.deleteCustomer, asReqBody(repA, { id: String(cB) }, {}));
      assert.equal(del.statusCode, 404, 'scoped: cross-owner DELETE must 404, got ' + del.statusCode);
      const row = (await q('SELECT name, phone FROM customers WHERE id=$1', [cB])).rows[0];
      assert.equal(row.name, 'cust-B', 'blocked PUT must not change the row');
      const ownPut = await call(custs.updateCustomer, asReqBody(repB, { id: String(cB) }, { name: 'cust-B2' }));
      assert.equal(ownPut.statusCode, 200, 'owner PUT must 200: ' + JSON.stringify(ownPut.body).slice(0, 200));
      const adminPut = await call(custs.updateCustomer, asReqBody(admin, { id: String(cB) }, { name: 'cust-B' }));
      assert.equal(adminPut.statusCode, 200, 'admin PUT must 200');
      const cTmp = await mkCust('cust-tmp', repB.id);
      const adminDel = await call(custs.deleteCustomer, asReqBody(admin, { id: String(cTmp) }, {}));
      assert.equal(adminDel.statusCode, 200, 'admin DELETE must 200');
      await q("UPDATE tenants SET customer_visibility_mode='shared' WHERE id=$1", [T]);
      const sharedPut = await call(custs.updateCustomer, asReqBody(repA, { id: String(cB) }, { name: 'cust-B', phone: '111' }));
      assert.equal(sharedPut.statusCode, 200, 'shared: cross-owner PUT must 200');
      await q("UPDATE tenants SET customer_visibility_mode='scoped' WHERE id=$1", [T]); }
    log('PASS scoped writes: cross-owner PUT/DELETE 404 + row untouched, owner/admin OK, shared allows');

    console.log('ALL CUSTOMER VISIBILITY TESTS PASSED');
  } finally { await env.stop(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
