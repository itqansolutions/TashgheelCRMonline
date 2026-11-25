'use strict';
// Isolated synthetic Postgres only. Reproduces the manager-report miscount for real-estate stage names.
const assert = require('assert/strict');
const h = require('./helpers/pgHarness.cjs');
(async () => {
  const env = await h.start(); const q = (...a) => env.pool.query(...a);
  const log = console.log;
  try {
    const T = (await q("INSERT INTO tenants(name,slug) VALUES('t1','t1') RETURNING id")).rows[0].id;
    const B = (await q("INSERT INTO branches(name,tenant_id) VALUES('b',$1) RETURNING id", [T])).rows[0].id;
    const admin = (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id) VALUES('rep','a@x.io','x','admin',$1,$2) RETURNING *", [T, B])).rows[0];
    const cust = (await q("INSERT INTO customers(name,tenant_id,branch_id) VALUES('c1',$1,$2) RETURNING id", [T, B])).rows[0].id;
    const mk = async (title, stage, cf = {}) => (await q("INSERT INTO deals(tenant_id,branch_id,title,value,pipeline_stage,client_id,assigned_to,custom_fields) VALUES($1,$2,$3,1000,$4,$5,$6,$7) RETURNING id", [T, B, title, stage, cust, admin.id, JSON.stringify(cf)])).rows[0].id;
    for (const s of ['Lead', 'Lead', 'Negotiation']) await mk('open-' + s, s);
    await mk('closed1', 'Closed'); await mk('closed2', 'Closed'); await mk('wonlc', 'won');
    const lostA = await mk('lostA', 'Lost'); await mk('lostB', 'Lost', { lost_reason: 'Price too high' }); await mk('lostC', 'lost', { lost_reason: 'Price too high' });
    await q("INSERT INTO re_cancellations(deal_id,cancellation_reason,total_paid_amount,deduction_amount,refundable_amount,refund_status,unit_action,processed_by,tenant_id) VALUES($1,'Buyer withdrew',0,0,0,'No Refund','release','t',$2)", [lostA, T]);
    const sm = require('../controllers/salesManagementController');
    const asReq = (query = {}) => ({ user: { ...admin, tenant_id: T, template_name: 'real_estate' }, branchId: B, body: {}, params: {}, query });
    const call = async (fn, req) => { const r = h.mockRes(); await fn(req, r); return r; };
    let r = await call(sm.getTeamPerformance, asReq());
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    const rows = r.body.data?.team || r.body.data?.salesmen || r.body.data || r.body;
    const rep = (Array.isArray(rows) ? rows : (rows.members || rows.team_members || [])).find(x => String(x.id) === String(admin.id));
    assert.ok(rep, 'rep row found: ' + JSON.stringify(r.body).slice(0, 300));
    assert.equal(rep.open_deals, 3, 'open'); assert.equal(rep.won_deals, 3, 'won (Closed x2 + won)'); assert.equal(rep.lost_deals, 3, 'lost (Lost x2 + lost)');
    assert.equal(Number(rep.total_won_value), 3000);
    log('PASS rep table: Closed/Lost counted as won/lost, not open');
    r = await call(sm.getOverview, asReq());
    assert.equal(r.statusCode, 200, JSON.stringify(r.body).slice(0, 300));
    const reasons = JSON.stringify(r.body);
    const lr = (r.body.data?.bottlenecks?.lost_reasons || r.body.data?.lost_reasons || []);
    assert.ok(lr.length, 'loss reasons present: ' + reasons.slice(0, 400));
    const by = Object.fromEntries(lr.map(x => [x.reason, x.count]));
    assert.equal(by['Price too high'], 2); assert.equal(by['Buyer withdrew'], 1); assert.equal(by['Unspecified'] || 0, 0);
    log('PASS loss reasons include Lost-capitalized deals and cancellation reasons'); log('ALL PASS');
  } catch (e) { console.error('FAIL', e); process.exitCode = 1; } finally { await env.stop(); }
})();
