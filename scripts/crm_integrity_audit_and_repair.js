/**
 * scripts/crm_integrity_audit_and_repair.js
 *
 * Tashgheel CRM Integrity Diagnostic & Safe Repair Engine
 *
 * Two Operating Modes:
 *   1. audit   : STRICTLY READ-ONLY. Audits Deal navigation, deal values, and relationships
 *                between deals, customers, and re_units. Outputs structured JSON + summary.
 *   2. repair  : STRICTLY LOCAL/TEST ONLY. Refuses to run on Railway/Production databases.
 *                Performs safe, idempotent repair with transactions only for verified unique matches.
 *
 * Usage:
 *   node scripts/crm_integrity_audit_and_repair.js --mode=audit
 *   node scripts/crm_integrity_audit_and_repair.js --mode=repair --confirm-local
 */

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

// Parse CLI flags
const args = process.argv.slice(2);
const modeArg = args.find(a => a.startsWith('--mode='))?.split('=')[1] || (args.includes('repair') ? 'repair' : 'audit');
const confirmLocal = args.includes('--confirm-local');

// ─────────────────────────────────────────────────────────────────────────────
// Production Safety Sentinel
// ─────────────────────────────────────────────────────────────────────────────
function assertSafeEnvironment(mode) {
  if (mode !== 'repair') return;

  const dbUrl = String(process.env.DATABASE_URL || '');
  const dbHost = String(process.env.DB_HOST || '');
  const nodeEnv = String(process.env.NODE_ENV || '');

  const isProductionIndicator = 
    dbUrl.includes('railway') || 
    dbUrl.includes('rlwy.net') || 
    dbHost.includes('railway') || 
    dbHost.includes('rlwy.net') ||
    nodeEnv === 'production';

  if (isProductionIndicator) {
    console.error('\n🚫 [SAFETY BLOCK] Execution halted!');
    console.error('Mode "repair" is strictly prohibited from running against Production / Railway databases.');
    console.error('Database URL / Host indicates an active deployment proxy.');
    process.exit(1);
  }

  if (!confirmLocal) {
    console.error('\n⚠️ [SAFETY BLOCK] Execution halted!');
    console.error('Mode "repair" requires explicit confirmation flag: --confirm-local');
    console.error('Please review the audit report first, then run:');
    console.error('  node scripts/crm_integrity_audit_and_repair.js --mode=repair --confirm-local\n');
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Audit Engine (Strictly Read-Only)
// ─────────────────────────────────────────────────────────────────────────────
async function runAudit() {
  console.log('\n===============================================================');
  console.log('   Tashgheel CRM Integrity Diagnostic Audit (Read-Only)       ');
  console.log('===============================================================\n');

  const auditReport = {
    generated_at: new Date().toISOString(),
    mode: 'audit',
    checks: {},
    deal_navigation: {},
    deal_values: {},
    relationships: {},
    tally: {},
    proposed_actions: []
  };

  // 1. Schema Existence Check
  const requiredTables = ['deals', 'customers', 're_units', 'property_finder_lead_mappings', 'property_finder_listing_mappings'];
  const tableCheckRes = await db.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
  `, [requiredTables]);
  const existingTables = new Set(tableCheckRes.rows.map(r => r.table_name));

  auditReport.checks.tables = {};
  for (const t of requiredTables) {
    auditReport.checks.tables[t] = existingTables.has(t);
  }

  // 2. Deal Navigation & Routes Diagnostic
  console.log('🔍 [1/3] Auditing Deal Navigation & Frontend Routing Patterns...');
  const appJsPath = path.resolve(__dirname, '../frontend/src/App.jsx');
  const dealsJsxPath = path.resolve(__dirname, '../frontend/src/pages/Deals.jsx');
  const unitsRegistryPath = path.resolve(__dirname, '../frontend/src/pages/RealEstate/UnitsRegistry.jsx');

  const navigationFindings = [];
  if (fs.existsSync(appJsPath)) {
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    const hasDealsIdRoute = /path=["']deals\/:id["']/.test(appJsContent);
    const hasWildcardRedirect = /path=["']\*["']\s+element=\{<Navigate\s+to=["']\/["']/.test(appJsContent);

    navigationFindings.push({
      item: 'App.jsx deals/:id Route',
      status: hasDealsIdRoute ? 'CONFIGURED' : 'MISSING',
      detail: hasDealsIdRoute 
        ? 'Route deals/:id is declared.' 
        : 'Route deals/:id is not defined. Direct links like /deals/123 hit the wildcard <Navigate to="/" /> and redirect user to home.'
    });

    navigationFindings.push({
      item: 'App.jsx Wildcard Fallback',
      status: hasWildcardRedirect ? 'ACTIVE' : 'NONE',
      detail: hasWildcardRedirect ? 'Catch-all route redirects unmatched paths to home (/)' : 'Custom 404 handler'
    });
  }

  if (fs.existsSync(unitsRegistryPath)) {
    const unitsContent = fs.readFileSync(unitsRegistryPath, 'utf8');
    const rawAnchorCount = (unitsContent.match(/href=\{`\/deals\?deal_id=/g) || []).length;
    navigationFindings.push({
      item: 'UnitsRegistry Anchor Navigation',
      status: rawAnchorCount > 0 ? 'USES_RAW_ANCHOR_HREF' : 'USES_ROUTER_NAVIGATE',
      detail: rawAnchorCount > 0
        ? `Found ${rawAnchorCount} raw <a href="/deals?deal_id=..."> tags. In SPA, raw anchor clicks trigger full browser refresh, which can trigger session/auth re-verification or home redirect if state is slow to initialize.`
        : 'All links use React Router navigate.'
    });
  }

  auditReport.deal_navigation.findings = navigationFindings;

  // 3. Deal Value Diagnostics
  console.log('🔍 [2/3] Auditing Deal Value Storage & Field Mapping...');
  const dealValueStats = await db.query(`
    SELECT 
      COUNT(*) as total_deals,
      COUNT(CASE WHEN value IS NULL THEN 1 END) as null_value_count,
      COUNT(CASE WHEN value = 0 THEN 1 END) as zero_value_count,
      COUNT(CASE WHEN value > 0 THEN 1 END) as positive_value_count,
      COUNT(CASE WHEN unit_id IS NOT NULL AND (value IS NULL OR value = 0) THEN 1 END) as unpriced_deals_with_unit
    FROM deals
  `);
  auditReport.deal_values.stats = dealValueStats.rows[0];

  // Inspect deals with 0 or null value
  const zeroValueDeals = await db.query(`
    SELECT 
      d.id, d.title, d.value, d.pipeline_stage, d.unit_id, d.client_id, d.source_type,
      ru.unit_number, ru.price as unit_price
    FROM deals d
    LEFT JOIN re_units ru ON d.unit_id::text = ru.id::text
    WHERE d.value IS NULL OR d.value = 0
  `);
  auditReport.deal_values.zero_value_deals = zeroValueDeals.rows;

  // 4. Relationships Diagnostic: Deals, Customers, Units, and Property Finder
  console.log('🔍 [3/3] Auditing Entity Relationships (Deals <-> Customers <-> Units)...');

  // A. Deals missing customer_id
  const dealsMissingCustomer = await db.query(`
    SELECT d.id, d.title, d.pipeline_stage, d.unit_id, d.source_type, d.source_id, d.custom_fields
    FROM deals d
    WHERE d.client_id IS NULL
    ORDER BY d.id ASC
  `);

  // B. Deals missing unit_id
  const dealsMissingUnit = await db.query(`
    SELECT d.id, d.title, d.value, d.pipeline_stage, d.client_id, d.source_type, d.source_id, d.custom_fields,
           c.name as customer_name
    FROM deals d
    LEFT JOIN customers c ON d.client_id::text = c.id::text
    WHERE d.unit_id IS NULL
    ORDER BY d.id ASC
  `);

  // C. Units with no deals attached
  const unitsWithoutDeals = await db.query(`
    SELECT ru.id, ru.unit_number, ru.name, ru.project_name, ru.status, ru.price
    FROM re_units ru
    WHERE NOT EXISTS (
      SELECT 1 FROM deals d WHERE d.unit_id::text = ru.id::text
    )
    ORDER BY ru.created_at ASC
  `);

  // D. Match Analysis for unlinked deals
  const confirmedMatches = [];
  const ambiguousMatches = [];
  const noMatchDeals = [];

  for (const deal of dealsMissingUnit.rows) {
    const cf = deal.custom_fields || {};
    const pfListingId = cf.pf_listing_id || cf.external_listing_id;
    const pfListingRef = cf.pf_listing_reference;
    const sourceId = deal.source_id;

    let matched = false;

    // Rule 1: Check property_finder_listing_mappings by external_listing_id (Unique ID match)
    if (existingTables.has('property_finder_listing_mappings') && pfListingId) {
      const lm = await db.query(`
        SELECT unit_id, external_listing_id, external_reference
        FROM property_finder_listing_mappings
        WHERE external_listing_id = $1 AND unit_id IS NOT NULL
        LIMIT 2
      `, [pfListingId]);

      if (lm.rows.length === 1) {
        confirmedMatches.push({
          deal_id: deal.id,
          deal_title: deal.title,
          strategy: 'PF_LISTING_MAPPING_UNIQUE_ID',
          matched_unit_id: lm.rows[0].unit_id,
          confidence: 'CONFIRMED',
          identifier: `pf_listing_id: ${pfListingId}`
        });
        matched = true;
      } else if (lm.rows.length > 1) {
        ambiguousMatches.push({
          deal_id: deal.id,
          deal_title: deal.title,
          strategy: 'PF_LISTING_MAPPING_MULTI_MATCH',
          confidence: 'AMBIGUOUS',
          reason: `Multiple units mapped to external_listing_id ${pfListingId}`
        });
        matched = true;
      }
    }

    // Rule 2: Check property_finder_lead_mappings by source_id (Unique Lead ID match)
    if (!matched && existingTables.has('property_finder_lead_mappings') && sourceId && deal.source_type === 'property_finder') {
      const leadMap = await db.query(`
        SELECT unit_id, customer_id, external_lead_id
        FROM property_finder_lead_mappings
        WHERE external_lead_id = $1 AND unit_id IS NOT NULL
        LIMIT 2
      `, [sourceId]);

      if (leadMap.rows.length === 1) {
        confirmedMatches.push({
          deal_id: deal.id,
          deal_title: deal.title,
          strategy: 'PF_LEAD_MAPPING_UNIQUE_ID',
          matched_unit_id: leadMap.rows[0].unit_id,
          confidence: 'CONFIRMED',
          identifier: `external_lead_id: ${sourceId}`
        });
        matched = true;
      }
    }

    // Rule 3: Check re_units by exact unit_number from pf_listing_reference
    if (!matched && pfListingRef) {
      const uRes = await db.query(`
        SELECT id, unit_number, name, project_name, price
        FROM re_units
        WHERE unit_number = $1
        LIMIT 2
      `, [pfListingRef]);

      if (uRes.rows.length === 1) {
        confirmedMatches.push({
          deal_id: deal.id,
          deal_title: deal.title,
          strategy: 'EXACT_UNIQUE_UNIT_NUMBER',
          matched_unit_id: uRes.rows[0].id,
          confidence: 'CONFIRMED',
          identifier: `unit_number: ${pfListingRef}`
        });
        matched = true;
      } else if (uRes.rows.length > 1) {
        ambiguousMatches.push({
          deal_id: deal.id,
          deal_title: deal.title,
          strategy: 'UNIT_NUMBER_COLLISION',
          confidence: 'AMBIGUOUS',
          reason: `Found ${uRes.rows.length} units with unit_number = ${pfListingRef}`
        });
        matched = true;
      }
    }

    if (!matched) {
      noMatchDeals.push({
        deal_id: deal.id,
        deal_title: deal.title,
        reason: 'No unique external listing ID or exact unit number reference found.'
      });
    }
  }

  // Tally Summary
  auditReport.relationships = {
    deals_missing_customer: dealsMissingCustomer.rows,
    deals_missing_unit: dealsMissingUnit.rows,
    units_without_deals: unitsWithoutDeals.rows,
    classification: {
      confirmed_matches: confirmedMatches,
      ambiguous_matches: ambiguousMatches,
      no_match_deals: noMatchDeals
    }
  };

  auditReport.tally = {
    total_deals: Number(dealValueStats.rows[0].total_deals),
    deals_missing_customer_count: dealsMissingCustomer.rows.length,
    deals_missing_unit_count: dealsMissingUnit.rows.length,
    units_without_deals_count: unitsWithoutDeals.rows.length,
    confirmed_relinkable_count: confirmedMatches.length,
    ambiguous_unlinked_count: ambiguousMatches.length,
    no_match_count: noMatchDeals.length,
    zero_or_null_values_count: Number(dealValueStats.rows[0].zero_value_count) + Number(dealValueStats.rows[0].null_value_count)
  };

  // Save audit report to JSON artifact
  const reportPath = path.resolve(__dirname, 'crm_integrity_audit_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(auditReport, null, 2), 'utf8');

  // Print Human-Readable Summary
  console.log('\n===============================================================');
  console.log('                 DIAGNOSTIC AUDIT SUMMARY                     ');
  console.log('===============================================================');
  console.log(`Report File Generated: ${reportPath}`);
  console.log(`Total Deals Audited:                    ${auditReport.tally.total_deals}`);
  console.log(`Deals Missing Customer (client_id):     ${auditReport.tally.deals_missing_customer_count}`);
  console.log(`Deals Missing Unit (unit_id):           ${auditReport.tally.deals_missing_unit_count}`);
  console.log(`Units Without Attached Deals:           ${auditReport.tally.units_without_deals_count}`);
  console.log(`Deals with Zero or NULL Value:          ${auditReport.tally.zero_or_null_values_count}`);
  console.log('---------------------------------------------------------------');
  console.log(`Classification of Unlinked Deals:`);
  console.log(`  - Confirmed Matches (Unique ID):      ${auditReport.tally.confirmed_relinkable_count}`);
  console.log(`  - Ambiguous / Conflicted Matches:     ${auditReport.tally.ambiguous_unlinked_count}`);
  console.log(`  - No Match Found:                     ${auditReport.tally.no_match_count}`);
  console.log('---------------------------------------------------------------');
  console.log('Navigation Findings:');
  for (const f of navigationFindings) {
    console.log(`  [${f.status}] ${f.item}: ${f.detail}`);
  }
  console.log('===============================================================\n');

  return auditReport;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Safe Repair Engine (Controlled Local / Test Database Only)
// ─────────────────────────────────────────────────────────────────────────────
async function runRepair() {
  assertSafeEnvironment('repair');

  console.log('\n===============================================================');
  console.log('   Tashgheel CRM Safe Repair Engine (Local / Test DB Only)    ');
  console.log('===============================================================\n');

  // Run audit first to obtain verified confirmed actions
  const audit = await runAudit();

  const confirmedMatches = audit.relationships.classification.confirmed_matches;
  const zeroValueDeals = audit.deal_values.zero_value_deals;

  const actionsToPerform = [];

  // Plan 1: Re-link confirmed unique matches
  for (const cm of confirmedMatches) {
    actionsToPerform.push({
      type: 'RELINK_UNIT',
      deal_id: cm.deal_id,
      unit_id: cm.matched_unit_id,
      reason: `Confirmed match via ${cm.strategy} (${cm.identifier})`
    });
  }

  // Plan 2: Safe value backfill ONLY where deal.value is 0/null and linked unit has known price
  for (const zd of zeroValueDeals) {
    if (zd.unit_id && zd.unit_price && Number(zd.unit_price) > 0) {
      actionsToPerform.push({
        type: 'BACKFILL_VALUE_FROM_UNIT',
        deal_id: zd.id,
        new_value: Number(zd.unit_price),
        reason: `Deal #${zd.id} value is ${zd.value} but linked unit #${zd.unit_number} has verified price ${zd.unit_price}`
      });
    }
  }

  console.log(`\n📋 Planned Repair Actions (${actionsToPerform.length} operations):`);
  if (actionsToPerform.length === 0) {
    console.log('  No automated repair actions required or verified. Database is clean.');
    return;
  }

  for (const a of actionsToPerform) {
    console.log(`  • [${a.type}] Deal #${a.deal_id}: ${a.reason}`);
  }

  // Execute within transaction
  console.log('\n⏳ Beginning atomic transaction for safe local repairs...');
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    let relinkCount = 0;
    let valueCount = 0;

    for (const a of actionsToPerform) {
      if (a.type === 'RELINK_UNIT') {
        const res = await client.query(`
          UPDATE deals 
          SET unit_id = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND unit_id IS NULL
          RETURNING id
        `, [String(a.unit_id), a.deal_id]);
        if (res.rowCount > 0) relinkCount++;
      } else if (a.type === 'BACKFILL_VALUE_FROM_UNIT') {
        const res = await client.query(`
          UPDATE deals 
          SET value = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND (value IS NULL OR value = 0)
          RETURNING id
        `, [a.new_value, a.deal_id]);
        if (res.rowCount > 0) valueCount++;
      }
    }

    await client.query('COMMIT');
    console.log('✅ [Repair Completed Successfully]');
    console.log(`   - Units Re-linked: ${relinkCount}`);
    console.log(`   - Values Backfilled: ${valueCount}\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ [Repair Rolled Back due to error]:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrypoint Execution
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  try {
    if (modeArg === 'repair') {
      await runRepair();
    } else {
      await runAudit();
    }
    process.exit(0);
  } catch (err) {
    console.error('\nFatal error during CRM integrity execution:', err);
    process.exit(1);
  }
}

main();
