'use strict';
// Regression: bulkAssignLeads must never assign to a disabled rep (users.is_working=false), in team and direct mode.
const assert = require('assert/strict');
const h = require('./helpers/pgHarness.cjs');
(async () => {
  const env = await h.start(); const q = (...a) => env.pool.query(...a); const log = console.log;
  try {
    const T = (await q("INSERT INTO tenants(name,slug) VALUES('t','t') RETURNING id")).rows[0].id;
    const B = (await q("INSERT INTO branches(name,tenant_id) VALUES('b',$1) RETURNING id", [T])).rows[0].id;
    const D = (await q("INSERT INTO departments(name,tenant_id) VALUES('d',$1) RETURNING id", [T])).rows[0].id;
    const admin = (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id) VALUES('a','a@x.io','x','admin',$1,$2) RETURNING *", [T, B])).rows[0];
    const off = (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id,department_id,is_working) VALUES('off','o@x.io','x','employee',$1,$2,$3,false) RETURNING *", [T, B, D])).rows[0];
    const on = (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id,department_id,is_working) VALUES('on','n@x.io','x','employee',$1,$2,$3,true) RETURNING *", [T, B, D])).rows[0];
    const team = (await q("INSERT INTO sales_teams(tenant_id,branch_id,department_id,name,manager_id) VALUES($1,$2,$3,'T',$4) RETURNING id", [T, B, D, admin.id])).rows[0].id;
    await q("INSERT INTO sales_team_members(tenant_id,team_id,user_id) VALUES($1,$2,$3),($1,$2,$4)", [T, team, off.id, on.id]);
    const mk = async (n) => (await q("INSERT INTO customers(name,tenant_id,branch_id,status) VALUES($1,$2,$3,'lead') RETURNING id", [n, T, B])).rows[0].id;
    const cu = require('../controllers/customersController');
    const call = async (body) => { const r = h.mockRes(); await cu.bulkAssignLeads({ user: admin, branchId: B, headers: {}, query: {}, params: {}, body }, r); return r; };
    const owner = async (id) => (await q('SELECT assigned_to FROM customers WHERE id=$1', [id])).rows[0].assigned_to;
    // direct: disabled target refused, owner unchanged
    const c1 = await mk('c1'); let r = await call({ customer_ids: [c1], target_user_id: off.id });
    assert.equal(r.statusCode, 422, JSON.stringify(r.body)); assert.equal(await owner(c1), null);
    log('PASS direct assign to disabled rep refused');
    // team: every lead goes to the enabled member only, across several leads and both methods
    const ids = [await mk('t1'), await mk('t2'), await mk('t3')];
    r = await call({ customer_ids: ids, team_id: team, distribution_method: 'round_robin' });
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    for (const id of ids) assert.equal(String(await owner(id)), String(on.id));
    log('PASS team distribution skips the disabled member');
    // team with only disabled member: refused, nothing written
    await q("UPDATE users SET is_working=false WHERE id=$1", [on.id]);
    const c2 = await mk('c2'); r = await call({ customer_ids: [c2], team_id: team, distribution_method: 'least_loaded' });
    assert.equal(r.statusCode, 422, JSON.stringify(r.body)); assert.equal(await owner(c2), null);
    log('PASS team with no working member refused, no write');
    log('ALL PASS');
  } finally { await env.stop(); }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
