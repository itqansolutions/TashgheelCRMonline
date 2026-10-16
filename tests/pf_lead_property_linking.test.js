const test = require('node:test');
const assert = require('node:assert/strict');
const { encrypt } = require('../utils/encryption');
const db = require('../config/db');
const PropertyFinderClient = require('../services/propertyFinderClient');
const svc = require('../services/propertyFinderSyncService');
const dealsController = require('../controllers/dealsController');
const customersController = require('../controllers/customersController');

const TA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const originalQuery = db.query;
const originalConnect = db.connect;
const originalGetListings = PropertyFinderClient.prototype.getListings;
const originalGetLeads = PropertyFinderClient.prototype.getLeads;

function createInMemoryCrmDb() {
  const s = {
    customers: [],
    deals: [],
    leadMaps: [],
    listingMaps: [],
    sources: [],
    events: [],
    branches: [],
    settings: {},
    templates: {},
    units: [],
    projects: [],
    failNextDealBackfill: false,
    allowNullableListingMapUnit: false,
    seq: 1
  };

  const q = async (sql, p = []) => {
    const norm = sql.replace(/\s+/g, ' ').trim();

    if (norm.includes('FROM branches')) {
      return { rows: s.branches.filter(b => b.tenant === p[0] && b.is_main).map(b => ({ id: b.id })) };
    }
    if (norm.includes('INSERT INTO property_finder_event_logs')) {
      s.events.push({ tenant: p[0], type: p[1], sev: p[2], msg: p[3], details: p[4] ? JSON.parse(p[4]) : null });
      return { rows: [] };
    }
    if (norm.includes('SELECT * FROM property_finder_settings')) {
      const st = s.settings[p[0]];
      return { rows: st ? [st] : [] };
    }
    if (norm.includes('UPDATE property_finder_settings')) {
      return { rows: [] };
    }

    // Listing mappings
    if (norm.startsWith('SELECT * FROM property_finder_listing_mappings WHERE tenant_id')) {
      return {
        rows: s.listingMaps.filter(m => m.tenant_id === p[0] && m.external_listing_id === String(p[1]))
      };
    }
    if (norm.startsWith('SELECT unit_id, external_reference FROM property_finder_listing_mappings WHERE tenant_id')) {
      return {
        rows: s.listingMaps.filter(m => m.tenant_id === p[0] && m.external_listing_id === String(p[1]))
      };
    }
    if (norm.startsWith('SELECT unit_id FROM property_finder_listing_mappings WHERE tenant_id') && norm.includes('LOWER(TRIM(external_reference))')) {
      const [tenantId, ref, extListingId] = p;
      const matches = s.listingMaps.filter(m =>
        m.tenant_id === tenantId &&
        m.unit_id != null &&
        String(m.external_reference || '').trim().toLowerCase() === String(ref || '').trim().toLowerCase() &&
        (!extListingId || !m.external_listing_id || m.external_listing_id === String(extListingId))
      );
      return { rows: matches };
    }
    if (norm.startsWith('SELECT unit_id FROM property_finder_listing_mappings WHERE tenant_id')) {
      return {
        rows: s.listingMaps.filter(m => m.tenant_id === p[0] && m.external_listing_id === String(p[1]))
      };
    }
    if (norm.startsWith('UPDATE property_finder_listing_mappings SET')) {
      const [extStatus, pubStatus, portalUrl, rejectionReason, extRef, payloadJson, id] = p;
      const m = s.listingMaps.find(x => x.id === id);
      if (m) {
        m.external_status = extStatus;
        m.publication_status = pubStatus;
        m.portal_url = portalUrl;
        m.rejection_reason = rejectionReason;
        if (extRef) m.external_reference = extRef;
        m.last_payload_snapshot = JSON.parse(payloadJson);
      }
      return { rows: [] };
    }
    if (norm.startsWith('INSERT INTO property_finder_listing_mappings') && norm.includes('VALUES ( $1::uuid, NULL,')) {
      if (!s.allowNullableListingMapUnit) {
        throw new Error('null value in column "unit_id" of relation "property_finder_listing_mappings" violates not-null constraint');
      }
      const [tenantId, extId, extStatus, extRef, portalUrl, ambReason, payloadJson] = p;
      const row = {
        id: s.seq++,
        tenant_id: tenantId,
        unit_id: null,
        external_listing_id: String(extId),
        publication_status: 'sync_error',
        external_status: extStatus,
        external_reference: extRef,
        portal_url: portalUrl,
        rejection_reason: ambReason,
        last_payload_snapshot: JSON.parse(payloadJson)
      };
      s.listingMaps.push(row);
      return { rows: [row] };
    }
    if (norm.startsWith('INSERT INTO property_finder_listing_mappings')) {
      const [tenantId, unitId, extId, pubStatus, extStatus, extRef, portalUrl, payloadJson] = p;
      const existing = s.listingMaps.find(m => m.tenant_id === tenantId && m.external_listing_id === String(extId));
      if (existing) {
        existing.unit_id = existing.unit_id || unitId;
        existing.publication_status = pubStatus;
        existing.external_status = extStatus;
        existing.external_reference = extRef || existing.external_reference;
        existing.portal_url = portalUrl;
        return { rows: [existing] };
      }
      const row = {
        id: s.seq++,
        tenant_id: tenantId,
        unit_id: unitId,
        external_listing_id: String(extId),
        publication_status: pubStatus,
        external_status: extStatus,
        external_reference: extRef,
        portal_url: portalUrl,
        last_payload_snapshot: JSON.parse(payloadJson)
      };
      s.listingMaps.push(row);
      return { rows: [row] };
    }

    // Units
    if (norm.startsWith('SELECT id, name, unit_number, project_name FROM re_units')) {
      const [tenantId, unitCode, candidateCode, extId] = p;
      const matches = s.units.filter(u => {
        if (u.tenant_id !== tenantId) return false;
        const uNum = String(u.unit_number || '').trim().toLowerCase();
        const codeMatch = uNum === String(unitCode || '').trim().toLowerCase() ||
          (candidateCode && uNum === String(candidateCode || '').trim().toLowerCase());
        if (!codeMatch) return false;
        const mappedToOther = s.listingMaps.some(m =>
          m.tenant_id === tenantId && m.unit_id === u.id && m.external_listing_id !== String(extId)
        );
        return !mappedToOther;
      });
      return { rows: matches.slice(0, 2) };
    }
    if (norm.startsWith('UPDATE re_units SET price')) {
      const [price, unitName, targetUnitId, tenantId] = p;
      const u = s.units.find(x => x.id === targetUnitId && x.tenant_id === tenantId);
      if (u) {
        if (!u.price || u.price === 0) u.price = price;
        if (!u.name) u.name = unitName;
      }
      return { rows: [] };
    }
    if (norm.startsWith('INSERT INTO re_units')) {
      const [tenantId, unitName, projectName, safeUnitNumber, unitType, areaSqm, price, rooms, locationText] = p;
      const u = {
        id: `00000000-0000-0000-0000-${String(s.seq++).padStart(12, '0')}`,
        tenant_id: tenantId,
        name: unitName,
        project_name: projectName,
        unit_number: safeUnitNumber,
        type: unitType,
        area_sqm: areaSqm,
        price,
        rooms,
        location: locationText,
        status: 'Available'
      };
      s.units.push(u);
      return { rows: [{ id: u.id }] };
    }
    if (norm.startsWith('SELECT id, unit_number, price, status FROM re_units WHERE id') ||
        norm.startsWith('SELECT unit_number, name, price FROM re_units WHERE id') ||
        norm.startsWith('SELECT price FROM re_units WHERE id')) {
      const [id, tenantId] = p;
      return {
        rows: s.units.filter(u => String(u.id) === String(id) && (!tenantId || u.tenant_id === tenantId))
      };
    }

    // Lead mappings & Backfill
    if (norm.startsWith('SELECT * FROM property_finder_lead_mappings WHERE tenant_id')) {
      return {
        rows: s.leadMaps.filter(m => m.tenant_id === p[0] && m.external_lead_id === String(p[1]))
      };
    }
    if (norm.startsWith('INSERT INTO property_finder_lead_mappings')) {
      const [tenantId, customerId, extLeadId, extListingId, unitId, channel, payloadJson] = p;
      if (!s.leadMaps.some(m => m.tenant_id === tenantId && m.external_lead_id === String(extLeadId))) {
        s.leadMaps.push({
          id: s.seq++,
          tenant_id: tenantId,
          customer_id: customerId,
          external_lead_id: String(extLeadId),
          external_listing_id: extListingId ? String(extListingId) : null,
          unit_id: unitId || null,
          channel,
          raw_enquiry_details: payloadJson ? JSON.parse(payloadJson) : {}
        });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (norm.startsWith('UPDATE property_finder_lead_mappings SET unit_id = $1::uuid, external_listing_id = COALESCE(external_listing_id, $2) WHERE tenant_id')) {
      const [unitId, extListingId, tenantId, extLeadId] = p;
      let count = 0;
      for (const m of s.leadMaps) {
        if (m.tenant_id === tenantId && m.external_lead_id === String(extLeadId) && m.unit_id === null) {
          m.unit_id = unitId;
          if (!m.external_listing_id && extListingId) m.external_listing_id = String(extListingId);
          count++;
        }
      }
      return { rows: [], rowCount: count };
    }
    if (norm.startsWith('UPDATE property_finder_lead_mappings SET unit_id = $1::uuid, external_listing_id = COALESCE(external_listing_id, $3) WHERE tenant_id')) {
      const [unitId, tenantId, extId, canMatchByRef, verifiedExtRef] = p;
      const updated = [];
      for (const m of s.leadMaps) {
        if (m.tenant_id !== tenantId || m.unit_id !== null) continue;
        const matchById = m.external_listing_id === String(extId);
        const rawRef = m.raw_enquiry_details?.listing?.reference ||
          m.raw_enquiry_details?.listingReference ||
          m.raw_enquiry_details?.listing_reference || '';
        const matchByRef = canMatchByRef && !m.external_listing_id && verifiedExtRef &&
          String(rawRef).trim().toLowerCase() === String(verifiedExtRef).trim().toLowerCase();
        if (matchById || matchByRef) {
          m.unit_id = unitId;
          if (!m.external_listing_id) m.external_listing_id = String(extId);
          updated.push({ external_lead_id: m.external_lead_id });
        }
      }
      return { rows: updated, rowCount: updated.length };
    }

    // Deals & Backfill
    if (norm.startsWith('UPDATE deals SET unit_id = $1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id')) {
      if (s.failNextDealBackfill) {
        s.failNextDealBackfill = false;
        throw new Error('simulated transient DB failure during deal unit backfill');
      }
      const [unitId, tenantId, extLeadId] = p;
      let count = 0;
      for (const d of s.deals) {
        if (d.tenant_id === tenantId && d.source_type === 'property_finder' && d.source_id === String(extLeadId) && d.unit_id === null) {
          d.unit_id = unitId;
          count++;
        }
      }
      return { rows: [], rowCount: count };
    }
    if (norm.startsWith('UPDATE deals d SET unit_id = $1, updated_at = CURRENT_TIMESTAMP WHERE d.tenant_id')) {
      if (s.failNextDealBackfill) {
        s.failNextDealBackfill = false;
        throw new Error('simulated transient DB failure during deal unit backfill');
      }
      const [unitId, tenantId, extId, canMatchByRef, verifiedExtRef] = p;
      const updated = [];
      for (const d of s.deals) {
        if (d.tenant_id !== tenantId || d.source_type !== 'property_finder' || d.unit_id !== null) continue;
        const cf = d.custom_fields || {};
        if ((cf.lead_type || 'listing') !== 'listing') continue;
        const matchById = cf.pf_listing_id === String(extId);
        const matchByRef = canMatchByRef && !cf.pf_listing_id && verifiedExtRef &&
          String(cf.pf_listing_reference || '').trim().toLowerCase() === String(verifiedExtRef).trim().toLowerCase();
        const matchByLeadMap = s.leadMaps.some(m =>
          m.tenant_id === tenantId &&
          m.external_lead_id === d.source_id &&
          (m.external_listing_id === String(extId) || String(m.unit_id) === String(unitId)) &&
          String(m.unit_id) === String(unitId)
        );
        if (matchById || matchByRef || matchByLeadMap) {
          d.unit_id = unitId;
          updated.push({ id: d.id });
        }
      }
      return { rows: updated, rowCount: updated.length };
    }

    // Lead sources, customers, deals during ingestLead
    if (norm.includes('SELECT id FROM lead_sources')) {
      return { rows: s.sources.filter(x => x.tenant_id === p[0]) };
    }
    if (norm.includes('INSERT INTO lead_sources')) {
      const r = { id: s.seq++, tenant_id: p[0] };
      s.sources.push(r);
      return { rows: [{ id: r.id }] };
    }
    if (norm.includes('SELECT id, name, notes FROM customers')) {
      const [t, phone, email] = p;
      return {
        rows: s.customers.filter(c =>
          c.tenant_id === t && ((phone && c.phone === phone) || (email && (c.email || '').toLowerCase() === email))
        )
      };
    }
    if (norm.includes('UPDATE customers')) {
      const c = s.customers.find(x => x.id === p[1] && x.tenant_id === p[2]);
      if (c) {
        c.notes = p[0];
        c.phone = c.phone || p[3] || null;
        c.email = c.email || p[4] || null;
      }
      return { rows: [] };
    }
    if (norm.includes('INSERT INTO customers')) {
      const c = {
        id: s.seq++,
        tenant_id: p[0],
        name: p[1],
        phone: p[2],
        email: p[3],
        source: 'Property Finder',
        source_id: p[4],
        assigned_to: p[5],
        status: 'lead',
        notes: p[6],
        branch_id: p[7]
      };
      s.customers.push(c);
      return { rows: [{ id: c.id }] };
    }
    if (norm.startsWith('SELECT id FROM deals WHERE tenant_id')) {
      const rows = s.deals.filter(d =>
        d.tenant_id === p[0] &&
        d.source_type === 'property_finder' &&
        d.source_id === String(p[1]) &&
        (!norm.includes('unit_id IS NULL') || d.unit_id === null)
      );
      return { rows };
    }
    if (norm.includes('SELECT template_name FROM tenants')) {
      return { rows: [{ template_name: s.templates[p[0]] || 'real_estate' }] };
    }
    if (norm.includes('to_regclass')) {
      return { rows: [{ teams_tbl: 'sales_teams', members_tbl: 'sales_team_members' }] };
    }
    if (norm.includes('pg_advisory_xact_lock')) {
      return { rows: [] };
    }
    if (norm.includes('FROM sales_teams') || norm.includes('FROM sales_team_members') || norm.includes('FROM users')) {
      return { rows: [] };
    }
    if (norm.startsWith('INSERT INTO deals')) {
      const d = {
        id: s.seq++,
        title: p[0],
        value: p[1],
        pipeline_stage: p[2],
        client_id: p[3],
        assigned_to: p[4],
        tenant_id: p[5],
        unit_id: p[6],
        source_type: 'property_finder',
        source_id: String(p[7]),
        custom_fields: JSON.parse(p[8]),
        branch_id: p[9],
        created_at: new Date().toISOString()
      };
      s.deals.push(d);
      return { rows: [{ id: d.id }] };
    }

    throw new Error('Unexpected SQL in pf_lead_property_linking test: ' + norm.slice(0, 140));
  };

  // Transactional client with snapshot rollback support
  const connect = async () => {
    let snapshot = null;
    return {
      async query(sql, p) {
        if (sql === 'BEGIN') {
          snapshot = JSON.stringify({
            customers: s.customers,
            deals: s.deals,
            leadMaps: s.leadMaps,
            listingMaps: s.listingMaps,
            units: s.units,
            sources: s.sources
          });
          return { rows: [] };
        }
        if (sql === 'COMMIT') {
          snapshot = null;
          return { rows: [] };
        }
        if (sql === 'ROLLBACK') {
          if (snapshot) {
            const restored = JSON.parse(snapshot);
            s.customers = restored.customers;
            s.deals = restored.deals;
            s.leadMaps = restored.leadMaps;
            s.listingMaps = restored.listingMaps;
            s.units = restored.units;
            s.sources = restored.sources;
          }
          snapshot = null;
          return { rows: [] };
        }
        return q(sql, p);
      },
      release() {}
    };
  };

  db.query = q;
  db.connect = connect;
  return { s, q, connect };
}

function seedTenant(s, tenant, { template = 'real_estate' } = {}) {
  s.branches.push({ id: 'branch-' + tenant.slice(0, 4), tenant, is_main: true });
  s.settings[tenant] = {
    tenant_id: tenant,
    is_enabled: true,
    lead_sync_enabled: true,
    listing_sync_enabled: true,
    environment: 'sandbox',
    country_code: 'EG',
    api_key_encrypted: encrypt('key_' + tenant.slice(0, 4)),
    api_secret_encrypted: encrypt('secret_' + tenant.slice(0, 4)),
    default_assigned_to: 7
  };
  s.templates[tenant] = template;
}

test.afterEach(() => {
  db.query = async () => ({ rows: [], rowCount: 0 });
  db.connect = async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release() {} });
  PropertyFinderClient.prototype.getListings = originalGetListings;
  PropertyFinderClient.prototype.getLeads = originalGetLeads;
  delete process.env.MOCK_PROPERTY_FINDER;
});

