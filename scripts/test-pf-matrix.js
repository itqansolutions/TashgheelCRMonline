const axios = require('axios');
const db = require('../config/db');
const { decrypt } = require('../utils/encryption');

/**
 * 🔬 Property Finder Live Diagnostic Matrix Script
 * Tests varying degrees of request complexity (A -> E) plus /listings control check.
 * Redacts all secrets and tokens before printing.
 */

function redact(str, secret, key) {
  if (!str) return str;
  let s = typeof str === 'string' ? str : JSON.stringify(str, null, 2);
  if (secret) s = s.replace(new RegExp(secret, 'g'), '[REDACTED_SECRET]');
  if (key) s = s.replace(new RegExp(key, 'g'), '[REDACTED_KEY]');
  s = s.replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer [REDACTED_TOKEN]');
  return s;
}

async function run() {
  console.log('================================================================');
  console.log('🔬 Property Finder API Diagnostic Matrix');
  console.log('================================================================\n');

  let apiKey = process.argv[2] || process.env.PF_KEY;
  let apiSecret = process.argv[3] || process.env.PF_SECRET;
  let environment = 'production';

  // If not provided in args/env, load from property_finder_settings in database
  if (!apiKey || !apiSecret) {
    try {
      const res = await db.query(
        `SELECT api_key_encrypted, api_secret_encrypted, environment FROM property_finder_settings 
         WHERE api_key_encrypted IS NOT NULL AND api_secret_encrypted IS NOT NULL 
         LIMIT 1`
      );
      if (res.rows.length > 0) {
        apiKey = decrypt(res.rows[0].api_key_encrypted);
        apiSecret = decrypt(res.rows[0].api_secret_encrypted);
        environment = res.rows[0].environment || 'production';
        console.log(`✅ Loaded credentials from database for environment: [${environment}]`);
        console.log(`   🔑 API Key length: ${apiKey.length} | Format: "${apiKey.slice(0, 3)}...${apiKey.slice(-3)}"`);
        console.log(`   🔒 API Secret length: ${apiSecret.length} | Format: "${apiSecret.slice(0, 2)}...${apiSecret.slice(-2)}"`);
      }
    } catch (dbErr) {
      console.warn(`⚠️ Could not query local database: ${dbErr.message}`);
    }
  }

  if (!apiKey || !apiSecret) {
    console.error('❌ Missing credentials. Provide them via CLI args: node scripts/test-pf-matrix.js <API_KEY> <API_SECRET>');
    process.exit(1);
  }

  console.log(`🌐 Environment: ${environment}`);
  const authUrl = process.env.PF_AUTH_URL || 'https://atlas.propertyfinder.com/v1/auth/token';
  const baseUrl = process.env.PF_API_BASE_URL || 'https://atlas.propertyfinder.com/v1';

  console.log(`🔗 Auth URL: ${authUrl}`);
  console.log(`🔗 Base URL: ${baseUrl}\n`);

  // Step 0: Obtain Access Token
  console.log('--- [Step 0: POST /auth/token] ---');
  let token = null;
  try {
    const authRes = await axios.post(
      authUrl,
      { apiKey, apiSecret },
      { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, timeout: 15000 }
    );
    token = authRes.data?.accessToken || authRes.data?.access_token || authRes.data?.token;
    console.log(`✅ Token received! HTTP ${authRes.status}`);
    console.log(`   Token type: Bearer, length: ${token ? token.length : 0} chars`);
    console.log(`   Expires in: ${authRes.data?.expiresIn || authRes.data?.expires_in || 'N/A'}s\n`);
  } catch (authErr) {
    console.error(`❌ Authentication failed! HTTP ${authErr.response?.status || 'No Response'}`);
    console.error(redact(authErr.response?.data || authErr.message, apiSecret, apiKey));
    process.exit(1);
  }

  const lookbackDate = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString();

  // Define Matrix Scenarios
  const scenarios = [
    {
      label: 'A: بدون params (Only Bearer Token + Accept: application/json)',
      url: `${baseUrl}/leads`,
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      params: null
    },
    {
      label: 'B: + page/perPage (page=1, perPage=50)',
      url: `${baseUrl}/leads`,
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      params: { page: 1, perPage: 50 }
    },
    {
      label: 'C: + createdAtFrom (ISO 8601 within 89 days)',
      url: `${baseUrl}/leads`,
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      params: { page: 1, perPage: 50, createdAtFrom: lookbackDate }
    },
    {
      label: 'D: + X-Country-Code: EG',
      url: `${baseUrl}/leads`,
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'X-Country-Code': 'EG' },
      params: { page: 1, perPage: 50, createdAtFrom: lookbackDate }
    },
    {
      label: 'E: + UA مخصص + Content-Type (Full CRM client simulation)',
      url: `${baseUrl}/leads`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Country-Code': 'EG',
        'User-Agent': 'Tashgheel-CRM/1.0 (ITQAN Solutions; RealEstate Egypt)'
      },
      params: { page: 1, perPage: 50, createdAtFrom: lookbackDate }
    },
    {
      label: 'CONTROL: GET /listings (Check if listings work with the same token)',
      url: `${baseUrl}/listings`,
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      params: { page: 1, limit: 5 }
    }
  ];

  for (const s of scenarios) {
    console.log(`================================================================`);
    console.log(`🧪 Testing Scenario [${s.label}]`);
    console.log(`   URL: ${s.url}`);
    if (s.params) console.log(`   Params: ${JSON.stringify(s.params)}`);
    console.log(`   Headers: ${JSON.stringify(Object.keys(s.headers))}`);

    try {
      const res = await axios({
        method: 'GET',
        url: s.url,
        params: s.params,
        headers: s.headers,
        timeout: 15000
      });

      console.log(`🟢 SUCCESS: HTTP ${res.status}`);
      console.log(`   Server Headers:`);
      printDiagnosticHeaders(res.headers);
      console.log(`   Response Body Preview:`);
      const bodySnippet = redact(res.data, apiSecret, apiKey);
      console.log(bodySnippet ? bodySnippet.slice(0, 400) : 'Empty Body');
    } catch (err) {
      const status = err.response?.status || 'ERR';
      console.log(`🔴 FAILED: HTTP ${status}`);
      if (err.response?.headers) {
        console.log(`   Server Headers:`);
        printDiagnosticHeaders(err.response.headers);
      }
      console.log(`   Response Body:`);
      const bodySnippet = redact(err.response?.data || err.message, apiSecret, apiKey);
      console.log(bodySnippet);
    }
    console.log('');
  }

  console.log('================================================================');
  console.log('🏁 Diagnostic Matrix Completed.');
  console.log('================================================================');
  process.exit(0);
}

function printDiagnosticHeaders(h) {
  const interesting = ['server', 'via', 'x-cache', 'x-amz-cf-id', 'x-amz-cf-pop', 'content-type', 'x-request-id', 'x-trace-id'];
  for (const k of interesting) {
    if (h[k]) console.log(`     ${k}: ${h[k]}`);
  }
}

run().catch(err => {
  console.error('Fatal execution error:', err.message);
  process.exit(1);
});
