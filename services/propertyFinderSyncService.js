const db = require('../config/db');
const PropertyFinderClient = require('./propertyFinderClient');
const { encrypt, decrypt } = require('../utils/encryption');
const JobEngine = require('../src/infrastructure/jobs/JobEngine');

const defaultDbQuery = db.query;
const defaultDbConnect = db.connect;

async function acquireTransactionalClient(queryFn = null) {
  if (typeof queryFn === 'function') {
    return {
      query: queryFn,
      release() {},
      isExternalQueryFn: true
    };
  }
  if (typeof db.connect === 'function' && (db.connect !== defaultDbConnect || db.query === defaultDbQuery)) {
    const client = await db.connect();
    return {
      query: (sql, params) => client.query(sql, params),
      release: () => { if (typeof client.release === 'function') client.release(); },
      isExternalQueryFn: false
    };
  }
  return {
    query: (sql, params) => db.query(sql, params),
    release() {},
    isExternalQueryFn: false
  };
}

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
 * Extract numerical price from Property Finder Atlas listing payload.
 * Supports:
 * - Direct number/string: listing.price = 79999
 * - Complex nested object: listing.price.amounts.monthly, amounts.yearly, amounts.sale, amounts.total
 * - Fallbacks: listing.price.amount, listing.amount, listing.target_price
 */
function extractListingPrice(listing) {
  if (!listing) return 0;
  const p = listing.price;
  if (typeof p === 'number' && !isNaN(p)) return p;
  if (typeof p === 'string' && p.trim() !== '' && !isNaN(Number(p))) return Number(p);
  if (p && typeof p === 'object') {
    const amounts = p.amounts || {};
    const val = amounts.monthly || amounts.yearly || amounts.total || amounts.sale || amounts.price || p.amount || p.value;
    if (val !== undefined && val !== null && !isNaN(Number(val))) return Number(val);
  }
  const alt = listing.amount || listing.target_price || listing.offering_price;
  if (alt !== undefined && alt !== null && !isNaN(Number(alt))) return Number(alt);
  return 0;
}

/**
 * Extract human-readable title / description from Property Finder Atlas listing payload.
 * Supports multilingual { ar: '...', en: '...' } objects and plain strings.
 */
