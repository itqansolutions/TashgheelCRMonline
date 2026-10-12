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

/**
 * Ingests a Property Finder lead and maps it into Tashgheel customers pipeline.
 * Deduplicates by external_lead_id, resolves associated unit, and prevents duplicate contacts.
 */
async function ingestLead(tenantId, rawLead) {
  if (!tenantId || !rawLead) {
    throw new Error('Tenant ID and lead payload are required.');
  }

  const extLeadId = String(rawLead.id || rawLead.lead_id || '').trim();
  if (!extLeadId) {
    throw new Error('Lead payload must contain a valid external lead ID.');
  }

  // 1. Check idempotency: Lead mapping table check
  const existingMapping = await db.query(
    `SELECT * FROM property_finder_lead_mappings WHERE tenant_id::text = $1::text AND external_lead_id = $2`,
    [tenantId, extLeadId]
  );

  if (existingMapping.rows.length > 0) {
    return {
      status: 'duplicate',
      customerId: existingMapping.rows[0].customer_id,
      leadId: extLeadId
    };
  }

  // 2. Fetch tenant settings for defaults (lead source, assigned agent)
  const settingsRes = await db.query(
    `SELECT * FROM property_finder_settings WHERE tenant_id::text = $1::text`,
    [tenantId]
  );
  const settings = settingsRes.rows[0] || {};

  // 3. Resolve lead source (Default: 'Property Finder')
  let sourceId = settings.default_lead_source_id;
  if (!sourceId) {
    try {
      const srcCheck = await db.query(
        `SELECT id FROM lead_sources 
         WHERE tenant_id::text = $1::text AND LOWER(TRIM(name)) = 'property finder' LIMIT 1`,
        [tenantId]
      );
      if (srcCheck.rows.length > 0) {
        sourceId = srcCheck.rows[0].id;
      } else {
        const newSrc = await db.query(
          `INSERT INTO lead_sources (name, tenant_id) VALUES ('Property Finder', $1::uuid) RETURNING id`,
          [tenantId]
        );
        sourceId = newSrc.rows[0].id;
      }
    } catch (e) {
      console.warn('[Lead Source Resolution Warning]', e.message);
    }
  }

  // 4. Extract lead information
  const contactName = (rawLead.contact_name || rawLead.name || rawLead.sender_name || 'Property Finder Lead').trim();
  const contactPhone = (rawLead.contact_phone || rawLead.phone || rawLead.mobile || '').trim();
  const contactEmail = (rawLead.contact_email || rawLead.email || '').trim();
  const rawChannel = (rawLead.channel || 'form').toLowerCase();
  const channel = ['whatsapp', 'phone', 'email', 'form'].includes(rawChannel) ? rawChannel : 'form';
  const enquiryMessage = rawLead.enquiry_message || rawLead.message || rawLead.notes || '';
  const extListingId = rawLead.listing_id ? String(rawLead.listing_id).trim() : null;

  // 5. Match associated unit in Tashgheel
  let associatedUnitId = null;
  if (extListingId) {
    const listMap = await db.query(
      `SELECT unit_id FROM property_finder_listing_mappings 
       WHERE tenant_id::text = $1::text AND external_listing_id = $2`,
      [tenantId, extListingId]
    );
    if (listMap.rows.length > 0) {
      associatedUnitId = listMap.rows[0].unit_id;
    }
  }

  // 6. Duplicate contact check: find existing customer by phone or email
  let customerId = null;
  if (contactPhone || contactEmail) {
    const custCheck = await db.query(
      `SELECT id, name, notes FROM customers 
       WHERE tenant_id::text = $1::text 
         AND (
           ($2::text <> '' AND phone = $2) 
           OR ($3::text <> '' AND email = $3)
         ) LIMIT 1`,
      [tenantId, contactPhone, contactEmail]
    );

    if (custCheck.rows.length > 0) {
      customerId = custCheck.rows[0].id;
      // Append inquiry note to existing customer
      const existingNotes = custCheck.rows[0].notes || '';
      const updatedNotes = `${existingNotes}\n[${new Date().toISOString()}] Property Finder Inquiry (${channel}): ${enquiryMessage} (Listing: ${extListingId || 'General'})`.trim();
      await db.query(
        `UPDATE customers SET notes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [updatedNotes, customerId]
      );
    }
  }

  // 7. If customer does not exist, create new lead record in customers
  if (!customerId) {
    const newNotes = `[${new Date().toISOString()}] Property Finder Inquiry (${channel}): ${enquiryMessage} (Listing: ${extListingId || 'General'})`;
    const custInsert = await db.query(
      `INSERT INTO customers (
        tenant_id, name, phone, email, source, source_id, assigned_to, status, notes
       ) VALUES (
        $1::uuid, $2, $3, $4, 'Property Finder', $5, $6, 'lead', $7
       ) RETURNING id`,
      [
        tenantId,
        contactName,
        contactPhone || null,
        contactEmail || null,
        sourceId || null,
        settings.default_assigned_to || null,
        newNotes
      ]
    );
    customerId = custInsert.rows[0].id;
  }

  // 8. Create lead mapping record
  await db.query(
    `INSERT INTO property_finder_lead_mappings (
      tenant_id, customer_id, external_lead_id, external_listing_id, unit_id, channel, raw_enquiry_details
     ) VALUES (
      $1::uuid, $2, $3, $4, $5, $6, $7
     )
     ON CONFLICT (tenant_id, external_lead_id) DO NOTHING`,
    [
      tenantId,
      customerId,
      extLeadId,
      extListingId,
      associatedUnitId,
      channel,
      JSON.stringify(rawLead)
    ]
  );

  await logIntegrationEvent(
    tenantId,
    'ingest_lead',
    `Lead ingested from Property Finder: ${contactName} (Lead ID: ${extLeadId}, Channel: ${channel}, Customer ID: ${customerId}).`,
    { extLeadId, customerId, channel, extListingId }
  );

  return {
    status: 'created',
    customerId,
    leadId: extLeadId,
    channel,
    unitId: associatedUnitId
  };
}

/**
 * Inbound webhook processor with idempotency protection.
 */
async function processWebhookEvent(tenantId, providerEventId, eventType, payload) {
  // 1. Check duplicate delivery
  const existing = await db.query(
    `SELECT * FROM property_finder_webhook_events WHERE tenant_id::text = $1::text AND provider_event_id = $2`,
    [tenantId, providerEventId]
  );

  if (existing.rows.length > 0) {
    return { status: 'duplicate', eventId: providerEventId };
  }

  // 2. Persist event
  await db.query(
    `INSERT INTO property_finder_webhook_events (tenant_id, provider_event_id, event_type, status, payload_summary)
     VALUES ($1::uuid, $2, $3, 'received', $4)`,
    [tenantId, providerEventId, eventType, JSON.stringify(payload)]
  );

  // 3. Process asynchronously via JobEngine
  JobEngine.enqueue(`pf_webhook_${providerEventId}`, async () => {
    try {
      if (eventType.includes('lead')) {
        await ingestLead(tenantId, payload);
      } else if (eventType.includes('listing')) {
        const listingId = payload.listing_id || payload.id;
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
  processWebhookEvent,
  logIntegrationEvent
};