test('1. Listing imported before its lead -> automatic linking sets unit_id on lead mapping and deal', async () => {
  const { s } = createInMemoryCrmDb();
  seedTenant(s, TA);

  PropertyFinderClient.prototype.getListings = async () => ({
    results: [
      {
        id: 'PF-LIST-101',
        reference: 'REF-VILLA-101',
        title: { en: 'Luxury Sea View Villa' },
        price: { amounts: { sale: 12500000 } },
        state: { type: 'live' }
      }
    ],
    pagination: { page: 1, totalPages: 1 }
  });

  const importRes = await svc.importListings(TA);
  assert.equal(importRes.created, 1);
  assert.equal(s.units.length, 1);
  assert.equal(s.units[0].unit_number, 'REF-VILLA-101');
  assert.equal(s.units[0].name, 'Luxury Sea View Villa');
  assert.equal(s.listingMaps[0].external_reference, 'REF-VILLA-101');

  const leadRes = await svc.ingestLead(TA, {
    id: 'PF-LEAD-101',
    channel: 'whatsapp',
    entityType: 'listing',
    sender: { name: 'Omar Hassan', contacts: [{ type: 'phone', value: '+201011112222' }] },
    listing: { id: 'PF-LIST-101', reference: 'REF-VILLA-101' }
  });

  assert.equal(leadRes.status, 'created');
  assert.equal(s.leadMaps.length, 1);
  assert.equal(s.leadMaps[0].unit_id, s.units[0].id);
  assert.equal(s.deals.length, 1);
  assert.equal(s.deals[0].unit_id, s.units[0].id);
  assert.equal(s.deals[0].value, 12500000);
  assert.equal(s.deals[0].custom_fields.pf_listing_id, 'PF-LIST-101');
  assert.equal(s.deals[0].custom_fields.pf_listing_reference, 'REF-VILLA-101');
});

