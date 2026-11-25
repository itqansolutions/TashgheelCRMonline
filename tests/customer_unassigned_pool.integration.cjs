'use strict';
const assert = require('assert/strict');
const h = require('./helpers/pgHarness.cjs');
(async () => {
  const env = await h.start(); const q = (...a) => env.pool.query(...a); const log = console.log;
  try {
    const T = (await q("INSERT INTO tenants(name,slug) VALUES('t1','t1') RETURNING id")).rows[0].id;
    const B = (await q("INSERT INTO branches(name,tenant_id) VALUES('b',$1) RETURNING id", [T])).rows[0].id;
    const admin = (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id) VALUES('a','a@x.io','x','admin',$1,$2) RETURNING *", [T, B])).rows[0];
    const colType = (await q("SELECT data_type FROM information_schema.columns WHERE table_name='customers' AND column_name='manager_id'")).rows[0];
    log('customers.manager_id type:', colType && colType.data_type);
    const mk = async (n, owner, mgr) => (await q("INSERT INTO customers(name,tenant_id,branch_id,assigned_to,manager_id,status) VALUES($1,$2,$3,$4,$5,'lead') RETURNING id", [n, T, B, owner, mgr])).rows[0].id;
    const free = await mk('ownerless', null, null);          // case 1: no owner, no manager -> in pool
    const ownerOnly = await mk('owner-no-manager', admin.id, null); // case 2: owned, manager NULL -> NOT in pool (the 7444 bug)
    const mgrOnly = await mk('manager-no-owner', null, admin.id);   // case 3: no owner, manager override set -> still ownerless, in pool
    const customers = require('../controllers/customersController');
    const r = h.mockRes(); await customers.getCustomers({ user: admin, branchId: B, query: { unassigned: 'true', limit: '50' }, body: {}, params: {} }, r);
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    const ids = (r.body.data || []).map(x => x.id).sort((a, b) => a - b); assert.deepEqual(ids, [free, mgrOnly].sort((a, b) => a - b)); assert(!ids.includes(ownerOnly));
    log('PASS unassigned=true means assigned_to IS NULL (3 cases); owned customer with NULL manager is not in the pool');
    // bulk assign (the hub's execute button): must work against a users table that has no is_active column
    const usersCols = (await q("SELECT column_name FROM information_schema.columns WHERE table_name='users'")).rows.map(x => x.column_name);
    log('users has is_active column:', usersCols.includes('is_active'));
    const D = (await q("INSERT INTO departments(name,tenant_id) VALUES('d',$1) RETURNING id", [T])).rows[0].id;
    const rep = (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id,department_id) VALUES('rep','rep@x.io','x','employee',$1,$2,$3) RETURNING *", [T, B, D])).rows[0];
    const team = (await q("INSERT INTO sales_teams(tenant_id,branch_id,department_id,name,manager_id) VALUES($1,$2,$3,'Team1',$4) RETURNING id", [T, B, D, admin.id])).rows[0].id;
    await q("INSERT INTO sales_team_members(tenant_id,team_id,user_id) VALUES($1,$2,$3)", [T, team, rep.id]);
    const r2 = h.mockRes(); await customers.bulkAssignLeads({ user: admin, branchId: B, headers: {}, query: {}, params: {}, body: { customer_ids: [free], team_id: team, distribution_method: 'round_robin' } }, r2);
    assert.equal(r2.statusCode, 200, JSON.stringify(r2.body)); assert.equal(r2.body.assigned_count, 1);
    assert.equal(String((await q('SELECT assigned_to FROM customers WHERE id=$1', [free])).rows[0].assigned_to), String(rep.id));
    assert.equal((await q('SELECT manager_id FROM customers WHERE id=$1', [free])).rows[0].manager_id, null);
    const r3 = h.mockRes(); await customers.getCustomers({ user: admin, branchId: B, query: { unassigned: 'true', limit: '50' }, body: {}, params: {} }, r3);
    assert(!(r3.body.data || []).some(x => x.id === free)); assert.equal((await q('SELECT manager_id FROM customers WHERE id=$1', [mgrOnly])).rows[0].manager_id, admin.id);
    log('PASS distributed customer leaves the pool, manager_id untouched, unrelated manager override untouched');
    log('PASS bulk-assign to a team assigns the lead (no users.is_active dependency)');
    log('ALL PASS');
  } finally { await env.stop(); }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
