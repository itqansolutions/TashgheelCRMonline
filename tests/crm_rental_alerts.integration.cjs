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
    const D2 = (await q("INSERT INTO departments(name,tenant_id) VALUES('d2',$1) RETURNING id", [T2])).rows[0].id;
    const mk = async (n, role, t = T, working = true) => (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id,department_id,is_working) VALUES($1,$2,'x',$3,$4,$5,$6,$7) RETURNING *", [n, n + '@x.io', role, t, t === T ? B : null, t === T ? D : D2, working])).rows[0];
    const admin = await mk('admin', 'admin'), mgr = await mk('mgr', 'manager'), emp = await mk('emp', 'employee'), m2 = await mk('m2', 'employee'), off = await mk('off', 'employee', T, false), foreign = await mk('foreign', 'employee', T2);
    const team = (await q("INSERT INTO sales_teams(tenant_id,branch_id,department_id,name,manager_id) VALUES($1,$2,$3,'T',$4) RETURNING id", [T, B, D, mgr.id])).rows[0].id;
    for (const u of [emp, m2, off]) await q("INSERT INTO sales_team_members(tenant_id,team_id,user_id) VALUES($1,$2,$3)", [T, team, u.id]);
    const base = async (name, responsible, teamId = team, tt = 'rent') => {
      const unit = (await q("INSERT INTO re_units(tenant_id,branch_id,name,unit_number,price,transaction_type,status,responsible_person_id) VALUES($1,$2,$3,$3,1000,$4,'Contracted',$5) RETURNING *", [String(T), String(B), name, tt, responsible ? String(responsible) : null])).rows[0];
      const deal = (await q("INSERT INTO deals(title,tenant_id,branch_id,unit_id,assigned_team_id,pipeline_stage) VALUES($1,$2,$3,$4,$5,'Closed') RETURNING *", [name, T, B, String(unit.id), teamId])).rows[0];
      const c = (await q("INSERT INTO re_contracts(contract_number,deal_id,unit_id,status,tenant_id,branch_id,end_date) VALUES($1,$2,$3,'Signed',$4,$5,'2027-06-30') RETURNING *", ['C' + name, deal.id, String(unit.id), String(T), String(B)])).rows[0];
      const ho = (await q("INSERT INTO re_handovers(deal_id,contract_id,unit_id,status,tenant_id,branch_id) VALUES($1,$2,$3,'Scheduled',$4,$5) RETURNING *", [deal.id, c.id, String(unit.id), String(T), String(B)])).rows[0];
      return { unit, deal, c, ho };
    };
    const hc = require('../controllers/reHandoversController'), rc = require('../controllers/reRentalOccupanciesController'), svc = require('../services/rentalOccupancyService');
    const rq = (u, body, params = {}, query = {}) => ({ user: u, branchId: u.branch_id, body, params, query });
    const call = async (fn, req) => { const r = h.mockRes(); await fn(req, r); return r; };

    const A = await base('A', emp.id);
    // rental handover requires notice days
    let r = await call(hc.updateHandoverStatus, rq(admin, { status: 'Handed Over' }, { id: A.ho.id })); assert.equal(r.statusCode, 400); assert.equal(r.body.code, 'INVALID_NOTICE_DAYS');
    r = await call(hc.updateHandoverStatus, rq(admin, { status: 'Handed Over', rental_reminder_lead_days: -2 }, { id: A.ho.id })); assert.equal(r.statusCode, 400);
    r = await call(hc.updateHandoverStatus, rq(admin, { status: 'Handed Over', rental_reminder_lead_days: 1.5 }, { id: A.ho.id })); assert.equal(r.statusCode, 400);
    r = await call(hc.updateHandoverStatus, rq(admin, { status: 'Handed Over', rental_reminder_lead_days: 400 }, { id: A.ho.id })); assert.equal(r.statusCode, 400);
    r = await call(hc.updateHandoverStatus, rq(admin, { status: 'Handed Over', rental_reminder_lead_days: 30, rental_ends_on: '2027-02-30' }, { id: A.ho.id })); assert.equal(r.statusCode, 400); assert.equal(r.body.code, 'INVALID_END_DATE');
    assert.equal((await q('SELECT status FROM re_units WHERE id=$1', [A.unit.id])).rows[0].status, 'Contracted', 'failed validation leaves lifecycle untouched');
    r = await call(hc.updateHandoverStatus, rq(admin, { status: 'Handed Over', rental_reminder_lead_days: 30 }, { id: A.ho.id })); assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    let occ = (await q("SELECT *, to_char(ends_on,'YYYY-MM-DD') e FROM re_rental_occupancies WHERE unit_id=$1", [A.unit.id])).rows; assert.equal(occ.length, 1); assert.equal(occ[0].e, '2027-06-30'); assert.equal(occ[0].reminder_lead_days, 30); assert.equal(occ[0].timezone, 'Africa/Cairo');
    log('PASS rental handover: notice days validated, end date from contract, occupancy created atomically');
    // sale unit needs nothing
    const S = await base('S', emp.id, team, 'sale'); r = await call(hc.updateHandoverStatus, rq(admin, { status: 'Handed Over' }, { id: S.ho.id })); assert.equal(r.statusCode, 200);
    assert.equal((await q('SELECT count(*)::int n FROM re_rental_occupancies WHERE unit_id=$1', [S.unit.id])).rows[0].n, 0); log('PASS sale handover unaffected');
    // due time: 2027-06-30 minus 30d = 2027-05-31 09:00 Africa/Cairo (EEST, UTC+3) = 06:00Z
    const due = (await q(`SELECT (${svc.DUE_SQL}) AS d FROM re_rental_occupancies o WHERE o.id=$1`, [occ[0].id])).rows[0].d.toISOString(); assert.equal(due, '2027-05-31T06:00:00.000Z'); log('PASS due = end date minus lead days at 09:00 Cairo (' + due + ')');
    const nj = async () => (await q('SELECT (SELECT count(*) FROM notification_jobs)::int j, (SELECT count(*) FROM notification_logs)::int l, (SELECT count(*) FROM outbox_events)::int o')).rows[0];
    const before = await nj();
    let s = await svc.scanDueAlerts(env.pool, { now: '2027-05-31T05:59:00Z' }); assert.equal(s.processed, 0);
    s = await svc.scanDueAlerts(env.pool, { now: '2027-05-31T06:00:00Z' }); assert.equal(s.delivered, 2, 'manager + responsible employee');
    let rec = (await q("SELECT recipient_user_id FROM re_rental_alert_deliveries ORDER BY 1")).rows.map(x => x.recipient_user_id).sort(); assert.deepEqual(rec, [mgr.id, emp.id].sort());
    s = await svc.scanDueAlerts(env.pool, { now: '2027-05-31T07:00:00Z' }); assert.equal(s.delivered, 0, 'dedupe on rescan');
    const notes = (await q("SELECT user_id,type,metadata FROM system_notifications WHERE type='rental_vacancy_warning'")).rows; assert.equal(notes.length, 2); assert.ok(notes.every(n => n.metadata.internal_only === true));
    assert.deepEqual(await nj(), before); log('PASS audience manager+responsible employee, deduped, in-app only (no jobs/logs/outbox)');
    // revision: extend -> new revision -> alert again
    const rcall = (fn, body, id, u = admin) => call(fn, rq(u, body, { id }));
    r = await rcall(rc.revise, { ends_on: '2027-08-31' }, occ[0].id); assert.equal(r.statusCode, 200, JSON.stringify(r.body)); assert.equal(r.body.data.changed, true); assert.equal(r.body.data.occupancy.revision, 2);
    r = await rcall(rc.revise, { ends_on: '2027-08-31' }, occ[0].id); assert.equal(r.body.data.changed, false);
    s = await svc.scanDueAlerts(env.pool, { now: '2027-07-31T05:00:00Z' }); assert.equal(s.processed, 0);
    s = await svc.scanDueAlerts(env.pool, { now: '2027-08-01T06:00:00Z' }); assert.equal(s.delivered, 2, 'revision 2 alerts again (due 2027-08-01 09:00 Cairo)');
    assert.equal((await q('SELECT count(DISTINCT revision)::int n FROM re_rental_alert_deliveries WHERE occupancy_id=$1', [occ[0].id])).rows[0].n, 2);
    r = await rcall(rc.revise, { ends_on: '2027-01-01', starts_on: '2027-02-01' }, occ[0].id); assert.equal(r.statusCode, 400);
    r = await rcall(rc.revise, { reminder_lead_days: 'x' }, occ[0].id); assert.equal(r.statusCode, 400);
    log('PASS extension creates new revision; invalid/no-op revisions handled');
    // vacancy confirm stops alerts
    const B2 = await base('B', null); // no responsible -> whole team + manager
    r = await call(hc.updateHandoverStatus, rq(admin, { status: 'Handed Over', rental_reminder_lead_days: 0, rental_ends_on: '2027-03-10' }, { id: B2.ho.id })); assert.equal(r.statusCode, 200);
    s = await svc.scanDueAlerts(env.pool, { now: '2027-03-10T07:00:00Z' });
    const bocc = (await q('SELECT id FROM re_rental_occupancies WHERE unit_id=$1', [B2.unit.id])).rows[0].id;
    rec = (await q("SELECT recipient_user_id FROM re_rental_alert_deliveries WHERE occupancy_id=$1", [bocc])).rows.map(x => x.recipient_user_id).sort(); assert.deepEqual(rec, [mgr.id, emp.id, m2.id].sort(), 'whole team + manager; not-working member and foreign tenant excluded');
    log('PASS no responsible employee -> manager + entire team (ineligible members excluded)');
    const C = await base('C', foreign.id); // responsible is another tenant's user => treated as not set
    r = await call(hc.updateHandoverStatus, rq(admin, { status: 'Handed Over', rental_reminder_lead_days: 0, rental_ends_on: '2027-03-11' }, { id: C.ho.id })); assert.equal(r.statusCode, 200);
    const cocc = (await q('SELECT id FROM re_rental_occupancies WHERE unit_id=$1', [C.unit.id])).rows[0].id;
    const rr = await svc.resolveRecipients(env.pool, { id: cocc, tenant_id: String(T) }); assert.ok(!rr.users.some(u => u.id === foreign.id)); assert.equal(rr.source, 'manager_and_team'); log('PASS foreign-tenant responsible id never becomes a recipient');
    const D3 = await base('D', emp.id, null); // no team: only responsible
    r = await call(hc.updateHandoverStatus, rq(admin, { status: 'Handed Over', rental_reminder_lead_days: 0, rental_ends_on: '2027-03-12' }, { id: D3.ho.id })); assert.equal(r.statusCode, 200);
    const docc = (await q('SELECT id FROM re_rental_occupancies WHERE unit_id=$1', [D3.unit.id])).rows[0].id; const dr = await svc.resolveRecipients(env.pool, { id: docc, tenant_id: String(T) }); assert.deepEqual(dr.users.map(u => u.id), [emp.id]); log('PASS individual (no team) deal: responsible employee only, no broad fallback');
    // vacancy confirmation + visibility
    r = await rcall(rc.confirmVacancy, {}, occ[0].id, m2); assert.equal(r.statusCode, 200, JSON.stringify(r.body)); assert.equal(r.body.data.state, 'vacancy_confirmed');
    r = await rcall(rc.confirmVacancy, {}, occ[0].id); assert.equal(r.statusCode, 409);
    s = await svc.scanDueAlerts(env.pool, { now: '2030-01-01T00:00:00Z' }); assert.equal((await q("SELECT count(*)::int n FROM re_rental_alert_deliveries WHERE occupancy_id=$1", [occ[0].id])).rows[0].n, 4, 'confirmed occupancy gets no more alerts');
    assert.equal((await q('SELECT status FROM re_units WHERE id=$1', [A.unit.id])).rows[0].status, 'Handed Over', 'vacancy confirm does not change lifecycle');
    const outsider = await mk('out', 'employee'); r = await rcall(rc.confirmVacancy, {}, cocc, outsider); assert.equal(r.statusCode, 404, 'non-team employee cannot see/act');
    r = await call(rc.list, rq(outsider, {})); assert.equal(r.body.data.length, 0);
    r = await call(rc.list, rq(m2, {})); assert.ok(r.body.data.length >= 3 && r.body.data.every(x => x.recipient_count >= 1));
    const f2 = await mk('f2', 'admin', T2); r = await call(rc.list, { user: f2, branchId: null, body: {}, params: {}, query: {} }); assert.equal(r.body.data.length, 0); log('PASS vacancy confirmation, team-scoped visibility, tenant isolation');
    // unique current occupancy per unit
    await assert.rejects(q("INSERT INTO re_rental_occupancies(id,tenant_id,unit_id,handover_id,ends_on,reminder_lead_days) VALUES(gen_random_uuid(),$1,$2,$3,'2028-01-01',1)", [String(T), D3.unit.id, B2.ho.id]));
    // repeated completion is idempotent (no 500, no second occupancy)
    r = await call(hc.updateHandoverStatus, rq(admin, { status: 'Handed Over', rental_reminder_lead_days: 30 }, { id: A.ho.id })); assert.equal(r.statusCode, 200); assert.equal(r.body.already_completed, true);
    assert.equal((await q('SELECT count(*)::int n FROM re_rental_occupancies WHERE unit_id=$1', [A.unit.id])).rows[0].n, 1);
    // same-tenant, different-branch caller must get 404 and no row on a completed handover (no early-return bypass)
    const BX = (await q("INSERT INTO branches(name,tenant_id) VALUES('bx',$1) RETURNING id", [T])).rows[0].id;
    const other = (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id,department_id,is_working) VALUES('ob','ob@x.io','x','manager',$1,$2,$3,true) RETURNING *", [T, BX, D])).rows[0];
    r = await call(hc.updateHandoverStatus, rq(other, { status: 'Handed Over', rental_reminder_lead_days: 30 }, { id: A.ho.id })); assert.equal(r.statusCode, 404); assert.equal(r.body.data, undefined); assert.equal(r.body.already_completed, undefined);
    r = await call(hc.updateHandoverStatus, rq(admin, { status: 'Handed Over', rental_reminder_lead_days: 30 }, { id: A.ho.id })); assert.equal(r.statusCode, 200); assert.equal(r.body.already_completed, true);
    // unique violation on occupancy maps to a clean 409, not a generic 500
    const U = await base('U', emp.id);
    await q("INSERT INTO re_rental_occupancies(id,tenant_id,unit_id,handover_id,ends_on,reminder_lead_days) VALUES(gen_random_uuid(),$1,$2,$3,'2028-01-01',1)", [String(T), U.unit.id, U.ho.id]);
    r = await call(hc.updateHandoverStatus, rq(admin, { status: 'Handed Over', rental_reminder_lead_days: 5 }, { id: U.ho.id })); assert.ok([409].includes(r.statusCode), 'got ' + r.statusCode + JSON.stringify(r.body));
    log('PASS repeated/conflicting handover completion is clean');
    // no responsible person, no team, no members -> admin/manager fallback (eligible, same tenant/branch only)
    const offAdmin = await mk('offadmin', 'admin', T, false);
    const E = await base('E', null, null);
    r = await call(hc.updateHandoverStatus, rq(admin, { status: 'Handed Over', rental_reminder_lead_days: 0, rental_ends_on: '2027-03-15' }, { id: E.ho.id })); assert.equal(r.statusCode, 200);
    const eocc = (await q('SELECT id FROM re_rental_occupancies WHERE unit_id=$1', [E.unit.id])).rows[0].id;
    const er = await svc.resolveRecipients(env.pool, { id: eocc, tenant_id: String(T) });
    assert.equal(er.source, 'admin_manager_fallback'); assert.deepEqual(er.users.map(u => u.id).sort(), [admin.id, mgr.id].sort());
    assert.ok(!er.users.some(u => [offAdmin.id, foreign.id, f2.id, emp.id].includes(u.id)), 'not-working, foreign-tenant admins and plain employees never receive');
    s = await svc.scanDueAlerts(env.pool, { now: '2027-03-15T07:00:00Z' }); assert.equal(s.noRecipients, 0);
    assert.equal((await q("SELECT count(*)::int n FROM re_rental_alert_deliveries WHERE occupancy_id=$1", [eocc])).rows[0].n, 2);
    s = await svc.scanDueAlerts(env.pool, { now: '2027-03-15T08:00:00Z' }); assert.equal(s.delivered, 0, 'fallback deliveries dedupe on rescan');
    log('PASS no-recipient occupancy falls back to eligible admin/manager users, deduped');
    // true no-recipient guard: no eligible admin/manager at all -> counted, occupancy id logged
    await q("UPDATE users SET is_working=false WHERE role IN ('admin','manager') AND tenant_id=$1", [T]);
    const F = await base('F', null, null);
    r = await call(hc.updateHandoverStatus, rq(admin, { status: 'Handed Over', rental_reminder_lead_days: 0, rental_ends_on: '2027-03-16' }, { id: F.ho.id })); assert.equal(r.statusCode, 200);
    const focc = (await q('SELECT id FROM re_rental_occupancies WHERE unit_id=$1', [F.unit.id])).rows[0].id;
    const logs = []; const ol = console.log; console.log = (...a) => { logs.push(a.join(' ')); };
    try { s = await svc.scanDueAlerts(env.pool, { now: '2027-03-16T07:00:00Z' }); } finally { console.log = ol; }
    assert.equal(s.noRecipients, 2, 'F plus E (E already delivered but admins now disabled, so still unresolved)'); assert.ok(logs.some(l => l.includes('noRecipientOccupancies=') && l.includes(String(focc))), 'scanner line names the occupancy id: ' + logs.join('|'));
    await q("UPDATE users SET is_working=true WHERE role IN ('admin','manager') AND tenant_id=$1 AND name<>'offadmin'", [T]);
    log('PASS true no-recipient case is counted and the occupancy id is logged');
    // scanner survives a rejected connection
    const flaky = { query: (...a) => env.pool.query(...a), connect: async () => { throw new Error('pool exhausted'); } };
    const res = await svc.scanDueAlerts(flaky, { now: '2030-01-01T00:00:00Z' }); assert.ok(res.processed >= 0);
    log('PASS scanner tolerates connection rejection');
    log('ALL RENTAL TESTS PASSED');
  } finally { await env.stop(); }
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; });
