// Isolated real-PostgreSQL regression test. Never reads application DB credentials.
// Requires local dev packages pg and embedded-postgres. Run from repository root:
// node tests/customer_timestamp_guard.integration.cjs [optional-unmodified-baseline]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const EmbeddedPostgres = require('embedded-postgres').default;
const { Pool } = require('pg');
const repo = path.resolve(__dirname, '..');
const baseline = process.argv[2] && path.resolve(process.argv[2]);
const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const branch = '33333333-3333-4333-8333-333333333333';
const results = [];
let cluster;
const pools = [];
let sequence = 0;
async function fixture(withDate) {
  const database = 'customer_guard_' + (++sequence);
  await cluster.createDatabase(database);
  const pool = new Pool({ host: '127.0.0.1', port: cluster.port, user: 'local', password: 'local', database });
  pools.push(pool);
  await pool.query(`
    CREATE TABLE tenants(id UUID PRIMARY KEY);
    CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,tenant_id UUID);
    CREATE TABLE lead_sources(id INTEGER PRIMARY KEY,name TEXT);
    CREATE TABLE customers(id SERIAL PRIMARY KEY,tenant_id UUID,branch_id UUID,name TEXT,
      assigned_to INTEGER,source_id INTEGER${withDate ? ',created_at TIMESTAMPTZ' : ''});
  `);
  await pool.query('INSERT INTO tenants VALUES($1),($2)', [tenantA, tenantB]);
  await pool.query(`INSERT INTO customers(tenant_id,branch_id,name) VALUES
    ($1,$3,'synthetic-own-null'),($2,$3,'synthetic-other-null'),($1,$3,'synthetic-own-dated'),($2,$3,'synthetic-other-dated')`, [tenantA, tenantB, branch]);
  if (withDate) await pool.query("UPDATE customers SET created_at='2001-02-03T04:05:06Z' WHERE id IN (3,4)");
  return pool;
}
function loadController(root, pool) {
  // Populate cache before loading any application module. No config/db code executes.
  const dbPath = require.resolve(path.join(root, 'config/db'));
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: (...a) => pool.query(...a), connect: () => pool.connect() } };
  const controllerPath = require.resolve(path.join(root, 'controllers/customersController'));
  delete require.cache[controllerPath];
  return require(controllerPath);
}
async function read(controller, id = 1) {
  let status = 200, body;
  await controller.getCustomerById({ params: { id }, user: { id: 1, role: 'admin', tenant_id: tenantA, branch_id: branch }, branchId: branch }, {
    status(n) { status = n; return this; }, json(value) { body = value; return this; }
  });
  return { status, body };
}
async function rows(pool) { return (await pool.query('SELECT id,tenant_id,branch_id,name,created_at FROM customers ORDER BY id')).rows; }
async function check(name, fn) { await fn(); results.push({ name, status: 'PASS' }); }
(async () => {
  const port = 57400 + Math.floor(Math.random() * 150);
  cluster = new EmbeddedPostgres({ databaseDir: fs.mkdtempSync(path.join(os.tmpdir(), 'customer-guard-pg-')), user: 'local', password: 'local', port, persistent: false });
  cluster.port = port;
  await cluster.initialise(); await cluster.start();
  if (baseline) await check('baseline actual read reproduces cross-tenant timestamp rewrite', async () => {
    const p = await fixture(true);
    assert.equal((await read(loadController(baseline, p))).status, 200);
    const after = await rows(p);
    assert(after[0].created_at instanceof Date);
    assert(after[1].created_at instanceof Date);
  });
  await check('existing null and known dates in both tenants remain unchanged', async () => {
    const p = await fixture(true), before = await rows(p);
    assert.equal((await read(loadController(repo, p))).status, 200);
    assert.deepEqual(await rows(p), before);
  });
  await check('missing date column does not assign invented dates to legacy rows', async () => {
    const p = await fixture(false);
    assert.equal((await read(loadController(repo, p))).status, 200);
    const after = await rows(p);
    assert.equal(after.length, 4);
    for (const row of after) assert.equal(row.created_at, null);
  });
  await check('future inserts receive default, explicit null and known dates remain respected', async () => {
    const p = await fixture(false);
    await read(loadController(repo, p));
    const inserted = await p.query('INSERT INTO customers(tenant_id,branch_id,name) VALUES($1,$2,$3) RETURNING created_at', [tenantA, branch, 'synthetic-future']);
    assert(inserted.rows[0].created_at instanceof Date);
    const explicit = await p.query("INSERT INTO customers(tenant_id,branch_id,name,created_at) VALUES($1,$2,'synthetic-explicit-null',NULL),($1,$2,'synthetic-known','2002-03-04T05:06:07Z') RETURNING created_at", [tenantA, branch]);
    assert.equal(explicit.rows[0].created_at, null);
    assert.equal(explicit.rows[1].created_at.toISOString(), '2002-03-04T05:06:07.000Z');
  });
  await check('repeat reads and a fresh controller preserve all historical rows', async () => {
    const p = await fixture(true), before = await rows(p);
    let controller = loadController(repo, p);
    await read(controller); await read(controller);
    controller = loadController(repo, p); await read(controller);
    assert.deepEqual(await rows(p), before);
  });
  await check('cross-tenant detail request remains 404 and neither tenant is rewritten', async () => {
    const p = await fixture(true), before = await rows(p);
    assert.equal((await read(loadController(repo, p), 2)).status, 404);
    assert.deepEqual(await rows(p), before);
  });
  console.log('RESULTS ' + JSON.stringify({ count: results.length, results }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const pool of pools) await pool.end();
  if (cluster) await cluster.stop();
});
