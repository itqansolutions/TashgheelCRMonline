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
    const mk = async (n, mgr) => (await q("INSERT INTO customers(name,tenant_id,branch_id,assigned_to,manager_id,status) VALUES($1,$2,$3,$4,$5,'lead') RETURNING id", [n, T, B, admin.id, mgr])).rows[0].id;
    const free = await mk('free', null); await mk('managed', admin.id);
    const customers = require('../controllers/customersController');
    const r = h.mockRes(); await customers.getCustomers({ user: admin, branchId: B, query: { unassigned: 'true', limit: '50' }, body: {}, params: {} }, r);
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    const ids = (r.body.data || []).map(x => x.id); assert.deepEqual(ids, [free]);
    log('PASS unassigned=true returns only manager_id NULL customers (no integer cast error)');
    log('ALL PASS');
  } finally { await env.stop(); }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
