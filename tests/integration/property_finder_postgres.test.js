/**
 * REAL-PostgreSQL concurrency verification for the Property Finder lead ingestion.
 *
 * Opt-in: runs ONLY when PF_TEST_PG_URL points at a LOCAL throwaway database (host must be
 * localhost/127.0.0.1). It never reads .env database settings and refuses any non-local host,
 * so it cannot touch Railway/production. Without PF_TEST_PG_URL every test is skipped.
 *
 *   PF_TEST_PG_URL=postgres://user:pw@127.0.0.1:5432/scratch_db node tests/integration/property_finder_postgres.test.js
 *
 * The schema is rebuilt from the repo's own definitions (database/schema.sql shapes for customers/deals/
 * lead_sources, migrations/019 verbatim, migrations/023 verbatim) so the real constraints are exercised.
 */
const url = process.env.PF_TEST_PG_URL;
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const skip = !url;
if (url) {
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Refusing to run: PF_TEST_PG_URL host "${host}" is not local.`);
  }
  // Make sure even the (lazy) default pool in config/db.js can never point at a remote DB.
  process.env.DATABASE_URL = url;
  process.env.DB_HOST = host;
}

const { Pool } = require('pg');
const crypto = require('crypto');
const { encrypt } = require('../../utils/encryption');
const db = require('../../config/db');
const PropertyFinderClient = require('../../services/propertyFinderClient');
const svc = require('../../services/propertyFinderSyncService');

const MIG = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', f), 'utf8');
let pool;
let pgVersion = 'n/a';
const uuid = () => crypto.randomUUID();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const BASE_DDL = `
DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
CREATE TABLE tenants (id UUID PRIMARY KEY, name TEXT, template_name VARCHAR(100) DEFAULT 'general');
CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT, tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE);
-- database/schema.sql: lead_sources + fix-lead-sources-migration unique index
CREATE TABLE lead_sources (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX idx_lead_sources_tenant_unique ON lead_sources(name, tenant_id);
-- database/schema.sql customers (+ columns added at runtime by customersController/dbReconciliation)
CREATE TABLE customers (
  id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, company_name VARCHAR(255), email VARCHAR(255), phone VARCHAR(50), address TEXT,
  source_id INTEGER REFERENCES lead_sources(id) ON DELETE SET NULL, assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL, status VARCHAR(50) DEFAULT 'lead',
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  source VARCHAR(100) DEFAULT 'Direct', notes TEXT, branch_id VARCHAR(255), entity_type VARCHAR(50) DEFAULT 'customer');
CREATE TABLE re_units (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id TEXT, name TEXT, project_name TEXT, unit_number TEXT, type TEXT, price NUMERIC, status TEXT DEFAULT 'Available');
CREATE TABLE products (id SERIAL PRIMARY KEY);
CREATE TABLE projects (id SERIAL PRIMARY KEY);
-- database/schema.sql deals + dealsController.ensureDealColumns + re_units_v2 (unit_id UUID FK: the stricter variant)
CREATE TABLE deals (
  id SERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL, value DECIMAL(15,2) DEFAULT 0.00, pipeline_stage VARCHAR(100) DEFAULT 'discovery',
  client_id INTEGER REFERENCES customers(id) ON DELETE CASCADE, product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL, assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  custom_fields JSONB DEFAULT '{}', tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  branch_id VARCHAR(255), unit_id UUID REFERENCES re_units(id) ON DELETE SET NULL, probability INTEGER DEFAULT 0,
  expected_close_date DATE, next_action VARCHAR(255), source_type VARCHAR(50), source_id VARCHAR(255));
`;

test.before(async () => {
  if (skip) return;
  pool = new Pool({ connectionString: url, max: 30 });
  pgVersion = (await pool.query('SHOW server_version')).rows[0].server_version;
  await pool.query(BASE_DDL);
  await pool.query(MIG('019_property_finder_integration.sql'));
  await pool.query(MIG('023_pf_lead_sync_watermark.sql'));
  // Route the service through the local pool only (independent pooled connections per call)
  db.query = (t, p) => pool.query(t, p);
  db.connect = () => pool.connect();
});

test.after(async () => { if (pool) await pool.end(); });

async function tenant(template = 'real_estate') {
  const id = uuid();
  await pool.query('INSERT INTO tenants (id, name, template_name) VALUES ($1,$2,$3)', [id, 't-' + id.slice(0, 4), template]);
  await pool.query(
    `INSERT INTO property_finder_settings (tenant_id, api_key_encrypted, api_secret_encrypted, is_enabled, is_connected)
     VALUES ($1,$2,$3,true,true)`, [id, encrypt('k'), encrypt('s')]);
  return id;
}

async function counts(t) {
  const q = async (sql) => Number((await pool.query(sql, [t])).rows[0].n);
  return {
    customers: await q(`SELECT count(*) n FROM customers WHERE tenant_id=$1`),
    deals: await q(`SELECT count(*) n FROM deals WHERE tenant_id=$1`),
    mappings: await q(`SELECT count(*) n FROM property_finder_lead_mappings WHERE tenant_id=$1`),
    sources: await q(`SELECT count(*) n FROM lead_sources WHERE tenant_id=$1`),
    orphanCustomers: await q(`SELECT count(*) n FROM customers c WHERE c.tenant_id=$1 AND c.source='Property Finder'
       AND NOT EXISTS (SELECT 1 FROM property_finder_lead_mappings m WHERE m.customer_id=c.id)`),
    mappingsWithoutDeal: await q(`SELECT count(*) n FROM property_finder_lead_mappings m WHERE m.tenant_id=$1
       AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.tenant_id=m.tenant_id AND d.source_type='property_finder' AND d.source_id=m.external_lead_id)`),
    dealsWithoutMapping: await q(`SELECT count(*) n FROM deals d WHERE d.tenant_id=$1 AND d.source_type='property_finder'
       AND NOT EXISTS (SELECT 1 FROM property_finder_lead_mappings m WHERE m.tenant_id=d.tenant_id AND m.external_lead_id=d.source_id)`)
  };
}

async function assertNoLeakedState() {
  await sleep(150);
  const idle = Number((await pool.query(
    `SELECT count(*) n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state LIKE 'idle in transaction%'`)).rows[0].n);
  const adv = Number((await pool.query(`SELECT count(*) n FROM pg_locks WHERE locktype='advisory'`)).rows[0].n);
  assert.equal(idle, 0, 'no transaction may be left open (idle in transaction)');
  assert.equal(adv, 0, 'no advisory lock may remain held after COMMIT/ROLLBACK');
}

test('schema + migrations 019/023 apply cleanly on real PostgreSQL; 023 is re-runnable; unique deal index is correct', { skip }, async () => {
  await pool.query(MIG('023_pf_lead_sync_watermark.sql')); // idempotent re-run
  const t = await tenant();
  const cust = (await pool.query(`INSERT INTO customers (tenant_id,name) VALUES ($1,'x') RETURNING id`, [t])).rows[0].id;
  const ins = (sid, type = 'property_finder') => pool.query(
    `INSERT INTO deals (title, tenant_id, client_id, source_type, source_id) VALUES ('d',$1,$2,$3,$4)`, [t, cust, type, sid]);
  await ins('L-1');
  await assert.rejects(() => ins('L-1'), (e) => e.code === '23505', 'same external lead id twice in one tenant must be rejected');
  await ins('L-2'); // seller case: different external ids for the same enquiry are allowed
  await ins('L-1', 'task'); // other sources are unaffected by the partial index
  await ins(null, 'property_finder'); // NULL source_id never collides
  const other = await tenant();
  const c2 = (await pool.query(`INSERT INTO customers (tenant_id,name) VALUES ($1,'y') RETURNING id`, [other])).rows[0].id;
  await pool.query(`INSERT INTO deals (title, tenant_id, client_id, source_type, source_id) VALUES ('d',$1,$2,'property_finder','L-1')`, [other, c2]);
  console.log(`# PostgreSQL ${pgVersion}`);
});

