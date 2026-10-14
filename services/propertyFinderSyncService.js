const db = require('../config/db');
const PropertyFinderClient = require('./propertyFinderClient');
const { encrypt, decrypt } = require('../utils/encryption');
const JobEngine = require('../src/infrastructure/jobs/JobEngine');

/**
 * 🔄 Property Finder Synchronization Service
 * Handles listing import, publishing, bidirectional status tracking,
 * lead ingestion, duplicate detection, and webhook processing.
 */

/**
 * Retrieve and decrypt Property Finder settings for a tenant,
 * returning an instantiated PropertyFinderClient.
 */
async function getClientForTenant(tenantId) {
  if (!tenantId) {
    throw new Error('Tenant ID is required.');
  }

  const result = await db.query(
    `SELECT * FROM property_finder_settings WHERE tenant_id::text = $1::text`,
    [tenantId]
  );

  if (result.rows.length === 0) {
    throw new Error('Property Finder integration is not configured for this organization.');
  }

  const settings = result.rows[0];
  if (!settings.api_key_encrypted || !settings.api_secret_encrypted) {
    throw new Error('Property Finder API credentials are missing.');
  }

  return {
    client: new PropertyFinderClient({
      apiKey: settings.api_key_encrypted,
      apiSecret: settings.api_secret_encrypted,
      environment: settings.environment,
      countryCode: settings.country_code || 'EG',
      tenantId: settings.tenant_id
    }),
    settings
  };
}

/**
 * Helper to log integration events safely without secret leakage.
 */