test('2. Lead received before its listing -> unit_id is NULL initially -> listing imported later -> safe backfill links lead mapping and deal', async () => {
  const { s } = createInMemoryCrmDb();
  seedTenant(s, TA);

  const leadRes = await svc.ingestLead(TA, {
    id: 'PF-LEAD-202',
    channel: 'call',
    entityType: 'listing',
    sender: { name: 'Nour Adel', contacts: [{ type: 'phone', value: '+201022223333' }] },
    listing: { id: 'PF-LIST-202', reference: 'REF-APT-202' }
  });

  assert.equal(leadRes.status, 'created');
  assert.equal(s.leadMaps[0].unit_id, null);
  assert.equal(s.deals[0].unit_id, null);

  PropertyFinderClient.prototype.getListings = async () => ({
    results: [
      {
        id: 'PF-LIST-202',
        reference: 'REF-APT-202',
        title: { en: 'Penthouse 202' },
        price: { amounts: { sale: 6800000 } },
        state: { type: 'live' }
      }
    ],
    pagination: { page: 1, totalPages: 1 }
  });

  const importRes = await svc.importListings(TA);
  assert.equal(importRes.created, 1);
  assert.equal(importRes.backfilledLeads, 1);

  const createdUnitId = s.units[0].id;
  assert.equal(s.leadMaps[0].unit_id, createdUnitId);
  assert.equal(s.deals[0].unit_id, createdUnitId);
});