test('all queries inside ingestLead use the transaction client; the pool-level db.query is only used for the post-commit audit log', async (t) => {
  if (skip) return t.skip();
  const tn = await tenant();
  const outside = [];
  const origQuery = db.query;
  db.query = (sql, p) => { outside.push(String(sql)); return origQuery(sql, p); };
  try {
    const r = await svc.ingestLead(tn, { id: 'txn-1', phone: '+2010', sender: { name: 'T' } });
    assert.equal(r.status, 'created');
  } finally { db.query = origQuery; }
  assert.equal(outside.length, 1);
  assert.match(outside[0], /INSERT INTO property_finder_event_logs/);
  await assertNoLeakedState();
});

test('webhook + poll + retry deliver the SAME lead concurrently (12 parallel connections) -> exactly one customer/deal/mapping', async (t) => {
  if (skip) return t.skip();
  const tn = await tenant();
  const lead = { id: 'race-A', phone: '+20100000001', sender: { name: 'Racer' }, listingId: 'x' };
  const origGet = PropertyFinderClient.prototype.getLeads;
  PropertyFinderClient.prototype.getLeads = async () => ({ data: [lead], pagination: { totalPages: 1 } });
  try {
    const jobs = [
      ...Array.from({ length: 8 }, () => svc.ingestLead(tn, { event: 'lead.created', data: lead })), // webhook envelopes
      svc.pullLeads(tn), svc.pullLeads(tn), // two pollers
      svc.ingestLead(tn, lead), svc.ingestLead(tn, lead) // provider retries
    ];
    const res = await Promise.allSettled(jobs);
    const failed = res.filter(r => r.status === 'rejected');
    assert.equal(failed.length, 0, 'no worker may fail: ' + failed.map(f => f.reason && f.reason.message).join('; '));
  } finally { PropertyFinderClient.prototype.getLeads = origGet; }
  const c = await counts(tn);
  assert.deepEqual([c.customers, c.deals, c.mappings], [1, 1, 1]);
  assert.deepEqual([c.orphanCustomers, c.mappingsWithoutDeal, c.dealsWithoutMapping], [0, 0, 0]);
  await assertNoLeakedState();
});

