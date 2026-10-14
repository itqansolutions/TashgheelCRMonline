const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const axios = require('axios');
const { encrypt } = require('../utils/encryption');
const db = require('../config/db');
const PropertyFinderClient = require('../services/propertyFinderClient');
const svc = require('../services/propertyFinderSyncService');
const controller = require('../controllers/propertyFinderController');

/**
 * End-to-end lead flow tests: incoming event/API page -> normalize -> customers -> deals -> mappings.
 * Uses an in-memory fake of ONLY the SQL statements the lead flow issues. Any unexpected statement
 * (e.g. a touch of whatsapp_* tables) throws, so schema/flow drift fails loudly.
 * These tests prove OUR logic; they do NOT prove Property Finder delivers leads to a real account.
 */

const TA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const originalQuery = db.query;
const originalGetLeads = PropertyFinderClient.prototype.getLeads;
const originalAxiosPost = axios.post;

function makeFakeDb() {
  const s = {
    customers: [], deals: [], leadMaps: [], listingMaps: [], sources: [], events: [], webhookEvents: [],
    settings: {}, templates: {}, units: {}, watermarkWrites: [], lockLog: [], failNext: null, seq: 1
  };
  const q = async (sql, p = []) => {
    if (/whatsapp_/i.test(sql)) throw new Error('Lead flow must not touch WhatsApp conversation tables');
    if (sql.includes('INSERT INTO property_finder_event_logs')) { s.events.push({ type: p[1], sev: p[2] }); return { rows: [] }; }
    if (sql.includes('SELECT webhook_secret_encrypted, is_enabled FROM property_finder_settings')) {
      const st = s.settings[p[0]]; return { rows: st ? [st] : [] };
    }
    if (sql.includes('SELECT * FROM property_finder_settings')) { const st = s.settings[p[0]]; return { rows: st ? [st] : [] }; }
    if (sql.includes('last_lead_sync_at')) { s.watermarkWrites.push({ at: p[0], tenant: p[1] }); s.settings[p[1]].last_lead_sync_at = p[0]; return { rows: [] }; }
    if (sql.includes('INSERT INTO property_finder_lead_mappings')) {
      if (!s.leadMaps.some(m => m.tenant === p[0] && m.ext === p[2])) {
        s.leadMaps.push({ tenant: p[0], customer_id: p[1], ext: p[2], listing: p[3], unit_id: p[4], channel: p[5] });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('DELETE FROM customers')) {
      s.customers = s.customers.filter(c => !(c.id === p[0] && c.tenant === p[1]));
      return { rows: [] };
    }
    if (sql.includes('FROM property_finder_lead_mappings')) {
      return { rows: s.leadMaps.filter(m => m.tenant === p[0] && m.ext === p[1]).map(m => ({ ...m, external_lead_id: m.ext })) };
    }
    if (sql.includes('SELECT id FROM lead_sources')) { return { rows: s.sources.filter(x => x.tenant === p[0]) }; }
    if (sql.includes('INSERT INTO lead_sources')) { const r = { id: s.seq++, tenant: p[0] }; s.sources.push(r); return { rows: [{ id: r.id }] }; }
    if (sql.includes('SELECT unit_id FROM property_finder_listing_mappings')) {
      return { rows: s.listingMaps.filter(m => m.tenant === p[0] && m.ext === p[1]) };
    }
    if (sql.includes('SELECT id, name, notes FROM customers')) {
      const [t, phone, email] = p;
      return { rows: s.customers.filter(c => c.tenant === t && ((phone && c.phone === phone) || (email && (c.email || '').toLowerCase() === email))) };
    }
    if (sql.includes('UPDATE customers')) {
      const c = s.customers.find(x => x.id === p[1] && x.tenant === p[2]);
      if (c) { c.notes = p[0]; c.phone = c.phone || p[3] || null; c.email = c.email || p[4] || null; }
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO customers')) {
      const c = { id: s.seq++, tenant: p[0], name: p[1], phone: p[2], email: p[3], source: 'Property Finder', source_id: p[4], status: 'lead', assigned_to: p[5], notes: p[6] };
      s.customers.push(c); return { rows: [{ id: c.id }] };
    }
    if (sql.includes('SELECT id FROM deals')) { return { rows: s.deals.filter(d => d.tenant === p[0] && d.source_type === 'property_finder' && d.source_id === p[1]) }; }
    if (sql.includes('SELECT template_name FROM tenants')) { return { rows: [{ template_name: s.templates[p[0]] || 'general' }] }; }
    if (sql.includes('FROM re_units')) {
      const u = s.units[p[0]]; return { rows: u && u.tenant === p[1] ? [u] : [] };
    }
    if (sql.includes('INSERT INTO deals')) {
      if (s.failNext === 'deals') { s.failNext = null; throw new Error('simulated deal insert failure'); }
      const d = { id: s.seq++, title: p[0], value: p[1], pipeline_stage: p[2], client_id: p[3], assigned_to: p[4], tenant: p[5], unit_id: p[6], source_type: 'property_finder', source_id: p[7], custom_fields: JSON.parse(p[8]) };
      s.deals.push(d); return { rows: [{ id: d.id }] };
    }
    if (sql.includes('SELECT * FROM property_finder_webhook_events')) {
      return { rows: s.webhookEvents.filter(e => e.tenant === p[0] && e.id === p[1]) };
    }
    if (sql.includes('INSERT INTO property_finder_webhook_events')) {
      if (!s.webhookEvents.some(e => e.tenant === p[0] && e.id === p[1])) s.webhookEvents.push({ tenant: p[0], id: p[1], type: p[2], status: 'received' });
      return { rows: [] };
    }
    if (sql.includes('UPDATE property_finder_webhook_events')) {
      const e = s.webhookEvents.find(x => x.tenant === p[0] && x.id === p[1]);
      if (e) e.status = sql.includes("'processed'") ? 'processed' : 'failed';
      return { rows: [] };
    }
    throw new Error('Unexpected SQL in lead flow: ' + sql.replace(/\s+/g, ' ').slice(0, 120));
  };

  // Pooled-client fake with transaction semantics used by ingestLead:
  //  - every statement yields to the event loop first, so concurrent ingests genuinely interleave
  //  - pg_advisory_xact_lock(hashtext($1)) is a real mutex held until COMMIT/ROLLBACK
  //  - ROLLBACK restores the pre-BEGIN snapshot (only used in single-writer tests)
  const lockQueues = new Map();
  const connect = async () => {
    const held = new Set();
    let snapshot = null;
    const releaseAll = () => { for (const k of held) { const w = lockQueues.get(k); if (w.length) { lockQueues.set(k, w); w.shift()(); } else lockQueues.delete(k); } held.clear(); };
    return {
      async query(sql, p) {
        await new Promise(r => setImmediate(r));
        if (sql === 'BEGIN') { snapshot = JSON.stringify({ customers: s.customers, deals: s.deals, leadMaps: s.leadMaps, sources: s.sources }); return { rows: [] }; }
        if (sql === 'COMMIT') { snapshot = null; releaseAll(); return { rows: [] }; }
        if (sql === 'ROLLBACK') { if (snapshot) Object.assign(s, JSON.parse(snapshot)); snapshot = null; releaseAll(); return { rows: [] }; }
        if (sql.includes('pg_advisory_xact_lock')) {
          const key = p[0];
          if (held.has(key)) return { rows: [] };
          if (lockQueues.has(key)) await new Promise(res => lockQueues.get(key).push(res));
          else lockQueues.set(key, []);
          held.add(key);
          s.lockLog.push(key);
          return { rows: [] };
        }
        return q(sql, p);
      },
      release() { if (held.size) throw new Error('client released while holding advisory locks (missing COMMIT/ROLLBACK)'); }
    };
  };
  db.query = q;
  db.connect = connect;
  return { s, q, connect };
}

function seedTenant(s, tenant, { template = 'real_estate', secret = null, leadSync = true } = {}) {
  s.settings[tenant] = {
    tenant_id: tenant, is_enabled: true, lead_sync_enabled: leadSync, environment: 'sandbox', country_code: 'EG',
    api_key_encrypted: encrypt('key_' + tenant.slice(0, 4)), api_secret_encrypted: encrypt('secret_' + tenant.slice(0, 4)),
    webhook_secret_encrypted: secret ? encrypt(secret) : null, default_assigned_to: 7
  };
  s.templates[tenant] = template;
}

const lead = (id, extra = {}) => ({ id, contactName: undefined, ...extra });

test.afterEach(() => {
  db.query = async () => { throw new Error('Real database access blocked in tests'); };
  db.connect = async () => { throw new Error('Real database access blocked in tests'); };
  PropertyFinderClient.prototype.getLeads = originalGetLeads;
  axios.post = originalAxiosPost;
  delete process.env.MOCK_PROPERTY_FINDER;
});

test('E2E: paginated API leads -> customers (status lead, PF source) -> deals at Lead stage -> mapped unit; replay is idempotent', async () => {
  const { s, q } = makeFakeDb(); db.query = q;
  seedTenant(s, TA);
  s.listingMaps.push({ tenant: TA, ext: 'L-100', unit_id: 'unit-1' });
  s.units['unit-1'] = { tenant: TA, unit_number: 'A-101', name: 'Apt', price: 4500000 };

  const pages = [
    { data: [
      { id: 'ld1', listingId: 'L-100', channel: 'whatsapp', sender: { name: 'Ahmed', phone: '+201001234567', email: 'A@x.com' }, message: 'Viewing Friday?' },
      { id: 'ld2', type: 'project', projectId: 'P-9', sender: { name: 'Mona', phone: '+201111111111' } }
    ], pagination: { totalPages: 2 } },
    { data: [
      { id: 'ld3', type: 'seller', listingId: 'L-100', sender: { name: 'Karim', email: 'karim@x.com' } }
    ], pagination: { totalPages: 2 } }
  ];
  const calls = [];
  PropertyFinderClient.prototype.getLeads = async function (args) { calls.push(args); return pages[args.page - 1]; };

  const stats = await svc.pullLeads(TA);
  assert.equal(stats.fetched, 3); assert.equal(stats.created, 3); assert.equal(stats.errors.length, 0);
  assert.deepEqual(calls.map(c => c.page), [1, 2]);
  assert.ok(calls.every(c => c.perPage === 50));

  // customers: existing CRM model, lead status, PF attribution, contact preserved
  assert.equal(s.customers.length, 3);
  assert.ok(s.customers.every(c => c.status === 'lead' && c.source === 'Property Finder' && c.source_id));
  const ahmed = s.customers.find(c => c.name === 'Ahmed');
  assert.equal(ahmed.phone, '+201001234567');
  assert.equal(ahmed.email, 'a@x.com');

  // deals: real_estate tenant Lead stage, source linkage, unit mapped
  assert.equal(s.deals.length, 3);
  assert.ok(s.deals.every(d => d.pipeline_stage === 'Lead' && d.source_type === 'property_finder'));
  const d1 = s.deals.find(d => d.source_id === 'ld1');
  assert.equal(d1.unit_id, 'unit-1'); assert.equal(d1.value, 4500000);
  assert.equal(s.deals.find(d => d.source_id === 'ld2').custom_fields.lead_type, 'project');
  assert.equal(s.deals.find(d => d.source_id === 'ld3').custom_fields.lead_type, 'seller');

  // WhatsApp-channel lead is flagged as a contact channel, not a conversation
  const m1 = s.leadMaps.find(m => m.ext === 'ld1');
  assert.equal(m1.channel, 'whatsapp');
  assert.match(ahmed.notes, /NOT a WhatsApp conversation/);

  // watermark advanced after a clean run
  assert.equal(s.watermarkWrites.length, 1);

  // Replay: same API pages again -> zero new rows
  const again = await svc.pullLeads(TA);
  assert.equal(again.created, 0); assert.equal(again.duplicates, 3);
  assert.equal(s.customers.length, 3); assert.equal(s.deals.length, 3); assert.equal(s.leadMaps.length, 3);
  // incremental request uses watermark minus overlap
  const lastFrom = calls[calls.length - 1].createdAtFrom;
  const wm = new Date(s.settings[TA].last_lead_sync_at || s.watermarkWrites[0].at).getTime();
  assert.ok(new Date(lastFrom).getTime() <= wm, 'overlap window must reach back before the watermark');
});

test('Existing customer (same phone/email) is upserted, not duplicated; each distinct lead still gets its own deal', async () => {
  const { s, q } = makeFakeDb(); db.query = q; seedTenant(s, TA);
  s.customers.push({ id: 900, tenant: TA, name: 'Old', phone: '+20100', email: null, notes: 'prev', status: 'active' });
  const r = await svc.ingestLead(TA, { id: 'x1', phone: '+20100', email: 'new@x.com', message: 'hi' });
  assert.equal(r.customerCreated, false); assert.equal(r.customerId, 900);
  assert.equal(s.customers.length, 1);
  assert.match(s.customers[0].notes, /prev\n/); assert.equal(s.customers[0].email, 'new@x.com');
  assert.equal(s.customers[0].status, 'active', 'existing customer status must not regress to lead');
  assert.equal(s.deals.length, 1);
});

test('Missing phone/email, empty payload fields, unmapped listing are handled safely', async () => {
  const { s, q } = makeFakeDb(); db.query = q; seedTenant(s, TA);
  const r1 = await svc.ingestLead(TA, { id: 'n1', listingId: 'UNKNOWN-1' });
  const r2 = await svc.ingestLead(TA, { id: 'n2' });
  assert.equal(r1.status, 'created'); assert.equal(r2.status, 'created');
  assert.equal(s.customers.length, 2, 'contactless leads must never be merged into one customer');
  assert.equal(s.customers[0].name, 'Property Finder Lead');
  assert.equal(s.customers[0].phone, null);
  assert.equal(r1.unitId, null);
  assert.equal(s.deals[0].unit_id, null);
  await assert.rejects(() => svc.ingestLead(TA, { name: 'no id' }), /external lead ID/);
  await assert.rejects(() => svc.ingestLead(TA, null), /required/);
  // Non-object garbage must not throw a TypeError
  await assert.rejects(() => svc.ingestLead(TA, 'garbage'), /external lead ID/);
});

test('General (non real-estate) tenant uses the default pipeline stage and no unit link', async () => {
  const { s, q } = makeFakeDb(); db.query = q; seedTenant(s, TA, { template: 'general' });
  await svc.ingestLead(TA, { id: 'g1', phone: '+2010' });
  assert.equal(s.deals[0].pipeline_stage, 'discovery'); assert.equal(s.deals[0].unit_id, null);
});

test('Strict tenant isolation: same lead id / phone / listing id in another tenant never crosses over', async () => {
  const { s, q } = makeFakeDb(); db.query = q; seedTenant(s, TA); seedTenant(s, TB);
  s.listingMaps.push({ tenant: TA, ext: 'L-1', unit_id: 'unitA' });
  s.units.unitA = { tenant: TA, unit_number: 'A', price: 1 };
  await svc.ingestLead(TA, { id: 'same', listingId: 'L-1', phone: '+2099', name: 'A-person' });
  const rb = await svc.ingestLead(TB, { id: 'same', listingId: 'L-1', phone: '+2099', name: 'B-person' });
  assert.equal(rb.status, 'created', 'same external id in a different tenant is NOT a duplicate');
  assert.equal(rb.unitId, null, 'tenant B must not resolve tenant A listing mapping');
  assert.equal(s.customers.length, 2);
  assert.deepEqual(new Set(s.customers.map(c => c.tenant)), new Set([TA, TB]));
  assert.ok(s.deals.every(d => d.client_id === s.customers.find(c => c.tenant === d.tenant).id));
  assert.equal(s.deals.find(d => d.tenant === TB).unit_id, null);
});

test('lead_sync_enabled=false skips ingestion without writing CRM records', async () => {
  const { s, q } = makeFakeDb(); db.query = q; seedTenant(s, TA, { leadSync: false });
  const r = await svc.ingestLead(TA, { id: 'z1', phone: '1' });
  assert.equal(r.status, 'skipped'); assert.equal(s.customers.length, 0);
});

test('Polling: watermark is NOT advanced when any lead fails, so it is retried next run', async () => {
  const { s, q } = makeFakeDb(); db.query = q; seedTenant(s, TA);
  PropertyFinderClient.prototype.getLeads = async () => ({ data: [{ id: 'ok1', phone: '1' }, { name: 'missing id' }] });
  const stats = await svc.pullLeads(TA);
  assert.equal(stats.created, 1); assert.equal(stats.errors.length, 1);
  assert.equal(s.watermarkWrites.length, 0);
});

test('Client: token request matches Atlas spec excerpt (JSON apiKey/apiSecret, no Basic header); secrets never leak in errors', async () => {
  let captured;
  axios.post = async (url, body, cfg) => { captured = { url, body, cfg }; return { data: { accessToken: 'tok123', expiresIn: 3600 } }; };
  const c = new PropertyFinderClient({ apiKey: 'KEY_ABC', apiSecret: 'SECRET_XYZ', environment: 'production', tenantId: 't-auth' });
  assert.equal(await c.getAccessToken(true), 'tok123');
  assert.equal(captured.url, 'https://atlas.propertyfinder.com/v1/auth/token');
  assert.deepEqual(captured.body, { apiKey: 'KEY_ABC', apiSecret: 'SECRET_XYZ' });
  assert.equal(captured.cfg.headers.Authorization, undefined);

  axios.post = async () => { const e = new Error('bad SECRET_XYZ and KEY_ABC'); e.response = { status: 401, data: { message: 'invalid SECRET_XYZ' } }; throw e; };
  const c2 = new PropertyFinderClient({ apiKey: 'KEY_ABC', apiSecret: 'SECRET_XYZ', environment: 'production', tenantId: 't-auth2' });
  await assert.rejects(() => c2.getAccessToken(true), (err) => !/SECRET_XYZ|KEY_ABC/.test(err.message));
});

test('Client: GET /leads uses perPage<=50 and clamps createdAtFrom to the 3-month limit', async () => {
  const c = new PropertyFinderClient({ apiKey: 'k', apiSecret: 's', tenantId: 't-leads' });
  let req;
  c.request = async (r) => { req = r; return { data: [] }; };
  await c.getLeads({ page: 2, perPage: 500, createdAtFrom: '2015-01-01T00:00:00Z' });
  assert.equal(req.endpoint, '/leads'); assert.equal(req.params.perPage, 50); assert.equal(req.params.page, 2);
  const ageDays = (Date.now() - new Date(req.params.createdAtFrom).getTime()) / 86400000;
  assert.ok(ageDays < 90, `createdAtFrom must be inside 3 months, got ${ageDays}d`);
  assert.deepEqual(PropertyFinderClient.extractLeads({ results: [1] }), [1]);
  assert.deepEqual(PropertyFinderClient.extractLeads(null), []);
  assert.deepEqual(PropertyFinderClient.extractListings({ results: [1, 2] }), [1, 2]);
  assert.deepEqual(PropertyFinderClient.extractListings({ data: [3] }), [3]);
  assert.deepEqual(PropertyFinderClient.extractListings(null), []);
});

function webhookReq(tenant, secret, body, eventId, { sign = true } = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  const headers = { 'x-pf-event-id': eventId };
  if (sign) headers['x-pf-signature'] = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return { query: { tenant_id: tenant }, headers, body, rawBody: raw };
}
function webhookRes() { const r = { code: null, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; }
const tick = () => new Promise(r => setTimeout(r, 30));

test('Webhook: lead.created / lead.updated / lead.assigned all ingest idempotently; duplicate event ids are deduped', async () => {
  const { s, q } = makeFakeDb(); db.query = q; seedTenant(s, TA, { secret: 'whsec' });
  const body = (event) => ({ event, data: { id: 'wh-lead-1', phone: '+2055', sender: { name: 'Web' } } });

  for (const [i, ev] of ['lead.created', 'lead.assigned', 'lead.updated'].entries()) {
    const res = webhookRes();
    await controller.handleWebhook(webhookReq(TA, 'whsec', body(ev), 'evt-' + i), res);
    assert.equal(res.code, 200, ev);
  }
  await tick();
  assert.equal(s.customers.length, 1, 'three events for one external lead -> one customer');
  assert.equal(s.deals.length, 1, '... and one deal');

  // Provider redelivers an already processed event id
  const res = webhookRes();
  await controller.handleWebhook(webhookReq(TA, 'whsec', body('lead.created'), 'evt-0'), res);
  assert.equal(res.body.state, 'duplicate');
});

test('Webhook: project lead first seen via lead.assigned (no lead.created) is still captured', async () => {
  const { s, q } = makeFakeDb(); db.query = q; seedTenant(s, TA, { secret: 'whsec' });
  const res = webhookRes();
  await controller.handleWebhook(webhookReq(TA, 'whsec', { event: 'lead.assigned', data: { id: 'proj-1', type: 'project', projectId: 'P1', sender: { name: 'P', phone: '+2077' } } }, 'e-proj'), res);
  await tick();
  assert.equal(s.deals.length, 1); assert.equal(s.deals[0].custom_fields.lead_type, 'project');
});

test('Webhook: a previously FAILED event is re-processed on provider retry', async () => {
  const { s, q } = makeFakeDb(); db.query = q; seedTenant(s, TA, { secret: 'whsec' });
  s.webhookEvents.push({ tenant: TA, id: 'e-retry', type: 'lead.created', status: 'failed' });
  const res = webhookRes();
  await controller.handleWebhook(webhookReq(TA, 'whsec', { event: 'lead.created', data: { id: 'retry-1', phone: '+2088' } }, 'e-retry'), res);
  await tick();
  assert.equal(res.body.state, 'accepted'); assert.equal(s.customers.length, 1);
  assert.equal(s.webhookEvents[0].status, 'processed');
});

test('Webhook security: forged/missing signature rejected; tenant with NO secret fails closed; nothing persisted', async () => {
  const { s, q } = makeFakeDb(); db.query = q; seedTenant(s, TA, { secret: 'whsec' }); seedTenant(s, TB, { secret: null });
  const evt = { event: 'lead.created', data: { id: 'bad-1', phone: '+2099' } };

  const forged = webhookRes();
  await controller.handleWebhook(webhookReq(TA, 'WRONG-secret', evt, 'f1'), forged);
  assert.equal(forged.code, 401);
  const unsigned = webhookRes();
  await controller.handleWebhook(webhookReq(TA, 'whsec', evt, 'f2', { sign: false }), unsigned);
  assert.equal(unsigned.code, 401);
  const noSecret = webhookRes();
  await controller.handleWebhook(webhookReq(TB, 'anything', evt, 'f3'), noSecret);
  assert.equal(noSecret.code, 401);
  await tick();
  assert.equal(s.customers.length, 0); assert.equal(s.leadMaps.length, 0);

  // A payload signed for tenant A's secret cannot be replayed against tenant B (different secret)
  seedTenant(s, TB, { secret: 'whsec-B' });
  const cross = webhookRes();
  await controller.handleWebhook(webhookReq(TB, 'whsec', evt, 'f4'), cross);
  assert.equal(cross.code, 401);
});

test('Concurrency: webhook + poll + retry of the SAME external lead run in parallel -> one customer, one deal, one mapping', async () => {
  const { s } = makeFakeDb(); seedTenant(s, TA);
  const payload = { id: 'race-1', phone: '+2066', sender: { name: 'Racer' } };
  const results = await Promise.all([
    svc.ingestLead(TA, payload), svc.ingestLead(TA, payload), svc.ingestLead(TA, payload)
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), ['created', 'duplicate', 'duplicate']);
  assert.equal(s.customers.length, 1);
  assert.equal(s.deals.length, 1);
  assert.equal(s.leadMaps.length, 1);
  // losers must have written nothing and the winner's customer must be the mapped one
  assert.equal(s.leadMaps[0].customer_id, s.customers[0].id);
});

test('Concurrency: DIFFERENT leads from the same person in parallel -> one customer (contact lock), separate deals', async () => {
  const { s } = makeFakeDb(); seedTenant(s, TA);
  await Promise.all([
    svc.ingestLead(TA, { id: 'p-1', phone: '+2071', sender: { name: 'Same' } }),
    svc.ingestLead(TA, { id: 'p-2', phone: '+2071', sender: { name: 'Same' } }),
    svc.ingestLead(TA, { id: 'p-3', email: 'same@x.com', phone: '+2071' })
  ]);
  assert.equal(s.customers.length, 1, 'no duplicate customer for the same phone');
  assert.equal(s.deals.length, 3, 'each external lead id keeps its own deal (seller leads / multi-agent)');
  assert.equal(s.leadMaps.length, 3);
});

test('Concurrency: first-ever leads in parallel create the Property Finder lead source once', async () => {
  const { s } = makeFakeDb(); seedTenant(s, TA);
  await Promise.all(['a', 'b', 'c'].map(i => svc.ingestLead(TA, { id: 'src-' + i, phone: '+20' + i.charCodeAt(0) })));
  assert.equal(s.sources.length, 1);
});

test('Failure inside the transaction rolls back customer + mapping atomically; nothing is deleted; retry succeeds', async () => {
  const { s } = makeFakeDb(); seedTenant(s, TA);
  s.customers.push({ id: 500, tenant: TA, name: 'Pre-existing', phone: '+2090', email: null, notes: 'keep me', status: 'active' });
  s.failNext = 'deals';
  await assert.rejects(() => svc.ingestLead(TA, { id: 'fail-1', phone: '+2091', sender: { name: 'New' } }), /simulated deal insert failure/);
  assert.equal(s.customers.length, 1, 'new customer rolled back');
  assert.equal(s.customers[0].id, 500, 'pre-existing customer untouched');
  assert.equal(s.leadMaps.length, 0, 'no mapping left behind, so the lead is retried, not lost');
  assert.equal(s.deals.length, 0);

  const retry = await svc.ingestLead(TA, { id: 'fail-1', phone: '+2091', sender: { name: 'New' } });
  assert.equal(retry.status, 'created'); assert.equal(s.customers.length, 2); assert.equal(s.deals.length, 1);
});

test('Safety net: mapping conflict that bypassed the lock rolls back atomically and never DELETEs rows', async () => {
  const { s } = makeFakeDb(); seedTenant(s, TA);
  // Simulate a writer that bypasses the advisory lock: mapping already exists when we try to insert it.
  const realConnect = db.connect;
  db.connect = async () => {
    const cl = await realConnect();
    const orig = cl.query.bind(cl);
    let injected = false;
    cl.query = async (sql, p) => {
      if (!injected && sql.includes('INSERT INTO property_finder_lead_mappings')) {
        injected = true;
        s.leadMaps.push({ tenant: TA, customer_id: 123, ext: 'bypass-1', channel: 'form' });
      }
      return orig(sql, p);
    };
    return cl;
  };
  const r = await svc.ingestLead(TA, { id: 'bypass-1', phone: '+2092' });
  assert.equal(r.status, 'duplicate');
  assert.equal(s.customers.length, 0, 'customer created in this attempt was rolled back (not deleted by id)');
  assert.equal(s.deals.length, 0);
});

test('Locks are taken in a fixed order (lead -> contact -> source) so concurrent ingests cannot deadlock', async () => {
  const { s } = makeFakeDb(); seedTenant(s, TA);
  await svc.ingestLead(TA, { id: 'ord-1', phone: '+2093', email: 'o@x.com' });
  const kinds = s.lockLog.map(k => k.split(':')[1]);
  assert.deepEqual(kinds, ['lead', 'contact', 'contact', 'source']);
});

test('Client: GET request never carries a body (data:null would send "null", Content-Length 4 -> CloudFront 403)', async () => {
  const c = new PropertyFinderClient({ apiKey: 'k'.repeat(40), apiSecret: 's'.repeat(32), environment: 'production', tenantId: TA });
  c.getAccessToken = async () => 'tok';
  const prevAdapter = axios.defaults.adapter;
  let captured;
  axios.defaults.adapter = async (config) => { captured = config; return { data: { data: [] }, status: 200, statusText: 'OK', headers: {}, config }; };
  try {
    await c.getLeads({ page: 1, perPage: 50 });
    assert.equal(captured.method, 'get');
    assert.equal(captured.data, undefined, 'GET must not have a request body');
    // POST bodies must still be sent
    await c.request({ method: 'POST', endpoint: '/x', data: { a: 1 } });
    assert.ok(captured.data, 'POST body must be preserved');
  } finally {
    axios.defaults.adapter = prevAdapter;
  }
});