test('3. Duplicate lead delivered by both webhook and polling -> no duplicate customer/deal/mapping; if initially unlinked and listing now exists, duplicate delivery repairs unit_id', async () => {
  const { s } = createInMemoryCrmDb();
  seedTenant(s, TA);

  const rawLead = {
    id: 'PF-LEAD-303',
    channel: 'email',
    entityType: 'listing',
    sender: { name: 'Karim Zaki', contacts: [{ type: 'phone', value: '+201033334444' }] },
    listing: { id: 'PF-LIST-303', reference: 'REF-303' }
  };

  // First delivery (webhook) before listing is mapped
  const first = await svc.ingestLead(TA, rawLead);
  assert.equal(first.status, 'created');
  assert.equal(s.deals.length, 1);
  assert.equal(s.deals[0].unit_id, null);

  // Listing mapping becomes available in DB
  const unit = {
    id: '00000000-0000-0000-0000-000000000303',
    tenant_id: TA,
    unit_number: 'REF-303',
    name: 'Duplex 303',
    price: 5000000,
    status: 'Available'
  };
  s.units.push(unit);
  s.listingMaps.push({
    id: 99,
    tenant_id: TA,
    unit_id: unit.id,
    external_listing_id: 'PF-LIST-303',
    external_reference: 'REF-303',
    publication_status: 'published'
  });

  // Second delivery (polling) of the same lead repairs unit_id without creating duplicates
  const second = await svc.ingestLead(TA, rawLead);
  assert.equal(second.status, 'duplicate');
  assert.equal(second.repairedUnitLink, true);
  assert.equal(second.unitId, unit.id);
  assert.equal(s.customers.length, 1);
  assert.equal(s.deals.length, 1);
  assert.equal(s.leadMaps.length, 1);
  assert.equal(s.leadMaps[0].unit_id, unit.id);
  assert.equal(s.deals[0].unit_id, unit.id);
});

test('4. Listing on a later pagination page (page 2 & page 3) -> fetched and mapped by importListings', async () => {
  const { s } = createInMemoryCrmDb();
  seedTenant(s, TA);

  const requestedPages = [];
  PropertyFinderClient.prototype.getListings = async ({ page }) => {
    requestedPages.push(page);
    if (page === 1) {
      return {
        results: [{ id: 'L-P1', reference: 'REF-P1', title: 'Unit P1', price: 1000000 }],
        pagination: { page: 1, perPage: 1, totalPages: 3 }
      };
    }
    if (page === 2) {
      return {
        results: [{ id: 'L-P2', reference: 'REF-P2', title: 'Unit P2', price: 2000000 }],
        pagination: { page: 2, perPage: 1, totalPages: 3 }
      };
    }
    return {
      results: [{ id: 'L-P3', reference: 'REF-P3', title: 'Unit P3', price: 3000000 }],
      pagination: { page: 3, perPage: 1, totalPages: 3 }
    };
  };

  const res = await svc.importListings(TA);
  assert.deepEqual(requestedPages, [1, 2, 3]);
  assert.equal(res.pages, 3);
  assert.equal(res.created, 3);
  assert.equal(s.listingMaps.length, 3);

  // Lead referencing the listing from page 3 links automatically
  await svc.ingestLead(TA, {
    id: 'LEAD-ON-P3',
    channel: 'whatsapp',
    sender: { name: 'Page Three Buyer', contacts: [{ type: 'phone', value: '+201044445555' }] },
    listing: { id: 'L-P3', reference: 'REF-P3' }
  });
  assert.equal(s.deals.length, 1);
  const unitP3 = s.units.find(u => u.unit_number === 'REF-P3');
  assert.ok(unitP3);
  assert.equal(s.deals[0].unit_id, unitP3.id);
});

test('5. Missing or ambiguous listing reference -> unit_id remains NULL (never links to an arbitrary unit)', async () => {
  const { s } = createInMemoryCrmDb();
  seedTenant(s, TA);

  // Create two different listing mappings that share the same external_reference (ambiguous reference)
  s.units.push({ id: '00000000-0000-0000-0000-000000000001', tenant_id: TA, unit_number: 'A-1', name: 'Unit 1', price: 1000000 });
  s.units.push({ id: '00000000-0000-0000-0000-000000000002', tenant_id: TA, unit_number: 'A-2', name: 'Unit 2', price: 1200000 });
  s.listingMaps.push(
    { id: 1, tenant_id: TA, unit_id: '00000000-0000-0000-0000-000000000001', external_listing_id: 'EXT-1', external_reference: 'DUP-REF' },
    { id: 2, tenant_id: TA, unit_id: '00000000-0000-0000-0000-000000000002', external_listing_id: 'EXT-2', external_reference: 'DUP-REF' }
  );

  // Lead arrives with unknown listing ID and the ambiguous reference 'DUP-REF'
  await svc.ingestLead(TA, {
    id: 'LEAD-AMB-1',
    channel: 'call',
    entityType: 'listing',
    sender: { name: 'Ambiguous Lead', contacts: [{ type: 'phone', value: '+201055556666' }] },
    listing: { id: 'UNKNOWN-EXT-ID', reference: 'DUP-REF' }
  });

  assert.equal(s.deals.length, 1);
  assert.equal(s.deals[0].unit_id, null);
  assert.equal(s.leadMaps[0].unit_id, null);
});

