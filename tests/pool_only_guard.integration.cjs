'use strict';
// Pool-only guard: bulkAssignLeads with only_if_unassigned=true must claim only rows still
// unassigned at write time (FOR UPDATE re-check), report skipped rows, and never disturb the
// concurrent winner's assignment. Flagless calls keep the existing overwrite (manual reassign).
const assert = require('assert/strict');
const h = require('./helpers/pgHarness.cjs');
const delay = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const env = await h.start();
  const q = (...a) => env.pool.query(...a);
  const log = console.log;
  try {
    const T = (await q("INSERT INTO tenants(name,slug) VALUES('t','t') RETURNING id")).rows[0].id;
    const B = (await q("INSERT INTO branches(name,tenant_id) VALUES('b',$1) RETURNING id", [T])).rows[0].id;
    const D = (await q("INSERT INTO departments(name,tenant_id) VALUES('d',$1) RETURNING id", [T])).rows[0].id;
    const admin = (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id) VALUES('a','a@x.io','x','admin',$1,$2) RETURNING *", [T, B])).rows[0];
    const repA = (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id,department_id,is_working) VALUES('ra','ra@x.io','x','employee',$1,$2,$3,true) RETURNING *", [T, B, D])).rows[0];
    const repB = (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id,department_id,is_working) VALUES('rb','rb@x.io','x','employee',$1,$2,$3,true) RETURNING *", [T, B, D])).rows[0];
    const team = (await q("INSERT INTO sales_teams(tenant_id,branch_id,department_id,name,manager_id) VALUES($1,$2,$3,'T',$4) RETURNING id", [T, B, D, admin.id])).rows[0].id;
    await q("INSERT INTO sales_team_members(tenant_id,team_id,user_id) VALUES($1,$2,$3),($1,$2,$4)", [T, team, repA.id, repB.id]);
    const mk = async (n, owner) => (await q("INSERT INTO customers(name,tenant_id,branch_id,status,assigned_to) VALUES($1,$2,$3,'lead',$4) RETURNING id", [n, T, B, owner || null])).rows[0].id;
    const cu = require('../controllers/customersController');
    const call = async (body) => { const r = h.mockRes(); await cu.bulkAssignLeads({ user: admin, branchId: B, headers: {}, query: {}, params: {}, body }, r); return r; };
    const owner = async (id) => (await q('SELECT assigned_to FROM customers WHERE id=$1', [id])).rows[0].assigned_to;

    // flagged direct call: ownerless rows claimed, owned row skipped with report
    const c1 = await mk('c1'); const c2 = await mk('c2'); const c3 = await mk('c3', repA.id);
    let r = await call({ customer_ids: [c1, c2, c3], target_user_id: repB.id, only_if_unassigned: true });
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.equal(r.body.assigned_count, 2);
    assert.equal(r.body.skipped_count, 1);
    assert.equal(r.body.skipped[0].customer_id, c3);
    assert.equal(String(await owner(c1)), String(repB.id));
    assert.equal(String(await owner(c3)), String(repA.id), 'owned row must keep its owner');
    log('PASS flagged direct: ownerless claimed, owned skipped and reported');

    // flagged team call: owned row not redistributed
    const c4 = await mk('c4'); const c5 = await mk('c5', repA.id);
    r = await call({ customer_ids: [c4, c5], team_id: team, distribution_method: 'least_loaded', only_if_unassigned: true });
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.equal(r.body.assigned_count, 1);
    assert.equal(r.body.skipped_count, 1);
    assert.equal(String(await owner(c5)), String(repA.id), 'team path must not overwrite owner');
    log('PASS flagged team: owned row skipped');

    // flagless manual reassignment still overwrites (existing behavior preserved)
    r = await call({ customer_ids: [c3], target_user_id: repB.id });
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.equal(String(await owner(c3)), String(repB.id), 'flagless reassign must still work');
    log('PASS flagless reassign preserved');

    // race: winner holds the row lock mid-write; flagged loser blocks, then skips
    const c6 = await mk('c6');
    const client = await env.pool.connect();
    let settled = false;
    try {
      await client.query('BEGIN');
      await client.query('UPDATE customers SET assigned_to=$1 WHERE id=$2', [repA.id, c6]);
      const p = call({ customer_ids: [c6], target_user_id: repB.id, only_if_unassigned: true })
        .then(res => { settled = true; return res; });
      await delay(300);
      assert.equal(settled, false, 'second writer must block on the winner row lock');
      await client.query('COMMIT');
      r = await p;
    } finally {
      client.release();
    }
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.equal(r.body.assigned_count, 0);
    assert.equal(r.body.skipped_count, 1);
    assert.equal(String(await owner(c6)), String(repA.id), 'winner assignment must stand');
    log('PASS race: loser blocked on lock then skipped, winner kept');

    // race without the flag: loser still overwrites after the lock releases (documented semantics)
    const c7 = await mk('c7');
    const client2 = await env.pool.connect();
    try {
      await client2.query('BEGIN');
      await client2.query('UPDATE customers SET assigned_to=$1 WHERE id=$2', [repA.id, c7]);
      const p = call({ customer_ids: [c7], target_user_id: repB.id });
      await delay(300);
      await client2.query('COMMIT');
      r = await p;
    } finally {
      client2.release();
    }
    assert.equal(String(await owner(c7)), String(repB.id));
    log('PASS flagless race: last writer wins (unchanged)');

    log('ALL PASS');
  } finally {
    await env.stop();
  }
})().catch(e => { console.error('FAIL', e && e.message ? e.message : e); process.exit(1); });
