'use strict';
// Isolated synthetic Postgres only (tests/helpers/pgHarness.cjs). Never touches a live DB.
// Regression for the write-time stage policy and the lost/cancelled delete-retention policy.
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
    const canc = require('../controllers/reCancellationsController');
    const asReq = (body = {}, params = {}, query = {}) => ({ user: { ...admin, tenant_id: T }, branchId: B, body, params, query, headers: {}, ip: '127.0.0.1' });
    const call = async (fn, req) => { const r = h.mockRes(); await fn(req, r); return r; };
    const mkDeal = async (title, unit, stage = 'Lead') => (await q("INSERT INTO deals(tenant_id,branch_id,title,value,pipeline_stage,client_id,assigned_to,unit_id) VALUES($1,$2,$3,1000000,$4,$5,$6,$7) RETURNING id", [T, B, title, stage, cust, admin.id, unit])).rows[0].id;
    const stage = async (d) => (await q('SELECT pipeline_stage FROM deals WHERE id=$1', [d])).rows[0].pipeline_stage;

    // 1. Tenant pipeline stages keep working (custom stages allowed)
    { const u = await mkUnit('P1'); const d = await mkDeal('pipeline-ok', u);
      for (const s of ['Interested', 'Site Visit', 'Negotiation']) {
        const r = await call(deals.updateDealStatus, asReq({ pipeline_stage: s }, { id: String(d) }));
        assert.equal(r.statusCode, 200, s + ': ' + JSON.stringify(r.body));
      }
      assert.equal(await stage(d), 'Negotiation'); }
    log('PASS tenant pipeline stages accepted (Interested/Site Visit/Negotiation)');

    // 2. Unknown stage strings rejected on all three write paths
    { const u = await mkUnit('P2'); const d = await mkDeal('unknown-stage', u);
      for (const bad of ['مكتملة بنجاح', 'garbage stage']) {
        let r = await call(deals.updateDealStatus, asReq({ pipeline_stage: bad }, { id: String(d) }));
        assert.equal(r.statusCode, 400, bad); assert.equal(r.body.code, 'INVALID_STAGE');
        r = await call(deals.updateDeal, asReq({ pipeline_stage: bad }, { id: String(d) }));
        assert.equal(r.statusCode, 400, bad); assert.equal(r.body.code, 'INVALID_STAGE');
        r = await call(deals.createDeal, asReq({ title: 'x', value: 5, pipeline_stage: bad, client_id: cust }));
        assert.equal(r.statusCode, 400, bad); assert.equal(r.body.code, 'INVALID_STAGE');
      }
      assert.equal(await stage(d), 'Lead', 'stage must be unchanged after rejected writes'); }
    log('PASS unknown stage strings (Arabic label, garbage) rejected on create/update/status');

    // 3. Canonical alias close still works
    { const u = await mkUnit('P3'); const d = await mkDeal('alias-ok', u);
      const r = await call(deals.updateDealStatus, asReq({ pipeline_stage: 'Closed Won' }, { id: String(d) }));
      assert.equal(r.statusCode, 200, JSON.stringify(r.body));
      assert.equal((await q('SELECT count(*)::int n FROM re_payments_mvp WHERE deal_id=$1', [d])).rows[0].n, 1); }
    log('PASS canonical alias close (Closed Won) still works with finance row');

    // 4. Lost/cancelled deals cannot be deleted (history retained)
    { const u = await mkUnit('P4'); const d = await mkDeal('cancel-del', u);
      let r = await call(canc.processCancellation, asReq({ deal_id: d, cancellation_reason: 'test', deduction_amount: 0, unit_action: 'release' }));
      assert.equal(r.statusCode, 201, JSON.stringify(r.body));
      r = await call(deals.deleteDeal, asReq({}, { id: String(d) }));
      assert.equal(r.statusCode, 409); assert.equal(r.body.code, 'DEAL_LOCKED');
      assert.equal((await q('SELECT count(*)::int n FROM re_cancellations WHERE deal_id=$1', [d])).rows[0].n, 1, 'cancellation record must survive');
      assert.equal((await q('SELECT count(*)::int n FROM deals WHERE id=$1', [d])).rows[0].n, 1, 'deal must survive'); }
    log('PASS cancelled deal delete blocked, cancellation record retained');
    { const u = await mkUnit('P5'); const d = await mkDeal('lost-del', u);
      let r = await call(deals.updateDealStatus, asReq({ pipeline_stage: 'Closed Lost' }, { id: String(d) }));
      assert.equal(r.statusCode, 200, JSON.stringify(r.body));
      r = await call(deals.deleteDeal, asReq({}, { id: String(d) }));
      assert.equal(r.statusCode, 409); assert.equal(r.body.code, 'DEAL_LOCKED');
      assert.equal((await q('SELECT count(*)::int n FROM deals WHERE id=$1', [d])).rows[0].n, 1); }
    log('PASS plain lost deal (Closed Lost) delete blocked');

    // 5. Open deal delete still allowed (unchanged existing behavior)
    { const u = await mkUnit('P6'); const d = await mkDeal('open-del', u);
      const r = await call(deals.deleteDeal, asReq({}, { id: String(d) }));
      assert.equal(r.statusCode, 200, JSON.stringify(r.body)); }
    log('PASS open deal delete still allowed');

    // 6. Invalid stage on a locked deal stays DEAL_LOCKED (lock precedence)
    { const u = await mkUnit('P7'); const d = await mkDeal('locked-precedence', u);
      let r = await call(deals.updateDealStatus, asReq({ pipeline_stage: 'Closed Won' }, { id: String(d) }));
      assert.equal(r.statusCode, 200);
      r = await call(deals.updateDealStatus, asReq({ pipeline_stage: 'garbage stage' }, { id: String(d) }));
      assert.equal(r.statusCode, 409); assert.equal(r.body.code, 'DEAL_LOCKED'); }
    log('PASS lock precedence: invalid stage on locked deal stays DEAL_LOCKED');

    console.log('ALL STAGE WRITE POLICY TESTS PASSED');
  } finally { await env.stop(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