test('different leads from the same phone/email arrive concurrently -> one customer, one deal + mapping per external lead id', async (t) => {
  if (skip) return t.skip();
  const tn = await tenant();
  // With a configured default lead source the per-tenant source lock is NOT taken, so only the contact
  // locks protect against duplicate customers (otherwise the source lock serialises everything and masks them).
  const srcId = (await pool.query(`INSERT INTO lead_sources (name, tenant_id) VALUES ('Configured',$1) RETURNING id`, [tn])).rows[0].id;
  await pool.query(`UPDATE property_finder_settings SET default_lead_source_id=$2 WHERE tenant_id=$1`, [tn, srcId]);
  // Widen the check-then-insert window: every customer INSERT is slow, so without the contact locks all
  // workers would SELECT "no customer yet" before the first one commits (verified by mutation).
  await pool.query(`CREATE OR REPLACE FUNCTION pf_slow_cust() RETURNS trigger AS $$ BEGIN PERFORM pg_sleep(0.3); RETURN NEW; END $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER pf_slow_cust_trg BEFORE INSERT ON customers FOR EACH ROW EXECUTE FUNCTION pf_slow_cust()`);
  t.after(() => pool.query(`DROP TRIGGER IF EXISTS pf_slow_cust_trg ON customers`));
  const jobs = [];
  for (let i = 0; i < 10; i++) jobs.push(svc.ingestLead(tn, { id: 'same-phone-' + i, phone: '+20122222222', sender: { name: 'P' } }));
  for (let i = 0; i < 6; i++) jobs.push(svc.ingestLead(tn, { id: 'same-mail-' + i, email: 'Shared@Example.com', sender: { name: 'E' } }));
  // seller case: one enquiry fanned out as several lead ids for different agents (same contact)
  for (let i = 0; i < 4; i++) jobs.push(svc.ingestLead(tn, { id: 'seller-' + i, type: 'seller', phone: '+20133333333', email: 'shared@example.com', agentId: 'ag' + i }));
  const res = await Promise.allSettled(jobs);
  assert.equal(res.filter(r => r.status === 'rejected').length, 0, res.filter(r => r.status === 'rejected').map(r => r.reason.message).join('; '));
  const c = await counts(tn);
  // phone group and the (phone+email) seller group are linked through the shared email => see below
  const custRows = (await pool.query(`SELECT id, phone, lower(email) email FROM customers WHERE tenant_id=$1 ORDER BY id`, [tn])).rows;
  const phones = new Set(custRows.map(r => r.phone).filter(Boolean));
  assert.equal(c.deals, 20, 'every external lead id keeps its own deal');
  assert.equal(c.mappings, 20);
  assert.deepEqual([c.orphanCustomers, c.mappingsWithoutDeal, c.dealsWithoutMapping], [0, 0, 0]);
  // No two customers may share the same phone or the same (lowercased) email
  const dupPhone = Number((await pool.query(`SELECT count(*) n FROM (SELECT phone FROM customers WHERE tenant_id=$1 AND phone IS NOT NULL GROUP BY phone HAVING count(*)>1) x`, [tn])).rows[0].n);
  const dupMail = Number((await pool.query(`SELECT count(*) n FROM (SELECT lower(email) FROM customers WHERE tenant_id=$1 AND email IS NOT NULL GROUP BY 1 HAVING count(*)>1) x`, [tn])).rows[0].n);
  assert.deepEqual([dupPhone, dupMail], [0, 0], `duplicate customers detected (customers=${c.customers}, phones=${[...phones]})`);
  await assertNoLeakedState();
});

