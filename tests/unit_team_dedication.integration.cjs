'use strict';
// Isolated synthetic Postgres only (tests/helpers/pgHarness.cjs). Never touches a live DB.
// Units team dedication (Ali 2026-11-25, permissions package item 5):
// re_units.assigned_team_id dedicates a unit to a sales team: visible to that team's
// active members + manager/leader + admin. No employee and no team => shared.
// BOTH employee and team set => the employee wins (most specific).
// Fail-on-base: at base, the column does not exist and any rep sees every unit.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const h = require('./helpers/pgHarness.cjs');
(async () => {
  const env = await h.start(); const q = (...a) => env.pool.query(...a);
  const log = console.log;
  try {
    // Apply the shipped migration (validates it executes; harness schema predates the column)
    const mig = fs.readFileSync(path.join(__dirname, '..', 'ops', 'proposals', 're_units_team_dedication.sql'), 'utf8').split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    for (const stmt of mig.split(';').map(s => s.trim()).filter(s => /^(ALTER|CREATE|INSERT|UPDATE)\b/i.test(s))) {
      await q(stmt);
    }
    log('PASS migration applies');

    const T = (await q("INSERT INTO tenants(name,slug,template_name) VALUES('t1','t1','real_estate') RETURNING id")).rows[0].id;
    const B = (await q("INSERT INTO branches(name,tenant_id) VALUES('b',$1) RETURNING id", [T])).rows[0].id;
    const D = (await q("INSERT INTO departments(name,tenant_id) VALUES('d',$1) RETURNING id", [T])).rows[0].id;
    const mkU = async (name, role, dept) => (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id,department_id) VALUES($1,$2,'x',$3,$4,$5,$6) RETURNING *", [name, name + '@x.io', role, T, B, dept])).rows[0];
    const repA = await mkU('repA', 'sales', null);   // member of team1
    const repB = await mkU('repB', 'sales', null);   // member of team2
    const mgr1 = await mkU('mgr1', 'manager', null); // manager of team1
    const admin = await mkU('admin', 'admin', null);
    const team1 = (await q("INSERT INTO sales_teams(tenant_id,branch_id,department_id,name,manager_id) VALUES($1,$2,$3,'team1',$4) RETURNING id", [T, B, D, mgr1.id])).rows[0].id;
    const team2 = (await q("INSERT INTO sales_teams(tenant_id,branch_id,department_id,name,manager_id) VALUES($1,$2,$3,'team2',$4) RETURNING id", [T, B, D, mgr1.id])).rows[0].id;
    await q("INSERT INTO sales_team_members(tenant_id,team_id,user_id) VALUES($1,$2,$3)", [T, team1, repA.id]);
    await q("INSERT INTO sales_team_members(tenant_id,team_id,user_id) VALUES($1,$2,$3)", [T, team2, repB.id]);
    const units = require('../controllers/reUnitsController');
    const asReq = (u, params = {}, query = {}, body = {}) => ({ user: { ...u, tenant_id: T }, branchId: B, body, params, query, headers: {}, ip: '127.0.0.1' });
    const call = async (fn, req) => { const r = h.mockRes(); await fn(req, r); return r; };
    const mkUnit = async (name, owner, teamId) => (await q("INSERT INTO re_units(tenant_id,branch_id,name,unit_number,price,transaction_type,status,assigned_to,assigned_team_id) VALUES($1,$2,$3,$3,100000,'sale','Available',$4,$5) RETURNING id", [String(T), String(B), name, owner, teamId])).rows[0].id;
    const uT1 = await mkUnit('unit-team1', null, team1);          // team-dedicated to team1
    const uT2 = await mkUnit('unit-team2', null, team2);          // team-dedicated to team2
    const uBoth = await mkUnit('unit-both', repB.id, team1);      // employee AND team set: employee wins
    const uOpen = await mkUnit('unit-open', null, null);          // shared

    // 1. Team member sees his team's unit, NOT the other team's
    { const r = await call(units.getUnits, asReq(repA));
      assert.equal(r.statusCode, 200, JSON.stringify(r.body).slice(0, 200));
      const ids = r.body.data.map(x => String(x.id));
      assert.ok(ids.includes(String(uT1)), 'repA (team1 member) must see team1 unit');
      assert.ok(ids.includes(String(uOpen)), 'repA must see shared unit');
      assert.ok(!ids.includes(String(uT2)), 'repA must NOT see team2 unit');
      const g1 = await call(units.getUnitById, asReq(repA, { id: String(uT1) }));
      assert.equal(g1.statusCode, 200, 'member detail on team unit must be 200');
      const g2 = await call(units.getUnitById, asReq(repA, { id: String(uT2) }));
      assert.equal(g2.statusCode, 404, 'member detail on other team unit must 404'); }
    log('PASS team member: own team visible, other team 404');

    // 2. Employee wins over team: uBoth is dedicated to repB AND team1 - repA (team1) must NOT see it, repB must
    { const gA = await call(units.getUnitById, asReq(repA, { id: String(uBoth) }));
      assert.equal(gA.statusCode, 404, 'employee+team: team member must NOT see it (employee wins)');
      const gB = await call(units.getUnitById, asReq(repB, { id: String(uBoth) }));
      assert.equal(gB.statusCode, 200, 'employee+team: the employee must see it'); }
    log('PASS employee wins over team when both set');

    // 3. Team manager sees team-dedicated units of teams he manages
    { const g1 = await call(units.getUnitById, asReq(mgr1, { id: String(uT1) }));
      assert.equal(g1.statusCode, 200, 'manager must see his team unit');
      const g2 = await call(units.getUnitById, asReq(mgr1, { id: String(uT2) }));
      assert.equal(g2.statusCode, 200, 'manager manages team2 as well, must see it'); }
    log('PASS team manager visibility');

    // 4. Admin sees everything
    { const r = await call(units.getUnits, asReq(admin));
      const ids = r.body.data.map(x => String(x.id));
      assert.ok([uT1, uT2, uBoth, uOpen].every(u => ids.includes(String(u))), 'admin sees all'); }
    log('PASS admin unaffected');

    // 5. Assignment surface: PUT assigned_team_id validates and persists; bogus team 400s
    { const bad = await call(units.updateUnit, asReq(admin, { id: String(uOpen) }, {}, { assigned_team_id: 999999 }));
      assert.equal(bad.statusCode, 400, 'unknown team must 400: ' + JSON.stringify(bad.body).slice(0, 150));
      const ok = await call(units.updateUnit, asReq(admin, { id: String(uOpen) }, {}, { assigned_team_id: team1 }));
      assert.equal(ok.statusCode, 200, 'valid team assignment must 200: ' + JSON.stringify(ok.body).slice(0, 150));
      const row = (await q('SELECT assigned_team_id FROM re_units WHERE id=$1', [uOpen])).rows[0];
      assert.equal(Number(row.assigned_team_id), Number(team1), 'team dedication persisted');
      const cleared = await call(units.updateUnit, asReq(admin, { id: String(uOpen) }, {}, { assigned_team_id: '' }));
      assert.equal(cleared.statusCode, 200, 'clearing team dedication must 200');
      const row2 = (await q('SELECT assigned_team_id FROM re_units WHERE id=$1', [uOpen])).rows[0];
      assert.equal(row2.assigned_team_id, null, 'team dedication cleared'); }
    log('PASS assignment endpoint: validate, persist, clear');

    console.log('ALL UNIT TEAM DEDICATION TESTS PASSED');
  } finally { await env.stop(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
