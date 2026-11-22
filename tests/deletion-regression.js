// Isolated deletion dependency regression. Run from the repository root.
// Requires embedded-postgres and pg in the local test environment.
// Never reads DATABASE_URL. All data is synthetic in a new local temporary PostgreSQL cluster.
require('./helpers/testSafetyGuard');
const EmbeddedPostgres = require('embedded-postgres').default;
const { Pool } = require('pg'); const fs = require('fs'); const REPO = process.env.REPO || process.cwd();
(async () => {
  const dir = fs.mkdtempSync('/tmp/pgdata-'); const port = 54000 + Math.floor(Math.random() * 500);
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'qa', password: 'qa', port, persistent: false });
  await pg.initialise(); await pg.start(); await pg.createDatabase('qa_local');
  const pool = new Pool({ host: '127.0.0.1', port, user: 'qa', password: 'qa', database: 'qa_local', max: 8 });
  const T = '42ee3a33-f056-4e83-b8c2-78a9fb01b411';
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE re_developers(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(255), name TEXT);
    CREATE TABLE re_projects(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(255), developer_id UUID);
    CREATE TABLE re_phases(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(255), project_id UUID);
    CREATE TABLE re_buildings(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(255), project_id UUID, phase_id UUID);
    CREATE TABLE re_units(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), unit_number TEXT, status VARCHAR(50) DEFAULT 'Available', tenant_id VARCHAR(255), branch_id VARCHAR(255), developer_id UUID, project_id UUID, phase_id UUID, building_id UUID);
    CREATE TABLE deals(id SERIAL PRIMARY KEY, tenant_id VARCHAR(255), unit_id VARCHAR(255));
    CREATE TABLE re_contracts(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(255), unit_id VARCHAR(255));
    CREATE TABLE re_cancellations(id SERIAL PRIMARY KEY, tenant_id VARCHAR(255), unit_id VARCHAR(255));
    CREATE TABLE re_handovers(id SERIAL PRIMARY KEY, tenant_id VARCHAR(255), unit_id VARCHAR(255));
    CREATE TABLE re_payments_mvp(id SERIAL PRIMARY KEY, tenant_id VARCHAR(255), unit_id VARCHAR(255));
    CREATE TABLE invoices(id SERIAL PRIMARY KEY, tenant_id VARCHAR(255), unit_id VARCHAR(255));
    CREATE TABLE system_logs(id SERIAL PRIMARY KEY, tenant_id TEXT, user_id INT, action TEXT, entity_type TEXT, entity_id TEXT, details JSONB, level TEXT, ip_address TEXT, user_agent TEXT, created_at TIMESTAMP DEFAULT now());`);
  await pool.query(`ALTER TABLE deals ADD COLUMN branch_id TEXT;
    ALTER TABLE re_contracts ADD COLUMN deal_id INTEGER;
    ALTER TABLE re_cancellations ADD COLUMN deal_id INTEGER;
    ALTER TABLE re_handovers ADD COLUMN deal_id INTEGER, ADD COLUMN contract_id UUID, ADD COLUMN branch_id TEXT, ADD COLUMN status TEXT;`);
  const q = async (...a) => pool.query(...a);
  const rs = (m, v) => { const p = require.resolve(REPO + m); require.cache[p] = { id: p, filename: p, loaded: true, exports: v }; };
  rs('/config/db', { query: q, connect: () => pool.connect() });
  const units = require(REPO + '/controllers/reUnitsController'), hier = require(REPO + '/controllers/reHierarchyController');
  const R = () => ({ code: 200, status(x) { this.code = x; return this; }, json(b) { this.body = b; return this; } });
  const user = { tenant_id: T, id: 1, role: 'admin' };
  const out = (n, v) => console.log(n.padEnd(64), v);
  const mkUnit = async (extra = '') => (await pool.query(`INSERT INTO re_units(unit_number,tenant_id,branch_id ${extra ? ',' + extra.split('=')[0] : ''}) VALUES('U',$1,'b1' ${extra ? ',' + extra.split('=')[1] : ''}) RETURNING id`, [T])).rows[0].id;
  const exists = async (t, id) => (await pool.query(`SELECT count(*) c FROM ${t} WHERE id=$1`, [id])).rows[0].c > 0;

  // 1 clean unit
  let u = await mkUnit(); let r = R(); await units.deleteUnit({ user, branchId: null, params: { id: u } }, r);
  out('1 clean Available unit delete', 'HTTP ' + r.code + ' exists=' + (await exists('re_units', u)));
  // 2 unit with deal
  u = await mkUnit(); await pool.query(`INSERT INTO deals(tenant_id,unit_id) VALUES ($1,$2)`, [T, String(u)]);
  r = R(); await units.deleteUnit({ user, branchId: null, params: { id: u } }, r);
  out('2 unit linked to deal', 'HTTP ' + r.code + ' code=' + (r.body && r.body.code) + ' unit exists=' + (await exists('re_units', u)) + ' deal intact=' + ((await pool.query('SELECT count(*) c FROM deals')).rows[0].c > 0));
  // 3 unit with contract / handover / payment / invoice
  u = await mkUnit();
  await pool.query(`INSERT INTO re_contracts(tenant_id,unit_id) VALUES ($1,$2)`, [T, String(u)]);
  await pool.query(`INSERT INTO re_handovers(tenant_id,unit_id) VALUES ($1,$2)`, [T, String(u)]);
  await pool.query(`INSERT INTO re_payments_mvp(tenant_id,unit_id) VALUES ($1,$2)`, [T, String(u)]);
  await pool.query(`INSERT INTO invoices(tenant_id,unit_id) VALUES ($1,$2)`, [T, String(u)]);
  r = R(); await units.deleteUnit({ user, branchId: null, params: { id: u } }, r);
  out('3 unit linked contract+handover+payment+invoice', 'HTTP ' + r.code + ' linked=' + JSON.stringify(r.body && r.body.linked) + ' exists=' + (await exists('re_units', u)));
  // 4 reserved unit unchanged rule
  u = await mkUnit(); await pool.query(`UPDATE re_units SET status='Reserved' WHERE id=$1`, [u]);
  r = R(); await units.deleteUnit({ user, branchId: null, params: { id: u } }, r);
  out('4 Reserved unit delete', 'HTTP ' + r.code + ' exists=' + (await exists('re_units', u)));
  // 5 empty developer
  let d = (await pool.query(`INSERT INTO re_developers(tenant_id,name) VALUES ($1,'D') RETURNING id`, [T])).rows[0].id;
  r = R(); await hier.deleteDeveloper({ user, params: { id: String(d) } }, r);
  out('5 empty developer delete', 'HTTP ' + r.code + ' exists=' + (await exists('re_developers', d)));
  // 6 developer with unlinked unit under its project (indirect)
  d = (await pool.query(`INSERT INTO re_developers(tenant_id,name) VALUES ($1,'D2') RETURNING id`, [T])).rows[0].id;
  const p = (await pool.query(`INSERT INTO re_projects(tenant_id,developer_id) VALUES ($1,$2) RETURNING id`, [T, d])).rows[0].id;
  await pool.query(`INSERT INTO re_units(unit_number,tenant_id,project_id) VALUES('U',$1,$2)`, [T, p]);
  r = R(); await hier.deleteDeveloper({ user, params: { id: String(d) } }, r);
  out('6 developer with unlinked unit under project', 'HTTP ' + r.code + ' contains=' + JSON.stringify(r.body && r.body.contains) + ' exists=' + (await exists('re_developers', d)));
  // 7 building whose unit is linked to a handover
  const b = (await pool.query(`INSERT INTO re_buildings(tenant_id,project_id) VALUES ($1,$2) RETURNING id`, [T, p])).rows[0].id;
  const u2 = (await pool.query(`INSERT INTO re_units(unit_number,tenant_id,building_id) VALUES('U',$1,$2) RETURNING id`, [T, b])).rows[0].id;
  await pool.query(`INSERT INTO re_handovers(tenant_id,unit_id) VALUES ($1,$2)`, [T, String(u2)]);
  r = R(); await hier.deleteBuilding({ user, params: { id: String(b) } }, r);
  out('7 building with handover-linked unit', 'HTTP ' + r.code + ' linked=' + JSON.stringify(r.body && r.body.linked) + ' exists=' + (await exists('re_buildings', b)));
  // 8 phase with (empty) buildings
  const ph = (await pool.query(`INSERT INTO re_phases(tenant_id,project_id) VALUES ($1,$2) RETURNING id`, [T, p])).rows[0].id;
  await pool.query(`INSERT INTO re_buildings(tenant_id,phase_id) VALUES ($1,$2)`, [T, ph]);
  r = R(); await hier.deletePhase({ user, params: { id: String(ph) } }, r);
  out('8 phase containing a building', 'HTTP ' + r.code + ' contains=' + JSON.stringify(r.body && r.body.contains) + ' exists=' + (await exists('re_phases', ph)));
  // 9 race: deal creation locks unit first, delete must then see the link
  u = await mkUnit();
  const c1 = await pool.connect();
  await c1.query('BEGIN'); await c1.query(`SELECT id FROM re_units WHERE id=$1 FOR UPDATE`, [u]);
  r = R(); const delP = units.deleteUnit({ user, branchId: null, params: { id: u } }, r);
  await new Promise(x => setTimeout(x, 400));
  await c1.query(`INSERT INTO deals(tenant_id,unit_id) VALUES ($1,$2)`, [T, String(u)]); await c1.query('COMMIT'); c1.release();
  await delP;
  out('9 deal created during delete attempt', 'HTTP ' + r.code + ' unit exists=' + (await exists('re_units', u)));
  // 10 two concurrent deletes of one clean unit
  u = await mkUnit(); const r1 = R(), r2 = R();
  await Promise.all([units.deleteUnit({ user, branchId: null, params: { id: u } }, r1), units.deleteUnit({ user, branchId: null, params: { id: u } }, r2)]);
  out('10 concurrent deletes of same unit', 'HTTP ' + r1.code + ' / ' + r2.code + ' exists=' + (await exists('re_units', u)));
  await new Promise(x => setTimeout(x, 400));
  out('11 audit rows', (await pool.query(`SELECT string_agg(entity_type||':'||action, ',') s FROM system_logs`)).rows[0].s);
  const assert = require('node:assert/strict');
  const handovers = require(REPO + '/controllers/reHandoversController');
  const other = { tenant_id: 'other-tenant', id: 2, role: 'admin' };
  const call = async (fn, id, actor = user, branchId = null) => {
    const res = R(); await fn({ user: actor, branchId, params: { id } }, res); return res;
  };
  const deal = (await pool.query(`INSERT INTO deals(tenant_id,branch_id) VALUES($1,'b1') RETURNING id`, [T])).rows[0].id;
  const contract = (await pool.query(`INSERT INTO re_contracts(tenant_id) VALUES($1) RETURNING id`, [T])).rows[0].id;
  for (const role of ['admin', 'manager']) for (const mode of ['deal', 'contract']) {
    const h = (await pool.query(`INSERT INTO re_handovers(tenant_id,status,deal_id,contract_id,branch_id)
      VALUES($1,'Draft',$2,$3,'b1') RETURNING id`, [T, mode === 'deal' ? deal : null, mode === 'contract' ? contract : null])).rows[0].id;
    const rr = await call(handovers.deleteHandover, h, {...user, role});
    assert.equal(rr.code,409); assert.equal(rr.body.code,'HANDOVER_HAS_LINKED_RECORDS'); assert.ok(await exists('re_handovers',h));
    const foreign = await call(handovers.deleteHandover,h,other);
    assert.equal(foreign.code,404); assert.equal(foreign.body.linked,undefined);
    console.log('ASSERT handover Draft linked '+mode+' denied '+role+'; foreign tenant 404 PASS');
  }
  // Own unit plus a corrupt cross-tenant textual reference: no foreign count is disclosed.
  u = await mkUnit(); await pool.query(`INSERT INTO deals(tenant_id,unit_id) VALUES('other-tenant',$1)`,[String(u)]);
  let rr = await call(units.deleteUnit,u,other); assert.equal(rr.code,404); assert.equal(rr.body.linked,undefined);
  rr = await call(units.deleteUnit,u); assert.equal(rr.code,200);
  console.log('ASSERT foreign unit access denied; cross-tenant link not disclosed PASS');
  const foreignD = await call(hier.deleteDeveloper,d,other); assert.equal(foreignD.code,404); assert.equal(foreignD.body.linked,undefined);
  const cleanD = (await pool.query(`INSERT INTO re_developers(tenant_id,name) VALUES($1,'empty') RETURNING id`,[T])).rows[0].id;
  await pool.query(`INSERT INTO re_projects(tenant_id,developer_id) VALUES('other-tenant',$1)`,[cleanD]);
  rr = await call(hier.deleteDeveloper,cleanD); assert.equal(rr.code,200);
  console.log('ASSERT hierarchy tenant denial and child-count isolation PASS');
  const bh = (await pool.query(`INSERT INTO re_handovers(tenant_id,status,deal_id,branch_id) VALUES($1,'Draft',$2,'b2') RETURNING id`,[T,deal])).rows[0].id;
  rr = await call(handovers.deleteHandover,bh,{...user,role:'manager'},'b1'); assert.equal(rr.code,404); assert.equal(rr.body.linked,undefined);
  console.log('ASSERT handover wrong branch 404 no link counts PASS');
  u = await mkUnit();
  const reserveClient = await pool.connect();
  await reserveClient.query('BEGIN'); await reserveClient.query(`SELECT id FROM re_units WHERE id=$1 FOR UPDATE`,[u]);
  const reserveDelete = call(units.deleteUnit,u);
  await new Promise(r=>setTimeout(r,100));
  await reserveClient.query(`UPDATE re_units SET status='Reserved' WHERE id=$1`,[u]); await reserveClient.query('COMMIT'); reserveClient.release();
  rr = await reserveDelete; assert.equal(rr.code,400); assert.ok(await exists('re_units',u));
  console.log('ASSERT reservation committed during delete wait: status rechecked, 400 unchanged PASS');
  const raceB = (await pool.query(`INSERT INTO re_buildings(tenant_id) VALUES($1) RETURNING id`,[T])).rows[0].id;
  const raceU = (await pool.query(`INSERT INTO re_units(tenant_id,building_id) VALUES($1,$2) RETURNING id`,[T,raceB])).rows[0].id;
  const dealClient = await pool.connect();await dealClient.query('BEGIN');await dealClient.query(`SELECT id FROM re_units WHERE id=$1 FOR UPDATE`,[raceU]);
  const hierarchyDelete = call(hier.deleteBuilding,raceB);
  await new Promise(r=>setTimeout(r,100));
  await dealClient.query(`INSERT INTO deals(tenant_id,unit_id) VALUES($1,$2)`,[T,String(raceU)]);await dealClient.query('COMMIT');dealClient.release();
  rr = await hierarchyDelete;assert.equal(rr.code,409);assert.equal(rr.body.linked.deals,1);assert.ok(await exists('re_buildings',raceB));
  console.log('ASSERT building delete waits for unit-linked deal commit, 409 unchanged PASS');
  await pool.query(`CREATE TABLE quotations(id SERIAL PRIMARY KEY,tenant_id TEXT,unit_id TEXT)`);
  for (const table of ['deals','re_contracts','re_cancellations','re_handovers','re_payments_mvp','invoices','quotations']) {
    const x = await mkUnit();
    const link = (await pool.query(`INSERT INTO ${table}(tenant_id,unit_id) VALUES($1,$2) RETURNING id`,[T,String(x)])).rows[0].id;
    const result = await call(units.deleteUnit,x); assert.equal(result.code,409);assert.ok(await exists('re_units',x));assert.ok(await exists(table,link));
    console.log('ASSERT unit link '+table+' 409 both records intact PASS');
  }
  for (const [table, fn] of [['re_projects',hier.deleteProject],['re_phases',hier.deletePhase],['re_buildings',hier.deleteBuilding]]) {
    const x = (await pool.query(`INSERT INTO ${table}(tenant_id) VALUES($1) RETURNING id`,[T])).rows[0].id;
    const result = await call(fn,x);assert.equal(result.code,200);assert.equal(await exists(table,x),false);
    console.log('ASSERT empty '+table+' delete succeeds PASS');
  }
  const indirectU = await mkUnit();await pool.query(`INSERT INTO re_contracts(tenant_id,unit_id) VALUES($1,$2)`,[T,String(indirectU)]);
  const indirectH = (await pool.query(`INSERT INTO re_handovers(tenant_id,status,unit_id) VALUES($1,'Draft',$2) RETURNING id`,[T,String(indirectU)])).rows[0].id;
  rr = await call(handovers.deleteHandover,indirectH);assert.equal(rr.code,409);assert.ok(await exists('re_handovers',indirectH));
  console.log('ASSERT handover indirect unit-to-contract link 409 intact PASS');
  // Fail closed when prerequisite hierarchy columns are missing.
  const emptyB = (await pool.query(`INSERT INTO re_buildings(tenant_id) VALUES($1) RETURNING id`,[T])).rows[0].id;
  await pool.query(`ALTER TABLE re_units DROP COLUMN building_id`);
  rr = await call(hier.deleteBuilding,emptyB); assert.equal(rr.code,500); assert.ok(await exists('re_buildings',emptyB));
  console.log('ASSERT missing hierarchy column fails closed with 500, row unchanged PASS');
  await pool.end(); await pg.stop(); process.exit(0);
})().catch(e => { console.error('ERR', e.stack); process.exit(1); });
