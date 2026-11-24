'use strict';
const assert = require('assert/strict');
const h = require('./helpers/pgHarness.cjs');
(async () => {
  const env = await h.start(); const q = (...a) => env.pool.query(...a); const log = console.log;
  try {
    const T = (await q("INSERT INTO tenants(name,slug) VALUES('t1','t1') RETURNING id")).rows[0].id;
    const T2 = (await q("INSERT INTO tenants(name,slug) VALUES('t2','t2') RETURNING id")).rows[0].id;
    const B = (await q("INSERT INTO branches(name,tenant_id) VALUES('b',$1) RETURNING id", [T])).rows[0].id;
    const D = (await q("INSERT INTO departments(name,tenant_id) VALUES('d',$1) RETURNING id", [T])).rows[0].id;
    const mk = async (n, role, t = T) => (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id,department_id) VALUES($1,$2,'x',$3,$4,$5,$6) RETURNING *", [n, n + '@x.io', role, t, t === T ? B : null, t === T ? D : null])).rows[0];
    const admin = await mk('admin', 'admin'), a = await mk('a', 'employee'), b = await mk('b', 'employee'), mgr = await mk('mgr', 'employee'), other = await mk('o', 'admin', T2);
    const team = (await q("INSERT INTO sales_teams(tenant_id,branch_id,department_id,name,manager_id) VALUES($1,$2,$3,'T',$4) RETURNING id", [T, B, D, mgr.id])).rows[0].id;
    await q("INSERT INTO sales_team_members(tenant_id,team_id,user_id) VALUES($1,$2,$3),($1,$2,$4)", [T, team, a.id, b.id]);
    const deal = (await q("INSERT INTO deals(title,tenant_id,branch_id,assigned_team_id) VALUES('d',$1,$2,$3) RETURNING *", [T, B, team])).rows[0];
    const act = require('../controllers/activityController'), h2 = (u, body, params, query = {}) => ({ user: u, branchId: u.branch_id, body, params, query });
    const call = async (fn, req) => { const r = h.mockRes(); await fn(req, r); return r; };
    for (const [u, action, n] of [[a, 'called', 3], [a, 'whatsapp', 2], [b, 'called', 1]]) for (let i = 0; i < n; i++) {
      const r = await call(act.createActivity, h2(u, { action, note: 'x' }, { entity_type: 'deal', entity_id: String(deal.id) })); assert.equal(r.statusCode, 201, JSON.stringify(r.body)); }
    // non-manual system row must not count
    await q("INSERT INTO activities(tenant_id,user_id,entity_type,entity_id,action,meta) VALUES($1,$2,'deal',$3,'called','{}')", [String(T), a.id, String(deal.id)]);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }), q0 = { from: today, to: today };
    let r = await call(act.getDealActivityReport, h2(admin, {}, {}, q0)); assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    const byName = Object.fromEntries(r.body.data.map(x => [x.user_name, x])); assert.equal(byName.a.by_action.called, 3); assert.equal(byName.a.by_action.whatsapp, 2); assert.equal(byName.a.total, 5); assert.equal(byName.b.total, 1);
    log('PASS counts per employee, manual logs only');
    r = await call(act.getDealActivityReport, h2(a, {}, {}, q0)); assert.deepEqual(r.body.data.map(x => x.user_name), ['a'], 'employee sees only self');
    r = await call(act.getDealActivityReport, h2(mgr, {}, {}, q0)); assert.deepEqual(r.body.data.map(x => x.user_name).sort(), ['a', 'b'], 'team manager sees their team'); log('PASS scope: self / team manager');
    r = await call(act.getDealActivityReport, h2(admin, {}, {}, { ...q0, user_id: String(b.id) })); assert.deepEqual(r.body.data.map(x => x.user_name), ['b']);
    r = await call(act.getDealActivityReport, h2(other, {}, {}, q0)); assert.equal(r.body.data.length, 0, 'tenant isolation');
    r = await call(act.getDealActivityReport, h2(admin, {}, {}, { from: '2020-01-01', to: '2020-01-02' })); assert.equal(r.body.data.length, 0);
    r = await call(act.getDealActivityReport, h2(admin, {}, {}, { from: 'x', to: today })); assert.equal(r.statusCode, 400);
    r = await call(act.getDealActivityReport, h2(admin, {}, {}, { ...q0, team_id: 'abc' })); assert.equal(r.statusCode, 400);
    // visit log must not make actor owner of a team-only deal
    await call(act.createActivity, h2(a, { action: 'visited', note: 'v' }, { entity_type: 'deal', entity_id: String(deal.id) }));
    assert.equal((await q('SELECT assigned_to FROM deals WHERE id=$1', [deal.id])).rows[0].assigned_to, null); log('PASS filters, period validation, no actor auto-ownership on visit');
    log('ALL ACTIVITY REPORT TESTS PASSED');
  } finally { await env.stop(); }
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; });
