const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { encrypt, decrypt, maskSecret, isEncrypted } = require('../utils/encryption');
const PropertyFinderClient = require('../services/propertyFinderClient');
const propertyFinderSyncService = require('../services/propertyFinderSyncService');
const propertyFinderController = require('../controllers/propertyFinderController');
const db = require('../config/db');

// Preserve original db.query
const originalDbQuery = db.query;

test('Property Finder Enterprise Integration Test Suite', async (suite) => {

  suite.after(() => {
    // Never restore the real pool here: late JobEngine retries would hit the configured remote database.
    db.query = async () => { throw new Error('Real database access blocked in tests'); };
    db.connect = async () => { throw new Error('Real database access blocked in tests'); };
  });

  // --------------------------------------------------------------------------
  // 1. CREDENTIAL ENCRYPTION & REDACTION TESTS
  // --------------------------------------------------------------------------
  await suite.test('1. Field-Level AES-256-GCM Encryption & Redaction', async () => {
    const rawSecret = 'pf_sec_live_998877665544332211';
    const encrypted = encrypt(rawSecret);

    assert.ok(isEncrypted(encrypted), 'Ciphertext must match enc:v1 format');
    assert.notEqual(encrypted, rawSecret, 'Ciphertext must not match raw secret');

    const decrypted = decrypt(encrypted);
    assert.equal(decrypted, rawSecret, 'Decrypted secret must match original raw secret');

    const masked = maskSecret(encrypted);
    assert.equal(masked, '••••••••2211', 'Masked secret must show only last 4 chars preceded by bullets');
    assert.ok(!masked.includes('9988'), 'Masked string must never expose non-masked secret content');

    // Idempotency: decrypting plaintext returns plaintext safely
    assert.equal(decrypt('plain_key'), 'plain_key');
  });

  // --------------------------------------------------------------------------
  // 2. CLIENT AUTHENTICATION & TOKEN EXPIRY TESTS
  // --------------------------------------------------------------------------
  await suite.test('2. Client OAuth2 Authentication, Caching & Expiry', async () => {
    const client = new PropertyFinderClient({
      apiKey: 'test_key_123',
      apiSecret: 'test_secret_abc',
      environment: 'sandbox',
      countryCode: 'EG',
      tenantId: 'tenant-test-1',
      mockMode: true
    });

    const token1 = await client.getAccessToken();
    assert.ok(token1.startsWith('mock_pf_access_token_'), 'Client returns valid access token');

    const conn = await client.testConnection();
    assert.equal(conn.success, true);
    assert.equal(conn.countryCode, 'EG');
    assert.equal(conn.environment, 'sandbox');
  });

  // --------------------------------------------------------------------------
  // 3. CROSS-TENANT ISOLATION TESTS
  // --------------------------------------------------------------------------
  await suite.test('3. Strict Cross-Tenant Isolation Enforcement', async () => {
    const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    // Mock DB queries simulating isolated tenant storage
    let capturedQueries = [];
    db.query = async (sql, params) => {
      capturedQueries.push({ sql, params });
      if (sql.includes('SELECT * FROM property_finder_settings')) {
        if (params[0] === tenantA) {
          return { rows: [{ tenant_id: tenantA, environment: 'production', is_enabled: true }] };
        }
        return { rows: [] }; // Tenant B has no access to Tenant A's settings
      }
      return { rows: [] };
    };

    // Tenant A fetch
    const reqA = { user: { tenant_id: tenantA, role: 'admin' } };
    let dataA = null;
    const resA = { json: (d) => { dataA = d; } };
    await propertyFinderController.getSettings(reqA, resA);
    assert.equal(dataA.data.environment, 'production');

    // Tenant B fetch
    const reqB = { user: { tenant_id: tenantB, role: 'admin' } };
    let dataB = null;
    const resB = { json: (d) => { dataB = d; } };
    await propertyFinderController.getSettings(reqB, resB);
    assert.equal(dataB.data.environment, 'sandbox', 'Tenant B must receive its own empty state, not Tenant A data');

    // Verify all queries parameterized tenant_id
    assert.ok(capturedQueries.every(q => q.params.length > 0), 'Every query must be tenant-parameterized');
  });

  // --------------------------------------------------------------------------
  // 4. LISTING IMPORT & DUPLICATE DETECTION TESTS
  // --------------------------------------------------------------------------
  await suite.test('4. Listing Import, Deduplication & Mapping Upsert', async () => {
    const testTenant = '11111111-1111-1111-1111-111111111111';

    // Mock DB behavior for mock import
    let createdUnits = [];
    let mappings = [];

    db.query = async (sql, params) => {
      if (sql.includes('SELECT * FROM property_finder_settings')) {
        return {
          rows: [{
            tenant_id: testTenant,
            api_key_encrypted: encrypt('key_1'),
            api_secret_encrypted: encrypt('sec_1'),
            environment: 'sandbox',
            is_enabled: true,
            country_code: 'EG'
          }]
        };
      }
      if (sql.includes('SELECT * FROM property_finder_listing_mappings WHERE tenant_id::text = $1::text AND external_listing_id = $2')) {
        const found = mappings.filter(m => m.external_listing_id === params[1]);
        return { rows: found };
      }
      if (sql.includes('SELECT id, name, unit_number, project_name FROM re_units')) {
        return { rows: [] }; // No existing unit, trigger create
      }
      if (sql.includes('INSERT INTO re_units')) {
        const newId = 'unit_mock_' + (createdUnits.length + 1);
        createdUnits.push({ id: newId, unit_number: params[3], price: params[6] });
        return { rows: [{ id: newId }] };
      }
      if (sql.includes('INSERT INTO property_finder_listing_mappings')) {
        mappings.push({ external_listing_id: params[2], unit_id: params[1] });
        return { rows: [] };
      }
      return { rows: [] };
    };

    // Override process env to enable mock mode
    process.env.MOCK_PROPERTY_FINDER = 'true';
    const stats = await propertyFinderSyncService.importListings(testTenant, { page: 1, limit: 10 });
    delete process.env.MOCK_PROPERTY_FINDER;

    assert.equal(stats.totalFetched, 2, 'Fetched 2 listings from mock Property Finder');
    assert.equal(stats.created, 2, 'Created 2 new units');
    assert.equal(mappings.length, 2, 'Mapped 2 units to external listing IDs');
  });

  // --------------------------------------------------------------------------
  // 5. LEAD INGESTION & PIPELINE DEDUPLICATION TESTS
  // --------------------------------------------------------------------------
  await suite.test('5. Lead Ingestion, Channel Identification & Deduplication', async () => {
    const testTenant = '22222222-2222-2222-2222-222222222222';
    const leadMappings = [];
    const customers = [];

    // ingestLead runs inside a transaction on a pooled client: route it through the same mock (never the real pool).
    db.connect = async () => ({ query: (sql, params) => db.query(sql, params), release() {} });
    db.query = async (sql, params) => {
      if (sql.includes('SELECT * FROM property_finder_lead_mappings')) {
        const existing = leadMappings.filter(m => m.external_lead_id === params[1]);
        return { rows: existing };
      }
      if (sql.includes('SELECT * FROM property_finder_settings')) {
        return { rows: [{ tenant_id: testTenant, default_assigned_to: 5 }] };
      }
      if (sql.includes('SELECT id, name, notes FROM customers')) {
        const found = customers.filter(c => c.phone === params[1]);
        return { rows: found };
      }
      if (sql.includes('INSERT INTO customers')) {
        const custId = customers.length + 1;
        customers.push({ id: custId, name: params[1], phone: params[2], email: params[3] });
        return { rows: [{ id: custId }] };
      }
      if (sql.includes('INSERT INTO property_finder_lead_mappings')) {
        leadMappings.push({ external_lead_id: params[2], customer_id: params[1], channel: params[5] });
        return { rows: [] };
      }
      return { rows: [] };
    };

    const rawLead = {
      id: 'pf_lead_unique_777',
      listing_id: 'pf_ext_101',
      contact_name: 'Mahmoud Hassan',
      contact_phone: '+201099887766',
      contact_email: 'mahmoud@itqan.eg',
      channel: 'whatsapp',
      enquiry_message: 'Interested in the villa in Sheikh Zayed.'
    };

    // First ingestion
    const firstResult = await propertyFinderSyncService.ingestLead(testTenant, rawLead);
    assert.equal(firstResult.status, 'created');
    assert.equal(firstResult.channel, 'whatsapp');
    assert.equal(customers.length, 1, 'Customer created with Property Finder source');

    // Duplicate ingestion (redelivery or retry)
    const secondResult = await propertyFinderSyncService.ingestLead(testTenant, rawLead);
    assert.equal(secondResult.status, 'duplicate', 'Idempotent deduplication must prevent duplicate customer creation');
    assert.equal(customers.length, 1, 'Customer count must remain exactly 1');
  });

  // --------------------------------------------------------------------------
  // 6. WEBHOOK HMAC-SHA256 SIGNATURE VALIDATION & REPLAY DEFENSE
  // --------------------------------------------------------------------------
  await suite.test('6. Inbound Webhook Signature Verification & Constant-Time Defense', async () => {
    const testTenant = '33333333-3333-3333-3333-333333333333';
    const sharedSecret = 'pf_wh_secret_super_secret_token';

    db.query = async (sql, params) => {
      if (sql.includes('SELECT webhook_secret_encrypted, is_enabled FROM property_finder_settings')) {
        return {
          rows: [{
            webhook_secret_encrypted: encrypt(sharedSecret),
            is_enabled: true
          }]
        };
      }
      if (sql.includes('SELECT * FROM property_finder_webhook_events')) {
        return { rows: [] }; // Not processed yet
      }
      return { rows: [] };
    };

    const bodyPayload = { event: 'leads.create', data: { id: 'evt_lead_888' } };
    const rawBodyBuffer = Buffer.from(JSON.stringify(bodyPayload));

    // Calculate valid HMAC-SHA256
    const validSignature = crypto.createHmac('sha256', sharedSecret).update(rawBodyBuffer).digest('hex');

    // Case A: Valid Signature accepted
    let statusA = null;
    let dataA = null;
    const reqA = {
      query: { tenant_id: testTenant },
      headers: {
        'x-pf-signature': `sha256=${validSignature}`,
        'x-pf-event-id': 'evt_001'
      },
      body: bodyPayload,
      rawBody: rawBodyBuffer
    };
    const resA = {
      status(s) { statusA = s; return this; },
      json(d) { dataA = d; return this; }
    };

    await propertyFinderController.handleWebhook(reqA, resA);
    assert.equal(statusA, 200, 'Valid signature must receive HTTP 200');
    assert.equal(dataA.received, true);

    // Case B: Tampered / Invalid Signature rejected
    let statusB = null;
    let dataB = null;
    const reqB = {
      query: { tenant_id: testTenant },
      headers: {
        'x-pf-signature': 'sha256=invalid_forged_signature_0000000000000000000000000000000000000000',
        'x-pf-event-id': 'evt_002'
      },
      body: bodyPayload,
      rawBody: rawBodyBuffer
    };
    const resB = {
      status(s) { statusB = s; return this; },
      json(d) { dataB = d; return this; }
    };

    await propertyFinderController.handleWebhook(reqB, resB);
    assert.equal(statusB, 401, 'Forged signature must be rejected with HTTP 401 Unauthorized');

    // Case C: Missing signature rejected when secret is configured
    let statusC = null;
    let dataC = null;
    const reqC = {
      query: { tenant_id: testTenant },
      headers: {
        'x-pf-event-id': 'evt_003'
        // No signature header sent
      },
      body: bodyPayload,
      rawBody: rawBodyBuffer
    };
    const resC = {
      status(s) { statusC = s; return this; },
      json(d) { dataC = d; return this; }
    };

    await propertyFinderController.handleWebhook(reqC, resC);
    assert.equal(statusC, 401, 'Missing signature header must be rejected with HTTP 401 Unauthorized');

    // Case D: Path param :tenantId resolution
    let statusD = null;
    let dataD = null;
    const reqD = {
      params: { tenantId: testTenant },
      headers: {
        'x-pf-signature': `sha256=${validSignature}`,
        'x-pf-event-id': 'evt_004'
      },
      body: bodyPayload,
      rawBody: rawBodyBuffer
    };
    const resD = {
      status(s) { statusD = s; return this; },
      json(d) { dataD = d; return this; }
    };

    await propertyFinderController.handleWebhook(reqD, resD);
    assert.equal(statusD, 200, 'Path param :tenantId resolution must succeed with valid signature');
  });

  // --------------------------------------------------------------------------
  // 7. REAL ESTATE UNIT PUBLISHING VALIDATION & STATUS LIFECYCLE
  // --------------------------------------------------------------------------
  await suite.test('7. Unit Publishing Pre-Validation & Non-Destructive Unpublishing', async () => {
    const testTenant = '44444444-4444-4444-4444-444444444444';

    db.query = async (sql, params) => {
      if (sql.includes('SELECT * FROM property_finder_settings')) {
        return {
          rows: [{
            tenant_id: testTenant,
            api_key_encrypted: encrypt('key'),
            api_secret_encrypted: encrypt('sec'),
            is_enabled: true
          }]
        };
      }
      if (sql.includes('SELECT * FROM re_units')) {
        // Return unit with invalid price 0
        return {
          rows: [{
            id: 'unit_zero_price',
            tenant_id: testTenant,
            price: 0,
            unit_number: 'U-001',
            type: 'Apartment',
            status: 'Available'
          }]
        };
      }
      return { rows: [] };
    };

    // Submitting unit with price 0 must fail validation before any API call
    let validationCaught = false;
    try {
      await propertyFinderSyncService.publishUnit(testTenant, 'unit_zero_price');
    } catch (valErr) {
      validationCaught = true;
      assert.ok(valErr.validationErrors.some(e => e.includes('greater than zero')));
    }
    assert.ok(validationCaught, 'Pre-submission validation must catch invalid property attributes');
  });

  // --------------------------------------------------------------------------
  // 8. EXTERNAL PRICE DRIFT DETECTION & NON-DESTRUCTIVE RECONCILIATION
  // --------------------------------------------------------------------------
  await suite.test('8. External Price Drift Detection During Listing Sync', async () => {
    const testTenant = '55555555-5555-5555-5555-555555555555';
    let loggedWarnings = [];

    db.query = async (sql, params) => {
      if (sql.includes('SELECT * FROM property_finder_settings')) {
        return {
          rows: [{
            tenant_id: testTenant,
            api_key_encrypted: encrypt('key_x'),
            api_secret_encrypted: encrypt('sec_x'),
            environment: 'sandbox',
            is_enabled: true,
            country_code: 'EG'
          }]
        };
      }
      if (sql.includes('FROM property_finder_listing_mappings') && sql.includes('external_listing_id = $2')) {
        // Existing mapping with unit_id
        return {
          rows: [{
            id: 10,
            tenant_id: testTenant,
            unit_id: 'unit_drift_1',
            external_listing_id: params[1],
            publication_status: 'published'
          }]
        };
      }
      if (sql.includes('SELECT id, unit_number, price, status FROM re_units WHERE id::text = $1::text')) {
        // Local unit has price 3,000,000 while external listing has price 4,500,000
        return {
          rows: [{
            id: 'unit_drift_1',
            unit_number: 'REF-CAIRO-101',
            price: 3000000,
            status: 'Available'
          }]
        };
      }
      if (sql.includes('INSERT INTO property_finder_event_logs')) {
        loggedWarnings.push({ eventType: params[1], severity: params[2], message: params[3] });
        return { rows: [] };
      }
      return { rows: [] };
    };

    process.env.MOCK_PROPERTY_FINDER = 'true';
    const stats = await propertyFinderSyncService.importListings(testTenant, { page: 1, limit: 10 });
    delete process.env.MOCK_PROPERTY_FINDER;

    assert.equal(stats.updated, 2, 'Existing mapped listings were updated');
    const driftLog = loggedWarnings.find(l => l.eventType === 'external_price_drift_detected');
    assert.ok(driftLog, 'Must detect and log external price drift');
    assert.equal(driftLog.severity, 'warn');
    assert.match(driftLog.message, /Tashgheel master field ownership policy preserved local price/);
  });

  // --------------------------------------------------------------------------
  // 9. CONTROLLER UX ERROR MAPPING & PRECONDITION VALIDATION
  // --------------------------------------------------------------------------
  await suite.test('9. Controller Error Mapping & Precondition Handling', async () => {
    const testTenant = '44444444-4444-4444-4444-444444444444';

    // Mock DB: settings exists but is_enabled = false
    db.query = async (sql, params) => {
      if (sql.includes('SELECT * FROM property_finder_settings')) {
        return {
          rows: [{
            tenant_id: testTenant,
            api_key_encrypted: encrypt('key_1'),
            api_secret_encrypted: encrypt('sec_1'),
            environment: 'sandbox',
            is_enabled: false,
            country_code: 'EG'
          }]
        };
      }
      return { rows: [] };
    };

    let importStatus = null;
    let importBody = null;
    const mockResImport = {
      status: (code) => {
        importStatus = code;
        return { json: (body) => { importBody = body; } };
      }
    };

    await propertyFinderController.triggerImport(
      { user: { tenant_id: testTenant, role: 'admin' }, body: {} },
      mockResImport
    );

    assert.equal(importStatus, 400, 'Must return HTTP 400 Bad Request when integration is disabled, not 500');
    assert.equal(importBody.code, 'INTEGRATION_PRECONDITION_FAILED');
    assert.match(importBody.message, /currently disabled/);

    let leadStatus = null;
    let leadBody = null;
    const mockResLead = {
      status: (code) => {
        leadStatus = code;
        return { json: (body) => { leadBody = body; } };
      }
    };

    await propertyFinderController.triggerLeadSync(
      { user: { tenant_id: testTenant, role: 'admin' }, body: {} },
      mockResLead
    );

    assert.equal(leadStatus, 400, 'Must return HTTP 400 Bad Request when lead sync is disabled, not 500');
    assert.equal(leadBody.code, 'INTEGRATION_PRECONDITION_FAILED');
    assert.match(leadBody.message, /currently disabled/);
  });

  // --------------------------------------------------------------------------
  // 10. PARTIAL SETTINGS SAVE (INDEPENDENT SYNC CONTROLS)
  // --------------------------------------------------------------------------
  await suite.test('10. Partial Settings Save Preserves Credentials & Environment', async () => {
    const testTenant = '55555555-5555-5555-5555-555555555555';
    let savedRow = null;

    db.query = async (sql, params) => {
      if (sql.includes('SELECT * FROM property_finder_settings')) {
        return {
          rows: [{
            tenant_id: testTenant,
            api_key_encrypted: encrypt('existing_key'),
            api_secret_encrypted: encrypt('existing_secret'),
            environment: 'production',
            country_code: 'EG',
            is_enabled: false,
            listing_sync_enabled: true,
            lead_sync_enabled: false
          }]
        };
      }
      if (sql.includes('INSERT INTO property_finder_settings')) {
        savedRow = {
          tenant_id: params[0],
          api_key_encrypted: params[1],
          api_secret_encrypted: params[2],
          environment: params[3],
          country_code: params[4],
          is_enabled: params[5],
          listing_sync_enabled: params[6],
          lead_sync_enabled: params[7],
          is_connected: true
        };
        return { rows: [savedRow] };
      }
      return { rows: [] };
    };

    let responseData = null;
    const mockRes = {
      json: (data) => { responseData = data; },
      status: () => mockRes
    };

    // Save only sync toggles (no credentials or environment passed)
    await propertyFinderController.saveSettings(
      {
        user: { tenant_id: testTenant, role: 'admin' },
        body: {
          is_enabled: true,
          listing_sync_enabled: true,
          lead_sync_enabled: true
        }
      },
      mockRes
    );

    assert.equal(responseData.status, 'success');
    assert.equal(responseData.data.is_enabled, true, 'is_enabled was updated to true');
    assert.equal(responseData.data.environment, 'production', 'environment was preserved as production');
    assert.ok(savedRow.api_key_encrypted, 'Credentials were not wiped during partial sync settings save');
  });

  // --------------------------------------------------------------------------
  // 11. ATLAS RFC 7807 & 403 TRACE_ID ERROR PARSING & SANITIZATION
  // --------------------------------------------------------------------------
  await suite.test('11. Atlas 403 Error Parsing: Captures Code, Detail, Trace ID, and Redacts Secrets', async () => {
    const rawSecret = 'super_secret_raw_pass_123';
    const client = new PropertyFinderClient({
      apiKey: 'pk_live_12345678',
      apiSecret: rawSecret,
      environment: 'production',
      countryCode: 'EG',
      tenantId: 'tenant-diag-123'
    });

    const mockAxios403Error = {
      message: 'Request failed with status code 403',
      response: {
        status: 403,
        headers: {
          'x-trace-id': 'trace-header-fallback-999'
        },
        data: {
          code: 'common-http-403-forbidden',
          detail: `User with secret ${rawSecret} is not authorized to access leads.`,
          attributes: {
            trace_id: 'pf_atlas_trace_abc_789'
          }
        }
      }
    };

    let caughtError = null;
    try {
      client._handleApiError(mockAxios403Error, 'GET /leads');
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError, 'Must throw structured customError');
    assert.equal(caughtError.status, 403);
    assert.equal(caughtError.code, 'common-http-403-forbidden');
    assert.equal(caughtError.traceId, 'pf_atlas_trace_abc_789');

    // Details payload assertions
    assert.equal(caughtError.details.status, 403);
    assert.equal(caughtError.details.code, 'common-http-403-forbidden');
    assert.equal(caughtError.details.trace_id, 'pf_atlas_trace_abc_789');
    assert.equal(caughtError.details.environment, 'production');
    assert.equal(caughtError.details.endpoint, 'GET /leads');
    assert.equal(caughtError.details.tenant_id, 'tenant-diag-123');

    // Zero secret leakage assertions
    assert.ok(!caughtError.message.includes(rawSecret), 'Raw secret must never leak in error message');
    assert.ok(caughtError.message.includes('[REDACTED_SECRET]'), 'Secret must be replaced with [REDACTED_SECRET]');
    assert.ok(!JSON.stringify(caughtError.details).includes(rawSecret), 'Raw secret must not leak in details JSON');
    assert.ok(JSON.stringify(caughtError.details).includes('[REDACTED_SECRET]'));
  });
});