test('6. Project and Seller leads without a listing -> unit_id remains NULL and metadata is preserved', async () => {
  const { s } = createInMemoryCrmDb();
  seedTenant(s, TA);

  // Seed a listing mapping that happens to have external_reference = 'PROJ-99'
  s.units.push({ id: '00000000-0000-0000-0000-000000000099', tenant_id: TA, unit_number: 'PROJ-99', name: 'Trap Unit', price: 3000000 });
  s.listingMaps.push({
    id: 10,
    tenant_id: TA,
    unit_id: '00000000-0000-0000-0000-000000000099',
    external_listing_id: 'LIST-99',
    external_reference: 'PROJ-99'
  });

  // Project lead without a specific listing
  await svc.ingestLead(TA, {
    id: 'LEAD-PROJ-1',
    channel: 'email',
    entityType: 'project',
    sender: { name: 'Project Inquirer', contacts: [{ type: 'phone', value: '+201066667777' }] },
    project: { id: 'PROJ-99' }
  });

  // Seller lead without a listing
  await svc.ingestLead(TA, {
    id: 'LEAD-SELLER-1',
    channel: 'call',
    entityType: 'seller',
    sender: { name: 'Property Owner', contacts: [{ type: 'phone', value: '+201066668888' }] }
  });

  assert.equal(s.deals.length, 2);
  assert.equal(s.deals[0].unit_id, null);
  assert.equal(s.deals[0].custom_fields.pf_project_id, 'PROJ-99');
  assert.equal(s.deals[0].custom_fields.lead_type, 'project');

  assert.equal(s.deals[1].unit_id, null);
  assert.equal(s.deals[1].custom_fields.lead_type, 'seller');
});

test('7. Duplicate external listing IDs or references across different tenants -> strict tenant isolation', async () => {
  const { s } = createInMemoryCrmDb();
  seedTenant(s, TA);
  seedTenant(s, TB);

  // Tenant B has listing 'SHARED-LIST-ID' mapped to Tenant B's unit
  s.units.push({ id: '00000000-0000-0000-0000-000000000050', tenant_id: TB, unit_number: 'SHARED-REF', name: 'Tenant B Unit', price: 9000000 });
  s.listingMaps.push({
    id: 50,
    tenant_id: TB,
    unit_id: '00000000-0000-0000-0000-000000000050',
    external_listing_id: 'SHARED-LIST-ID',
    external_reference: 'SHARED-REF'
  });

  // Tenant A receives a lead with the same external listing ID and reference
  await svc.ingestLead(TA, {
    id: 'LEAD-TENANT-A',
    channel: 'whatsapp',
    entityType: 'listing',
    sender: { name: 'Tenant A Client', contacts: [{ type: 'phone', value: '+201077778888' }] },
    listing: { id: 'SHARED-LIST-ID', reference: 'SHARED-REF' }
  });

  const tenantADeal = s.deals.find(d => d.tenant_id === TA);
  assert.ok(tenantADeal);
  assert.equal(tenantADeal.unit_id, null, 'Tenant A deal must never link to Tenant B unit');

  // Running backfill on Tenant B must never touch Tenant A's deal
  await svc.backfillUnlinkedLeadsForListing(TB, 'SHARED-LIST-ID');
  assert.equal(tenantADeal.unit_id, null);
});

test('8. Existing non-NULL unit_id is never overwritten by backfill or by updateDeal', async () => {
  const { s } = createInMemoryCrmDb();
  seedTenant(s, TA);

  const origUnitId = '00000000-0000-0000-0000-000000000801';
  const newUnitId = '00000000-0000-0000-0000-000000000802';

  s.units.push(
    { id: origUnitId, tenant_id: TA, unit_number: 'ORIG-1', name: 'Original Unit', price: 4000000 },
    { id: newUnitId, tenant_id: TA, unit_number: 'NEW-2', name: 'New Unit', price: 5000000 }
  );

  // Deal already linked to origUnitId
  s.deals.push({
    id: 501,
    tenant_id: TA,
    title: 'Existing Linked Deal',
    value: 4000000,
    pipeline_stage: 'Negotiation',
    client_id: 1,
    assigned_to: 7,
    unit_id: origUnitId,
    source_type: 'property_finder',
    source_id: 'PF-LEAD-501',
    custom_fields: { pf_listing_id: 'PF-LIST-501', pf_listing_reference: 'NEW-2' },
    branch_id: 'branch-aaaa'
  });
  s.leadMaps.push({
    id: 601,
    tenant_id: TA,
    customer_id: 1,
    external_lead_id: 'PF-LEAD-501',
    external_listing_id: 'PF-LIST-501',
    unit_id: origUnitId,
    channel: 'call',
    raw_enquiry_details: {}
  });
  s.listingMaps.push({
    id: 701,
    tenant_id: TA,
    unit_id: newUnitId,
    external_listing_id: 'PF-LIST-501',
    external_reference: 'NEW-2'
  });

  // 8a. Backfill must not overwrite existing non-NULL unit_id
  const bf = await svc.backfillUnlinkedLeadsForListing(TA, 'PF-LIST-501');
  assert.equal(bf.repairedDeals, 0);
  assert.equal(s.deals[0].unit_id, origUnitId);
  assert.equal(s.leadMaps[0].unit_id, origUnitId);

  // 8b. dealsController.updateDeal rejects overwriting non-NULL unit_id with 400 UNIT_ALREADY_LINKED
  db.query = async (sql) => {
    const norm = sql.replace(/\s+/g, ' ').trim();
    if (norm.startsWith('ALTER TABLE deals')) return { rows: [] };
    if (norm.includes('SELECT * FROM deals WHERE id = $1')) {
      return { rows: [s.deals[0]] };
    }
    throw new Error('Unexpected SQL in updateDeal overwrite check: ' + norm);
  };

  let statusCode = 200;
  let body = null;
  const req = {
    params: { id: 501 },
    body: { unit_id: newUnitId },
    user: { id: 1, tenant_id: TA, role: 'admin', permissions: ['deal.edit_details'] },
    ip: '127.0.0.1'
  };
  const res = {
    status(c) { statusCode = c; return this; },
    json(b) { body = b; return this; }
  };

  await dealsController.updateDeal(req, res);
  assert.equal(statusCode, 400);
  assert.equal(body.code, 'UNIT_ALREADY_LINKED');
  assert.equal(s.deals[0].unit_id, origUnitId);
});

