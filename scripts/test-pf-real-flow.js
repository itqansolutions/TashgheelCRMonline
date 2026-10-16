const axios = require('axios');
const db = require('../config/db');
const PropertyFinderClient = require('../services/propertyFinderClient');

/**
 * 🔬 One-Off Real Application Flow Verification Script
 * 
 * Replicates the exact `pullLeads` pagination loop from `propertyFinderSyncService.js`
 * using the real `PropertyFinderClient` for tenant 85acf1e4-27c3-4ad9-a46f-c5100362f8a4.
 *
 * Rules:
 * - Runs exactly as propertyFinderSyncService.js does (same arguments, same pagination loop).
 * - On failure, prints strictly:
 *     - attempt number
 *     - page number
 *     - final URL with query string
 *     - header NAMES sent (no values)
 *     - token length and whether it came from cache
 *     - response status
 *     - response headers (via, x-cache, x-amz-cf-id, x-amz-cf-pop)
 * - Runs 3 times in burst mode, and once with 1-second delay between pages.
 * - NEVER prints tokens, keys, or secrets.
 */

const TARGET_TENANT_ID = process.argv[2] || '85acf1e4-27c3-4ad9-a46f-c5100362f8a4';
const LEAD_OVERLAP_MS = 60 * 60 * 1000; // 1 hour (same as propertyFinderSyncService.js)
const MAX_LEAD_PAGES = 50;

// Shared telemetry tracker
let currentReqState = {
  page: 1,
  attempt: 1,
  lastToken: null,
  tokenFetchedCount: 0,
  tokenFreshlyFetchedForReq: false,
  finalUrl: null,
  headerNames: [],
  tokenLength: 0,
  tokenFromCache: false
};

// Install Axios interceptors for deep request/response inspection
axios.interceptors.request.use((config) => {
  const url = config.url || '';

  if (url.includes('/auth/token')) {
    currentReqState.tokenFetchedCount++;
    currentReqState.tokenFreshlyFetchedForReq = true;
    return config;
  }

  if (url.includes('/leads')) {
    const authHeader = config.headers['Authorization'] || config.headers['authorization'] || '';
    const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '') : '';
    const uri = axios.getUri(config);

    if (currentReqState.finalUrl === uri) {
      currentReqState.attempt++;
    } else {
      currentReqState.attempt = 1;
    }

    currentReqState.finalUrl = uri;
    currentReqState.headerNames = Object.keys(config.headers || {});
    currentReqState.tokenLength = token.length;

    // Determine if token came from in-memory cache
    if (currentReqState.lastToken && currentReqState.lastToken === token && !currentReqState.tokenFreshlyFetchedForReq) {
      currentReqState.tokenFromCache = true;
    } else {
      currentReqState.tokenFromCache = false;
    }

    currentReqState.lastToken = token;
    currentReqState.tokenFreshlyFetchedForReq = false;
  }

  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.config && (error.config.url || '').includes('/leads')) {
      const resp = error.response;
      console.error('\n🚨 [LEADS REQUEST FAILED] -------------------------------------');
      console.error(`• Attempt Number    : ${currentReqState.attempt}`);
      console.error(`• Page Number       : ${currentReqState.page}`);
      console.error(`• Final URL         : ${currentReqState.finalUrl || error.config.url}`);
      console.error(`• Header Names Sent : ${JSON.stringify(currentReqState.headerNames)}`);
      console.error(`• Token Length      : ${currentReqState.tokenLength} chars`);
      console.error(`• Token From Cache  : ${currentReqState.tokenFromCache}`);
      console.error(`• Response Status   : ${resp ? resp.status : 'NO_RESPONSE'}`);
      console.error('• Response Headers  :');
      if (resp && resp.headers) {
        console.error(`    via         : ${resp.headers['via'] || 'none'}`);
        console.error(`    x-cache     : ${resp.headers['x-cache'] || 'none'}`);
        console.error(`    x-amz-cf-id : ${resp.headers['x-amz-cf-id'] || 'none'}`);
        console.error(`    x-amz-cf-pop: ${resp.headers['x-amz-cf-pop'] || 'none'}`);
      } else {
        console.error('    (No response headers received)');
      }
      console.error('--------------------------------------------------------------\n');
    }
    return Promise.reject(error);
  }
);

/**
 * Executes the exact loop from propertyFinderSyncService.js
 */
