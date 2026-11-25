'use strict';
// Isolated synthetic Postgres only (tests/helpers/pgHarness.cjs). Never touches a live DB.
// Regression: sales-team manager/leader sees members' PERSONAL deals and customers
// (Ali 2026-11-25), not only team-owned deals. Fails on base f51ed01.
const assert = require('assert/strict');
const h = require('./helpers/pgHarness.cjs');
(async () => {
  const env = await h.start(); const q = (...a) => env.pool.query(...a);
  const log = console.log;
  try {
    const T = (await q("INSERT INTO tenants(name,slug,template_name) VALUES('t1','t1','real_estate') RETURNING id")).rows[0].id;
    const B = (await q("INSERT INTO branches(name,tenant_id) VALUES('b',$1) RETURNING id", [T])).rows[0].id;
    const D = (await q("INSERT INTO departments(name,tenant_id) VALUES('d',$1) RETURNING id", [T])).rows[0].id;
    const mkU = async (name, role, dept) => (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id,department_id) VALUES($1,$2,'x',$3,$4,$5,$6) RETURNING *", [name, name + '@x.io', role, T, B, dept])).rows[0];
    const mgr = await mkU('mgr', 'manager', null);          // team manager, NO department
    const a = await mkU('repA', 'sales', null);
    const b = await mkU('repB', 'sales', null);
    const c = await mkU('repC', 'sales', null);              // outside the team
    const admin = await mkU('admin', 'admin', null);
    const team = (await q("INSERT INTO sales_teams(tenant_id,branch_id,department_id,name,manager_id) VALUES($1,$2,$3,'team',$4) RETURNING id", [T, B, D, mgr.id])).rows[0].id;
    await q("INSERT INTO sales_team_members(tenant_id,team_id,user_id) VALUES($1,$2,$3),($1,$2,$4)", [T, team, a.id, b.id]);
    const deals = require('../controllers/dealsController');
    const custs = require('../controllers/customersController');
    const asReq = (u, query = {}, params = {}) => ({ user: { ...u, tenant_id: T }, branchId: B, body: {}, params, query, headers: {}, ip: '127.0.0.1' });
    const call = async (fn, req) => { const r = h.mockRes(); await fn(req, r); return r; };
    const mkDeal = async (title, owner, teamId = null) => (await q("INSERT INTO deals(tenant_id,branch_id,title,value,pipeline_stage,assigned_to,assigned_team_id) VALUES($1,$2,$3,1000,'Lead',$4,$5) RETURNING id", [T, B, title, owner, teamId])).rows[0].id;
    const mkCust = async (name, owner) => (await q("INSERT INTO customers(name,tenant_id,branch_id,assigned_to) VALUES($1,$2,$3,$4) RETURNING id", [name, T, B, owner])).rows[0].id;
    const dA = await mkDeal('deal-A', a.id), dB = await mkDeal('deal-B', b.id), dC = await mkDeal('deal-C', c.id);
    const dT = await mkDeal('deal-TEAM', null, team);
    const cA = await mkCust('cust-A', a.id), cC = await mkCust('cust-C', c.id);

    // 1. Team manager sees members' personal deals + team deals, NOT outsider's
    { const r = await call(deals.getDeals, asReq(mgr)); const ids = r.body.data.map(x => x.id);
      assert.equal(r.statusCode, 200, JSON.stringify(r.body));
      assert.ok(ids.includes(dA) && ids.includes(dB) && ids.includes(dT), 'manager must see members personal + team deals: ' + ids);
      assert.ok(!ids.includes(dC), 'manager must NOT see outsider deal');
      const gA = await call(deals.getDealById, asReq(mgr, {}, { id: String(dA) }));
      assert.equal(gA.statusCode, 200, 'manager detail on member deal: ' + JSON.stringify(gA.body));
      const gC = await call(deals.getDealById, asReq(mgr, {}, { id: String(dC) }));
      assert.equal(gC.statusCode, 404, 'manager detail on outsider deal must 404'); }
    log('PASS team manager sees members personal deals (list+detail), outsider 404');

    // 2. Team manager sees members' customers, NOT outsider's
    { const r = await call(custs.getCustomers, asReq(mgr)); const ids = r.body.data.map(x => x.id);
      assert.equal(r.statusCode, 200, JSON.stringify(r.body));
      assert.ok(ids.includes(cA), 'manager must see member customer');
      assert.ok(!ids.includes(cC), 'manager must NOT see outsider customer'); }
    log('PASS team manager sees members customers (list)');

    // 3. Plain member still sees only own personal + team deals (unchanged)
    { const r = await call(deals.getDeals, asReq(a)); const ids = r.body.data.map(x => x.id);
      assert.ok(ids.includes(dA) && ids.includes(dT) && !ids.includes(dB) && !ids.includes(dC), 'member scope unchanged: ' + ids); }
    log('PASS plain member scope unchanged');

    // 4. Inactive membership drops visibility
    { await q('UPDATE sales_team_members SET is_active=false WHERE team_id=$1 AND user_id=$2', [team, b.id]);
      const r = await call(deals.getDeals, asReq(mgr)); const ids = r.body.data.map(x => x.id);
      assert.ok(!ids.includes(dB), 'inactive member records must drop out');
      assert.ok(ids.includes(dA) && ids.includes(dT));
      await q('UPDATE sales_team_members SET is_active=true WHERE team_id=$1 AND user_id=$2', [team, b.id]); }
    log('PASS inactive membership drops visibility');

    // 5. Admin unchanged
    { const r = await call(deals.getDeals, asReq(admin)); assert.ok(r.body.data.length >= 4); }
    log('PASS admin sees all');

    console.log('ALL TEAM MANAGER SCOPE TESTS PASSED');
  } finally { await env.stop(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