test('deal creation fails mid-transaction -> everything rolls back (no customer, mapping, or open transaction); retry succeeds; other data untouched', async (t) => {
  if (skip) return t.skip();
  const tn = await tenant();
  const pre = (await pool.query(`INSERT INTO customers (tenant_id,name,phone,notes,status) VALUES ($1,'Pre','+20144444444','keep','active') RETURNING id`, [tn])).rows[0].id;
  await pool.query(`CREATE OR REPLACE FUNCTION pf_fail_deal() RETURNS trigger AS $$ BEGIN
      IF NEW.source_id LIKE 'fail-%' THEN RAISE EXCEPTION 'simulated deal failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER pf_fail_deal_trg BEFORE INSERT ON deals FOR EACH ROW EXECUTE FUNCTION pf_fail_deal()`);
  try {
    await assert.rejects(() => svc.ingestLead(tn, { id: 'fail-1', phone: '+20155555555', sender: { name: 'New' } }), /simulated deal failure/);
    // also a failure for a lead that WOULD have merged into the pre-existing customer: its note update must roll back
    await assert.rejects(() => svc.ingestLead(tn, { id: 'fail-2', phone: '+20144444444', message: 'merge me' }), /simulated deal failure/);
    const c = await counts(tn);
    assert.deepEqual([c.customers, c.deals, c.mappings, c.sources], [1, 0, 0, 0], 'rolled back fully, including the lead_source created in the tx');
    const row = (await pool.query(`SELECT notes FROM customers WHERE id=$1`, [pre])).rows[0];
    assert.equal(row.notes, 'keep', 'merge note on the existing customer must be rolled back too');
    await assertNoLeakedState();
  } finally {
    await pool.query(`DROP TRIGGER pf_fail_deal_trg ON deals`);
  }
  const retry = await svc.ingestLead(tn, { id: 'fail-1', phone: '+20155555555', sender: { name: 'New' } });
  assert.equal(retry.status, 'created');
  const c2 = await counts(tn);
  assert.deepEqual([c2.customers, c2.deals, c2.mappings], [2, 1, 1]);
  await assertNoLeakedState();
});

test('lead source is created once under parallel first-ever leads (no unique-violation failures)', async (t) => {
  if (skip) return t.skip();
  const tn = await tenant();
  const res = await Promise.allSettled(Array.from({ length: 15 }, (_, i) => svc.ingestLead(tn, { id: 'src-' + i, phone: '+2016' + String(1000 + i) })));
  assert.equal(res.filter(r => r.status === 'rejected').length, 0, res.filter(r => r.status === 'rejected').map(r => r.reason.message).join('; '));
  const c = await counts(tn);
  assert.deepEqual([c.sources, c.customers, c.deals, c.mappings], [1, 15, 15, 15]);
  assert.equal((await pool.query(`SELECT count(DISTINCT source_id) n FROM customers WHERE tenant_id=$1`, [tn])).rows[0].n, '1');
  await assertNoLeakedState();
});

test('tenant isolation under concurrency: same lead id and phone in two tenants -> separate records, no cross-linking', async (t) => {
  if (skip) return t.skip();
  const [a, b] = [await tenant(), await tenant()];
  const same = { id: 'shared-id', phone: '+20177777777', sender: { name: 'Same' } };
  const res = await Promise.all([a, b, a, b, a, b].map(tn => svc.ingestLead(tn, same)));
  assert.equal(res.filter(r => r.status === 'created').length, 2);
  for (const tn of [a, b]) {
    const c = await counts(tn);
    assert.deepEqual([c.customers, c.deals, c.mappings], [1, 1, 1]);
  }
  const cross = Number((await pool.query(`SELECT count(*) n FROM property_finder_lead_mappings m JOIN customers c ON c.id=m.customer_id WHERE m.tenant_id<>c.tenant_id`)).rows[0].n);
  assert.equal(cross, 0);
  await assertNoLeakedState();
});