test('9. Backfill preserves existing deal pipeline_stage, assigned_to, SLA fields, activity history, value, and title', async () => {
  const { s } = createInMemoryCrmDb();
  seedTenant(s, TA);

  const unit900 = '00000000-0000-0000-0000-000000000900';
  s.units.push({ id: unit900, tenant_id: TA, unit_number: 'U-900', name: 'Villa 900', price: 15000000 });
  s.listingMaps.push({
    id: 900,
    tenant_id: TA,
    unit_id: unit900,
    external_listing_id: 'PF-LIST-900',
    external_reference: 'U-900'
  });

  const existingDeal = {
    id: 901,
    tenant_id: TA,
    title: 'Custom Sales Title - Edited by Agent',
    value: 14200000,
    pipeline_stage: 'Site Visit Scheduled',
    client_id: 42,
    assigned_to: 19,
    unit_id: null,
    source_type: 'property_finder',
    source_id: 'PF-LEAD-900',
    next_followup_at: '2026-10-18T10:00:00.000Z',
    sla_alerted_at: '2026-10-15T10:00:00.000Z',
    custom_fields: {
      pf_listing_id: 'PF-LIST-900',
      pf_listing_reference: 'U-900',
      lead_type: 'listing',
      activity_notes: ['Called client, agreed on Thursday visit']
    },
    branch_id: 'branch-aaaa'
  };
  s.deals.push(existingDeal);
  s.leadMaps.push({
    id: 902,
    tenant_id: TA,
    customer_id: 42,
    external_lead_id: 'PF-LEAD-900',
    external_listing_id: 'PF-LIST-900',
    unit_id: null,
    channel: 'whatsapp',
    raw_enquiry_details: {}
  });

  const bf = await svc.backfillUnlinkedLeadsForListing(TA, 'PF-LIST-900');
  assert.equal(bf.repairedDeals, 1);
  assert.equal(existingDeal.unit_id, unit900);

  // Verify no commercial or workflow fields were altered
  assert.equal(existingDeal.title, 'Custom Sales Title - Edited by Agent');
  assert.equal(existingDeal.value, 14200000);
  assert.equal(existingDeal.pipeline_stage, 'Site Visit Scheduled');
  assert.equal(existingDeal.assigned_to, 19);
  assert.equal(existingDeal.next_followup_at, '2026-10-18T10:00:00.000Z');
  assert.equal(existingDeal.sla_alerted_at, '2026-10-15T10:00:00.000Z');
  assert.deepEqual(existingDeal.custom_fields.activity_notes, ['Called client, agreed on Thursday visit']);
});

test('10. Customer 360, getDealById, and getDeals return linked property details (unit_id, unit_number, unit_name, unit_project)', async () => {
  const capturedSqls = [];
  db.query = async (sql) => {
    const norm = sql.replace(/\s+/g, ' ').trim();
    capturedSqls.push(norm);

    if (norm.startsWith('ALTER TABLE deals')) {
      return { rows: [] };
    }
    if (norm.includes('SELECT template_name FROM tenants')) {
      return { rows: [{ template_name: 'real_estate' }] };
    }
    if (norm.includes('FROM deals d') && norm.includes('ORDER BY d.created_at DESC') && !norm.includes('WHERE d.client_id')) {
      return {
        rows: [
          {
            id: 77,
            title: 'Property Finder Lead - Omar - REF-VILLA-101',
            unit_id: 'unit-101',
            unit_number: 'REF-VILLA-101',
            unit_name: 'Luxury Sea View Villa',
            unit_project: 'Palm Hills',
            custom_fields: { pf_listing_id: 'PF-LIST-101', pf_listing_reference: 'REF-VILLA-101' }
          }
        ]
      };
    }
    if (norm.includes('FROM deals d') && norm.includes('WHERE d.id = $1')) {
      return {
        rows: [
          {
            id: 77,
            title: 'Property Finder Lead - Omar - REF-VILLA-101',
            unit_id: 'unit-101',
            unit_number: 'REF-VILLA-101',
            unit_name: 'Luxury Sea View Villa',
            unit_project: 'Palm Hills',
            custom_fields: { pf_listing_id: 'PF-LIST-101', pf_listing_reference: 'REF-VILLA-101' }
          }
        ]
      };
    }
    if (norm.includes('FROM customers c') && norm.includes('WHERE c.id::text = $1::text')) {
      return { rows: [{ id: 12, name: 'Omar Hassan', tenant_id: TA, branch_id: 'branch-aaaa' }] };
    }
    if (norm.includes('FROM deals d') && norm.includes('WHERE d.client_id::text = $1::text')) {
      return {
        rows: [
          {
            id: 77,
            title: 'Property Finder Lead - Omar - REF-VILLA-101',
            unit_id: 'unit-101',
            unit_number: 'REF-VILLA-101',
            unit_name: 'Luxury Sea View Villa',
            unit_project_name: 'Palm Hills',
            custom_fields: { pf_listing_id: 'PF-LIST-101', pf_listing_reference: 'REF-VILLA-101' },
            created_at: new Date().toISOString()
          }
        ]
      };
    }
    return { rows: [] };
  };

  const makeRes = () => {
    let status = 200;
    let payload = null;
    return {
      status(c) { status = c; return this; },
      json(p) { payload = p; return this; },
      getStatus: () => status,
      getPayload: () => payload
    };
  };

  // 10a. getDeals (Deals list & Kanban)
  const resList = makeRes();
  await dealsController.getDeals(
    { query: {}, user: { id: 1, tenant_id: TA, role: 'admin', branch_id: 'branch-aaaa' } },
    resList
  );
  assert.equal(resList.getStatus(), 200);
  assert.equal(resList.getPayload().data[0].unit_id, 'unit-101');
  assert.equal(resList.getPayload().data[0].unit_number, 'REF-VILLA-101');
  assert.equal(resList.getPayload().data[0].unit_name, 'Luxury Sea View Villa');
  assert.equal(resList.getPayload().data[0].unit_project, 'Palm Hills');

  // 10b. getDealById (Deal details)
  const resDetail = makeRes();
  await dealsController.getDealById(
    { params: { id: 77 }, user: { id: 1, tenant_id: TA, role: 'admin', branch_id: 'branch-aaaa' } },
    resDetail
  );
  assert.equal(resDetail.getStatus(), 200);
  assert.equal(resDetail.getPayload().data.unit_id, 'unit-101');
  assert.equal(resDetail.getPayload().data.unit_name, 'Luxury Sea View Villa');

  // 10c. getCustomer360 (Customer 360 deals tab)
  const res360 = makeRes();
  await customersController.getCustomer360(
    { params: { id: 12 }, branchId: 'branch-aaaa', user: { id: 1, tenant_id: TA, role: 'admin', branch_id: 'branch-aaaa' } },
    res360
  );
  assert.equal(res360.getStatus(), 200);
  assert.equal(res360.getPayload().data.deals[0].unit_id, 'unit-101');
  assert.equal(res360.getPayload().data.deals[0].unit_number, 'REF-VILLA-101');
  assert.equal(res360.getPayload().data.deals[0].unit_name, 'Luxury Sea View Villa');
  assert.equal(res360.getPayload().data.deals[0].unit_project_name, 'Palm Hills');

  // Verify the SQL queries themselves select ru.name as unit_name
  assert.ok(capturedSqls.some(q => q.includes('ru.name as unit_name') && q.includes('FROM deals d')));
  assert.ok(capturedSqls.some(q => q.includes('ru.name as unit_name') && q.includes('WHERE d.id = $1')));
  assert.ok(capturedSqls.some(q => q.includes('ru.name as unit_name') && q.includes('WHERE d.client_id::text = $1::text')));
});

