'use strict';
// Isolated synthetic Postgres only (tests/helpers/pgHarness.cjs). Never touches a live DB.
const assert = require('assert/strict');
const h = require('./helpers/pgHarness.cjs');
(async () => {
  const env = await h.start(); const q = (...a) => env.pool.query(...a); await env.pool.query(require('fs').readFileSync(require('path').join(__dirname, '../ops/proposals/deal_price_workflow.sql'), 'utf8'));
  const log = console.log;
  try {
    const T = (await q("INSERT INTO tenants(name,slug) VALUES('t1','t1') RETURNING id")).rows[0].id;
    const B = (await q("INSERT INTO branches(name,tenant_id) VALUES('b',$1) RETURNING id", [T])).rows[0].id;
    const admin = (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id) VALUES('admin','a@x.io','x','admin',$1,$2) RETURNING *", [T, B])).rows[0];
    const cust = (await q("INSERT INTO customers(name,tenant_id,branch_id) VALUES('c1',$1,$2) RETURNING id", [T, B])).rows[0].id;
    const cust2 = (await q("INSERT INTO customers(name,tenant_id,branch_id) VALUES('c2',$1,$2) RETURNING id", [T, B])).rows[0].id;
    const mkUnit = async (n) => (await q("INSERT INTO re_units(tenant_id,name,unit_number,status,price) VALUES($1,$2,$2,'Available',1000000) RETURNING id", [T, n])).rows[0].id;
    const deals = require('../controllers/dealsController');
    const canc = require('../controllers/reCancellationsController');
    const asReq = (body = {}, params = {}, query = {}) => ({ user: { ...admin, tenant_id: T }, branchId: B, body, params, query, headers: {}, ip: '127.0.0.1' });
    const call = async (fn, req) => { const r = h.mockRes(); await fn(req, r); return r; };
    const mkDeal = async (title, unit, stage = 'Lead') => (await q("INSERT INTO deals(tenant_id,branch_id,title,value,pipeline_stage,client_id,assigned_to,unit_id) VALUES($1,$2,$3,1000000,$4,$5,$6,$7) RETURNING id", [T, B, title, stage, cust, admin.id, unit])).rows[0].id;
    const pay = async (id) => (await q("SELECT * FROM re_payments_mvp WHERE deal_id::text=$1", [String(id)])).rows;
    const logs = async (id, type) => (await q("SELECT action,details FROM system_logs WHERE entity_type=$1 AND entity_id=$2 ORDER BY id", [type, String(id)])).rows;

    // 1. Close via PUT creates exactly one Pending registry row; repeat PUT does not duplicate
    const u1 = await mkUnit('U1'); const d1 = await mkDeal('close-put', u1);
    let r = await call(deals.updateDeal, asReq({ pipeline_stage: 'Closed' }, { id: String(d1) })); assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    let p = await pay(d1); assert.equal(p.length, 1); assert.equal(p[0].status, 'Pending'); assert.equal(Number(p[0].total_amount), 1000000);
    r = await call(deals.updateDeal, asReq({ pipeline_stage: 'Closed' }, { id: String(d1) })); assert.equal((await pay(d1)).length, 1); log('PASS PUT close creates one Pending registry row, idempotent');
    // 2. Close via status endpoint: same result
    const u2 = await mkUnit('U2'); const d2 = await mkDeal('close-status', u2);
    r = await call(deals.updateDealStatus, asReq({ pipeline_stage: 'Closed' }, { id: String(d2) })); assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    p = await pay(d2); assert.equal(p.length, 1); assert.equal(p[0].status, 'Pending');
    log('PASS status close creates one Pending registry row (same shape as PUT)');
    // closed deal stays locked on both endpoints
    r = await call(deals.updateDealStatus, asReq({ pipeline_stage: 'Lead' }, { id: String(d1) })); assert.equal(r.statusCode, 409);
    r = await call(deals.updateDeal, asReq({ pipeline_stage: 'Lead' }, { id: String(d1) })); assert.equal(r.statusCode, 409); log('PASS closed deal still locked');

    // 3. Cancel: audit rows, same transaction, stage Lost
    const u3 = await mkUnit('U3'); const d3 = await mkDeal('cancel-me', u3);
    r = await call(canc.processCancellation, asReq({ deal_id: d3, cancellation_reason: 'test', deduction_amount: 0, unit_action: 'release' })); assert.equal(r.statusCode, 201, JSON.stringify(r.body));
    assert.equal((await q("SELECT pipeline_stage FROM deals WHERE id=$1", [d3])).rows[0].pipeline_stage, 'Lost');
    const dl = await logs(d3, 'Deal'); assert.equal(dl.length, 1); assert.equal(dl[0].action, 'STAGE_CHANGE');
    const det = typeof dl[0].details === 'string' ? JSON.parse(dl[0].details) : dl[0].details; assert.equal(det.after.pipeline_stage, 'Lost'); assert.ok(det.cancellation_id);
    assert.equal(det.unit_id, u3); assert.equal(det.unit_status_change, 'Available'); assert.equal((await q("SELECT status FROM re_units WHERE id=$1", [u3])).rows[0].status, 'Available'); log('PASS cancellation writes Deal audit row incl. unit transition');
    // 4. duplicate cancel rejected, no extra audit/cancellation rows
    r = await call(canc.processCancellation, asReq({ deal_id: d3, cancellation_reason: 'again' })); assert.equal(r.statusCode, 409);
    assert.equal((await q("SELECT count(*)::int n FROM re_cancellations WHERE deal_id=$1", [d3])).rows[0].n, 1);
    assert.equal((await logs(d3, 'Deal')).length, 1); log('PASS duplicate cancel 409, no extra rows');
    // 5. cancelled/Lost deal read-only: stage reopen, customer, unit, value on both endpoints
    const before = (await q("SELECT * FROM deals WHERE id=$1", [d3])).rows[0];
    for (const body of [{ pipeline_stage: 'Lead' }, { client_id: cust2 }, { value: 5 }, { title: 'x', pipeline_stage: 'Lead', client_id: cust2 }]) {
      r = await call(deals.updateDeal, asReq(body, { id: String(d3) })); assert.equal(r.statusCode, 409, JSON.stringify(body) + JSON.stringify(r.body)); assert.equal(r.body.code, 'DEAL_LOCKED');
    }
    const u4 = await mkUnit('U4');
    r = await call(deals.updateDeal, asReq({ unit_id: u4 }, { id: String(d3) })); assert.equal(r.statusCode, 409);
    r = await call(deals.updateDealStatus, asReq({ pipeline_stage: 'Lead' }, { id: String(d3) })); assert.equal(r.statusCode, 409);
    const after = (await q("SELECT * FROM deals WHERE id=$1", [d3])).rows[0];
    assert.equal(after.pipeline_stage, 'Lost'); assert.equal(after.client_id, before.client_id); assert.equal(after.unit_id, before.unit_id); assert.equal(String(after.updated_at), String(before.updated_at));
    log('PASS cancelled deal read-only on PUT and status (stage/customer/unit/value)');
    // 6. plain Lost (status endpoint, no cancellation row) is terminal too
    const u5 = await mkUnit('U5'); const d5 = await mkDeal('plain-lost', u5);
    r = await call(deals.updateDealStatus, asReq({ pipeline_stage: 'Lost' }, { id: String(d5) })); assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    r = await call(deals.updateDealStatus, asReq({ pipeline_stage: 'Lead' }, { id: String(d5) })); assert.equal(r.statusCode, 409);
    r = await call(deals.updateDeal, asReq({ pipeline_stage: 'Lead' }, { id: String(d5) })); assert.equal(r.statusCode, 409); log('PASS plain Lost deal read-only');
    // 7. open deal edits and moving open deal to Lost still work; unrelated open-deal behaviour unchanged
    const d6 = await mkDeal('open', null);
    r = await call(deals.updateDeal, asReq({ title: 'renamed', client_id: cust2 }, { id: String(d6) })); assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    r = await call(deals.updateDeal, asReq({ pipeline_stage: 'Negotiation' }, { id: String(d6) })); assert.equal(r.statusCode, 200);
    log('PASS open deal editing unchanged');
    // 8. reassign / extend-SLA cannot bypass the lock on closed, lost or cancelled deals; open deal still works
    for (const id of [d1, d3, d5]) {
      const ownerBefore = (await q('SELECT assigned_to, custom_fields FROM deals WHERE id=$1', [id])).rows[0];
      r = await call(deals.reassignDeal, asReq({ target_user_id: admin.id, reason: 'x' }, { id: String(id) })); assert.equal(r.statusCode, 409, JSON.stringify(r.body)); assert.equal(r.body.code, 'DEAL_LOCKED');
      r = await call(deals.extendDealSla, asReq({ reason: 'x' }, { id: String(id) })); assert.equal(r.statusCode, 409, JSON.stringify(r.body));
      const ownerAfter = (await q('SELECT assigned_to, custom_fields FROM deals WHERE id=$1', [id])).rows[0];
      assert.deepEqual(ownerAfter, ownerBefore);
    }
    r = await call(deals.extendDealSla, asReq({ reason: 'ok' }, { id: String(d6) })); assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    log('PASS reassign and extend-SLA blocked on closed/cancelled/lost, open deal extend still works'); log('ALL PASS');
  } catch (e) { console.error('FAIL', e); process.exitCode = 1; } finally { await env.stop(); }
})();