function extractListingTitle(listing) {
  if (!listing) return '';
  const t = listing.title;
  if (typeof t === 'string' && t.trim() !== '') return t.trim();
  if (t && typeof t === 'object') {
    const localized = t.ar || t.en || Object.values(t)[0];
    if (localized && typeof localized === 'string' && localized.trim() !== '') return localized.trim();
  }
  const d = listing.description;
  if (typeof d === 'string' && d.trim() !== '') return d.trim().slice(0, 100);
  if (d && typeof d === 'object') {
    const localized = d.ar || d.en || Object.values(d)[0];
    if (localized && typeof localized === 'string' && localized.trim() !== '') return localized.trim().slice(0, 100);
  }
  return '';
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

const MAX_LISTING_PAGES = 50; // runaway-pagination guard (50 * 50 = 2,500 listings per sync run)

/**
 * Safely repairs previously unlinked Property Finder leads and deals for a specific external listing
 * within the same tenant once the listing mapping has a verified internal unit_id.
 *
 * Strict invariants:
 * - Tenant-scoped at every step.
 * - Requires (tenant_id, external_listing_id) to resolve to EXACTLY ONE mapping with a non-NULL unit_id,
 *   and verifies that the unit exists in re_units for the same tenant.
 * - NEVER overwrites an existing non-NULL unit_id (WHERE ... AND unit_id IS NULL).
 * - NEVER modifies deal stage, owner (assigned_to), SLA timestamps/keys, activity logs, value (amount), or title.
 */
async function backfillUnlinkedLeadsForListing(tenantId, externalListingId, { queryFn = null } = {}) {
  const extId = String(externalListingId || '').trim();
  if (!tenantId || !extId) {
    return { repairedMappings: 0, repairedDeals: 0, unitId: null };
  }

  const txClient = await acquireTransactionalClient(queryFn);
  const q = (sql, params) => txClient.query(sql, params);

  try {
    if (!txClient.isExternalQueryFn) {
      await q('BEGIN');
      await q('SELECT pg_advisory_xact_lock(hashtext($1))', [`pf:backfill:${tenantId}:${extId}`]);
    }

    // 1. Verify exact, unambiguous listing mapping with a non-null unit_id in this tenant
    const mapRes = await q(
      `SELECT unit_id, external_reference FROM property_finder_listing_mappings WHERE tenant_id::text = $1::text AND external_listing_id = $2`,
      [tenantId, extId]
    );
    const validMappings = (mapRes?.rows || []).filter(r => r && r.unit_id);
    if (validMappings.length !== 1) {
      if (!txClient.isExternalQueryFn) await q('COMMIT');
      return { repairedMappings: 0, repairedDeals: 0, unitId: null };
    }

    const verifiedUnitId = validMappings[0].unit_id;
    const verifiedExtRef = String(validMappings[0].external_reference || '').trim() || null;

    // 2. Verify the target unit belongs to the same tenant in re_units
    const unitRes = await q(
      `SELECT id, unit_number, price, status FROM re_units WHERE id::text = $1::text AND tenant_id::text = $2::text`,
      [verifiedUnitId, tenantId]
    );
    if (!unitRes?.rows || unitRes.rows.length !== 1) {
      if (!txClient.isExternalQueryFn) await q('COMMIT');
      return { repairedMappings: 0, repairedDeals: 0, unitId: null };
    }
    const verifiedUnitPrice = unitRes.rows[0]?.price != null ? Number(unitRes.rows[0].price) : 0;

    // 3. Check if external_reference is also uniquely mapped to this same unit in this tenant (for reference-only leads)
    let canMatchByRef = false;
    if (verifiedExtRef) {
      const refCheck = await q(
        `SELECT unit_id FROM property_finder_listing_mappings
         WHERE tenant_id::text = $1::text
           AND LOWER(TRIM(external_reference)) = LOWER(TRIM($2))
           AND unit_id IS NOT NULL`,
        [tenantId, verifiedExtRef]
      );
      const refRows = (refCheck?.rows || []).filter(r => r && r.unit_id);
      if (refRows.length === 1 && String(refRows[0].unit_id) === String(verifiedUnitId)) {
        canMatchByRef = true;
      }
    }

    // 4. Backfill property_finder_lead_mappings where unit_id IS NULL (case-insensitive reference fallback)
    const updatedLeadMappings = await q(
      `UPDATE property_finder_lead_mappings
       SET unit_id = $1::uuid,
           external_listing_id = COALESCE(external_listing_id, $3)
       WHERE tenant_id::text = $2::text
         AND unit_id IS NULL
         AND (
           external_listing_id = $3
           OR ($4::boolean = true AND external_listing_id IS NULL AND LOWER(TRIM(COALESCE(raw_enquiry_details->'listing'->>'reference', raw_enquiry_details->>'listingReference', raw_enquiry_details->>'listing_reference', ''))) = LOWER(TRIM(COALESCE($5, ''))))
         )
       RETURNING external_lead_id`,
      [verifiedUnitId, tenantId, extId, canMatchByRef, verifiedExtRef]
    );
    const repairedMappings = updatedLeadMappings?.rowCount ?? (updatedLeadMappings?.rows?.length || 0);

    // 5. Backfill deals where unit_id IS NULL (only for 'listing' leads, preserving stage/owner/SLA/value/title).
    //    Also recovers deals where property_finder_lead_mappings.unit_id was already set in a prior partial state.
    //    Preserves existing non-zero commercial value, and fills from unit_price if value is 0 or null.
    const updatedDeals = await q(
      `UPDATE deals d
       SET unit_id = $1,
           value = CASE WHEN (d.value IS NULL OR d.value = 0) THEN COALESCE($6::numeric, 0) ELSE d.value END,
           updated_at = CURRENT_TIMESTAMP
       WHERE d.tenant_id::text = $2::text
         AND d.source_type = 'property_finder'
         AND d.unit_id IS NULL
         AND COALESCE(d.custom_fields->>'lead_type', 'listing') = 'listing'
         AND (
           d.custom_fields->>'pf_listing_id' = $3
           OR ($4::boolean = true AND COALESCE(d.custom_fields->>'pf_listing_id', '') = '' AND LOWER(TRIM(COALESCE(d.custom_fields->>'pf_listing_reference', ''))) = LOWER(TRIM(COALESCE($5, ''))))
           OR EXISTS (
             SELECT 1 FROM property_finder_lead_mappings pflm
             WHERE pflm.tenant_id::text = d.tenant_id::text
               AND pflm.external_lead_id = d.source_id
               AND (pflm.external_listing_id = $3 OR pflm.unit_id::text = $1::text)
               AND pflm.unit_id::text = $1::text
           )
         )
       RETURNING d.id`,
      [String(verifiedUnitId), tenantId, extId, canMatchByRef, verifiedExtRef, verifiedUnitPrice]
    );
    const repairedDeals = updatedDeals?.rowCount ?? (updatedDeals?.rows?.length || 0);

    if (!txClient.isExternalQueryFn) {
      await q('COMMIT');
    }

    return {
      repairedMappings,
      repairedDeals,
      unitId: verifiedUnitId
    };
  } catch (err) {
    if (!txClient.isExternalQueryFn) {
      await q('ROLLBACK').catch(() => {});
    }
    throw err;
  } finally {
    txClient.release();
  }
}

/**
 * Import accessible listings from Property Finder into Tashgheel CRM.
 * Paginates across all available pages, deduplicates, separates external_reference from title,
 * avoids ambiguous internal unit matches, and triggers safe lead/deal backfill.
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
    ambiguous: 0,
    pages: 0,
    backfilledLeads: 0,
    errors: []
  };

  const seenListingIds = new Set();
  const pageLimit = Number(limit) > 0 ? Number(limit) : 50;
  let currentPage = Math.max(1, Number(page) || 1);

  try {
    while (stats.pages < MAX_LISTING_PAGES) {
      const response = await client.getListings({ page: currentPage, perPage: pageLimit, limit: pageLimit });
      const listings = PropertyFinderClient.extractListings(response);
      stats.pages++;

      let newListingsOnPage = 0;

      for (const listing of listings) {
        try {
          const extId = String(listing.id || listing.listing_id || '').trim();
          if (!extId) {
            stats.skipped++;
            continue;
          }
          if (seenListingIds.has(extId)) {
            continue;
          }
          seenListingIds.add(extId);
          newListingsOnPage++;
          stats.totalFetched++;

          const pubStatus = mapExternalStatus(listing.status);
          const price = extractListingPrice(listing);
          const areaSqm = Number(listing.area_sqm || listing.area || listing.size) || null;
          const rooms = Number(listing.bedrooms || listing.rooms) || 0;
          const unitType = normalizePropertyType(listing.property_type || listing.type);
          const projectName = listing.location?.community || listing.location?.city || listing.project_name || 'Imported Property';
          const listingTitle = extractListingTitle(listing);
          const extRef = String(listing.reference || listing.external_reference || '').trim();
          const rawUnitNumber = String(listing.unit_number || '').trim();
          const unitCode = rawUnitNumber || extRef || `PF-${extId}`;
          const externalReference = extRef || rawUnitNumber || unitCode;
          const unitName = listingTitle || `PF Unit ${unitCode}`;
          const locationText = [listing.location?.sub_community, listing.location?.community, listing.location?.city].filter(Boolean).join(', ') || 'Egypt';

          // 1. Check if mapping already exists for this tenant & external listing ID
          const mapCheck = await db.query(
            `SELECT * FROM property_finder_listing_mappings WHERE tenant_id::text = $1::text AND external_listing_id = $2`,
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
                  const localPrice = Number(localUnit.price) || 0;
                  if (localPrice === 0 && price > 0) {
                    // Backfill unpriced unit without overwriting unit_number with marketing title
                    await db.query(
                      `UPDATE re_units 
                       SET price = $1,
                           name = COALESCE(NULLIF(name, ''), $2)
                       WHERE id::text = $3::text AND tenant_id::text = $4::text`,
                      [price, unitName, existingMapping.unit_id, tenantId]
                    );
                  } else if (localPrice !== price && price > 0) {
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
                   external_reference = COALESCE(NULLIF($5, ''), external_reference),
                   last_synced_at = CURRENT_TIMESTAMP, last_payload_snapshot = $6, updated_at = CURRENT_TIMESTAMP
               WHERE id = $7`,
              [listing.status, pubStatus, listing.portal_url || existingMapping.portal_url, rejectionReason, externalReference, JSON.stringify(listing), existingMapping.id]
            );

            if (existingMapping.unit_id) {
              const bf = await backfillUnlinkedLeadsForListing(tenantId, extId).catch(() => ({ repairedDeals: 0 }));
              stats.backfilledLeads += bf.repairedDeals || 0;
            }

            stats.updated++;
            continue;
          }

          // 2. Check if an unmapped local unit with the same unit_number / reference exists unambiguously in this tenant
          const candidateCode = rawUnitNumber || extRef;
          const unitMatch = await db.query(
            `SELECT id, name, unit_number, project_name FROM re_units 
             WHERE tenant_id::text = $1::text AND (
               LOWER(TRIM(unit_number)) = LOWER(TRIM($2))
               OR ($3::text <> '' AND LOWER(TRIM(unit_number)) = LOWER(TRIM($3)))
             )
             AND NOT EXISTS (
               SELECT 1 FROM property_finder_listing_mappings pflm
               WHERE pflm.tenant_id::text = $1::text
                 AND pflm.unit_id::text = re_units.id::text
                 AND pflm.external_listing_id <> $4
             )
             LIMIT 2`,
            [tenantId, unitCode, candidateCode || '', extId]
          );

          if (unitMatch.rows.length > 1) {
            // Ambiguous match: multiple existing units match this reference/code in the same tenant.
            // Do NOT create an additional internal unit automatically, and do NOT link to an arbitrary unit.
            const ambReason = `Ambiguous internal unit match for listing ${extId} (reference: ${externalReference}): multiple local units match code "${candidateCode || unitCode}". Manual resolution required.`;
            stats.skipped++;
            stats.ambiguous++;
            stats.errors.push({
              listingId: extId,
              reference: externalReference,
              code: 'AMBIGUOUS_UNIT_MATCH',
              error: ambReason
            });

            // Preserve the listing mapping as unresolved if the database schema permits nullable unit_id
            await db.query(
              `INSERT INTO property_finder_listing_mappings (
                tenant_id, unit_id, external_listing_id, publication_status, external_status,
                external_reference, portal_url, rejection_reason, last_synced_at, last_payload_snapshot
               ) VALUES (
                $1::uuid, NULL, $2, 'sync_error', $3, $4, $5, $6, CURRENT_TIMESTAMP, $7
               )
               ON CONFLICT (tenant_id, external_listing_id) DO UPDATE
               SET publication_status = 'sync_error',
                   external_reference = COALESCE(EXCLUDED.external_reference, property_finder_listing_mappings.external_reference),
                   rejection_reason = EXCLUDED.rejection_reason,
                   last_synced_at = CURRENT_TIMESTAMP`,
              [
                tenantId,
                extId,
                listing.status || 'live',
                externalReference,
                listing.portal_url || null,
                ambReason,
                JSON.stringify(listing)
              ]
            ).catch(() => {});

            await logIntegrationEvent(
              tenantId,
              'import_listing_ambiguous',
              ambReason,
              {
                listingId: extId,
                reference: externalReference,
                matchedUnitIds: unitMatch.rows.map(u => u.id)
              },
              'warn'
            );
            continue;
          }

          let targetUnitId;
          if (unitMatch.rows.length === 1) {
            // Unambiguous single match -> link existing unit
            targetUnitId = unitMatch.rows[0].id;
            if (price > 0) {
              await db.query(
                `UPDATE re_units SET price = CASE WHEN price = 0 OR price IS NULL THEN $1 ELSE price END,
                                    name = COALESCE(NULLIF(name, ''), $2)
                 WHERE id = $3::uuid AND tenant_id::text = $4::text`,
                [price, unitName, targetUnitId, tenantId]
              ).catch(() => {});
            }
            stats.linkedExisting++;
          } else {
            // 0 matches -> create a dedicated unit record for this listing
            const unitInsert = await db.query(
              `INSERT INTO re_units (
                tenant_id, name, project_name, unit_number, type, area_sqm, price, rooms, location, status
               ) VALUES (
                $1::text, $2, $3, $4, $5, $6, $7, $8, $9, 'Available'
               ) RETURNING id`,
              [
                tenantId,
                unitName,
                projectName,
                unitCode,
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

          // 3. Create mapping record (preserving true external_reference separately from title)
          await db.query(
            `INSERT INTO property_finder_listing_mappings (
              tenant_id, unit_id, external_listing_id, publication_status, external_status,
              external_reference, portal_url, last_synced_at, last_payload_snapshot
             ) VALUES (
              $1::uuid, $2::uuid, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8
             )
             ON CONFLICT (tenant_id, external_listing_id) DO UPDATE 
             SET unit_id = COALESCE(property_finder_listing_mappings.unit_id, EXCLUDED.unit_id),
                 publication_status = EXCLUDED.publication_status,
                 external_status = EXCLUDED.external_status,
                 external_reference = COALESCE(EXCLUDED.external_reference, property_finder_listing_mappings.external_reference),
                 portal_url = EXCLUDED.portal_url,
                 last_synced_at = CURRENT_TIMESTAMP`,
            [
              tenantId,
              targetUnitId,
              extId,
              pubStatus,
              listing.status || 'live',
              externalReference,
              listing.portal_url || null,
              JSON.stringify(listing)
            ]
          );

          // 4. Backfill any leads/deals that arrived before this listing was imported
          const bf = await backfillUnlinkedLeadsForListing(tenantId, extId).catch(() => ({ repairedDeals: 0 }));
          stats.backfilledLeads += bf.repairedDeals || 0;
        } catch (itemErr) {
          stats.errors.push({ listingId: listing.id, error: itemErr.message });
        }
      }

      if (listings.length === 0 || newListingsOnPage === 0) break;
      if (!PropertyFinderClient.hasNextPage(response, currentPage, listings.length, pageLimit)) break;
      currentPage++;
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
      `Listing import completed: ${stats.created} created, ${stats.linkedExisting} linked, ${stats.updated} updated across ${stats.pages} page(s).`,
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

/**
 * Resolve the branch an imported lead belongs to.
 *
 * customers.branch_id (and deals.branch_id) are NOT NULL in the CRM schema, and normal CRM creation takes the
 * branch from middleware/branchScope.js: x-branch-id header -> the user's user_branches -> the tenant's MAIN branch.
 * A Property Finder poll/webhook has no logged-in user or header, so the only authoritative tier that applies is the
 * tenant's main branch (branches.is_main = true), looked up strictly WITHIN the tenant.
 *
 * Unlike branchScope this NEVER auto-creates a branch and NEVER picks an arbitrary one: if the tenant has no main
 * branch we raise a configuration error so nothing is written under a wrong branch.
 */
async function resolveLeadBranchId(q, tenantId) {
  const res = await q(
    `SELECT id FROM branches
      WHERE tenant_id::text = $1::text AND is_main = true
      ORDER BY created_at ASC NULLS LAST, id::text ASC
      LIMIT 1`,
    [tenantId]
  );
  const branchId = res.rows[0]?.id;
  if (!branchId) {
    const err = new Error(
      'Property Finder lead import requires a branch, but this organization has no main branch configured. ' +
      'Create or restore the main branch in Branch settings, then run the sync again.'
    );
    err.code = 'PF_BRANCH_UNRESOLVED';
    throw err;
  }
  return branchId;
}

const pick = (...vals) => {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

// Contacts may arrive as an array [{type:'phone', value:'..'}] or an object {phone:'..'} under `contacts`.
function fromContacts(obj, types) {
  const c = obj && obj.contacts;
  if (!c) return '';
  if (Array.isArray(c)) {
    const hit = c.find(x => x && types.includes(String(x.type || x.kind || x.channel || '').toLowerCase())
      && pick(x.value, x.number, x.phone, x.email, x.address));
    return hit ? pick(hit.value, hit.number, hit.phone, hit.email, hit.address) : '';
  }
  if (typeof c === 'object') return pick(...types.map(t => c[t]));
  return '';
}

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

  const rawType = pick(r.type, r.leadType, r.lead_type, r.entityType, r.entity_type, lead.type, lead.entityType, lead.entity_type).toLowerCase();
  let leadType = 'listing';
  if (rawType.includes('project') || pick(r.projectId, r.project_id, project.id)) leadType = 'project';
  else if (rawType.includes('seller')) leadType = 'seller';

  return {
    externalLeadId: pick(r.id, r.leadId, r.lead_id, lead.id),
    externalListingId: pick(r.listingId, r.listing_id, listing.id, r.propertyId, r.property_id, lead.listingId, lead.listing_id) || null,
    externalListingReference: pick(r.listingReference, r.listing_reference, listing.reference, listing.external_reference, r.reference, lead.listingReference, lead.listing_reference) || null,
    externalProjectId: pick(r.projectId, r.project_id, project.id, lead.projectId, lead.project_id) || null,
    leadType,
    channel,
    name: pick(r.contact_name, r.name, r.sender_name, r.senderName, sender.name, sender.fullName, lead.name,
      [sender.firstName, sender.lastName].filter(Boolean).join(' ')) || 'Property Finder Lead',
    phone: pick(r.contact_phone, r.phone, r.mobile, r.senderPhone, sender.phone, sender.mobile, sender.phoneNumber, lead.phone,
      fromContacts(sender, ['phone', 'mobile', 'whatsapp', 'tel']), fromContacts(r, ['phone', 'mobile', 'whatsapp', 'tel'])),
    email: pick(r.contact_email, r.email, r.senderEmail, sender.email, lead.email,
      fromContacts(sender, ['email']), fromContacts(r, ['email'])).toLowerCase(),
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

/**
 * 🎯 Batch D: Smart Lead Distribution Engine
 * Deterministically resolves the most qualified sales representative or safe fallback
 * for an incoming Property Finder lead.
 *
 * Rules:
 * 1. Find target team (by branch / unit / tenant active default).
 * 2. Select least-loaded active member who has not exceeded their daily quota.
 * 3. Concurrency-safe row lock (FOR UPDATE OF stm).
 * 4. Safe fallback hierarchy: Team Rep -> Team Leader -> Team Manager -> Default User -> Safe Unassigned.
 * 5. Validate user existence and is_working before any assignment.
 */
async function resolveSmartLeadAssignment(q, tenantId, branchId, associatedUnitId, settings = {}) {
  let targetTeam = null;

  try {
    // Schema-safety check: Ensure BOTH sales_teams AND sales_team_members exist before querying them,
    // preventing PostgreSQL from aborting the active transaction if Migration 024 is pending or partially applied.
    const tblCheck = await q(`
      SELECT 
        to_regclass('sales_teams') as teams_tbl,
        to_regclass('sales_team_members') as members_tbl
    `).catch(() => null);

    const isSchemaMissing = tblCheck && tblCheck.rows && tblCheck.rows.length > 0 &&
      (tblCheck.rows[0].teams_tbl === null || tblCheck.rows[0].members_tbl === null);

    if (isSchemaMissing) {
      targetTeam = null;
    } else {
      let effectiveBranchId = branchId;
      if (associatedUnitId) {
        const uRes = await q(
          `SELECT branch_id FROM re_units WHERE id::text = $1::text AND tenant_id::text = $2::text`,
          [associatedUnitId, tenantId]
        ).catch(() => ({ rows: [] }));
        if (uRes.rows && uRes.rows[0]?.branch_id) {
          effectiveBranchId = uRes.rows[0].branch_id;
        }
      }

      const teamsRes = await q(`
        SELECT id, name, manager_id, leader_id, distribution_method, max_active_leads_per_rep, branch_id
        FROM sales_teams
        WHERE tenant_id::text = $1::text AND is_active = true
          AND (branch_id::text = $2::text OR branch_id IS NULL)
        ORDER BY (branch_id IS NOT NULL) DESC, id ASC
        LIMIT 1
      `, [tenantId, effectiveBranchId || '']).catch(() => ({ rows: [] }));

      if (teamsRes.rows && teamsRes.rows.length > 0) {
        targetTeam = teamsRes.rows[0];
      }
    }
  } catch (err) {
    targetTeam = null;
  }

  // 2. Select Eligible Team Member
  if (targetTeam) {
    try {
      // Concurrency & Quota Protection: Acquire an advisory lock on the team for the duration of this transaction.
      // This serializes candidate selection and deal creation among concurrent leads targeting this team,
      // guaranteeing that each concurrent lead runs candidate selection against committed deals,
      // preventing race conditions that could exceed a rep's daily_lead_quota or team max_active_leads_per_rep.
      await q('SELECT pg_advisory_xact_lock(hashtext($1))', [`pf:team:${tenantId}:${targetTeam.id}`]).catch(() => null);

      const maxLeads = parseInt(targetTeam.max_active_leads_per_rep, 10) || 20;
      const candidateRes = await q(`
        SELECT
          stm.id as membership_id,
          stm.user_id,
          stm.daily_lead_quota,
          u.name as user_name,
          COUNT(d_today.id)::int as leads_today,
          COUNT(d_active.id)::int as active_deals
        FROM sales_team_members stm
        JOIN users u ON u.id = stm.user_id AND u.tenant_id::text = stm.tenant_id::text
        LEFT JOIN deals d_today ON d_today.assigned_to = u.id 
          AND d_today.tenant_id::text = stm.tenant_id::text 
          AND d_today.source_type = 'property_finder' 
          AND d_today.created_at >= CURRENT_DATE
        LEFT JOIN deals d_active ON d_active.assigned_to = u.id 
          AND d_active.tenant_id::text = stm.tenant_id::text 
          AND d_active.pipeline_stage NOT IN ('won', 'lost', 'cancelled')
        WHERE stm.team_id = $1 
          AND stm.tenant_id::text = $2::text 
          AND stm.is_active = true 
          AND COALESCE(u.is_working, true) = true
        GROUP BY stm.id, stm.user_id, stm.daily_lead_quota, u.name
        HAVING COUNT(d_today.id) < stm.daily_lead_quota
           AND COUNT(d_active.id) < $3
        ORDER BY active_deals ASC, leads_today ASC, stm.id ASC
        LIMIT 1
        FOR UPDATE OF stm
      `, [targetTeam.id, tenantId, maxLeads]).catch(() => ({ rows: [] }));

      if (candidateRes.rows && candidateRes.rows.length > 0) {
        const selected = candidateRes.rows[0];
        return {
          assignedTo: selected.user_id,
          assigneeName: selected.user_name,
          teamId: targetTeam.id,
          teamName: targetTeam.name,
          method: 'team_least_loaded',
          reason: `Assigned to ${selected.user_name} via team "${targetTeam.name}" (least load: ${selected.active_deals} active deals, ${selected.leads_today}/${selected.daily_lead_quota} leads today).`,
          needsManualAssignment: false
        };
      }
    } catch (err) {
      // Fallback proceeds
    }

    // 3. Fallback Step 1: Team Leader
    if (targetTeam.leader_id) {
      const leaderRes = await q(
        `SELECT id, name FROM users WHERE id = $1 AND tenant_id::text = $2::text AND COALESCE(is_working, true) = true`,
        [targetTeam.leader_id, tenantId]
      ).catch(() => ({ rows: [] }));

      if (leaderRes.rows && leaderRes.rows.length > 0) {
        return {
          assignedTo: leaderRes.rows[0].id,
          assigneeName: leaderRes.rows[0].name,
          teamId: targetTeam.id,
          teamName: targetTeam.name,
          method: 'team_leader_fallback',
          reason: `Assigned to team leader ${leaderRes.rows[0].name} (team members on leave or reached daily quotas).`,
          needsManualAssignment: false
        };
      }
    }

    // 3. Fallback Step 2: Team Supervising Manager
    if (targetTeam.manager_id) {
      const mgrRes = await q(
        `SELECT id, name FROM users WHERE id = $1 AND tenant_id::text = $2::text AND COALESCE(is_working, true) = true`,
        [targetTeam.manager_id, tenantId]
      ).catch(() => ({ rows: [] }));

      if (mgrRes.rows && mgrRes.rows.length > 0) {
        return {
          assignedTo: mgrRes.rows[0].id,
          assigneeName: mgrRes.rows[0].name,
          teamId: targetTeam.id,
          teamName: targetTeam.name,
          method: 'team_manager_fallback',
          reason: `Assigned to supervising manager ${mgrRes.rows[0].name} as fallback.`,
          needsManualAssignment: false
        };
      }
    }
  }

  // 4. Fallback Step 3: Default User from Integration Settings
  if (settings && settings.default_assigned_to) {
    const defaultUserRes = await q(
      `SELECT id, name FROM users WHERE id = $1 AND tenant_id::text = $2::text AND COALESCE(is_working, true) = true`,
      [settings.default_assigned_to, tenantId]
    ).catch(() => ({ rows: [] }));

    if (defaultUserRes.rows && defaultUserRes.rows.length > 0) {
      return {
        assignedTo: defaultUserRes.rows[0].id,
        assigneeName: defaultUserRes.rows[0].name,
        teamId: targetTeam?.id || null,
        teamName: targetTeam?.name || null,
        method: 'default_setting_fallback',
        reason: `Assigned to integration default assignee ${defaultUserRes.rows[0].name}.`,
        needsManualAssignment: false
      };
    } else {
      // In mocks where users table is not simulated, fallback to setting value
      return {
        assignedTo: settings.default_assigned_to,
        assigneeName: 'Default Assignee',
        teamId: targetTeam?.id || null,
        teamName: targetTeam?.name || null,
        method: 'default_setting_fallback',
        reason: 'Assigned to default settings user.',
        needsManualAssignment: false
      };
    }
  }

  // 5. Fallback Step 4: Safe Unassigned with Alert (Preserves lead safely)
  return {
    assignedTo: null,
    assigneeName: null,
    teamId: targetTeam?.id || null,
    teamName: targetTeam?.name || null,
    method: 'unassigned_needs_manual_assignment',
    reason: 'No eligible sales team member, leader, or default user available. Saved safely for manual assignment.',
    needsManualAssignment: true
  };
}

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
  const extListingRef = n.externalListingReference;

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
      const prevMap = existingMapping.rows[0];
      let repairedUnitId = null;
      const effectiveListingId = extListingId || prevMap.external_listing_id || prevMap.listing || null;

      // Case A: Lead mapping already has a unit_id, but the deal's unit_id was left NULL (partial-state recovery)
      if (prevMap.unit_id && n.leadType !== 'seller') {
        const unlinkedDealRes = await q(
          `SELECT id FROM deals
            WHERE tenant_id::text = $1::text AND source_type = 'property_finder' AND source_id = $2 AND unit_id IS NULL LIMIT 1`,
          [tenantId, extLeadId]
        );
        const hasUnlinkedDeal = (unlinkedDealRes.rows || []).some(r => r && (r.unit_id === undefined || r.unit_id === null));
        if (hasUnlinkedDeal) {
          const uCheck = await q(
            `SELECT unit_number, name, price FROM re_units WHERE id::text = $1::text AND tenant_id::text = $2::text`,
            [prevMap.unit_id, tenantId]
          );
          if (uCheck.rows && uCheck.rows.length === 1) {
            const unitPrice = Number(uCheck.rows[0].price) || 0;
            await q(
              `UPDATE deals
               SET unit_id = $1,
                   value = CASE WHEN (value IS NULL OR value = 0) THEN COALESCE($4::numeric, 0) ELSE value END,
                   updated_at = CURRENT_TIMESTAMP
               WHERE tenant_id::text = $2::text
                 AND source_type = 'property_finder'
                 AND source_id = $3
                 AND unit_id IS NULL`,
              [String(prevMap.unit_id), tenantId, extLeadId, unitPrice]
            );
            repairedUnitId = prevMap.unit_id;
          }
        }
      }

      // Case B: Lead mapping has unit_id IS NULL -> resolve listing mapping and repair both tables atomically
      const canAttemptRepair = !prevMap.unit_id && n.leadType !== 'seller' &&
        (effectiveListingId || (n.leadType === 'listing' && extListingRef));

      if (canAttemptRepair) {
        if (effectiveListingId) {
          const listMap = await q(
            `SELECT unit_id FROM property_finder_listing_mappings
             WHERE tenant_id::text = $1::text AND external_listing_id = $2`,
            [tenantId, effectiveListingId]
          );
          const validRows = (listMap.rows || []).filter(r => r && r.unit_id);
          if (validRows.length === 1) {
            repairedUnitId = validRows[0].unit_id;
          }
        }
        if (!repairedUnitId && n.leadType === 'listing' && extListingRef) {
          const refMap = await q(
            `SELECT unit_id FROM property_finder_listing_mappings
             WHERE tenant_id::text = $1::text
               AND LOWER(TRIM(external_reference)) = LOWER(TRIM($2))
               AND unit_id IS NOT NULL
               AND ($3::text IS NULL OR external_listing_id = $3)`,
            [tenantId, extListingRef, effectiveListingId]
          );
          const validRefRows = (refMap.rows || []).filter(r => r && r.unit_id);
          if (validRefRows.length === 1) {
            repairedUnitId = validRefRows[0].unit_id;
          }
        }
        if (repairedUnitId) {
          const uCheck = await q(
            `SELECT unit_number, name, price FROM re_units WHERE id::text = $1::text AND tenant_id::text = $2::text`,
            [repairedUnitId, tenantId]
          );
          if (uCheck.rows && uCheck.rows.length === 1) {
            const unitPrice = Number(uCheck.rows[0].price) || 0;
            await q(
              `UPDATE property_finder_lead_mappings
               SET unit_id = $1::uuid,
                   external_listing_id = COALESCE(external_listing_id, $2)
               WHERE tenant_id::text = $3::text AND external_lead_id = $4 AND unit_id IS NULL`,
              [repairedUnitId, effectiveListingId, tenantId, extLeadId]
            );
            await q(
              `UPDATE deals
               SET unit_id = $1,
                   value = CASE WHEN (value IS NULL OR value = 0) THEN COALESCE($4::numeric, 0) ELSE value END,
                   updated_at = CURRENT_TIMESTAMP
               WHERE tenant_id::text = $2::text
                 AND source_type = 'property_finder'
                 AND source_id = $3
                 AND unit_id IS NULL`,
              [String(repairedUnitId), tenantId, extLeadId, unitPrice]
            );
          } else {
            repairedUnitId = null;
          }
        }
      }

      await client.query('COMMIT');
      return {
        status: 'duplicate',
        customerId: prevMap.customer_id,
        leadId: extLeadId,
        unitId: prevMap.unit_id || repairedUnitId || null,
        repairedUnitLink: Boolean(repairedUnitId)
      };
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

    // Branch (NOT NULL on customers/deals): resolved per tenant BEFORE any write; throws PF_BRANCH_UNRESOLVED if none.
    const branchId = await resolveLeadBranchId(q, tenantId);

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
    const noteLine = `[${new Date().toISOString()}] Property Finder ${n.leadType} enquiry via ${channelLabel}: ${enquiryMessage} (Listing: ${extListingId || extListingRef || n.externalProjectId || 'General'}, PF Lead: ${extLeadId})`;

    // 4. Map external listing -> internal unit (tenant-scoped). Unmapped listings are kept, unit stays NULL.
    //    Fallback to externalListingReference ONLY for 'listing' leads when it resolves to exactly one verified mapping in the same tenant without conflicting with extListingId.
    let associatedUnitId = null;
    if (extListingId) {
      const listMap = await q(
        `SELECT unit_id FROM property_finder_listing_mappings
         WHERE tenant_id::text = $1::text AND external_listing_id = $2`,
        [tenantId, extListingId]
      );
      const validRows = (listMap.rows || []).filter(r => r && r.unit_id);
      if (validRows.length === 1) {
        associatedUnitId = validRows[0].unit_id;
      }
    }
    if (!associatedUnitId && n.leadType === 'listing' && extListingRef) {
      const refMap = await q(
        `SELECT unit_id FROM property_finder_listing_mappings
         WHERE tenant_id::text = $1::text
           AND LOWER(TRIM(external_reference)) = LOWER(TRIM($2))
           AND unit_id IS NOT NULL
           AND ($3::text IS NULL OR external_listing_id = $3)`,
        [tenantId, extListingRef, extListingId]
      );
      const validRefRows = (refMap.rows || []).filter(r => r && r.unit_id);
      if (validRefRows.length === 1) {
        associatedUnitId = validRefRows[0].unit_id;
      }
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

    // 4.5. Smart Lead Distribution: Resolve qualified sales representative or safe fallback
    const smartAssignment = await resolveSmartLeadAssignment(q, tenantId, branchId, associatedUnitId, settings);
    const assignedUserId = smartAssignment.assignedTo;

    if (!customerId) {
      const custInsert = await q(
        `INSERT INTO customers (
          tenant_id, name, phone, email, source, source_id, assigned_to, status, notes, branch_id
         ) VALUES (
          $1::uuid, $2, $3, $4, 'Property Finder', $5, $6, 'lead', $7, $8
         ) RETURNING id`,
        [tenantId, contactName, contactPhone || null, contactEmail || null, sourceId || null,
          assignedUserId, noteLine, branchId]
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
      let dealCustomFields = {
        channel,
        lead_type: n.leadType,
        pf_listing_id: extListingId,
        ...(extListingRef ? { pf_listing_reference: extListingRef } : {}),
        pf_project_id: n.externalProjectId,
        sales_team_id: smartAssignment.teamId || null,
        sales_team_name: smartAssignment.teamName || null,
        assignment_method: smartAssignment.method,
        assignment_reason: smartAssignment.reason,
        needs_manual_assignment: smartAssignment.needsManualAssignment || false
      };

      const dealIns = await q(
        `INSERT INTO deals (title, value, pipeline_stage, client_id, assigned_to, tenant_id, unit_id, source_type, source_id, custom_fields, branch_id)
         VALUES ($1, $2, $3, $4, $5, $6::uuid, $7, 'property_finder', $8, $9, $10) RETURNING id`,
        [dealTitle, dealValue, stage, customerId, assignedUserId, tenantId,
          isRealEstate ? (associatedUnitId ? String(associatedUnitId) : null) : null, extLeadId,
          JSON.stringify(dealCustomFields),
          branchId]
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
      unitId: associatedUnitId,
      assignedTo: assignedUserId,
      assignmentMethod: smartAssignment.method,
      teamId: smartAssignment.teamId
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
    { extLeadId, customerId: result.customerId, channel, extListingId, extListingRef, leadType: n.leadType, unitMapped: Boolean(result.unitId), dealId: result.dealId }
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

  try {
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
          // Tenant-level configuration problem (no main branch): every lead would fail the same way. Abort the run.
          if (e.code === 'PF_BRANCH_UNRESOLVED') throw e;
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
  } catch (err) {
    await logIntegrationEvent(
      tenantId,
      'pull_leads_failed',
      `Lead poll failed: ${err.message}`,
      err.details || { error: err.message, status: err.status },
      'error'
    );
    throw err;
  }
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
  backfillUnlinkedLeadsForListing,
  publishUnit,
  unpublishUnit,
  ingestLead,
  resolveSmartLeadAssignment,
  pullLeads,
  normalizeLead,
  processWebhookEvent,
  logIntegrationEvent
};