test('11. Atomic backfill: partial failure rolls back lead_mappings update, retry succeeds, and partial state (mapped lead + NULL deal) recovers', async () => {
  const { s } = createInMemoryCrmDb();
  seedTenant(s, TA);

  const unitId = '00000000-0000-0000-0000-000000000950';
  s.units.push({ id: unitId, tenant_id: TA, unit_number: 'U-950', name: 'Unit 950', price: 8000000, status: 'Available' });
  s.listingMaps.push({
    id: 950,
    tenant_id: TA,
    unit_id: unitId,
    external_listing_id: 'PF-LIST-950',
    external_reference: 'U-950'
  });

  s.leadMaps.push({
    id: 951,
    tenant_id: TA,
    customer_id: 1,
    external_lead_id: 'PF-LEAD-950',
    external_listing_id: 'PF-LIST-950',
    unit_id: null,
    channel: 'whatsapp',
    raw_enquiry_details: {}
  });
  s.deals.push({
    id: 952,
    tenant_id: TA,
    title: 'Property Finder: Client 950',
    value: 0,
    pipeline_stage: 'Lead',
    client_id: 1,
    assigned_to: 7,
    unit_id: null,
    source_type: 'property_finder',
    source_id: 'PF-LEAD-950',
    custom_fields: { pf_listing_id: 'PF-LIST-950', pf_listing_reference: 'U-950', lead_type: 'listing' },
    branch_id: 'branch-aaaa'
  });

  // 11a. Simulate failure during deal update -> transaction rolls back lead_mappings so both stay NULL
  s.failNextDealBackfill = true;
  await assert.rejects(
    () => svc.backfillUnlinkedLeadsForListing(TA, 'PF-LIST-950'),
    /simulated transient DB failure/
  );
  assert.equal(s.leadMaps[0].unit_id, null, 'Rollback must revert property_finder_lead_mappings.unit_id to NULL');
  assert.equal(s.deals[0].unit_id, null, 'deals.unit_id must remain NULL');

  // 11b. Retry after transient failure -> both tables update atomically
  const retryRes = await svc.backfillUnlinkedLeadsForListing(TA, 'PF-LIST-950');
  assert.equal(retryRes.repairedMappings, 1);
  assert.equal(retryRes.repairedDeals, 1);
  assert.equal(s.leadMaps[0].unit_id, unitId);
  assert.equal(s.deals[0].unit_id, unitId);

  // 11c. Partial state recovery: if lead_mapping already has unit_id set, but deal still has unit_id = NULL,
  //      both backfillUnlinkedLeadsForListing AND duplicate ingestLead recover deals.unit_id
  s.deals[0].unit_id = null;
  const partialBackfill = await svc.backfillUnlinkedLeadsForListing(TA, 'PF-LIST-950');
  assert.equal(partialBackfill.repairedDeals, 1);
  assert.equal(s.deals[0].unit_id, unitId);

  // Also test recovery via duplicate ingestLead when lead_mapping has unit_id set and deal has unit_id = NULL
  s.deals[0].unit_id = null;
  const dupIngest = await svc.ingestLead(TA, {
    id: 'PF-LEAD-950',
    channel: 'whatsapp',
    entityType: 'listing',
    sender: { name: 'Client 950', contacts: [{ type: 'phone', value: '+201095009500' }] },
    listing: { id: 'PF-LIST-950', reference: 'U-950' }
  });
  assert.equal(dupIngest.status, 'duplicate');
  assert.equal(dupIngest.repairedUnitLink, true);
  assert.equal(s.deals[0].unit_id, unitId);
});

test('12. Pagination correctness: perPage parameter, missing totals, null totals, empty totals, and nextPage precedence', async () => {
  // 12a. Verify getListings sends perPage (clamped to MAX_PER_PAGE = 50)
  const client = new PropertyFinderClient({
    apiKey: 'k',
    apiSecret: 's',
    environment: 'sandbox',
    countryCode: 'EG',
    tenantId: TA
  });
  let capturedReq = null;
  client.request = async (opts) => {
    capturedReq = opts;
    return { results: [], pagination: { page: 1, totalPages: 1 } };
  };
  await client.getListings({ page: 2, limit: 100 });
  assert.equal(capturedReq.params.page, 2);
  assert.equal(capturedReq.params.perPage, 50);
  assert.equal(capturedReq.params.limit, 50);

  // 12b. Unit tests on PropertyFinderClient.hasNextPage for null, empty, and missing totals
  assert.equal(
    PropertyFinderClient.hasNextPage({ pagination: { page: 1, total: null, nextPage: 2 } }, 1, 10, 50),
    true,
    'null total must never override a valid nextPage indicator'
  );
  assert.equal(
    PropertyFinderClient.hasNextPage({ pagination: { page: 1, total: '', nextPage: 2 } }, 1, 10, 50),
    true,
    'empty string total must never override a valid nextPage indicator'
  );
  assert.equal(
    PropertyFinderClient.hasNextPage({ pagination: { page: 1, total_count: null } }, 1, 50, 50),
    true,
    'null total_count on a full page must fall back to page-size check (true), not coerce null to 0'
  );
  assert.equal(
    PropertyFinderClient.hasNextPage({ pagination: { page: 1, total: '' } }, 1, 50, 50),
    true,
    'empty total on a full page must fall back to page-size check (true), not coerce "" to 0'
  );
  assert.equal(
    PropertyFinderClient.hasNextPage({ pagination: { page: 2, total: null } }, 2, 12, 50),
    false,
    'null total on a partial page (< perPage) with no nextPage returns false'
  );
  assert.equal(
    PropertyFinderClient.hasNextPage({ results: [1, 2] }, 1, 2, 2),
    true,
    'missing pagination object on a full page returns true'
  );
  assert.equal(
    PropertyFinderClient.hasNextPage({ results: [1] }, 2, 1, 2),
    false,
    'missing pagination object on a partial page returns false'
  );
});

