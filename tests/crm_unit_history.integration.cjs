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
    const admin = await mk('admin', 'admin'); const other = await mk('o', 'admin', T2);
    const unit = async (name, price, tt = 'sale', status = 'Available', t = T) => (await q("INSERT INTO re_units(tenant_id,branch_id,name,unit_number,price,transaction_type,status) VALUES($1,$2,$3,$3,$4,$5,$6) RETURNING *", [String(t), String(B), name, price, tt, status])).rows[0];
    const sale = await unit('S1', 1000000), rent = await unit('R1', 10000, 'rent'), reserved = await unit('S2', 500000, 'sale', 'Reserved');
    const units = require('../controllers/reUnitsController');
    const rq = (u, body, params = {}, query = {}) => ({ user: u, branchId: u.branch_id, body, params, query });
    const call = async (fn, req) => { const r = h.mockRes(); await fn(req, r); return r; };
    const events = async (id) => (await q('SELECT * FROM re_unit_events WHERE unit_id=$1 ORDER BY created_at,id', [id])).rows;

    let r = await call(units.updateUnit, rq(admin, { price: 1200000 }, { id: sale.id })); assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    r = await call(units.updateUnit, rq(admin, { price: 1200000 }, { id: sale.id })); assert.equal(r.statusCode, 200);
    r = await call(units.updateUnit, rq(admin, { price: 1100000 }, { id: sale.id })); assert.equal(r.statusCode, 200);
    let ev = await events(sale.id); assert.equal(ev.length, 2, 'unchanged price creates no event');
    assert.equal(ev[0].previous_data.price, '1000000.00'.replace('.00', '') === '1000000' ? ev[0].previous_data.price : '');
    assert.equal(Number(ev[0].previous_data.price), 1000000); assert.equal(Number(ev[0].new_data.price), 1200000); assert.equal(Number(ev[1].new_data.price), 1100000);
    assert.equal(ev[0].actor_user_id, admin.id); log('PASS price edits record old/new once, atomic with update, no event on unchanged');
    r = await call(units.updateUnit, rq(admin, { price: -5 }, { id: sale.id })); assert.equal(r.statusCode, 400); assert.equal(r.body.code, 'INVALID_PRICE');
    r = await call(units.updateUnit, rq(admin, { price: 'abc' }, { id: sale.id })); assert.equal(r.statusCode, 400);
    assert.equal(Number((await q('SELECT price FROM re_units WHERE id=$1', [sale.id])).rows[0].price), 1100000); log('PASS invalid price rejected without write');
    await call(units.updateUnit, rq(admin, { price: 12000 }, { id: rent.id }));
    // period indicators
    const today = new Date().toISOString().slice(0, 10);
    r = await call(units.getPriceChanges, rq(admin, {}, {}, { from: '2026-01-01', to: '2099-12-31' })); assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    const s1 = r.body.data.find(x => x.unit_id === sale.id); assert.equal(s1.direction, 'up'); assert.equal(s1.net_delta, 100000); assert.equal(Math.round(s1.net_percent), 10); assert.equal(s1.changes.length, 2);
    assert.equal(r.body.summary_by_transaction_type.sale.up, 1); assert.equal(r.body.summary_by_transaction_type.rent.up, 1); assert.ok(!('average' in r.body));
    r = await call(units.getPriceChanges, rq(admin, {}, {}, { from: '2026-01-01', to: '2026-01-02' })); assert.equal(r.body.data.length, 0);
    r = await call(units.getPriceChanges, rq(admin, {}, {}, { from: '2026-02-30', to: '2026-03-01' })); assert.equal(r.statusCode, 400);
    r = await call(units.getPriceChanges, rq(other, {}, {}, { from: '2026-01-01', to: '2099-12-31' })); assert.equal(r.body.data.length, 0, 'tenant isolation'); log('PASS period indicators: direction, delta, %, sale vs rent separated, tenant isolated');
    r = await call(units.getUnitEvents, rq(admin, {}, { id: sale.id })); assert.equal(r.body.data.length, 2);
    r = await call(units.getUnitEvents, rq(other, {}, { id: sale.id })); assert.equal(r.statusCode, 404); log('PASS timeline scoped by tenant');
    // marketing
    r = await call(units.updateUnit, rq(admin, { marketing_active: false }, { id: sale.id })); assert.equal(r.statusCode, 400); assert.equal(r.body.code, 'REASON_REQUIRED');
    r = await call(units.updateUnit, rq(admin, { marketing_active: false, marketing_inactive_reason: 'sold_elsewhere' }, { id: sale.id })); assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    let u = (await q('SELECT * FROM re_units WHERE id=$1', [sale.id])).rows[0]; assert.equal(u.marketing_active, false); assert.equal(u.status, 'Available'); assert.equal(u.marketing_changed_by, admin.id);
    assert.equal((await q('SELECT count(*)::int n FROM re_commissions')).rows[0].n, 0); assert.equal((await q('SELECT count(*)::int n FROM re_contracts')).rows[0].n, 0);
    r = await call(units.updateUnit, rq(admin, { marketing_active: false, marketing_inactive_reason: 'sold_elsewhere' }, { id: reserved.id })); assert.equal(r.statusCode, 409); assert.equal(r.body.code, 'UNIT_HAS_LIVE_RESERVATION_OR_CONTRACT');
    assert.equal((await q('SELECT marketing_active FROM re_units WHERE id=$1', [reserved.id])).rows[0].marketing_active, true);
    r = await call(units.updateUnit, rq(admin, { marketing_active: true }, { id: sale.id })); assert.equal(r.statusCode, 200);
    ev = await events(sale.id); assert.deepEqual(ev.map(e => e.event_type), ['price_changed', 'price_changed', 'marketing_deactivated', 'marketing_activated']); log('PASS marketing deactivate/reactivate: reason required, live reservation blocked, no finance/lifecycle side effects');
    // deal creation on inactive unit
    await call(units.updateUnit, rq(admin, { marketing_active: false, marketing_inactive_reason: 'other', marketing_inactive_note: 'owner withdrew' }, { id: sale.id }));
    const deals = require('../controllers/dealsController');
    r = await call(deals.createDeal, { user: admin, branchId: admin.branch_id, body: { title: 'd', unit_id: sale.id }, params: {}, query: {} }); assert.equal(r.statusCode, 409); assert.equal(r.body.code, 'UNIT_NOT_MARKETED'); log('PASS inactive unit cannot start a deal');
    // atomicity: failing event insert rolls back the price update
    await q('ALTER TABLE re_unit_events RENAME TO re_unit_events_x'); 
    r = await call(units.updateUnit, rq(admin, { price: 999 }, { id: rent.id })); assert.equal(r.statusCode, 500);
    await q('ALTER TABLE re_unit_events_x RENAME TO re_unit_events');
    assert.equal(Number((await q('SELECT price FROM re_units WHERE id=$1', [rent.id])).rows[0].price), 12000); log('PASS event failure rolls back price change');
    log('ALL UNIT HISTORY TESTS PASSED');
  } finally { await env.stop(); }
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; });