test('the advisory lock really blocks on PostgreSQL: a second ingest waits for another connection that holds the lead lock, then sees its committed work', async (t) => {
  if (skip) return t.skip();
  const tn = await tenant();
  const key = `pf:lead:${tn}:blocked-1`;
  const holder = await pool.connect();
  try {
    await holder.query('BEGIN');
    await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);

    let done = false;
    const pending = svc.ingestLead(tn, { id: 'blocked-1', phone: '+20188888888' }).then(r => { done = true; return r; });
    await sleep(500);
    assert.equal(done, false, 'ingest must be blocked while another connection holds the lead lock');
    const waiting = Number((await pool.query(`SELECT count(*) n FROM pg_locks WHERE locktype='advisory' AND NOT granted`)).rows[0].n);
    assert.ok(waiting >= 1, 'PostgreSQL must show a waiting advisory lock request');

    // the "winner" commits its customer + mapping + deal while holding the lock
    const cid = (await holder.query(`INSERT INTO customers (tenant_id,name,phone,source,status) VALUES ($1,'Winner','+20188888888','Property Finder','lead') RETURNING id`, [tn])).rows[0].id;
    await holder.query(`INSERT INTO property_finder_lead_mappings (tenant_id,customer_id,external_lead_id,channel) VALUES ($1,$2,'blocked-1','form')`, [tn, cid]);
    await holder.query(`INSERT INTO deals (title,tenant_id,client_id,source_type,source_id) VALUES ('w',$1,$2,'property_finder','blocked-1')`, [tn, cid]);
    await holder.query('COMMIT');

    const r = await pending;
    assert.equal(r.status, 'duplicate');
    const c = await counts(tn);
    assert.deepEqual([c.customers, c.deals, c.mappings], [1, 1, 1]);
  } finally { holder.release(); }
  await assertNoLeakedState();
});

test('end-to-end on real PostgreSQL: paginated poll -> customers/deals/mappings/unit link; replay idempotent; watermark persisted by migration 023', async (t) => {
  if (skip) return t.skip();
  const tn = await tenant();
  const unit = (await pool.query(`INSERT INTO re_units (tenant_id,name,unit_number,price) VALUES ($1,'Apt','A-1',3500000) RETURNING id`, [tn])).rows[0].id;
  await pool.query(`INSERT INTO property_finder_listing_mappings (tenant_id, unit_id, external_listing_id) VALUES ($1,$2,'LST-1')`, [tn, unit]);
  const pages = [
    { data: [{ id: 'e1', listingId: 'LST-1', channel: 'whatsapp', sender: { name: 'Ahmed', phone: '+20190000001' }, message: 'hi' },
             { id: 'e2', type: 'project', projectId: 'P1', sender: { name: 'Mona', phone: '+20190000002' } }], pagination: { totalPages: 2 } },
    { data: [{ id: 'e3', type: 'seller', listingId: 'UNMAPPED', sender: { name: 'Karim' } }], pagination: { totalPages: 2 } }
  ];
  const origGet = PropertyFinderClient.prototype.getLeads;
  PropertyFinderClient.prototype.getLeads = async ({ page }) => pages[page - 1];
  try {
    const s1 = await svc.pullLeads(tn);
    assert.deepEqual([s1.fetched, s1.created, s1.errors.length], [3, 3, 0]);
    const s2 = await svc.pullLeads(tn);
    assert.deepEqual([s2.created, s2.duplicates], [0, 3]);
  } finally { PropertyFinderClient.prototype.getLeads = origGet; }
  const c = await counts(tn);
  assert.deepEqual([c.customers, c.deals, c.mappings], [3, 3, 3]);
  const d = (await pool.query(`SELECT d.pipeline_stage, d.unit_id, d.value, d.source_type, c.status, c.source, m.channel
       FROM deals d JOIN customers c ON c.id=d.client_id JOIN property_finder_lead_mappings m ON m.external_lead_id=d.source_id AND m.tenant_id=d.tenant_id
       WHERE d.tenant_id=$1 AND d.source_id='e1'`, [tn])).rows[0];
  assert.deepEqual([d.pipeline_stage, d.unit_id, Number(d.value), d.source_type, d.status, d.source, d.channel],
    ['Lead', unit, 3500000, 'property_finder', 'lead', 'Property Finder', 'whatsapp']);
  assert.equal((await pool.query(`SELECT count(*) n FROM deals WHERE tenant_id=$1 AND source_id='e3' AND unit_id IS NULL`, [tn])).rows[0].n, '1');
  const wm = (await pool.query(`SELECT last_lead_sync_at FROM property_finder_settings WHERE tenant_id=$1`, [tn])).rows[0].last_lead_sync_at;
  assert.ok(wm instanceof Date, 'watermark persisted');
  await assertNoLeakedState();
});
