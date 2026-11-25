'use strict';
// Isolated synthetic Postgres only (tests/helpers/pgHarness.cjs). Never touches a live DB.
// Regression for the stage-alias guard bypass: API-written stage aliases
// ('Closed Won', 'closed_won', 'closed-won', 'Contracted', 'Closed Lost', 'CANCELLED')
// must hit the same won/lost terminal semantics as canonical values.
const assert = require('assert/strict');
const h = require('./helpers/pgHarness.cjs');
(async () => {
  const env = await h.start(); const q = (...a) => env.pool.query(...a); await env.pool.query(require('fs').readFileSync(require('path').join(__dirname, '../ops/proposals/deal_price_workflow.sql'), 'utf8'));
  const log = console.log;
  try {
    const T = (await q("INSERT INTO tenants(name,slug,template_name) VALUES('t1','t1','real_estate') RETURNING id")).rows[0].id;
    const B = (await q("INSERT INTO branches(name,tenant_id) VALUES('b',$1) RETURNING id", [T])).rows[0].id;
    const admin = (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id) VALUES('admin','a@x.io','x','admin',$1,$2) RETURNING *", [T, B])).rows[0];
    const cust = (await q("INSERT INTO customers(name,tenant_id,branch_id) VALUES('c1',$1,$2) RETURNING id", [T, B])).rows[0].id;
    const mkUnit = async (n) => (await q("INSERT INTO re_units(tenant_id,name,unit_number,status,price) VALUES($1,$2,$2,'Available',1000000) RETURNING id", [T, n])).rows[0].id;
    const deals = require('../controllers/dealsController');
    const asReq = (body = {}, params = {}, query = {}) => ({ user: { ...admin, tenant_id: T }, branchId: B, body, params, query, headers: {}, ip: '127.0.0.1' });
    const call = async (fn, req) => { const r = h.mockRes(); await fn(req, r); return r; };
    const mkDeal = async (title, unit, stage = 'Lead') => (await q("INSERT INTO deals(tenant_id,branch_id,title,value,pipeline_stage,client_id,assigned_to,unit_id) VALUES($1,$2,$3,1000000,$4,$5,$6,$7) RETURNING id", [T, B, title, stage, cust, admin.id, unit])).rows[0].id;
    const pay = async (d) => (await q('SELECT * FROM re_payments_mvp WHERE deal_id=$1', [d])).rows;

    // 1. Won-side ALIASES create the Pending finance registry row on close (status + PUT)
    let n = 0;
    for (const alias of ['Closed Won', 'closed_won', 'closed-won', 'Contracted', 'CONTRACTED']) {
      n++; const u = await mkUnit('AW' + n); const d = await mkDeal('alias-won-' + n, u);
      let r = await call(deals.updateDealStatus, asReq({ pipeline_stage: alias }, { id: String(d) }));
      assert.equal(r.statusCode, 200, 'status close ' + alias + ': ' + JSON.stringify(r.body));
      assert.equal((await pay(d)).length, 1, 'finance row missing for ' + alias);
      assert.equal((await pay(d))[0].status, 'Pending');
    }
    log('PASS won-side aliases (Closed Won/closed_won/closed-won/Contracted/CONTRACTED) create finance registry row via status');
    { const u = await mkUnit('AWP'); const d = await mkDeal('alias-won-put', u);
      const r = await call(deals.updateDeal, asReq({ pipeline_stage: 'Closed Won' }, { id: String(d) }));
      assert.equal(r.statusCode, 200, JSON.stringify(r.body));
      assert.equal((await pay(d)).length, 1, 'finance row missing for PUT Closed Won'); }
    log('PASS PUT close with alias Closed Won creates finance registry row');

    // 2. Won-side ALIASES lock the deal: reopen blocked, delete blocked
    { const d = (await q("SELECT id FROM deals WHERE title='alias-won-1'")).rows[0].id;
      let r = await call(deals.updateDealStatus, asReq({ pipeline_stage: 'Lead' }, { id: String(d) }));
      assert.equal(r.statusCode, 409); assert.equal(r.body.code, 'DEAL_LOCKED');
      r = await call(deals.updateDeal, asReq({ pipeline_stage: 'Lead' }, { id: String(d) }));
      assert.equal(r.statusCode, 409); assert.equal(r.body.code, 'DEAL_LOCKED');
      r = await call(deals.deleteDeal, asReq({}, { id: String(d) }));
      assert.equal(r.statusCode, 409); assert.equal(r.body.code, 'DEAL_LOCKED'); }
    log('PASS alias-closed deal (Closed Won) is terminal-locked on reopen and delete');

    // 3. Pending-price close block fires for aliases
    { const u = await mkUnit('AP'); const d = await mkDeal('alias-pending', u);
      const svc = require('../services/dealPriceService');
      await svc.recordPriceChange(env.pool, { tenantId: T, branchId: B, dealId: d, oldValue: null, newValue: 1000000, unitPrice: 1000000, changedBy: admin.id, source: 'create' });
      await svc.createPriceRequest(env.pool, { tenantId: T, branchId: B, deal: (await q('SELECT * FROM deals WHERE id=$1', [d])).rows[0], requestedValue: 900000, unitPrice: 1000000, requestedBy: admin.id });
      let r = await call(deals.updateDealStatus, asReq({ pipeline_stage: 'Contracted' }, { id: String(d) }));
      assert.equal(r.statusCode, 409); assert.equal(r.body.code, 'PRICE_APPROVAL_PENDING');
      r = await call(deals.updateDeal, asReq({ pipeline_stage: 'closed-won' }, { id: String(d) }));
      assert.equal(r.statusCode, 409); assert.equal(r.body.code, 'PRICE_APPROVAL_PENDING');
      assert.equal((await pay(d)).length, 0, 'no finance row may be created while approval pending'); }
    log('PASS pending-price close block fires for Contracted/closed-won aliases');

    // 4. Lost-side ALIASES are terminal too
    n = 0;
    for (const alias of ['Closed Lost', 'closed_lost', 'CANCELLED']) {
      n++; const u = await mkUnit('AL' + n); const d = await mkDeal('alias-lost-' + n, u);
      let r = await call(deals.updateDealStatus, asReq({ pipeline_stage: alias }, { id: String(d) }));
      assert.equal(r.statusCode, 200, 'status ' + alias + ': ' + JSON.stringify(r.body));
      r = await call(deals.updateDealStatus, asReq({ pipeline_stage: 'Lead' }, { id: String(d) }));
      assert.equal(r.statusCode, 409, 'reopen must be blocked for ' + alias); assert.equal(r.body.code, 'DEAL_LOCKED');
      r = await call(deals.updateDeal, asReq({ pipeline_stage: 'Lead' }, { id: String(d) }));
      assert.equal(r.statusCode, 409, 'reopen via PUT must be blocked for ' + alias); assert.equal(r.body.code, 'DEAL_LOCKED');
    }
    log('PASS lost-side aliases (Closed Lost/closed_lost/CANCELLED) are terminal-locked on reopen');

    // 5. Custom pipeline stages keep working (no over-blocking)
    { const u = await mkUnit('AC'); const d = await mkDeal('alias-custom', u);
      let r = await call(deals.updateDealStatus, asReq({ pipeline_stage: 'Interested' }, { id: String(d) }));
      assert.equal(r.statusCode, 200, JSON.stringify(r.body));
      r = await call(deals.updateDeal, asReq({ pipeline_stage: 'Site Visit' }, { id: String(d) }));
      assert.equal(r.statusCode, 200, JSON.stringify(r.body));
      r = await call(deals.updateDealStatus, asReq({ pipeline_stage: 'Lead' }, { id: String(d) }));
      assert.equal(r.statusCode, 200, 'non-terminal moves stay allowed'); }
    log('PASS custom pipeline stages unaffected (Interested/Site Visit/reopen while open)');

    console.log('ALL STAGE ALIAS GUARD TESTS PASSED');
  } finally { await env.stop(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