async function logIntegrationEvent(tenantId, eventType, message, details = null, severity = 'info') {
  try {
    await db.query(
      `INSERT INTO property_finder_event_logs (tenant_id, event_type, severity, message, details)
       VALUES ($1::uuid, $2, $3, $4, $5)`,
      [tenantId, eventType, severity, message, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.warn('[Property Finder Log Warning]', err.message);
  }
}

/**
 * Normalizes property type from Property Finder to Tashgheel CRM standard.
 */
function normalizePropertyType(pfType) {
  if (!pfType) return 'Apartment';
  const lower = pfType.toLowerCase();
  if (lower.includes('villa') || lower.includes('townhouse') || lower.includes('twin')) return 'Villa';
  if (lower.includes('office') || lower.includes('commercial')) return 'Office';
  if (lower.includes('duplex') || lower.includes('penthouse')) return 'Duplex';
  if (lower.includes('chalet')) return 'Chalet';
  return 'Apartment';
}

/**
 * Map Property Finder external publication status to Tashgheel internal status.
 */
function mapExternalStatus(externalStatus) {
  if (!externalStatus) return 'draft';
  const s = externalStatus.toLowerCase();
  if (s === 'live' || s === 'published' || s === 'active') return 'published';
  if (s === 'pending' || s === 'pending_review' || s === 'under_review') return 'pending_publication';
  if (s === 'rejected' || s === 'declined') return 'rejected';
  if (s === 'unpublished' || s === 'archived' || s === 'inactive') return 'unpublished';
  return 'draft';
}

/**
 * Import accessible listings from Property Finder into Tashgheel CRM.
 * Deduplicates, performs safe upsert, links existing units, and logs summary.
 */
async function importListings(tenantId, { forceRefresh = false, page = 1, limit = 50 } = {}) {
  const { client, settings } = await getClientForTenant(tenantId);

  if (!settings.is_enabled) {
    throw new Error('Property Finder integration is currently disabled for this tenant.');
  }

  const stats = {
    totalFetched: 0,
    created: 0,
    linkedExisting: 0,
    updated: 0,
    skipped: 0,
    errors: []
  };

  try {
    const response = await client.getListings({ page, limit });
    const listings = response.data || [];
    stats.totalFetched = listings.length;

    for (const listing of listings) {
      try {
        const extId = String(listing.id || listing.listing_id || '').trim();
        if (!extId) {
          stats.skipped++;
          continue;
        }

        const pubStatus = mapExternalStatus(listing.status);
        const price = Number(listing.price) || 0;
        const areaSqm = Number(listing.area_sqm || listing.area || listing.size) || null;
        const rooms = Number(listing.bedrooms || listing.rooms) || 0;
        const unitType = normalizePropertyType(listing.property_type || listing.type);
        const projectName = listing.location?.community || listing.location?.city || listing.project_name || 'Imported Property';
        const unitNumber = listing.reference || listing.unit_number || `PF-${extId}`;
        const locationText = [listing.location?.sub_community, listing.location?.community, listing.location?.city].filter(Boolean).join(', ') || 'Egypt';

        // 1. Check if mapping already exists for this tenant & external listing ID
        const mapCheck = await db.query(
          `SELECT * FROM property_finder_listing_mappings 
           WHERE tenant_id::text = $1::text AND external_listing_id = $2`,
          [tenantId, extId]
        );

        if (mapCheck.rows.length > 0) {
          const existingMapping = mapCheck.rows[0];
          const rejectionReason = listing.rejection_reason || existingMapping.rejection_reason || null;

          // Detect external price/status drift against local unit without destructive overwrite
          if (existingMapping.unit_id) {
            try {
              const localUnitRes = await db.query(
                `SELECT id, unit_number, price, status FROM re_units WHERE id::text = $1::text`,
                [existingMapping.unit_id]
              );
              if (localUnitRes.rows.length > 0) {
                const localUnit = localUnitRes.rows[0];
                if (Number(localUnit.price) !== price && price > 0) {
                  await logIntegrationEvent(
                    tenantId,
                    'external_price_drift_detected',
                    `Unit ${localUnit.unit_number}: External Property Finder price (${price} EGP) differs from internal price (${localUnit.price} EGP). Tashgheel master field ownership policy preserved local price.`,
                    { unitId: localUnit.id, internalPrice: localUnit.price, externalPrice: price },
                    'warn'
                  );
                }
              }
            } catch (driftErr) {
              console.warn('[Price Drift Check Warning]', driftErr.message);
            }
          }

          await db.query(
            `UPDATE property_finder_listing_mappings 
             SET external_status = $1, publication_status = $2, portal_url = $3,
                 rejection_reason = $4,
                 last_synced_at = CURRENT_TIMESTAMP, last_payload_snapshot = $5, updated_at = CURRENT_TIMESTAMP
             WHERE id = $6`,
            [listing.status, pubStatus, listing.portal_url || existingMapping.portal_url, rejectionReason, JSON.stringify(listing), existingMapping.id]
          );
          stats.updated++;
          continue;
        }

        // 2. Check if a local unit with the same unit_number exists in this tenant
        const unitMatch = await db.query(
          `SELECT id, name, unit_number, project_name FROM re_units 
           WHERE tenant_id::text = $1::text AND LOWER(TRIM(unit_number)) = LOWER(TRIM($2))
           LIMIT 1`,
          [tenantId, unitNumber]
        );

        let targetUnitId;
        if (unitMatch.rows.length > 0) {
          // Link existing unit
          targetUnitId = unitMatch.rows[0].id;
          stats.linkedExisting++;
        } else {
          // Create new re_units record
          const unitInsert = await db.query(
            `INSERT INTO re_units (
              tenant_id, name, project_name, unit_number, type, area_sqm, price, rooms, location, status
             ) VALUES (
              $1::text, $2, $3, $4, $5, $6, $7, $8, $9, 'Available'
             ) RETURNING id`,
            [
              tenantId,
              listing.title || `PF Unit ${unitNumber}`,
              projectName,
              unitNumber,
              unitType,
              areaSqm ? String(areaSqm) : null,
              price,
              rooms,
              locationText
            ]
          );
          targetUnitId = unitInsert.rows[0].id;
          stats.created++;
        }

        // 3. Create mapping record
        await db.query(
          `INSERT INTO property_finder_listing_mappings (
            tenant_id, unit_id, external_listing_id, publication_status, external_status,
            external_reference, portal_url, last_synced_at, last_payload_snapshot
           ) VALUES (
            $1::uuid, $2::uuid, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8
           )
           ON CONFLICT (tenant_id, external_listing_id) DO UPDATE 
           SET publication_status = EXCLUDED.publication_status,
               external_status = EXCLUDED.external_status,
               portal_url = EXCLUDED.portal_url,
               last_synced_at = CURRENT_TIMESTAMP`,
          [
            tenantId,
            targetUnitId,
            extId,
            pubStatus,
            listing.status || 'live',
            unitNumber,
            listing.portal_url || null,
            JSON.stringify(listing)
          ]
        );
      } catch (itemErr) {
        stats.errors.push({ listingId: listing.id, error: itemErr.message });
      }
    }

    // Update settings sync timestamps
    await db.query(
      `UPDATE property_finder_settings 
       SET last_sync_at = CURRENT_TIMESTAMP, 
           last_sync_status = $1, 
           last_error_message = $2,
           updated_at = CURRENT_TIMESTAMP 
       WHERE tenant_id::text = $3::text`,
      [stats.errors.length > 0 ? 'warning' : 'success', stats.errors.length > 0 ? `${stats.errors.length} listing sync errors` : null, tenantId]
    );

    await logIntegrationEvent(
      tenantId,
      'import_listings',
      `Listing import completed: ${stats.created} created, ${stats.linkedExisting} linked, ${stats.updated} updated.`,
      stats
    );

    return stats;
  } catch (err) {
    await db.query(
      `UPDATE property_finder_settings 
       SET last_sync_at = CURRENT_TIMESTAMP, last_sync_status = 'failed', last_error_message = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE tenant_id::text = $2::text`,
      [err.message, tenantId]
    );
    await logIntegrationEvent(tenantId, 'import_listings_failed', err.message, { stack: err.stack }, 'error');
    throw err;
  }
}

/**
 * Publish an eligible Tashgheel unit to Property Finder.
 * Validates required attributes, submits to official API, and tracks status.
 */
async function publishUnit(tenantId, unitId) {
  const { client, settings } = await getClientForTenant(tenantId);

  if (!settings.is_enabled) {
    throw new Error('Property Finder integration is disabled.');
  }

  // 1. Fetch unit from re_units
  const unitRes = await db.query(
    `SELECT * FROM re_units WHERE id::text = $1::text AND tenant_id::text = $2::text`,
    [unitId, tenantId]
  );

  if (unitRes.rows.length === 0) {
    throw new Error('Real estate unit not found or access denied.');
  }

  const unit = unitRes.rows[0];

  // 2. Pre-submission validation
  const validationErrors = [];
  if (!unit.price || Number(unit.price) <= 0) {
    validationErrors.push('Unit price must be greater than zero.');
  }
  if (!unit.unit_number && !unit.name) {
    validationErrors.push('Unit must have a valid unit number or name.');
  }
  if (!unit.project_name && !unit.location) {
    validationErrors.push('Project name or location is required.');
  }

  if (validationErrors.length > 0) {
    const error = new Error('Unit does not meet Property Finder publishing requirements.');
    error.validationErrors = validationErrors;
    throw error;
  }

  // 3. Prepare Property Finder payload
  const payload = {
    reference: unit.unit_number || `U-${unit.id.slice(0, 8)}`,
    title: unit.name || `${unit.type || 'Property'} in ${unit.project_name}`,
    description: `Offering ${unit.type || 'unit'} in ${unit.project_name || 'prime location'}. Floor: ${unit.floor || 'N/A'}, Area: ${unit.area_sqm || 'N/A'} sqm.`,
    property_type: unit.type || 'Apartment',
    offering_type: unit.transaction_type === 'rent' ? 'rent' : 'sale',
    price: Number(unit.price),
    currency: 'EGP',
    bedrooms: Number(unit.rooms) || 0,
    area_sqm: unit.area_sqm ? Number(unit.area_sqm) : undefined,
    location: {
      community: unit.project_name || 'Cairo',
      address: unit.location || 'Cairo, Egypt'
    }
  };

  // 4. Check existing mapping
  const mappingRes = await db.query(
    `SELECT * FROM property_finder_listing_mappings WHERE unit_id::text = $1::text AND tenant_id::text = $2::text`,
    [unitId, tenantId]
  );

  let externalListing;
  const isUpdate = mappingRes.rows.length > 0 && mappingRes.rows[0].external_listing_id;

  try {
    if (isUpdate) {
      const extId = mappingRes.rows[0].external_listing_id;
      externalListing = await client.updateListing(extId, payload);
    } else {
      externalListing = await client.createListing(payload);
    }

    const externalId = String(externalListing.id || (isUpdate ? mappingRes.rows[0].external_listing_id : ''));
    const pubStatus = mapExternalStatus(externalListing.status || 'pending_review');

    // 5. Update or insert mapping
    await db.query(
      `INSERT INTO property_finder_listing_mappings (
        tenant_id, unit_id, external_listing_id, publication_status, external_status,
        external_reference, portal_url, last_synced_at, last_payload_snapshot
       ) VALUES (
        $1::uuid, $2::uuid, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8
       )
       ON CONFLICT (tenant_id, unit_id) DO UPDATE
       SET external_listing_id = EXCLUDED.external_listing_id,
           publication_status = EXCLUDED.publication_status,
           external_status = EXCLUDED.external_status,
           portal_url = EXCLUDED.portal_url,
           last_synced_at = CURRENT_TIMESTAMP,
           last_payload_snapshot = EXCLUDED.last_payload_snapshot,
           updated_at = CURRENT_TIMESTAMP`,
      [
        tenantId,
        unitId,
        externalId,
        pubStatus,
        externalListing.status || 'pending_review',
        payload.reference,
        externalListing.portal_url || null,
        JSON.stringify(externalListing)
      ]
    );

    await logIntegrationEvent(
      tenantId,
      'publish_listing',
      `Unit ${unit.unit_number} (${unitId}) published to Property Finder (Ext ID: ${externalId}, Status: ${pubStatus}).`,
      { unitId, externalId, pubStatus }
    );

    return {
      success: true,
      unitId,
      externalListingId: externalId,
      publicationStatus: pubStatus,
      portalUrl: externalListing.portal_url
    };
  } catch (err) {
    // Record sync error in mapping if mapping exists
    if (mappingRes.rows.length > 0) {
      await db.query(
        `UPDATE property_finder_listing_mappings 
         SET publication_status = 'sync_error', rejection_reason = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [err.message, mappingRes.rows[0].id]
      );
    }
    await logIntegrationEvent(tenantId, 'publish_listing_failed', `Failed to publish unit ${unitId}: ${err.message}`, { stack: err.stack }, 'error');
    throw err;
  }
}

/**
 * Unpublish listing on Property Finder without deleting internal Tashgheel unit.
 */
async function unpublishUnit(tenantId, unitId) {
  const { client } = await getClientForTenant(tenantId);

  const mappingRes = await db.query(
    `SELECT * FROM property_finder_listing_mappings WHERE unit_id::text = $1::text AND tenant_id::text = $2::text`,
    [unitId, tenantId]
  );

  if (mappingRes.rows.length === 0 || !mappingRes.rows[0].external_listing_id) {
    throw new Error('This unit is not linked to any external Property Finder listing.');
  }

  const mapping = mappingRes.rows[0];
  await client.unpublishListing(mapping.external_listing_id);

  await db.query(
    `UPDATE property_finder_listing_mappings 
     SET publication_status = 'unpublished', external_status = 'unpublished',
         last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [mapping.id]
  );

  await logIntegrationEvent(
    tenantId,
    'unpublish_listing',
    `Unpublished listing ${mapping.external_listing_id} for unit ${unitId}. Internal unit preserved.`
  );

  return { success: true, unitId, publicationStatus: 'unpublished' };
}

const LEAD_OVERLAP_MS = 60 * 60 * 1000; // re-read the last hour on every poll; external-ID dedup makes this safe
const MAX_LEAD_PAGES = 200;              // runaway-pagination guard (200 * 50 = 10k leads per run)

const pick = (...vals) => {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

/**
 * Normalizes a Property Finder lead (API item or webhook payload) into a flat shape.
 * The official schema is partner-gated and was NOT verifiable by us, so this accepts the
 * common naming variants (camelCase / snake_case / nested objects) and fails safe.
 */
function normalizeLead(raw) {
  const root = raw && typeof raw === 'object' ? raw : {};
  // Webhook envelopes: { event, data: {...} } or { lead: {...} }
  const r = (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) ? root.data : root;
  const lead = (r.lead && typeof r.lead === 'object') ? r.lead : {};
  const sender = (r.sender && typeof r.sender === 'object') ? r.sender : ((r.contact && typeof r.contact === 'object') ? r.contact : {});
  const listing = (r.listing && typeof r.listing === 'object') ? r.listing : {};
  const project = (r.project && typeof r.project === 'object') ? r.project : {};

  const rawChannel = pick(r.channel, r.contactChannel, r.contact_channel, r.source_channel, lead.channel).toLowerCase();
  let channel = 'form';
  if (rawChannel.includes('whatsapp')) channel = 'whatsapp';
  else if (rawChannel.includes('call') || rawChannel.includes('phone')) channel = 'phone';
  else if (rawChannel.includes('mail')) channel = 'email';

  const rawType = pick(r.type, r.leadType, r.lead_type, lead.type).toLowerCase();
  let leadType = 'listing';
  if (rawType.includes('project') || pick(r.projectId, r.project_id, project.id)) leadType = 'project';
  else if (rawType.includes('seller')) leadType = 'seller';

  return {
    externalLeadId: pick(r.id, r.leadId, r.lead_id, lead.id),
    externalListingId: pick(r.listingId, r.listing_id, listing.id, r.propertyId, r.property_id) || null,
    externalProjectId: pick(r.projectId, r.project_id, project.id) || null,
    leadType,
    channel,
    name: pick(r.contact_name, r.name, r.sender_name, r.senderName, sender.name, sender.fullName, lead.name,
      [sender.firstName, sender.lastName].filter(Boolean).join(' ')) || 'Property Finder Lead',
    phone: pick(r.contact_phone, r.phone, r.mobile, r.senderPhone, sender.phone, sender.mobile, sender.phoneNumber, lead.phone),
    email: pick(r.contact_email, r.email, r.senderEmail, sender.email, lead.email).toLowerCase(),
    message: pick(r.enquiry_message, r.message, r.notes, r.comment, lead.message),
    assignedExternalAgent: pick(r.agentId, r.agent_id, r.assignedTo, r.assigned_to) || null
  };
}

/**
 * Ingests a Property Finder lead into the EXISTING Tashgheel model:
 *   customers (status='lead', source='Property Finder', source_id -> lead_sources)
 *   + deals   (Lead stage, source_type='property_finder', source_id=<external lead id>, unit_id)
 * plus property_finder_lead_mappings for idempotency/audit. No parallel lead store.
 *
 * Concurrency model: the whole ingest runs in ONE database transaction guarded by transaction-scoped
 * advisory locks (released automatically on COMMIT/ROLLBACK):
 *   1. per (tenant, external lead id)  -> webhook vs poll vs retry for the same lead serialize; the
 *      loser re-checks the mapping AFTER acquiring the lock and returns 'duplicate' having written nothing.
 *   2. per (tenant, phone/email)       -> two different leads from the same person cannot both miss each
 *      other's customer and create two customers (customers has no unique constraint on phone/email).
 *   3. per tenant lead-source creation -> avoids unique violations on lead_sources(name, tenant_id).
 * Locks are always taken in this order (and contact keys sorted), so they cannot deadlock.
 * Any failure rolls back everything (no orphan customer, nothing is ever DELETEd), and the error is
 * surfaced so a webhook retry / next poll reprocesses the lead.
 * Residual risk: customers created by OTHER code paths (manual UI, Meta, chatbot) do not take these locks.
 */
async function ingestLead(tenantId, rawLead) {
  if (!tenantId || !rawLead) {
    throw new Error('Tenant ID and lead payload are required.');
  }

  const n = normalizeLead(rawLead);
  const extLeadId = n.externalLeadId;
  if (!extLeadId) {
    throw new Error('Lead payload must contain a valid external lead ID.');
  }

  const { channel, name: contactName, phone: contactPhone, email: contactEmail, message: enquiryMessage } = n;
  const extListingId = n.externalListingId;

  const client = await db.connect();
  let result;
  try {
    await client.query('BEGIN');
    const q = (sql, params) => client.query(sql, params);
    const lock = (key) => q('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);

    // Lock 1: this external lead
    await lock(`pf:lead:${tenantId}:${extLeadId}`);

    // 1. Idempotency (checked under the lock, so a concurrent winner is always visible here)
    const existingMapping = await q(
      `SELECT * FROM property_finder_lead_mappings WHERE tenant_id::text = $1::text AND external_lead_id = $2`,
      [tenantId, extLeadId]
    );
    if (existingMapping.rows.length > 0) {
      await client.query('COMMIT');
      return { status: 'duplicate', customerId: existingMapping.rows[0].customer_id, leadId: extLeadId };
    }

    // 2. Tenant settings
    const settingsRes = await q(
      `SELECT * FROM property_finder_settings WHERE tenant_id::text = $1::text`,
      [tenantId]
    );
    const settings = settingsRes.rows[0] || {};
    if (settings.lead_sync_enabled === false) {
      await client.query('COMMIT');
      return { status: 'skipped', reason: 'lead_sync_disabled', leadId: extLeadId };
    }

    // Lock 2: the contact (phone and/or email), sorted for a stable acquisition order
    const contactKeys = [contactPhone && `pf:contact:${tenantId}:p:${contactPhone}`,
      contactEmail && `pf:contact:${tenantId}:e:${contactEmail}`].filter(Boolean).sort();
    for (const k of contactKeys) await lock(k);

    // 3. Lead source (existing lead_sources table); Lock 3 serialises first-time creation per tenant
    let sourceId = settings.default_lead_source_id;
    if (!sourceId) {
      await lock(`pf:source:${tenantId}`);
      const srcCheck = await q(
        `SELECT id FROM lead_sources
         WHERE tenant_id::text = $1::text AND LOWER(TRIM(name)) = 'property finder' LIMIT 1`,
        [tenantId]
      );
      if (srcCheck.rows.length > 0) {
        sourceId = srcCheck.rows[0].id;
      } else {
        const newSrc = await q(
          `INSERT INTO lead_sources (name, tenant_id) VALUES ('Property Finder', $1::uuid) RETURNING id`,
          [tenantId]
        );
        sourceId = newSrc.rows[0]?.id;
      }
    }

    const channelLabel = channel === 'whatsapp'
      ? 'WhatsApp contact channel (enquiry received via Property Finder; NOT a WhatsApp conversation)'
      : channel;
    const noteLine = `[${new Date().toISOString()}] Property Finder ${n.leadType} enquiry via ${channelLabel}: ${enquiryMessage} (Listing: ${extListingId || n.externalProjectId || 'General'}, PF Lead: ${extLeadId})`;

    // 4. Map external listing -> internal unit (tenant-scoped). Unmapped listings are kept, unit stays NULL.
    let associatedUnitId = null;
    if (extListingId) {
      const listMap = await q(
        `SELECT unit_id FROM property_finder_listing_mappings
         WHERE tenant_id::text = $1::text AND external_listing_id = $2`,
        [tenantId, extListingId]
      );
      if (listMap.rows.length > 0) associatedUnitId = listMap.rows[0].unit_id;
    }

    // 5. Customer upsert by phone/email within the tenant. Missing contact info => new customer, never a false merge.
    let customerId = null;
    let customerCreated = false;
    if (contactPhone || contactEmail) {
      const custCheck = await q(
        `SELECT id, name, notes FROM customers
         WHERE tenant_id::text = $1::text
           AND (
             ($2::text <> '' AND phone = $2)
             OR ($3::text <> '' AND LOWER(email) = $3)
           ) LIMIT 1`,
        [tenantId, contactPhone, contactEmail]
      );
      if (custCheck.rows.length > 0) {
        customerId = custCheck.rows[0].id;
        const updatedNotes = `${custCheck.rows[0].notes || ''}\n${noteLine}`.trim();
        await q(
          `UPDATE customers
              SET notes = $1,
                  phone = COALESCE(NULLIF(phone, ''), NULLIF($4, '')),
                  email = COALESCE(NULLIF(email, ''), NULLIF($5, '')),
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND tenant_id::text = $3::text`,
          [updatedNotes, customerId, tenantId, contactPhone, contactEmail]
        );
      }
    }

    if (!customerId) {
      const custInsert = await q(
        `INSERT INTO customers (
          tenant_id, name, phone, email, source, source_id, assigned_to, status, notes
         ) VALUES (
          $1::uuid, $2, $3, $4, 'Property Finder', $5, $6, 'lead', $7
         ) RETURNING id`,
        [tenantId, contactName, contactPhone || null, contactEmail || null, sourceId || null,
          settings.default_assigned_to || null, noteLine]
      );
      customerId = custInsert.rows[0].id;
      customerCreated = true;
    }

    // 6. Mapping row (unique per tenant + external lead id: final safety net behind the advisory lock).
    //    rowCount 0 means something bypassed the lock: roll EVERYTHING back atomically (no manual DELETE).
    const mapRes = await q(
      `INSERT INTO property_finder_lead_mappings (
        tenant_id, customer_id, external_lead_id, external_listing_id, unit_id, channel, raw_enquiry_details
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, external_lead_id) DO NOTHING`,
      [tenantId, customerId, extLeadId, extListingId, associatedUnitId, channel, JSON.stringify(rawLead)]
    );
    if (mapRes && mapRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return { status: 'duplicate', customerId: null, leadId: extLeadId };
    }

    // 7. Sales pipeline: one deal per external lead id, at the tenant template's first stage (Kanban-visible).
    //    A failure here rolls back the whole ingest so the lead is retried instead of silently losing its deal.
    let dealId = null;
    const dupDeal = await q(
      `SELECT id FROM deals
        WHERE tenant_id::text = $1::text AND source_type = 'property_finder' AND source_id = $2 LIMIT 1`,
      [tenantId, extLeadId]
    );
    if (dupDeal.rows.length > 0) {
      dealId = dupDeal.rows[0].id;
    } else {
      let stage = 'discovery';
      let isRealEstate = false;
      const tpl = await q(`SELECT template_name FROM tenants WHERE id::text = $1::text`, [tenantId]);
      if (tpl.rows[0]?.template_name === 'real_estate') { stage = 'Lead'; isRealEstate = true; }

      let dealValue = 0;
      let dealTitle = `Property Finder: ${contactName}`;
      if (associatedUnitId) {
        const u = await q(
          `SELECT unit_number, name, price FROM re_units WHERE id::text = $1::text AND tenant_id::text = $2::text`,
          [associatedUnitId, tenantId]
        );
        if (u.rows[0]) {
          dealValue = Number(u.rows[0].price) || 0;
          dealTitle = `Property Finder: ${contactName} - ${u.rows[0].unit_number || u.rows[0].name || ''}`.trim();
        }
      }
      const dealIns = await q(
        `INSERT INTO deals (title, value, pipeline_stage, client_id, assigned_to, tenant_id, unit_id, source_type, source_id, custom_fields)
         VALUES ($1, $2, $3, $4, $5, $6::uuid, $7, 'property_finder', $8, $9) RETURNING id`,
        [dealTitle, dealValue, stage, customerId, settings.default_assigned_to || null, tenantId,
          isRealEstate ? (associatedUnitId ? String(associatedUnitId) : null) : null, extLeadId,
          JSON.stringify({ channel, lead_type: n.leadType, pf_listing_id: extListingId, pf_project_id: n.externalProjectId })]
      );
      dealId = dealIns.rows[0]?.id || null;
    }

    await client.query('COMMIT');
    result = {
      status: 'created',
      customerId,
      customerCreated,
      dealId,
      leadId: extLeadId,
      channel,
      leadType: n.leadType,
      unitId: associatedUnitId
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection may already be gone */ }
    throw err;
  } finally {
    client.release();
  }

  // Audit log after commit (best-effort, never affects the ingest outcome)
  await logIntegrationEvent(
    tenantId,
    'ingest_lead',
    `Lead ingested from Property Finder (Lead ID: ${extLeadId}, Type: ${n.leadType}, Channel: ${channel}, Customer ID: ${result.customerId}, Unit mapped: ${result.unitId ? 'yes' : 'no'}).`,
    { extLeadId, customerId: result.customerId, channel, extListingId, leadType: n.leadType, unitMapped: Boolean(result.unitId), dealId: result.dealId }
  );

  return result;
}

/**
 * Polling sync via GET /leads. Complements webhooks (project leads / missed deliveries).
 * Incremental: persistent watermark (property_finder_settings.last_lead_sync_at) minus an overlap window;
 * duplicates are neutralised by external-lead-id idempotency in ingestLead.
 */
async function pullLeads(tenantId, { fullBackfill = false } = {}) {
  const { client, settings } = await getClientForTenant(tenantId);
  if (!settings.is_enabled) throw new Error('Property Finder integration is currently disabled for this tenant.');
  if (settings.lead_sync_enabled === false) throw new Error('Lead sync is disabled for this tenant.');

  const startedAt = new Date();
  const watermark = settings.last_lead_sync_at ? new Date(settings.last_lead_sync_at) : null;
  // No watermark (or explicit backfill) => request the maximum allowed window; the client clamps to 3 months.
  const createdAtFrom = (!fullBackfill && watermark)
    ? new Date(watermark.getTime() - LEAD_OVERLAP_MS).toISOString()
    : new Date(0).toISOString();

  const stats = { fetched: 0, created: 0, duplicates: 0, skipped: 0, errors: [], pages: 0 };
  let page = 1;
  let allPagesRead = true;

  while (true) {
    if (page > MAX_LEAD_PAGES) { allPagesRead = false; break; }
    const response = await client.getLeads({ page, perPage: 50, createdAtFrom });
    const leads = PropertyFinderClient.extractLeads(response);
    stats.pages++;
    stats.fetched += leads.length;

    for (const lead of leads) {
      try {
        const r = await ingestLead(tenantId, lead);
        if (r.status === 'created') stats.created++;
        else if (r.status === 'duplicate') stats.duplicates++;
        else stats.skipped++;
      } catch (e) {
        stats.errors.push({ leadId: lead?.id || lead?.leadId || null, error: e.message });
      }
    }

    if (!PropertyFinderClient.hasNextPage(response, page, leads.length, 50)) break;
    page++;
  }

  // Advance the watermark only if every page was read and nothing failed, so failures are retried next run.
  if (allPagesRead && stats.errors.length === 0) {
    try {
      await db.query(
        `UPDATE property_finder_settings SET last_lead_sync_at = $1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id::text = $2::text`,
        [startedAt.toISOString(), tenantId]
      );
    } catch (e) {
      stats.watermarkWarning = 'last_lead_sync_at column missing: run migrations/023_pf_lead_sync_watermark.sql';
    }
  }

  await logIntegrationEvent(tenantId, 'pull_leads',
    `Lead poll: ${stats.fetched} fetched, ${stats.created} created, ${stats.duplicates} duplicates, ${stats.errors.length} errors.`,
    { ...stats, errors: stats.errors.slice(0, 10) }, stats.errors.length ? 'warn' : 'info');

  return stats;
}


/**
 * Inbound webhook processor with idempotency protection.
 */
async function processWebhookEvent(tenantId, providerEventId, eventType, payload) {
  const evType = String(eventType || '').toLowerCase();

  // 1. Duplicate delivery. Only 'processed' events are final: a provider retry of a 'failed'/'received'
  //    event must be re-run (safe because ingestLead is idempotent per external lead id).
  const existing = await db.query(
    `SELECT * FROM property_finder_webhook_events WHERE tenant_id::text = $1::text AND provider_event_id = $2`,
    [tenantId, providerEventId]
  );

  if (existing.rows.length > 0 && !['failed', 'received'].includes(existing.rows[0].status)) {
    return { status: 'duplicate', eventId: providerEventId };
  }

  // 2. Persist event (atomic: concurrent deliveries of the same event id cannot double-insert)
  if (existing.rows.length === 0) {
    await db.query(
      `INSERT INTO property_finder_webhook_events (tenant_id, provider_event_id, event_type, status, payload_summary)
       VALUES ($1::uuid, $2, $3, 'received', $4)
       ON CONFLICT (tenant_id, provider_event_id) DO NOTHING`,
      [tenantId, providerEventId, evType || 'unknown', JSON.stringify(payload)]
    );
  }

  // 3. Process asynchronously via JobEngine
  JobEngine.enqueue(`pf_webhook_${providerEventId}`, async () => {
    try {
      // lead.created / lead.updated / lead.assigned (and legacy leads.create) all go through the same
      // idempotent ingestion: a lead first seen via update/assign (e.g. project leads) is still captured.
      if (evType.includes('lead')) {
        await ingestLead(tenantId, payload);
      } else if (evType.includes('listing')) {
        const listingId = payload.listing_id || payload.listingId || payload.id;
        const newStatus = mapExternalStatus(payload.status);
        if (listingId) {
          await db.query(
            `UPDATE property_finder_listing_mappings 
             SET publication_status = $1, external_status = $2, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE tenant_id::text = $3::text AND external_listing_id = $4`,
            [newStatus, payload.status || 'updated', tenantId, String(listingId)]
          );
        }
      }

      await db.query(
        `UPDATE property_finder_webhook_events 
         SET status = 'processed', processed_at = CURRENT_TIMESTAMP 
         WHERE tenant_id::text = $1::text AND provider_event_id = $2`,
        [tenantId, providerEventId]
      );
    } catch (procErr) {
      await db.query(
        `UPDATE property_finder_webhook_events 
         SET status = 'failed' 
         WHERE tenant_id::text = $1::text AND provider_event_id = $2`,
        [tenantId, providerEventId]
      );
      throw procErr;
    }
  });

  return { status: 'accepted', eventId: providerEventId };
}

module.exports = {
  getClientForTenant,
  importListings,
  publishUnit,
  unpublishUnit,
  ingestLead,
  pullLeads,
  normalizeLead,
  processWebhookEvent,
  logIntegrationEvent
};

