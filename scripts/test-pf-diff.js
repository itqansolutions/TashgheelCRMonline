// One-off differential diagnostic (ASCII only, safe to paste). Never prints tokens/keys/secrets.
const https = require('https');
const axios = require('axios');
const db = require('../config/db');
const PropertyFinderClient = require('../services/propertyFinderClient');

const TENANT = process.argv[2] || '85acf1e4-27c3-4ad9-a46f-c5100362f8a4';
const BASE = 'https://atlas.propertyfinder.com/v1';
const UA = 'Tashgheel-CRM/1.0 (ITQAN Solutions; RealEstate Egypt)';

// Capture the REAL outgoing request head (what goes on the wire), Authorization redacted.
let lastRaw = null;
const origRequest = https.request;
https.request = function () {
  const req = origRequest.apply(this, arguments);
  req.on('finish', () => {
    lastRaw = String(req._header || '').replace(/(Authorization:\s*Bearer\s+)(\S+)/i, (m, p, t) => p + '<token len ' + t.length + '>');
  });
  return req;
};

async function send(name, cfg) {
  lastRaw = null;
  let status = 'NO_RESPONSE';
  let cfId = 'none';
  let pop = 'none';
  try {
    const r = await axios(cfg);
    status = r.status; cfId = r.headers['x-amz-cf-id'] || 'none'; pop = r.headers['x-amz-cf-pop'] || 'none';
  } catch (e) {
    if (e.response) {
      status = e.response.status; cfId = e.response.headers['x-amz-cf-id'] || 'none'; pop = e.response.headers['x-amz-cf-pop'] || 'none';
    } else { status = 'ERR ' + e.code; }
  }
  await new Promise((r) => setTimeout(r, 50));
  console.log('\n=== ' + name + ' ===');
  console.log('status: ' + status + ' | x-amz-cf-id: ' + cfId + ' | pop: ' + pop);
  console.log('has data key in config: ' + Object.prototype.hasOwnProperty.call(cfg, 'data') + ' (value: ' + String(cfg.data) + ')');
  console.log('--- raw outgoing request head ---');
  console.log(lastRaw ? lastRaw.trim() : '(not captured)');
  return status;
}

(async () => {
  const res = await db.query('SELECT * FROM property_finder_settings WHERE tenant_id::text = $1::text', [TENANT]);
  if (!res.rows.length) { console.error('tenant not found'); process.exit(1); }
  const s = res.rows[0];
  const client = new PropertyFinderClient({
    apiKey: s.api_key_encrypted, apiSecret: s.api_secret_encrypted,
    environment: s.environment, countryCode: s.country_code || 'EG', tenantId: s.tenant_id
  });
  const token = await client.getAccessToken();
  console.log('client.countryCode = ' + JSON.stringify(client.countryCode));
  console.log('client.baseUrl     = ' + JSON.stringify(client.baseUrl));
  console.log('User-Agent used    = ' + JSON.stringify(UA));
  console.log('Accept used        = "application/json"');
  console.log('token length       = ' + token.length);

  const url = BASE + '/leads';
  const createdAtFrom = new Date(Date.now() - 90 * 86400000 + 86400000).toISOString();
  const params = { page: 1, perPage: 50, createdAtFrom };
  const auth = 'Bearer ' + token;
  const cc = client.countryCode;

  const results = {};
  // V0: exact config of PropertyFinderClient.request()
  results.V0 = await send('V0 exact client config (data:null, Content-Type, all headers)', {
    method: 'GET', url, data: null, params,
    headers: { 'Authorization': auth, 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Country-Code': cc, 'User-Agent': UA },
    timeout: 25000
  });
  results.V1 = await send('V1 = V0 without data key', {
    method: 'GET', url, params,
    headers: { 'Authorization': auth, 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Country-Code': cc, 'User-Agent': UA },
    timeout: 25000
  });
  results.V2 = await send('V2 = V1 without Content-Type', {
    method: 'GET', url, params,
    headers: { 'Authorization': auth, 'Accept': 'application/json', 'X-Country-Code': cc, 'User-Agent': UA },
    timeout: 25000
  });
  results.V3 = await send('V3 = V2 without User-Agent', {
    method: 'GET', url, params,
    headers: { 'Authorization': auth, 'Accept': 'application/json', 'X-Country-Code': cc },
    timeout: 25000
  });
  results.V4 = await send('V4 = V3 without X-Country-Code', {
    method: 'GET', url, params,
    headers: { 'Authorization': auth, 'Accept': 'application/json' },
    timeout: 25000
  });
  // Matrix scenario E replica (as in test-pf-matrix.js: 89-day lookback, no data key, timeout 15000)
  results.E = await send('E matrix scenario E replica', {
    method: 'GET', url,
    params: { page: 1, perPage: 50, createdAtFrom: new Date(Date.now() - 89 * 86400000).toISOString() },
    headers: { 'Authorization': auth, 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Country-Code': 'EG', 'User-Agent': UA },
    timeout: 15000
  });

  console.log('\n=== SUMMARY ===');
  Object.keys(results).forEach((k) => console.log(k + ': ' + results[k]));
  process.exit(0);
})().catch((e) => { console.error('fatal: ' + e.message); process.exit(1); });