test('13. Ambiguous internal units during importListings -> does NOT create a duplicate unit, reports ambiguity, and requires manual resolution', async () => {
  const { s } = createInMemoryCrmDb();
  seedTenant(s, TA);

  // Two existing local units in the same tenant share unit_number = 'DUP-UNIT-10'
  s.units.push(
    { id: '00000000-0000-0000-0000-000000000011', tenant_id: TA, unit_number: 'DUP-UNIT-10', name: 'Building A - 10', price: 3000000, status: 'Available' },
    { id: '00000000-0000-0000-0000-000000000012', tenant_id: TA, unit_number: 'DUP-UNIT-10', name: 'Building B - 10', price: 3500000, status: 'Available' }
  );

  PropertyFinderClient.prototype.getListings = async () => ({
    results: [
      {
        id: 'PF-AMB-LIST-10',
        reference: 'DUP-UNIT-10',
        title: { en: 'Listing With Ambiguous Code' },
        price: { amounts: { sale: 3200000 } },
        state: { type: 'live' }
      }
    ],
    pagination: { page: 1, totalPages: 1 }
  });

  const importRes = await svc.importListings(TA);
  assert.equal(importRes.created, 0, 'Must NOT create a 3rd duplicate unit in re_units');
  assert.equal(importRes.linkedExisting, 0, 'Must NOT link to either ambiguous unit');
  assert.equal(importRes.ambiguous, 1);
  assert.equal(importRes.skipped, 1);
  assert.equal(s.units.length, 2, 'Total units in re_units must remain 2');
  assert.equal(importRes.errors.length, 1);
  assert.equal(importRes.errors[0].code, 'AMBIGUOUS_UNIT_MATCH');
  assert.ok(s.events.some(e => e.type === 'import_listing_ambiguous' && e.sev === 'warn'));

  // Lead arriving for this ambiguous listing stays safely unlinked (unit_id = NULL) for manual resolution
  await svc.ingestLead(TA, {
    id: 'PF-LEAD-FOR-AMB',
    channel: 'call',
    entityType: 'listing',
    sender: { name: 'Buyer For Ambiguous Unit', contacts: [{ type: 'phone', value: '+201088889999' }] },
    listing: { id: 'PF-AMB-LIST-10', reference: 'DUP-UNIT-10' }
  });
  assert.equal(s.deals.length, 1);
  assert.equal(s.deals[0].unit_id, null);
  assert.equal(s.deals[0].custom_fields.pf_listing_id, 'PF-AMB-LIST-10');
  assert.equal(s.deals[0].custom_fields.pf_listing_reference, 'DUP-UNIT-10');
});

test('14. Manual unit-linking validation: backend rejects Reserved, Contracted, Handed Over, Under Dispute, and Sold units, and allows Available units', async () => {
  const unlinkedDeal = {
    id: 880,
    tenant_id: TA,
    title: 'Property Finder Unlinked Deal',
    value: 0,
    pipeline_stage: 'Lead',
    client_id: 1,
    assigned_to: 7,
    unit_id: null,
    source_type: 'property_finder',
    source_id: 'PF-LEAD-880',
    custom_fields: { pf_listing_id: 'PF-LIST-880' },
    branch_id: 'branch-aaaa'
  };

  const invalidStatuses = ['Reserved', 'Contracted', 'Handed Over', 'Under Dispute', 'Sold'];
  for (const badStatus of invalidStatuses) {
    db.query = async (sql) => {
      const norm = sql.replace(/\s+/g, ' ').trim();
      if (norm.startsWith('ALTER TABLE deals')) return { rows: [] };
      if (norm.includes('SELECT * FROM deals WHERE id = $1')) return { rows: [{ ...unlinkedDeal }] };
      if (norm.includes('FROM re_contracts')) return { rows: [] };
      if (norm.includes('FROM re_units WHERE id::text = $1::text')) {
        return {
          rows: [{
            id: 'unit-bad',
            tenant_id: TA,
            status: badStatus,
            project_name: 'Project X',
            unit_number: 'U-BAD',
            name: 'Invalid Status Unit',
            price: 5000000,
            branch_id: 'branch-aaaa'
          }]
        };
      }
      throw new Error('Unexpected SQL in invalid status test: ' + norm);
    };

    let statusCode = 200;
    let body = null;
    await dealsController.updateDeal(
      {
        params: { id: 880 },
        body: { unit_id: 'unit-bad' },
        user: { id: 1, tenant_id: TA, role: 'admin', branch_id: 'branch-aaaa', permissions: ['deal.edit_details'] },
        ip: '127.0.0.1'
      },
      {
        status(c) { statusCode = c; return this; },
        json(b) { body = b; return this; }
      }
    );

    assert.equal(statusCode, 400, `Unit with status "${badStatus}" must be rejected with 400`);
    assert.equal(body.code, 'UNIT_NOT_AVAILABLE');
  }

  // Verify linking an 'Available' unit succeeds and syncs property_finder_lead_mappings.unit_id
  let leadMapSyncedUnitId = null;
  let dealUpdatedUnitId = null;
  db.query = async (sql, params) => {
    const norm = sql.replace(/\s+/g, ' ').trim();
    if (norm.startsWith('ALTER TABLE deals')) return { rows: [] };
    if (norm.includes('SELECT * FROM deals WHERE id = $1')) return { rows: [{ ...unlinkedDeal }] };
    if (norm.includes('FROM re_contracts')) return { rows: [] };
    if (norm.includes('FROM re_units WHERE id::text = $1::text')) {
      return {
        rows: [{
          id: '00000000-0000-0000-0000-000000000880',
          tenant_id: TA,
          status: 'Available',
          project_name: 'Palm Hills',
          unit_number: 'U-AVAIL-880',
          name: 'Available Unit 880',
          price: 6000000,
          branch_id: 'branch-aaaa'
        }]
      };
    }
    if (norm.startsWith('UPDATE deals SET')) {
      dealUpdatedUnitId = params[16];
      return { rows: [{ ...unlinkedDeal, unit_id: dealUpdatedUnitId }] };
    }
    if (norm.startsWith('UPDATE property_finder_lead_mappings SET unit_id')) {
      leadMapSyncedUnitId = params[0];
      return { rows: [], rowCount: 1 };
    }
    if (norm.includes('INSERT INTO activities') || norm.includes('INSERT INTO system_logs')) {
      return { rows: [] };
    }
    return { rows: [] };
  };

  let okStatus = 200;
  let okBody = null;
  await dealsController.updateDeal(
    {
      params: { id: 880 },
      body: { unit_id: '00000000-0000-0000-0000-000000000880' },
      user: { id: 1, tenant_id: TA, role: 'admin', branch_id: 'branch-aaaa', permissions: ['deal.edit_details'] },
      ip: '127.0.0.1'
    },
    {
      status(c) { okStatus = c; return this; },
      json(b) { okBody = b; return this; }
    }
  );

  assert.equal(okStatus, 200);
  assert.equal(dealUpdatedUnitId, '00000000-0000-0000-0000-000000000880');
  assert.equal(leadMapSyncedUnitId, '00000000-0000-0000-0000-000000000880');
  assert.equal(okBody.data.unit_id, '00000000-0000-0000-0000-000000000880');
});
