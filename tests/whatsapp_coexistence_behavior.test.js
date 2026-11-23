/**
 * Behavioral tests for the effects-bearing Coexistence paths.
 * Graph API (axios) and the database (config/db) are stubbed in-process;
 * every assertion runs the real service/controller code. No real Meta calls,
 * no real database.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ENABLE_WHATSAPP_COEXISTENCE = 'true';

const db = require('../config/db');
const axios = require('axios');
const coexistenceService = require('../services/whatsappCoexistenceService');
const whatsappController = require('../controllers/whatsappController');

// ---------------------------------------------------------------------------
// Capture fakes
// ---------------------------------------------------------------------------
let queries;
let axiosGetCalls;
let axiosPostCalls;
let dbHandler;

function installFakes() {
  queries = [];
  axiosGetCalls = [];
  axiosPostCalls = [];
  dbHandler = async () => ({ rows: [] });

  db.query = async (sql, params) => {
    queries.push({ sql, params });
    return dbHandler(sql, params);
  };
  axios.get = async (url, cfg) => {
    axiosGetCalls.push({ url, cfg });
    return { data: {} };
  };
  axios.post = async (url, body, cfg) => {
    axiosPostCalls.push({ url, body, cfg });
    return { data: {} };
  };
}

function mkRes() {
  const r = {
    statusCode: 200,
    body: null,
    status(c) { r.statusCode = c; return r; },
    json(d) { r.body = d; return r; },
    send() { return r; }
  };
  return r;
}

const TENANT = 'tenant-b1';
const ACCOUNT_ROW = {
  account_id: 7,
  tenant_id: TENANT,
  branch_id: null,
  access_token: 'tok-1',
  meta_app_secret: null,
  connection_type: 'coexistence',
  display_phone_number: '+201055500002'
};

function stubMetaSuccess() {
  axios.get = async (url, cfg) => {
    axiosGetCalls.push({ url, cfg });
    return {
      data: {
        id: 'pn-1',
        display_phone_number: '+201055500002',
        verified_name: 'Itqan Sales',
        quality_rating: 'GREEN',
        whatsapp_business_account: { id: 'waba-1' }
      }
    };
  };
  axios.post = async (url, body, cfg) => {
    axiosPostCalls.push({ url, body, cfg });
    if (url.includes('subscribed_apps')) return { data: { success: true } };
    if (url.includes('smb_app_data')) return { data: { messaging_product: 'whatsapp', request_id: `req-${body.sync_type}` } };
    return { data: {} };
  };
}

function onboardedAccount(metadata) {
  return {
    id: 7,
    tenant_id: TENANT,
    phone_number_id: 'pn-1',
    display_phone_number: '+201055500002',
    verified_name: 'Itqan Sales',
    connection_type: 'coexistence',
    coexistence_status: 'linked',
    coexistence_metadata: metadata
  };
}

const smbAppDataCalls = () => axiosPostCalls.filter(c => c.url.includes('smb_app_data'));
const metadataUpdates = () => queries.filter(q => /UPDATE whatsapp_accounts[\s\S]*coexistence_metadata/.test(q.sql));

test('Coexistence behavioral suite (mocked Graph + stubbed DB)', async (t) => {

  await t.test('B1. onboarding with NO sync opt-ins never calls smb_app_data', async () => {
    installFakes();
    stubMetaSuccess();
    dbHandler = async (sql) => {
      if (/INSERT INTO whatsapp_accounts/.test(sql)) return { rows: [onboardedAccount({ waba_id: 'waba-1' })] };
      return { rows: [] };
    };

    await coexistenceService.processEmbeddedSignupAuthorization({
      tenantId: TENANT,
      accessToken: 'tok-1',
      phoneNumberId: 'pn-1',
      wabaId: 'waba-1'
    });

    assert.equal(smbAppDataCalls().length, 0, 'no opt-in flags must mean zero smb_app_data requests');
  });

  await t.test('B2. explicit opt-ins send correct sync payloads and store request ids', async () => {
    installFakes();
    stubMetaSuccess();
    dbHandler = async (sql) => {
      if (/INSERT INTO whatsapp_accounts/.test(sql)) return { rows: [onboardedAccount({ waba_id: 'waba-1' })] };
      return { rows: [] };
    };

    await coexistenceService.processEmbeddedSignupAuthorization({
      tenantId: TENANT,
      accessToken: 'tok-1',
      phoneNumberId: 'pn-1',
      wabaId: 'waba-1',
      syncContacts: true,
      syncHistory: true
    });

    const syncCalls = smbAppDataCalls();
    assert.equal(syncCalls.length, 2, 'both requested sync types must be initiated');
    const syncTypes = syncCalls.map(c => c.body && c.body.sync_type).sort();
    assert.deepEqual(syncTypes, ['history', 'smb_app_state_sync'], 'payloads must carry the exact Meta sync_type values');
    for (const c of syncCalls) {
      assert.equal(c.body.messaging_product, 'whatsapp');
      assert.match(c.cfg.headers.Authorization, /^Bearer tok-1$/);
    }

    const metaWrites = metadataUpdates();
    assert.ok(metaWrites.length >= 1, 'sync request ids must be persisted to coexistence_metadata');
    const written = JSON.parse(metaWrites[metaWrites.length - 1].params[0]);
    assert.equal(written.sync_requests.smb_app_state_sync.request_id, 'req-smb_app_state_sync');
    assert.equal(written.sync_requests.history.request_id, 'req-history');
  });

  await t.test('B3. contacts-only opt-in never requests history', async () => {
    installFakes();
    stubMetaSuccess();
    dbHandler = async (sql) => {
      if (/INSERT INTO whatsapp_accounts/.test(sql)) return { rows: [onboardedAccount({ waba_id: 'waba-1' })] };
      return { rows: [] };
    };

    await coexistenceService.processEmbeddedSignupAuthorization({
      tenantId: TENANT,
      accessToken: 'tok-1',
      phoneNumberId: 'pn-1',
      wabaId: 'waba-1',
      syncContacts: true
    });

    const syncTypes = smbAppDataCalls().map(c => c.body.sync_type);
    assert.deepEqual(syncTypes, ['smb_app_state_sync'], 'history must not be requested without the history opt-in');
  });

  await t.test('B4. repeat onboarding skips already-requested sync types (once-only)', async () => {
    installFakes();
    stubMetaSuccess();
    const existingMeta = {
      waba_id: 'waba-1',
      sync_requests: {
        smb_app_state_sync: { request_id: 'req-old-contacts', requested_at: '2026-11-23T00:00:00Z' },
        history: { request_id: 'req-old-history', requested_at: '2026-11-23T00:00:00Z' }
      }
    };
    dbHandler = async (sql) => {
      if (/INSERT INTO whatsapp_accounts/.test(sql)) return { rows: [onboardedAccount(existingMeta)] };
      return { rows: [] };
    };

    await coexistenceService.processEmbeddedSignupAuthorization({
      tenantId: TENANT,
      accessToken: 'tok-1',
      phoneNumberId: 'pn-1',
      wabaId: 'waba-1',
      syncContacts: true,
      syncHistory: true
    });

    assert.equal(smbAppDataCalls().length, 0, 'already-requested sync types must not be re-requested');
    const metaWrites = metadataUpdates();
    assert.ok(metaWrites.length >= 1, 'the skip decision must still be recorded');
    const written = JSON.parse(metaWrites[metaWrites.length - 1].params[0]);
    assert.equal(written.sync_requests.history.skipped, true);
    assert.equal(written.sync_requests.history.reason, 'already_requested');
  });

  await t.test('B5. history-decline service records decline and ingests nothing', async () => {
    installFakes();
    const ok = await coexistenceService.recordCoexistenceHistoryDeclined({
      tenantId: TENANT,
      account: onboardedAccount({}),
      errorCode: 2593109
    });

    assert.equal(ok, true);
    assert.equal(queries.filter(q => /INSERT INTO whatsapp_messages|INSERT INTO whatsapp_conversations/.test(q.sql)).length, 0,
      'a decline signal must never create messages or conversations');
    const written = JSON.parse(metadataUpdates()[0].params[0]);
    assert.equal(written.history_sharing.status, 'declined_by_business');
    assert.equal(written.history_sharing.error_code, '2593109');
  });

  await t.test('B6. controller history webhook with error 2593109 records decline, ingests nothing', async () => {
    installFakes();
    dbHandler = async (sql) => {
      if (/FROM whatsapp_accounts a/.test(sql)) return { rows: [ACCOUNT_ROW] };
      return { rows: [] };
    };

    const req = {
      headers: {},
      body: {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            field: 'history',
            value: { metadata: { phone_number_id: 'pn-1' }, errors: [{ code: 2593109 }] }
          }]
        }]
      }
    };
    await whatsappController.handleWebhookEvent(req, mkRes());

    assert.equal(queries.filter(q => /INSERT INTO whatsapp_messages|INSERT INTO whatsapp_conversations/.test(q.sql)).length, 0,
      'controller decline path must not ingest messages');
    const metaWrites = metadataUpdates();
    assert.ok(metaWrites.length >= 1, 'decline must be persisted via the controller path');
    assert.equal(JSON.parse(metaWrites[0].params[0]).history_sharing.status, 'declined_by_business');
  });

  await t.test('B7. PARTNER_REMOVED account_update marks the account disconnected', async () => {
    installFakes();
    const ok = await coexistenceService.recordCoexistenceAccountUpdate({
      tenantId: TENANT,
      account: onboardedAccount({}),
      accountUpdateData: { event: 'PARTNER_REMOVED' }
    });

    assert.equal(ok, true);
    const statusWrites = queries.filter(q => /coexistence_status = \$2/.test(q.sql));
    assert.ok(statusWrites.length >= 1);
    assert.equal(statusWrites[0].params[1], 'disconnected');
  });

  await t.test('B8. controller account_update webhook routes PARTNER_REMOVED to disconnection', async () => {
    installFakes();
    dbHandler = async (sql) => {
      if (/FROM whatsapp_accounts a/.test(sql)) return { rows: [ACCOUNT_ROW] };
      return { rows: [] };
    };

    const req = {
      headers: {},
      body: {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            field: 'account_update',
            value: { metadata: { phone_number_id: 'pn-1' }, event: 'PARTNER_REMOVED' }
          }]
        }]
      }
    };
    await whatsappController.handleWebhookEvent(req, mkRes());

    const statusWrites = queries.filter(q => /coexistence_status = \$2/.test(q.sql));
    assert.ok(statusWrites.length >= 1, 'controller must persist the disconnected status');
    assert.equal(statusWrites[0].params[1], 'disconnected');
  });

  await t.test('B9. sendMessage rejects a disconnected coexistence account before any Meta call', async () => {
    installFakes();
    dbHandler = async (sql) => {
      if (/FROM whatsapp_conversations c/.test(sql)) {
        return {
          rows: [{
            id: 55,
            tenant_id: TENANT,
            phone_number: '+201111111111',
            account_phone_number_id: 'pn-1',
            account_connection_type: 'coexistence',
            account_coexistence_status: 'disconnected',
            access_token: 'tok-1',
            default_phone_id: 'pn-0'
          }]
        };
      }
      return { rows: [] };
    };

    const res = mkRes();
    await whatsappController.sendMessage(
      { user: { tenant_id: TENANT, id: 1 }, params: { id: '55' }, body: { body: 'hello' } },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'COEXISTENCE_ACCOUNT_DISCONNECTED');
    assert.equal(axiosPostCalls.length, 0, 'no Meta send may be attempted for a disconnected number');
    assert.equal(queries.filter(q => /INSERT INTO whatsapp_messages/.test(q.sql)).length, 0,
      'rejection must happen before any message row is written');
  });

  await t.test('B10. startNewChat rejects an explicitly chosen disconnected account before any write', async () => {
    installFakes();
    dbHandler = async (sql) => {
      if (/SELECT COALESCE\(connection_type, 'cloud_api'\) AS connection_type, coexistence_status/.test(sql)) {
        return { rows: [{ connection_type: 'coexistence', coexistence_status: 'disconnected' }] };
      }
      return { rows: [] };
    };

    const res = mkRes();
    await whatsappController.startNewChat(
      { user: { tenant_id: TENANT, id: 1 }, body: { account_id: 7, phone_number: '+201111111111' } },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'COEXISTENCE_ACCOUNT_DISCONNECTED');
    assert.equal(queries.filter(q => /INSERT INTO whatsapp_conversations/.test(q.sql)).length, 0,
      'rejection must happen before any conversation row is written');
  });

  await t.test('B11. startNewChat default pick excludes disconnected accounts in the executed SQL', async () => {
    installFakes();
    dbHandler = async (sql) => {
      if (/SELECT id FROM whatsapp_accounts/.test(sql)) return { rows: [{ id: 11 }] };
      if (/SELECT COALESCE\(connection_type/.test(sql)) return { rows: [{ connection_type: 'cloud_api', coexistence_status: 'unlinked' }] };
      if (/INSERT INTO whatsapp_conversations/.test(sql)) return { rows: [{ id: 56, tenant_id: TENANT, account_id: 11 }] };
      return { rows: [] };
    };

    const res = mkRes();
    await whatsappController.startNewChat(
      { user: { tenant_id: TENANT, id: 1 }, body: { phone_number: '+201111111111' } },
      res
    );

    assert.equal(res.statusCode, 200);
    const pickQuery = queries.find(q => /SELECT id FROM whatsapp_accounts/.test(q.sql));
    assert.ok(pickQuery, 'default sender pick must have run');
    assert.match(pickQuery.sql, /coexistence_status = 'disconnected'/,
      'the executed default-pick SQL must exclude disconnected coexistence accounts');
  });

  await t.test('B12. setDefaultWhatsAppAccount rejects a disconnected account before the UPDATE', async () => {
    installFakes();
    dbHandler = async (sql) => {
      if (/SELECT COALESCE\(connection_type/.test(sql)) {
        return { rows: [{ connection_type: 'coexistence', coexistence_status: 'disconnected' }] };
      }
      return { rows: [] };
    };

    const res = mkRes();
    await whatsappController.setDefaultWhatsAppAccount(
      { user: { tenant_id: TENANT }, params: { id: '7' } },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'COEXISTENCE_ACCOUNT_DISCONNECTED');
    assert.equal(queries.filter(q => /SET is_default/.test(q.sql)).length, 0,
      'the is_default update must never run for a disconnected account');
  });

  await t.test('B13. linked coexistence accounts still send normally (no over-blocking)', async () => {
    installFakes();
    axios.post = async (url, body, cfg) => {
      axiosPostCalls.push({ url, body, cfg });
      return { data: { messages: [{ id: 'wamid.ok1' }] } };
    };
    dbHandler = async (sql) => {
      if (/FROM whatsapp_conversations c/.test(sql)) {
        return {
          rows: [{
            id: 55,
            tenant_id: TENANT,
            phone_number: '+201111111111',
            account_phone_number_id: 'pn-1',
            account_connection_type: 'coexistence',
            account_coexistence_status: 'linked',
            access_token: 'tok-1',
            default_phone_id: 'pn-0'
          }]
        };
      }
      if (/INSERT INTO whatsapp_messages/.test(sql)) return { rows: [{ id: 900 }] };
      return { rows: [] };
    };

    const res = mkRes();
    await whatsappController.sendMessage(
      { user: { tenant_id: TENANT, id: 1 }, params: { id: '55' }, body: { body: 'hello' } },
      res
    );

    assert.equal(res.statusCode, 200, 'linked coexistence send must succeed');
    const sendCalls = axiosPostCalls.filter(c => /\/pn-1\/messages$/.test(c.url));
    assert.equal(sendCalls.length, 1, 'exactly one Cloud API send should be attempted');
  });
});
