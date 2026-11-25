'use strict';
// Isolated synthetic Postgres only. Applies ops/proposals/deal_price_workflow.sql to the synthetic DB.
const assert = require('assert/strict'); const fs = require('fs'); const path = require('path');
const h = require('./helpers/pgHarness.cjs');
(async () => {
  const env = await h.start(); const q = (...a) => env.pool.query(...a);
  const log = console.log;
  try {
    const T = (await q("INSERT INTO tenants(name,slug) VALUES('t1','t1') RETURNING id")).rows[0].id;
    const T2 = (await q("INSERT INTO tenants(name,slug) VALUES('t2','t2') RETURNING id")).rows[0].id;
    const B = (await q("INSERT INTO branches(name,tenant_id) VALUES('b',$1) RETURNING id", [T])).rows[0].id;
    const D = (await q("INSERT INTO departments(name,tenant_id) VALUES('d',$1) RETURNING id", [T])).rows[0].id;
    const mk = async (n, role, dept = null, t = T) => (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id,department_id) VALUES($1,$2,'x',$3,$4,$5,$6) RETURNING *", [n, n + '@x.io', role, t, B, dept])).rows[0];
    const admin = await mk('admin', 'admin'), rep = await mk('rep', 'sales', D), repB = await mk('repB', 'sales'), deptMgr = await mk('deptmgr', 'manager'), teamMgr = await mk('teammgr', 'manager'), otherMgr = await mk('other', 'manager');
    await q("UPDATE departments SET manager_id=$1 WHERE id=$2", [deptMgr.id, D]);
    const team = (await q("INSERT INTO sales_teams(tenant_id,branch_id,department_id,name,manager_id) VALUES($1,$2,$3,'Team1',$4) RETURNING id", [T, B, D, teamMgr.id])).rows[0].id;
    await q("INSERT INTO sales_team_members(tenant_id,team_id,user_id,is_active) VALUES($1,$2,$3,true)", [T, team, rep.id]);
    // migration is applied AFTER the app code is loaded, to prove the workflow is skipped safely before it exists
    const deals = require('../controllers/dealsController'); const priceC = require('../controllers/dealPriceController'); const priceS = require('../services/dealPriceService');
    const cust = (await q("INSERT INTO customers(name,tenant_id,branch_id) VALUES('c1',$1,$2) RETURNING id", [T, B])).rows[0].id;
    const mkUnit = async (n, price) => (await q("INSERT INTO re_units(tenant_id,name,unit_number,status,price) VALUES($1,$2,$2,'Available',$3) RETURNING id", [T, n, price])).rows[0].id;
    const asReq = (u, body = {}, params = {}, query = {}) => ({ user: { ...u, tenant_id: u.tenant_id || T }, branchId: B, body, params, query, headers: {}, ip: '127.0.0.1' });
    const call = async (fn, req) => { const r = h.mockRes(); await fn(req, r); return r; };
    const val = async (id) => Number((await q('SELECT value FROM deals WHERE id=$1', [id])).rows[0].value);

    // 0. before migration: unit-linked deal saves FAIL CLOSED (503), nothing is stored; deals without a unit still save
    const u0 = await mkUnit('U0', 1000000);
    let r = await call(deals.createDeal, asReq(admin, { title: 'pre-migration', client_id: cust, unit_id: u0, value: 900000 }));
    assert.equal(r.statusCode, 503, JSON.stringify(r.body)); assert.equal(r.body.code, 'PRICE_WORKFLOW_UNAVAILABLE');
    assert.equal((await q("SELECT count(*)::int n FROM deals WHERE title='pre-migration'")).rows[0].n, 0);
    r = await call(deals.createDeal, asReq(admin, { title: 'no-unit-deal', client_id: cust, value: 5000 })); assert.equal(r.statusCode, 201, JSON.stringify(r.body));
    log('PASS before migration: unit-linked save fails closed, no-unit deal unaffected');
    await q(fs.readFileSync(path.join(h.root, 'ops/proposals/deal_price_workflow.sql'), 'utf8'));
    await q(fs.readFileSync(path.join(h.root, 'ops/proposals/deal_price_workflow.sql'), 'utf8')); log('PASS migration is idempotent');

    // 1. create at or above unit price: saved, history 'create'
    const u1 = await mkUnit('U1', 1000000);
    r = await call(deals.createDeal, asReq(admin, { title: 'ok-price', client_id: cust, unit_id: u1, value: 1200000, assigned_team_id: team, assigned_to: rep.id })); assert.equal(r.statusCode, 201, JSON.stringify(r.body));
    const d1 = r.body.data.id; assert.equal(await val(d1), 1200000); assert.equal(r.body.price_approval, undefined);
    assert.equal((await q("SELECT count(*)::int n FROM deal_price_changes WHERE deal_id=$1 AND source='create'", [d1])).rows[0].n, 1); log('PASS create above unit price: saved and logged');
    // 2. edit to higher price: saved + history edit
    r = await call(deals.updateDeal, asReq(rep, { value: 1300000 }, { id: String(d1) })); assert.equal(r.statusCode, 200, JSON.stringify(r.body)); assert.equal(await val(d1), 1300000);
    let hist = (await q("SELECT old_value,new_value,source,changed_by FROM deal_price_changes WHERE deal_id=$1 ORDER BY changed_at,source", [d1])).rows; assert.equal(hist.length, 2); log('PASS higher price saved, history has old/new/actor');
    // 3. edit below unit price: value unchanged, pending request to TEAM manager
    r = await call(deals.updateDeal, asReq(rep, { value: 800000 }, { id: String(d1) })); assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.equal(r.body.price_approval.status, 'pending'); assert.equal(await val(d1), 1300000);
    let ap = (await q("SELECT * FROM deal_price_approvals WHERE deal_id=$1 AND status='pending'", [d1])).rows; assert.equal(ap.length, 1); assert.equal(ap[0].approver_user_id, teamMgr.id); assert.equal(ap[0].approver_route, 'team_manager');
    assert.equal(Number(ap[0].requested_value), 800000); assert.equal(Number(ap[0].unit_price_at_request), 1000000); log('PASS below unit price: value unchanged, pending request routed to team manager');
    // notification delivered to approver
    await new Promise(r => setTimeout(r, 200));
    assert.ok((await q("SELECT 1 FROM system_notifications WHERE type='price_approval' AND user_id=$1", [String(teamMgr.id)])).rows.length >= 1); log('PASS approver notified in-app');
    // 4. close blocked while pending (PUT and status)
    r = await call(deals.updateDeal, asReq(rep, { pipeline_stage: 'Closed' }, { id: String(d1) })); assert.equal(r.statusCode, 409); assert.equal(r.body.code, 'PRICE_APPROVAL_PENDING');
    r = await call(deals.updateDealStatus, asReq(rep, { pipeline_stage: 'Closed' }, { id: String(d1) })); assert.equal(r.statusCode, 409); assert.equal(r.body.code, 'PRICE_APPROVAL_PENDING');
    assert.equal((await q('SELECT pipeline_stage FROM deals WHERE id=$1', [d1])).rows[0].pipeline_stage, 'discovery'); log('PASS close blocked while a request is pending');
    // 5. non-approvers cannot decide; approver can; value applied + history approval row
    const pid = ap[0].id;
    for (const u of [rep, otherMgr, deptMgr, admin]) { r = await call(priceC.approve, asReq(u, {}, { approvalId: pid })); assert.equal(r.statusCode, 403, u.name); }
    assert.equal(await val(d1), 1300000);
    r = await call(priceC.listPendingForMe, asReq(teamMgr)); assert.equal(r.body.data.length, 1);
    r = await call(priceC.listPendingForMe, asReq(otherMgr)); assert.equal(r.body.data.length, 0);
    r = await call(priceC.approve, asReq(teamMgr, { note: 'ok' }, { approvalId: pid })); assert.equal(r.statusCode, 200, JSON.stringify(r.body)); assert.equal(await val(d1), 800000);
    hist = (await q("SELECT source,approval_id,changed_by FROM deal_price_changes WHERE deal_id=$1 AND source='approval'", [d1])).rows; assert.equal(hist.length, 1); assert.equal(hist[0].approval_id, pid); assert.equal(hist[0].changed_by, teamMgr.id);
    r = await call(priceC.approve, asReq(teamMgr, {}, { approvalId: pid })); assert.equal(r.statusCode, 409); log('PASS only designated approver decides; approval applies value, logs history, cannot be replayed');
    r = await call(priceC.getPriceHistory, asReq(admin, {}, { id: String(d1) })); assert.equal(r.statusCode, 200); assert.ok(r.body.data.changes.length >= 3); assert.equal(r.body.data.pending, null);
    // 6. reject keeps value; newer request supersedes the older pending one
    r = await call(deals.updateDeal, asReq(rep, { value: 700000 }, { id: String(d1) })); const p1 = (await q("SELECT id FROM deal_price_approvals WHERE deal_id=$1 AND status='pending'", [d1])).rows[0].id;
    r = await call(deals.updateDeal, asReq(rep, { value: 650000 }, { id: String(d1) }));
    assert.equal((await q("SELECT status FROM deal_price_approvals WHERE id=$1", [p1])).rows[0].status, 'cancelled');
    const p2 = (await q("SELECT id FROM deal_price_approvals WHERE deal_id=$1 AND status='pending'", [d1])).rows[0].id;
    r = await call(priceC.reject, asReq(teamMgr, { note: 'too low' }, { approvalId: p2 })); assert.equal(r.statusCode, 200); assert.equal(await val(d1), 800000);
    log('PASS reject keeps the value; newer request supersedes older');
    // 7. stale: value or unit price changes after the request -> approval refused, not applied
    r = await call(deals.updateDeal, asReq(rep, { value: 600000 }, { id: String(d1) })); const p3 = (await q("SELECT id FROM deal_price_approvals WHERE deal_id=$1 AND status='pending'", [d1])).rows[0].id;
    await q("UPDATE re_units SET price=1100000 WHERE id=$1", [u1]);
    r = await call(priceC.approve, asReq(teamMgr, {}, { approvalId: p3 })); assert.equal(r.statusCode, 409); assert.equal(r.body.code, 'STALE_REQUEST'); assert.equal(await val(d1), 800000);
    assert.equal((await q("SELECT status FROM deal_price_approvals WHERE id=$1", [p3])).rows[0].status, 'stale'); log('PASS stale request (unit price changed) is not applied');
    await q("UPDATE re_units SET price=1000000 WHERE id=$1", [u1]);
    r = await call(deals.updateDeal, asReq(rep, { value: 500000 }, { id: String(d1) })); const p4 = (await q("SELECT id FROM deal_price_approvals WHERE deal_id=$1 AND status='pending'", [d1])).rows[0].id;
    await q("UPDATE deals SET value=900000 WHERE id=$1", [d1]);
    r = await call(priceC.approve, asReq(teamMgr, {}, { approvalId: p4 })); assert.equal(r.statusCode, 409); assert.equal(await val(d1), 900000); log('PASS stale request (deal value changed) is not applied, newer price not overwritten');
    // 8. routing: no team -> department manager; none -> admin pool; requester manager skipped
    const u2 = await mkUnit('U2', 1000000);
    r = await call(deals.createDeal, asReq(rep, { title: 'dept-route', client_id: cust, unit_id: u2, value: 500000 })); assert.equal(r.statusCode, 201, JSON.stringify(r.body)); assert.equal(r.body.price_approval.status, 'pending');
    const dr = (await q("SELECT * FROM deal_price_approvals WHERE deal_id=$1", [r.body.data.id])).rows[0]; assert.equal(dr.approver_route, 'department_manager'); assert.equal(dr.approver_user_id, deptMgr.id);
    assert.equal(await val(r.body.data.id), 1000000, 'created at unit price while pending');
    const u3 = await mkUnit('U3', 1000000);
    r = await call(deals.createDeal, asReq(repB, { title: 'admin-route', client_id: cust, unit_id: u3, value: 500000 })); const ar = (await q("SELECT * FROM deal_price_approvals WHERE deal_id=$1", [r.body.data.id])).rows[0];
    assert.equal(ar.approver_route, 'admin'); assert.equal(ar.approver_user_id, null);
    r = await call(priceC.approve, asReq(repB, {}, { approvalId: ar.id })); assert.equal(r.statusCode, 403);
    r = await call(priceC.listPendingForMe, asReq(admin)); assert.ok(r.body.data.some(x => x.id === ar.id));
    r = await call(priceC.approve, asReq(admin, {}, { approvalId: ar.id })); assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    const u4 = await mkUnit('U4', 1000000); await q("UPDATE users SET department_id=$1 WHERE id=$2", [D, deptMgr.id]);
    r = await call(deals.createDeal, asReq(deptMgr, { title: 'mgr-self', client_id: cust, unit_id: u4, value: 400000, assigned_to: deptMgr.id })); const ms = (await q("SELECT * FROM deal_price_approvals WHERE deal_id=$1", [r.body.data.id])).rows[0];
    assert.equal(ms.approver_route, 'admin', 'requester manager is not their own approver'); log('PASS routing: team manager, department manager, admin pool; no self-approval by manager');
    // 9. tenant isolation
    const other = await mk('o2', 'admin', null, T2); r = await call(priceC.approve, asReq(other, {}, { approvalId: ar.id })); assert.equal(r.statusCode, 404);
    r = await call(priceC.getPriceHistory, asReq(other, {}, { id: String(d1) })); assert.equal(r.statusCode, 404); log('PASS tenant isolation');
    // 10. terminal deal: pending request cannot be applied
    const u5 = await mkUnit('U5', 1000000);
    r = await call(deals.createDeal, asReq(admin, { title: 'term', client_id: cust, unit_id: u5, value: 400000, assigned_team_id: team, assigned_to: rep.id })); const dT = r.body.data.id; const pT = (await q("SELECT id FROM deal_price_approvals WHERE deal_id=$1", [dT])).rows[0].id;
    await q("UPDATE deals SET pipeline_stage='Lost' WHERE id=$1", [dT]);
    r = await call(priceC.approve, asReq(teamMgr, {}, { approvalId: pT })); assert.equal(r.statusCode, 409); assert.equal(await val(dT), 1000000); log('PASS terminal deal request not applied');
    // 11. admin may approve own request; non-admin requester may not
    const u6 = await mkUnit('U6', 1000000);
    r = await call(deals.createDeal, asReq(admin, { title: 'admin-self', client_id: cust, unit_id: u6, value: 300000 })); assert.equal(r.statusCode, 201, JSON.stringify(r.body));
    const sa = (await q("SELECT * FROM deal_price_approvals WHERE deal_id=$1", [r.body.data.id])).rows[0]; assert.equal(sa.approver_route, 'admin'); assert.equal(sa.requested_by, admin.id);
    r = await call(priceC.approve, asReq(admin, {}, { approvalId: sa.id })); assert.equal(r.statusCode, 200, JSON.stringify(r.body)); assert.equal(await val(sa.deal_id), 300000);
    const u7 = await mkUnit('U7', 1000000);
    r = await call(deals.createDeal, asReq(repB, { title: 'rep-self', client_id: cust, unit_id: u7, value: 300000 })); const ra = (await q("SELECT * FROM deal_price_approvals WHERE deal_id=$1", [r.body.data.id])).rows[0];
    r = await call(priceC.approve, asReq(repB, {}, { approvalId: ra.id })); assert.equal(r.statusCode, 403); assert.equal(await val(ra.deal_id), 1000000);
    log('PASS admin may self-approve; non-admin requester cannot');
    // 12. deals with price history/requests cannot be deleted; history stays
    const before = (await q("SELECT count(*)::int n FROM deal_price_changes WHERE deal_id=$1", [d1])).rows[0].n;
    r = await call(deals.deleteDeal, asReq(admin, {}, { id: String(d1) })); assert.equal(r.statusCode, 409, JSON.stringify(r.body)); assert.equal(r.body.code, 'PRICE_HISTORY_RETAINED');
    assert.equal((await q("SELECT count(*)::int n FROM deals WHERE id=$1", [d1])).rows[0].n, 1); assert.equal((await q("SELECT count(*)::int n FROM deal_price_changes WHERE deal_id=$1", [d1])).rows[0].n, before);
    await assert.rejects(() => q("DELETE FROM deals WHERE id=$1", [d1]), /foreign key|violates/i); log('PASS deletion blocked (API and FK), history retained');
    // 13. other close writers blocked while pending
    const u8 = await mkUnit('U8', 1000000);
    r = await call(deals.createDeal, asReq(admin, { title: 'inv-block', client_id: cust, unit_id: u8, value: 200000, assigned_team_id: team, assigned_to: rep.id })); const dI = r.body.data.id;
    assert.equal((await q("SELECT count(*)::int n FROM deal_price_approvals WHERE deal_id=$1 AND status='pending'", [dI])).rows[0].n, 1);
    // harness-only: align deals.unit_id with re_units.id (uuid) so the existing salesService join runs
    await q('ALTER TABLE deals ALTER COLUMN unit_id TYPE uuid USING unit_id::uuid').catch(() => {});
    for (const c of ['floor text', 'area numeric', 'type text']) await q('ALTER TABLE re_units ADD COLUMN IF NOT EXISTS ' + c);
    const salesService = require('../services/salesService'); const fin = require('../controllers/financeController');
    await assert.rejects(() => salesService.convertDealToInvoice(dI, T), e => { if (e.code !== 'PRICE_APPROVAL_PENDING') console.log('ERRDBG', e.message); return e.code === 'PRICE_APPROVAL_PENDING'; });
    r = await call(fin.createInvoiceFromDeal, asReq(admin, {}, { dealId: String(dI) })); assert.equal(r.statusCode, 409, JSON.stringify(r.body)); assert.equal(r.body.code, 'PRICE_APPROVAL_PENDING');
    assert.equal((await q("SELECT pipeline_stage FROM deals WHERE id=$1", [dI])).rows[0].pipeline_stage.toLowerCase() === 'won', false); assert.equal((await q("SELECT count(*)::int n FROM invoices WHERE deal_id=$1", [dI])).rows[0].n, 0);
    log('PASS finance and sales invoice-close writers blocked while pending');
    // 14. concurrency, deterministic: pause each close writer right after its LAST pending-request check, then try to
    //     take the deal row lock the way a request writer does. With a real transaction the writer still holds the lock, so the
    //     request writer must stay blocked until the close finishes. Without it (unpatched), the request writer gets through
    //     while the close is about to commit on a stale "no pending" answer.
    {
      const salesService2 = require('../services/salesService'); const fin2 = require('../controllers/financeController');
      const realHas = priceS.hasPendingRequest;
      const writers = {
        sales: (id) => salesService2.convertDealToInvoice(id, T).then(() => 'closed', e => e.code || e.message),
        finance: async (id) => { const rs = await call(fin2.createInvoiceFromDeal, asReq(admin, {}, { dealId: String(id) })); return rs.body.code || rs.statusCode; },
        put: async (id) => { const rs = await call(deals.updateDeal, asReq(rep, { pipeline_stage: 'Closed' }, { id: String(id) })); return rs.body.code || rs.statusCode; },
        status: async (id) => { const rs = await call(deals.updateDealStatus, asReq(rep, { pipeline_stage: 'Closed' }, { id: String(id) })); return rs.body.code || rs.statusCode; },
      };
      const mkDeal = async (label) => {
        const ur = await mkUnit('G-' + label, 1000000);
        return (await call(deals.createDeal, asReq(admin, { title: 'race-' + label, client_id: cust, unit_id: ur, value: 1000000, assigned_team_id: team, assigned_to: rep.id }))).body.data;
      };
      for (const name of Object.keys(writers)) {
        // probe: how many pending checks does this writer make on a clean deal?
        let calls = 0; priceS.hasPendingRequest = async (...a) => { calls++; return realHas(...a); };
        await writers[name]((await mkDeal(name + '-probe')).id);
        assert.ok(calls >= 1, name + ' makes at least one pending check');
        const target = calls;
        // real run: gate after the last check
        const dr = await mkDeal(name);
        let n = 0, reachedRes, gateRes; const reached = new Promise(r => reachedRes = r); const gate = new Promise(r => gateRes = r);
        priceS.hasPendingRequest = async (...a) => { const v = await realHas(...a); if (++n === target) { reachedRes(); await gate; } return v; };
        const closer = writers[name](dr.id);
        await reached;                                              // closer has seen "no pending" and is about to write
        const c1 = await env.pool.connect(); let reqSettled = false, reqPromise;
        try {
          await c1.query('BEGIN');
          reqPromise = (async () => {
            await c1.query('SELECT id FROM deals WHERE id=$1 FOR UPDATE', [dr.id]);
            const full = (await c1.query('SELECT * FROM deals WHERE id=$1', [dr.id])).rows[0];
            await priceS.createPriceRequest(c1, { tenantId: T, branchId: B, deal: full, requestedValue: 500000, unitPrice: 1000000, requestedBy: rep.id });
          })().then(() => { reqSettled = true; }, () => { reqSettled = true; });
          await new Promise(r => setTimeout(r, 600));
          assert.equal(reqSettled, false, name + ': request writer must stay blocked while the close holds the deal lock after its pending check');
        } finally {
          // If the request writer already got through (the failure case), free its lock first so the paused closer can finish
          // and the failed assertion is reported immediately. If it is still blocked (expected), the closer must finish first.
          if (reqSettled) await c1.query('ROLLBACK').catch(() => {});
          gateRes(); await closer; await reqPromise; if (!reqSettled) await c1.query('COMMIT').catch(() => {}); c1.release();
          priceS.hasPendingRequest = realHas;
        }
      }
      priceS.hasPendingRequest = realHas;
      log('PASS concurrent request vs close: all four close writers hold the deal lock across check and write (request writer blocked at the interleaving point)');
    }
    log('ALL PASS');
  } catch (e) { console.error('FAIL', e); process.exitCode = 1; } finally { await env.stop(); }
})();
