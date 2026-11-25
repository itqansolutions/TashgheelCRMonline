'use strict';
// One-off, tenant-scoped backfill of project_name/location from PF location ids.
// Usage: BACKFILL_APPLY=1 to write; default is a dry run. Updates only rows still
// at the import defaults (project_name 'Imported Property' AND location 'Egypt').
// Step 2 (after migration 030): fills description_ar/description_en/bathrooms/furnishing only where still NULL.
// Updates those columns only. No deletes. Secrets stay in env/db.
const { Pool } = require('pg');
const PropertyFinderClient = require('../services/propertyFinderClient');
const { mapListingDetails, FILL_SQL } = require('../services/propertyFinderDetails');
const { resolveListingLocation, DEFAULT_PROJECT, DEFAULT_LOCATION } = require('../services/propertyFinderLocations');
const T = process.env.BACKFILL_TENANT || '113160f4-7e28-4a4e-a940-1e892f4e3e81';
const APPLY = process.env.BACKFILL_APPLY === '1';
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  const s = (await pool.query('select * from property_finder_settings where tenant_id::text=$1', [T])).rows[0];
  if (!s) throw new Error('no PF settings for tenant');
  const client = new PropertyFinderClient({ apiKey: s.api_key_encrypted, apiSecret: s.api_secret_encrypted, environment: s.environment, countryCode: s.country_code || 'EG', tenantId: s.tenant_id });
  const count = async () => (await pool.query(
    "select count(*)::int total, count(*) filter (where project_name=$2 and location=$3)::int at_default from re_units where tenant_id::text=$1", [T, DEFAULT_PROJECT, DEFAULT_LOCATION])).rows[0];
  console.log('BEFORE', JSON.stringify(await count()), APPLY ? 'APPLY' : 'DRY RUN');
  const rows = (await pool.query(
    `select u.id unit_id, m.last_payload_snapshot->'location'->>'id' lid
       from property_finder_listing_mappings m join re_units u on u.id=m.unit_id and u.tenant_id::text=m.tenant_id::text
      where m.tenant_id::text=$1 and u.project_name=$2 and u.location=$3`, [T, DEFAULT_PROJECT, DEFAULT_LOCATION])).rows;
  const cache = new Map(); let updated = 0, unresolved = 0, noId = 0, skipped = 0;
  for (const r of rows) {
    if (!r.lid) { noId++; continue; }
    const res = await resolveListingLocation(client, { location: { id: r.lid } }, cache);
    if (!res) { unresolved++; continue; }
    if (!APPLY) { updated++; continue; }
    const u = await pool.query(
      'update re_units set project_name=$1, location=$2 where id=$3 and tenant_id::text=$4 and project_name=$5 and location=$6',
      [res.projectName, res.locationText, r.unit_id, T, DEFAULT_PROJECT, DEFAULT_LOCATION]);
    if (u.rowCount === 1) updated++; else skipped++;
  }
  console.log('candidates', rows.length, 'distinct ids', cache.size, APPLY ? 'updated' : 'would update', updated, 'unresolved', unresolved, 'noLocationId', noId, 'skippedChangedMeanwhile', skipped);
  console.log('AFTER', JSON.stringify(await count()));
  // Step 2: listing details, only if migration 030 columns exist; COALESCE never overwrites a non-null value.
  const hasCols = (await pool.query("select count(*)::int n from information_schema.columns where table_name='re_units' and column_name in ('description_ar','description_en','bathrooms','furnishing')")).rows[0].n === 4;
  if (!hasCols) {
    console.log('DETAILS skipped: migration 030 columns not present');
  } else {
    const dc = async () => (await pool.query("select count(description_ar)::int ar, count(description_en)::int en, count(bathrooms)::int bath, count(furnishing)::int furn from re_units where tenant_id::text=$1", [T])).rows[0];
    console.log('DETAILS BEFORE', JSON.stringify(await dc()));
    const maps = (await pool.query("select m.unit_id, m.last_payload_snapshot snap from property_finder_listing_mappings m join re_units u on u.id=m.unit_id and u.tenant_id::text=m.tenant_id::text where m.tenant_id::text=$1", [T])).rows;
    let touched = 0;
    for (const m of maps) {
      const d = mapListingDetails(m.snap);
      if (!APPLY) { touched++; continue; }
      const r = await pool.query(FILL_SQL, [d.description_ar, d.description_en, d.bathrooms, d.furnishing, m.unit_id, T]);
      touched += r.rowCount;
    }
    console.log('details rows', maps.length, APPLY ? 'processed' : 'would process', touched);
    console.log('DETAILS AFTER', JSON.stringify(await dc()));
  }
  await pool.end();
})().catch((e) => { console.log('ERR', String(e.message).replace(/postgres[^ ]*/g, '[url]')); process.exit(1); });
