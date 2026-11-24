'use strict';
const assert = require('assert/strict');
const h = require('./helpers/pgHarness.cjs');
(async () => {
  const env = await h.start(); const q = (...a) => env.pool.query(...a);
  const log = console.log;
  try {
    const T = (await q("INSERT INTO tenants(name,slug) VALUES('t1','t1') RETURNING id")).rows[0].id;
    const T2 = (await q("INSERT INTO tenants(name,slug) VALUES('t2','t2') RETURNING id")).rows[0].id;
    const B = (await q("INSERT INTO branches(name,tenant_id) VALUES('b',$1) RETURNING id", [T])).rows[0].id;
    const B2 = (await q("INSERT INTO branches(name,tenant_id) VALUES('b2',$1) RETURNING id", [T])).rows[0].id;
    const D = (await q("INSERT INTO departments(name,tenant_id) VALUES('d',$1) RETURNING id", [T])).rows[0].id;
    const D2 = (await q("INSERT INTO departments(name,tenant_id) VALUES('d2',$1) RETURNING id", [T2])).rows[0].id;
    const mk = async (n, role, t = T, b = B, dept = D) => (await q("INSERT INTO users(name,email,password_hash,role,tenant_id,branch_id,department_id) VALUES($1,$2,'x',$3,$4,$5,$6) RETURNING *", [n, n + '@x.io', role, t, b, dept])).rows[0];
    const admin = await mk('admin', 'admin'), a = await mk('a', 'employee'), b = await mk('b', 'employee'), c = await mk('c', 'employee'), other = await mk('o', 'employee', T2, null, D2);
    const team = (await q("INSERT INTO sales_teams(tenant_id,branch_id,department_id,name,manager_id) VALUES($1,$2,$3,'Team1',$4) RETURNING id", [T, B, D, c.id])).rows[0].id;
    const teamOtherBranch = (await q("INSERT INTO sales_teams(tenant_id,branch_id,department_id,name) VALUES($1,$2,$3,'TeamB2') RETURNING id", [T, B2, D])).rows[0].id;
    const teamOtherTenant = (await q("INSERT INTO sales_teams(tenant_id,department_id,name) VALUES($1,$2,'TeamT2') RETURNING id", [T2, D2])).rows[0].id;
    await q("INSERT INTO sales_team_members(tenant_id,team_id,user_id,is_active) VALUES($1,$2,$3,false)", [T, team, a.id]); // inactive lead receipt must still be a member
    const deals = require('../controllers/dealsController');
    const asReq = (u, body = {}, params = {}, query = {}) => ({ user: { ...u, tenant_id: u.tenant_id }, branchId: u.branch_id, body, params, query });
    const call = async (fn, req) => { const r = h.mockRes(); await fn(req, r); return r; };

    // team-only deal: no actor auto-assigned
    let r = await call(deals.createDeal, asReq(admin, { title: 'team only', assigned_team_id: team }));
    assert.equal(r.statusCode, 201, JSON.stringify(r.body)); assert.equal(r.body.data.assigned_to, null); assert.equal(r.body.data.assigned_team_id, team);
    const teamOnly = r.body.data.id; log('PASS team-only deal keeps assigned_to NULL');
    // team + member employee (inactive for lead receiving still allowed)
    r = await call(deals.createDeal, asReq(admin, { title: 'team+emp', assigned_team_id: team, assigned_to: a.id }));
    assert.equal(r.statusCode, 201); assert.equal(r.body.data.assigned_to, a.id); const teamEmp = r.body.data.id; log('PASS team + member employee');
    // rejects: non-member, other tenant team, other branch team
    r = await call(deals.createDeal, asReq(admin, { title: 'x', assigned_team_id: team, assigned_to: b.id })); assert.equal(r.statusCode, 400); assert.equal(r.body.code, 'EMPLOYEE_NOT_TEAM_MEMBER');
    r = await call(deals.createDeal, asReq(admin, { title: 'x', assigned_team_id: teamOtherTenant })); assert.equal(r.statusCode, 400); assert.equal(r.body.code, 'INVALID_TEAM');
    r = await call(deals.createDeal, asReq(admin, { title: 'x', assigned_team_id: teamOtherBranch })); assert.equal(r.statusCode, 400); assert.equal(r.body.code, 'TEAM_BRANCH_MISMATCH');
    r = await call(deals.createDeal, asReq(admin, { title: 'x', assigned_team_id: 'abc' })); assert.equal(r.statusCode, 400);
    assert.equal((await q("SELECT count(*)::int n FROM deals WHERE title='x'")).rows[0].n, 0); log('PASS invalid team/employee/tenant/branch rejected, nothing written');
    // individual deal (legacy) still defaults to actor
    r = await call(deals.createDeal, asReq(admin, { title: 'indiv' })); assert.equal(r.body.data.assigned_to, admin.id); assert.equal(r.body.data.assigned_team_id, null); const indiv = r.body.data.id; log('PASS individual deal unchanged (defaults to actor)');
    // visibility
    const ids = async (u) => { const rr = await call(deals.getDeals, asReq(u)); assert.equal(rr.statusCode, 200, JSON.stringify(rr.body)); return rr.body.data.map(x => x.id).sort(); };
    assert.deepEqual(await ids(a), [teamOnly, teamEmp].sort(), 'member sees team deals');
    assert.deepEqual(await ids(c), [teamOnly, teamEmp].sort(), 'team manager sees team deals');
    assert.deepEqual(await ids(b), [], 'non-member sees none');
    assert.equal((await call(deals.getDealById, asReq(b, {}, { id: String(teamOnly) }))).statusCode, 404);
    assert.equal((await call(deals.getDealById, asReq(a, {}, { id: String(teamOnly) }))).statusCode, 200);
    assert.equal((await call(deals.getDealById, asReq(a, {}, { id: String(indiv) }))).statusCode, 404); log('PASS visibility: member/manager see, non-member does not');
    // status change does not auto-assign actor on team-only deal
    r = await call(deals.updateDealStatus, asReq(a, { pipeline_stage: 'qualified' }, { id: String(teamOnly) }));
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.equal((await q('SELECT assigned_to FROM deals WHERE id=$1', [teamOnly])).rows[0].assigned_to, null); log('PASS stage update leaves team-only owner empty');
    // update: set employee to nonmember rejected; to member ok; clear team requires employee
    r = await call(deals.updateDeal, asReq(admin, { assigned_to: b.id }, { id: String(teamOnly) })); assert.equal(r.statusCode, 400); assert.equal(r.body.code, 'EMPLOYEE_NOT_TEAM_MEMBER');
    r = await call(deals.updateDeal, asReq(admin, { assigned_to: a.id }, { id: String(teamOnly) })); assert.equal(r.statusCode, 200, JSON.stringify(r.body)); assert.equal(r.body.data.assigned_to, a.id);
    r = await call(deals.updateDeal, asReq(admin, { assigned_to: '' }, { id: String(teamOnly) })); assert.equal(r.statusCode, 200); assert.equal(r.body.data.assigned_to, null); assert.equal(r.body.data.assigned_team_id, team);
    r = await call(deals.updateDeal, asReq(admin, { assigned_team_id: '' }, { id: String(teamOnly) })); assert.equal(r.statusCode, 400); assert.equal(r.body.code, 'DEAL_NEEDS_OWNER');
    r = await call(deals.updateDeal, asReq(admin, { assigned_team_id: '', assigned_to: b.id }, { id: String(teamOnly) })); assert.equal(r.statusCode, 200); assert.equal(r.body.data.assigned_team_id, null); assert.equal(r.body.data.assigned_to, b.id);
    log('PASS update paths: validate, clear employee, clear team needs owner');
    // reassign onto team deal validates membership
    r = await call(deals.reassignDeal, asReq(admin, { target_user_id: b.id }, { id: String(teamEmp) })); assert.equal(r.statusCode, 400, JSON.stringify(r.body));
    assert.equal((await q('SELECT assigned_to FROM deals WHERE id=$1', [teamEmp])).rows[0].assigned_to, a.id); log('PASS reassign to nonmember blocked and rolled back');
    // concurrency: remove membership while assign in flight cannot yield nonmember owner
    await q("INSERT INTO sales_team_members(tenant_id,team_id,user_id) VALUES($1,$2,$3)", [T, team, b.id]);
    const cl = await env.pool.connect(); await cl.query('BEGIN'); await cl.query('DELETE FROM sales_team_members WHERE team_id=$1 AND user_id=$2', [team, b.id]);
    const pending = call(deals.createDeal, asReq(admin, { title: 'race', assigned_team_id: team, assigned_to: b.id }));
    await new Promise(r => setTimeout(r, 300)); await cl.query('COMMIT'); cl.release();
    r = await pending; assert.equal(r.statusCode, 400); assert.equal(r.body.code, 'EMPLOYEE_NOT_TEAM_MEMBER'); log('PASS membership-removal race: assignment waits on lock then rejects');
    log('ALL TEAM ASSIGNMENT TESTS PASSED');
  } finally { await env.stop(); }
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; });