async function executeSyncServiceFlow(client, settings, { delayBetweenPagesMs = 0, runLabel = '' } = {}) {
  console.log(`\n================================================================`);
  console.log(`▶ Starting Flow: ${runLabel} (delay between pages: ${delayBetweenPagesMs}ms)`);
  console.log(`================================================================`);

  const watermark = settings.last_lead_sync_at ? new Date(settings.last_lead_sync_at) : null;
  const createdAtFrom = watermark
    ? new Date(watermark.getTime() - LEAD_OVERLAP_MS).toISOString()
    : new Date(0).toISOString();

  console.log(`📅 Computed createdAtFrom: ${createdAtFrom} (watermark: ${watermark ? watermark.toISOString() : 'none'})`);

  let page = 1;
  const stats = { pages: 0, fetched: 0, errors: [] };

  while (true) {
    if (page > MAX_LEAD_PAGES) {
      console.log(`⏹ Reached MAX_LEAD_PAGES (${MAX_LEAD_PAGES}). Stopping.`);
      break;
    }

    currentReqState.page = page;
    currentReqState.attempt = 1;

    try {
      if (delayBetweenPagesMs > 0 && page > 1) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenPagesMs));
      }

      const response = await client.getLeads({ page, perPage: 50, createdAtFrom });
      const leads = PropertyFinderClient.extractLeads(response);
      stats.pages++;
      stats.fetched += leads.length;

      console.log(`  ✅ [Page ${page}] HTTP 200 OK | Fetched ${leads.length} leads (Total so far: ${stats.fetched})`);

      if (!PropertyFinderClient.hasNextPage(response, page, leads.length, 50)) {
        console.log(`  🏁 End of pages reached at page ${page}.`);
        break;
      }

      page++;
    } catch (err) {
      stats.errors.push({ page, message: err.message, status: err.status });
      console.error(`  ❌ [Page ${page}] Execution failed: ${err.message}`);
      // Break pagination on error, matching propertyFinderSyncService.js behavior
      break;
    }
  }

  console.log(`🏁 Flow Summary [${runLabel}]: Pages: ${stats.pages}, Fetched: ${stats.fetched}, Errors: ${stats.errors.length}`);
  return stats;
}

async function main() {
  console.log('================================================================');
  console.log('🔬 Property Finder Real Flow Verification Suite');
  console.log('================================================================');
  console.log(`🎯 Target Tenant ID: ${TARGET_TENANT_ID}`);

  // 1. Fetch settings from DB
  let settings;
  try {
    const res = await db.query(
      `SELECT * FROM property_finder_settings WHERE tenant_id::text = $1::text`,
      [TARGET_TENANT_ID]
    );
    if (res.rows.length > 0) {
      settings = res.rows[0];
      console.log(`✅ Loaded settings from DB for tenant: ${settings.tenant_id}`);
      console.log(`   Environment: ${settings.environment} | Country: ${settings.country_code} | Enabled: ${settings.is_enabled}`);
    } else if (process.env.PF_KEY && process.env.PF_SECRET) {
      settings = {
        tenant_id: TARGET_TENANT_ID,
        api_key_encrypted: process.env.PF_KEY,
        api_secret_encrypted: process.env.PF_SECRET,
        environment: process.env.PF_ENV || 'production',
        country_code: 'EG',
        is_enabled: true
      };
      console.log(`✅ Loaded settings from environment variables for tenant: ${TARGET_TENANT_ID}`);
    } else {
      throw new Error(`Tenant ${TARGET_TENANT_ID} not found in property_finder_settings.`);
    }
  } catch (dbErr) {
    if (process.env.PF_KEY && process.env.PF_SECRET) {
      settings = {
        tenant_id: TARGET_TENANT_ID,
        api_key_encrypted: process.env.PF_KEY,
        api_secret_encrypted: process.env.PF_SECRET,
        environment: process.env.PF_ENV || 'production',
        country_code: 'EG',
        is_enabled: true
      };
      console.log(`✅ Loaded settings from environment variables (DB fallback) for tenant: ${TARGET_TENANT_ID}`);
    } else {
      console.error(`❌ DB error loading settings: ${dbErr.message}`);
      process.exit(1);
    }
  }

  // 2. Instantiate real client
  const client = new PropertyFinderClient({
    apiKey: settings.api_key_encrypted,
    apiSecret: settings.api_secret_encrypted,
    environment: settings.environment,
    countryCode: settings.country_code || 'EG',
    tenantId: settings.tenant_id
  });

  const results = [];

  // Run 1: Burst (0ms delay)
  results.push(await executeSyncServiceFlow(client, settings, { delayBetweenPagesMs: 0, runLabel: 'Run 1/3 (Burst Mode)' }));

  // Run 2: Burst (0ms delay)
  results.push(await executeSyncServiceFlow(client, settings, { delayBetweenPagesMs: 0, runLabel: 'Run 2/3 (Burst Mode)' }));

  // Run 3: Burst (0ms delay)
  results.push(await executeSyncServiceFlow(client, settings, { delayBetweenPagesMs: 0, runLabel: 'Run 3/3 (Burst Mode)' }));

  // Run 4: 1-second delay between pages
  results.push(await executeSyncServiceFlow(client, settings, { delayBetweenPagesMs: 1000, runLabel: 'Run 4 (Paced: 1000ms delay)' }));

  console.log('\n================================================================');
  console.log('📊 FINAL EXECUTION SUMMARY ACROSS ALL 4 RUNS');
  console.log('================================================================');
  results.forEach((r, idx) => {
    const label = idx < 3 ? `Run ${idx + 1} (Burst)` : 'Run 4 (1s delay)';
    console.log(`• ${label}: ${r.errors.length === 0 ? '✅ PASS' : '❌ FAIL'} | Pages: ${r.pages} | Fetched: ${r.fetched} | Errors: ${r.errors.length}`);
  });
  console.log('================================================================\n');

  process.exit(results.some((r) => r.errors.length > 0) ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal execution error:', err.message);
  process.exit(1);
});
