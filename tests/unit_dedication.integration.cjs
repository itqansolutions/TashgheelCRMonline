'use strict';
// Isolated synthetic Postgres only (tests/helpers/pgHarness.cjs). Never touches a live DB.
// Unit dedication visibility (Ali 2026-11-25, permissions package item 2):
// a unit dedicated to an employee (re_units.assigned_to) is visible only to that employee,
// that employee's managers (managed sales team / department), and admin.
// Unassigned units (NULL or '') stay shared. Detail reads 404 like deals.
// Fail-on-base: at base f51ed01 any rep sees every unit (list + detail 200).
const assert = require('assert/strict');
const h = require('./helpers/pgHarness.cjs');
(async () => {
  const env = await h.start(); const q = (...a) => env.pool.query(...a);
  const log = console.log;
  try {
    // Team-dedication column ships in the same package; apply it so the predicate resolves
    const fs = require('fs'); const path = require('path');
    const mig = fs.readFileSync(path.join(__dirname, '..', 'ops', 'proposals', 're_units_team_dedication.sql'), 'utf8').split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    for (const stmt of mig.split(';').map(s => s.trim()).filter(s => /^(ALTER|CREATE|INSERT|UPDATE)\b/i.test(s))) {
      await q(stmt);
    }
    const T = (await q("INSERT INTO tenants(name,slug,template_name) VALUES('t1','t1','real_estate') RETURNING id")).rows[0].id;
    const B = (await q("INSERT INTO branches(name,tenant_id) VALUES('b',$1) RETURNING id", [T])).rows[0].id;
    const D = (await q("INSERT INTO departments(name,tenant_id) VALUES('d',$1) RETURNING id", [T])).rows[0].id;
    const mkU = async (name, role, dept) => (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id,department_id) VALUES($1,$2,'x',$3,$4,$5,$6) RETURNING *", [name, name + '@x.io', role, T, B, dept])).rows[0];
    const repA = await mkU('repA', 'sales', null);
    const repB = await mkU('repB', 'sales', null);
    const mgr = await mkU('mgr', 'manager', null);            // team manager of repA only, NO department
    const admin = await mkU('admin', 'admin', null);
    const team = (await q("INSERT INTO sales_teams(tenant_id,branch_id,department_id,name,manager_id) VALUES($1,$2,$3,'team',$4) RETURNING id", [T, B, D, mgr.id])).rows[0].id;
    await q("INSERT INTO sales_team_members(tenant_id,team_id,user_id) VALUES($1,$2,$3)", [T, team, repA.id]);
    const units = require('../controllers/reUnitsController');
    const asReq = (u, params = {}, query = {}) => ({ user: { ...u, tenant_id: T }, branchId: B, body: {}, params, query, headers: {}, ip: '127.0.0.1' });
    const call = async (fn, req) => { const r = h.mockRes(); await fn(req, r); return r; };
    const mkUnit = async (name, owner) => (await q("INSERT INTO re_units(tenant_id,branch_id,name,unit_number,price,transaction_type,status,assigned_to) VALUES($1,$2,$3,$3,100000,'sale','Available',$4) RETURNING id", [String(T), String(B), name, owner])).rows[0].id;
    const uA = await mkUnit('unit-A', repA.id);
    const uB = await mkUnit('unit-B', repB.id);
    const uUn = await mkUnit('unit-unassigned', null);
    const uEmpty = await mkUnit('unit-emptystr', '');

    // 1. repA list: own dedicated + unassigned units; NOT repB's dedicated unit
    { const r = await call(units.getUnits, asReq(repA));
      assert.equal(r.statusCode, 200, JSON.stringify(r.body).slice(0, 200));
      const ids = r.body.data.map(x => String(x.id));
      assert.ok(ids.includes(String(uA)), 'repA must see own dedicated unit');
      assert.ok(ids.includes(String(uUn)) && ids.includes(String(uEmpty)), 'repA must see unassigned units (NULL and empty)');
      assert.ok(!ids.includes(String(uB)), 'repA must NOT see repB dedicated unit'); }
    log('PASS rep list: own + unassigned only');

    // 2. repA detail on repB's unit = 404; own + unassigned = 200
    { const gB = await call(units.getUnitById, asReq(repA, { id: String(uB) }));
      assert.equal(gB.statusCode, 404, 'cross-owner unit detail must 404, got ' + gB.statusCode);
      const gA = await call(units.getUnitById, asReq(repA, { id: String(uA) }));
      assert.equal(gA.statusCode, 200, 'own unit detail must be 200');
      const gU = await call(units.getUnitById, asReq(repA, { id: String(uUn) }));
      assert.equal(gU.statusCode, 200, 'unassigned unit detail must be 200'); }
    log('PASS rep detail: cross-owner 404, own/unassigned 200');

    // 3. Team manager of repA: sees repA's unit, NOT repB's (repB is not in his team)
    { const gA = await call(units.getUnitById, asReq(mgr, { id: String(uA) }));
      assert.equal(gA.statusCode, 200, 'manager must see managed member unit');
      const gB = await call(units.getUnitById, asReq(mgr, { id: String(uB) }));
      assert.equal(gB.statusCode, 404, 'manager must NOT see outsider unit');
      const r = await call(units.getUnits, asReq(mgr));
      const ids = r.body.data.map(x => String(x.id));
      assert.ok(ids.includes(String(uA)) && ids.includes(String(uUn)) && !ids.includes(String(uB)), 'manager list wiring'); }
    log('PASS team manager wiring consistent (list + detail)');

    // 4. Admin sees everything
    { const r = await call(units.getUnits, asReq(admin));
      const ids = r.body.data.map(x => String(x.id));
      assert.ok(ids.includes(String(uA)) && ids.includes(String(uB)) && ids.includes(String(uUn)), 'admin sees all units'); }
    log('PASS admin unaffected');

    // 5. Unit events + overview also 404 cross-owner
    { const e = await call(units.getUnitEvents, asReq(repA, { id: String(uB) }));
      assert.equal(e.statusCode, 404, 'cross-owner unit events must 404');
      const o = await call(units.getUnitOverview, asReq(repA, { id: String(uB) }));
      assert.equal(o.statusCode, 404, 'cross-owner unit overview must 404');
      const e2 = await call(units.getUnitEvents, asReq(repA, { id: String(uA) }));
      assert.equal(e2.statusCode, 200, 'own unit events must be 200'); }
    log('PASS events/overview: cross-owner 404, own 200');

    // 6. Match-for-unit endpoint 404s on a unit dedicated to someone else
    { const m = await call(units.matchCustomersForUnit, asReq(repA, { unitId: String(uB) }));
      assert.equal(m.statusCode, 404, 'matchCustomersForUnit on invisible unit must 404'); }
    log('PASS match-for-unit: invisible unit 404');

    console.log('ALL UNIT DEDICATION TESTS PASSED');
  } finally { await env.stop(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
