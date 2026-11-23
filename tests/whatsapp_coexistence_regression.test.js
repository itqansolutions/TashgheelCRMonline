const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('WhatsApp Cloud API & Coexistence Regression Test Suite', async (t) => {
  const coexistenceService = require('../services/whatsappCoexistenceService');
  const whatsappController = require('../controllers/whatsappController');
  const whatsappService = require('../services/whatsappService');

  // -------------------------------------------------------------------------
  // Scenario 1: Existing Cloud API sending endpoints & services remain intact
  // -------------------------------------------------------------------------
  await t.test('1. Cloud API message sending exports and service contracts are preserved', () => {
    assert.equal(typeof whatsappService.sendTestMessage, 'function', 'sendTestMessage must be exported');
    assert.equal(typeof whatsappService.sendDirectTextMessage, 'function', 'sendDirectTextMessage must be exported');
    assert.equal(typeof whatsappService.sendWelcomeMessage, 'function', 'sendWelcomeMessage must be exported');
    assert.equal(typeof whatsappService.broadcastWhatsAppCampaign, 'function', 'broadcastWhatsAppCampaign must be exported');
    assert.equal(typeof whatsappController.sendMessage, 'function', 'sendMessage controller must be exported');
    assert.equal(typeof whatsappController.sendTestWhatsApp, 'function', 'sendTestWhatsApp controller must be exported');
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Webhook endpoints and verification flow preserved
  // -------------------------------------------------------------------------
  await t.test('2. Webhook endpoints and verification flow remain preserved in server.js and routes', () => {
    const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const routesJs = fs.readFileSync(path.join(__dirname, '../routes/whatsappRoutes.js'), 'utf8');

    assert.match(serverJs, /app\.get\('\/api\/whatsapp\/webhook', whatsappController\.handleWebhookVerification\)/, 'GET /api/whatsapp/webhook must be mounted');
    assert.match(serverJs, /app\.post\('\/api\/whatsapp\/webhook', whatsappController\.handleWebhookEvent\)/, 'POST /api/whatsapp/webhook must be mounted');
    assert.match(serverJs, /app\.get\('\/api\/meta\/webhook', metaController\.handleWebhookVerification\)/, 'GET /api/meta/webhook must be mounted');
    assert.match(serverJs, /app\.post\('\/api\/meta\/webhook', metaController\.handleWebhookEvent\)/, 'POST /api/meta/webhook must be mounted');

    assert.match(routesJs, /router\.get\('\/conversations', whatsappController\.getConversations\)/, 'GET /conversations route preserved');
    assert.match(routesJs, /router\.post\('\/conversations\/:id\/messages', whatsappController\.sendMessage\)/, 'POST /conversations/:id/messages route preserved');
    assert.match(routesJs, /router\.get\('\/settings', authorize\(\['admin'\]\), whatsappController\.getWhatsAppSettings\)/, 'GET /settings route preserved');
    assert.match(routesJs, /router\.post\('\/settings', authorize\(\['admin'\]\), whatsappController\.updateWhatsAppSettings\)/, 'POST /settings route preserved');
    assert.match(routesJs, /router\.post\('\/test', authorize\(\['admin'\]\), whatsappController\.sendTestWhatsApp\)/, 'POST /test route preserved');
    assert.match(routesJs, /router\.get\('\/phone-numbers', authorize\(\['admin'\]\), whatsappController\.fetchPhoneNumbersFromMeta\)/, 'GET /phone-numbers route preserved');
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Templates, media and Graph API version preservation
  // -------------------------------------------------------------------------
  await t.test('3. Graph API version v21.0 and media helper methods are preserved', () => {
    const serviceContent = fs.readFileSync(path.join(__dirname, '../services/whatsappService.js'), 'utf8');

    assert.match(serviceContent, /const WA_API_VERSION = 'v21.0';/, 'WA_API_VERSION must remain v21.0');
    assert.equal(typeof whatsappService.downloadAndStoreMedia, 'function', 'downloadAndStoreMedia must be exported');
    assert.equal(typeof whatsappService.fetchApprovedTemplates, 'function', 'fetchApprovedTemplates must be exported');
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Meta Lead Forms integration continues working
  // -------------------------------------------------------------------------
  await t.test('4. Meta Lead Forms integration continues to dispatch welcome messages', () => {
    const metaServiceContent = fs.readFileSync(path.join(__dirname, '../services/metaService.js'), 'utf8');

    assert.match(metaServiceContent, /sendWelcomeMessage\(\{/, 'metaService must continue calling sendWelcomeMessage for leads');
    assert.match(metaServiceContent, /triggerGreetingIfConfigured/, 'metaService must check greeting trigger for meta_lead');
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Zero re-onboarding required — default connection_type is 'cloud_api'
  // -------------------------------------------------------------------------
  await t.test('5. Existing accounts default safely to cloud_api with zero re-onboarding', () => {
    const migrationContent = fs.readFileSync(path.join(__dirname, '../database/migrations/add_whatsapp_coexistence_support.sql'), 'utf8');

    assert.match(migrationContent, /ADD COLUMN IF NOT EXISTS connection_type VARCHAR\(30\) NOT NULL DEFAULT 'cloud_api'/, 'migration must add connection_type with default cloud_api');
    assert.match(migrationContent, /ADD COLUMN IF NOT EXISTS coexistence_status VARCHAR\(50\) DEFAULT 'unlinked'/, 'migration must add coexistence_status with default unlinked');
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Standard Cloud API accounts operate without Coexistence interference
  // -------------------------------------------------------------------------
  await t.test('6. Standard cloud_api accounts are never intercepted as Coexistence app echoes', () => {
    const cloudApiAccount = {
      id: 1,
      tenant_id: 'tenant-123',
      display_phone_number: '+201000000001',
      connection_type: 'cloud_api'
    };

    const incomingMsg = {
      id: 'wamid.HBgLMTIzNDU2Nzg5MA==',
      from: '201000000001',
      text: { body: 'Customer reply' }
    };

    const isEcho = coexistenceService.isCoexistenceAppEcho({
      message: incomingMsg,
      account: cloudApiAccount
    });

    assert.equal(isEcho, false, 'Cloud API accounts must never be treated as coexistence app echoes');
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Coexistence account correctly identifies app echoes vs customer messages
  // -------------------------------------------------------------------------
  await t.test('7. Coexistence accounts accurately isolate app echoes from customer messages', () => {
    const coexistenceAccount = {
      id: 2,
      tenant_id: 'tenant-123',
      display_phone_number: '+201000000002',
      connection_type: 'coexistence'
    };

    // Case A: Message sent from mobile app (phone matches business phone)
    const appEchoMsg = {
      id: 'wamid.ECHO12345',
      from: '201000000002',
      text: { body: 'Agent replied via WhatsApp mobile app' }
    };

    const isEcho = coexistenceService.isCoexistenceAppEcho({
      message: appEchoMsg,
      account: coexistenceAccount
    });

    assert.equal(isEcho, true, 'Coexistence message matching business phone must be detected as app echo');

    // Case B: Real customer message (from customer phone, different from business)
    const customerMsg = {
      id: 'wamid.CUST99999',
      from: '201111111111',
      text: { body: 'Hello, I want to inquire about a product' }
    };

    const isCustomerEcho = coexistenceService.isCoexistenceAppEcho({
      message: customerMsg,
      account: coexistenceAccount
    });

    assert.equal(isCustomerEcho, false, 'Customer message must NOT be detected as echo');
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Feature flag guarding for Coexistence onboarding
  // -------------------------------------------------------------------------
  await t.test('8. Feature flag strictly protects Coexistence onboarding', async () => {
    const prevFlag = process.env.ENABLE_WHATSAPP_COEXISTENCE;
    try {
      // Force feature flag OFF
      delete process.env.ENABLE_WHATSAPP_COEXISTENCE;
      assert.equal(coexistenceService.isCoexistenceEnabled(), false, 'Feature flag must default to false');

      await assert.rejects(
        async () => {
          await coexistenceService.onboardCoexistenceAccount({
            tenantId: 'tenant-test',
            phoneNumberId: 'phone-test',
            displayPhoneNumber: '+201000000000'
          });
        },
        /WhatsApp Coexistence is currently disabled/i,
        'Onboarding must be rejected when feature flag is disabled'
      );
    } finally {
      if (prevFlag !== undefined) {
        process.env.ENABLE_WHATSAPP_COEXISTENCE = prevFlag;
      }
    }
  });

  // -------------------------------------------------------------------------
  // Scenario 9: Rollback safety and non-destructive capability
  // -------------------------------------------------------------------------
  await t.test('9. Rollback plan is fully documented and non-destructive to existing credentials', () => {
    const migrationContent = fs.readFileSync(path.join(__dirname, '../database/migrations/add_whatsapp_coexistence_support.sql'), 'utf8');

    assert.match(migrationContent, /ROLLBACK SCRIPT/, 'Migration must provide explicit rollback instructions');
    assert.doesNotMatch(migrationContent, /DROP TABLE whatsapp_settings/, 'Migration must never drop existing tables');
    assert.doesNotMatch(migrationContent, /DROP TABLE whatsapp_accounts/, 'Migration must never drop existing accounts');
    assert.doesNotMatch(migrationContent, /DELETE FROM/, 'Migration must never delete data');
  });

  // -------------------------------------------------------------------------
  // Scenario 10: Server-side ownership verification guards
  // -------------------------------------------------------------------------
  await t.test('10. Server-side ownership verification rejects missing tokens and mismatched accounts', async () => {
    // Missing arguments check
    await assert.rejects(
      async () => {
        await coexistenceService.verifyMetaAccountOwnership({ phoneNumberId: null, accessToken: null });
      },
      /phoneNumberId and accessToken are required/i,
      'verifyMetaAccountOwnership must require phoneNumberId and accessToken'
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 11: Embedded Signup code exchange validation
  // -------------------------------------------------------------------------
  await t.test('11. Embedded Signup token exchange strictly validates credentials', async () => {
    await assert.rejects(
      async () => {
        await coexistenceService.exchangeEmbeddedSignupCode({ code: null, appId: null, appSecret: null });
      },
      /code, appId, and appSecret are required/i,
      'exchangeEmbeddedSignupCode must require code, appId, and appSecret'
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 12: Coexistence Webhook Extended Fields in Controller
  // -------------------------------------------------------------------------
  await t.test('12. Webhook event handler explicitly supports smb_message_echoes, history, and smb_app_state_sync', () => {
    const controllerContent = fs.readFileSync(path.join(__dirname, '../controllers/whatsappController.js'), 'utf8');

    assert.match(controllerContent, /'smb_message_echoes'/, 'Controller must explicitly support smb_message_echoes');
    assert.match(controllerContent, /'history'/, 'Controller must explicitly support history');
    assert.match(controllerContent, /'smb_app_state_sync'/, 'Controller must explicitly support smb_app_state_sync');
    assert.match(controllerContent, /recordCoexistenceHistoryBatch/, 'Controller must invoke recordCoexistenceHistoryBatch');
    assert.match(controllerContent, /recordCoexistenceAppStateSync/, 'Controller must invoke recordCoexistenceAppStateSync');
    assert.match(controllerContent, /'account_update'/, 'Controller must explicitly support account_update');
    assert.match(controllerContent, /recordCoexistenceAccountUpdate/, 'Controller must invoke recordCoexistenceAccountUpdate');
  });

  // -------------------------------------------------------------------------
  // Scenario 13: History batch and App state sync exports
  // -------------------------------------------------------------------------
  await t.test('13. Coexistence service exports dedicated history and app state sync methods', () => {
    assert.equal(typeof coexistenceService.recordCoexistenceHistoryBatch, 'function', 'recordCoexistenceHistoryBatch must be exported');
    assert.equal(typeof coexistenceService.recordCoexistenceAppStateSync, 'function', 'recordCoexistenceAppStateSync must be exported');
    assert.equal(typeof coexistenceService.processEmbeddedSignupAuthorization, 'function', 'processEmbeddedSignupAuthorization must be exported');
    assert.equal(typeof coexistenceService.verifyMetaAccountOwnership, 'function', 'verifyMetaAccountOwnership must be exported');
  });

  // -------------------------------------------------------------------------
  // Scenario 14: Embedded Signup launch matches Meta's current supported flow (v4)
  // -------------------------------------------------------------------------
  await t.test('14. Frontend launches Embedded Signup with the v4 WhatsApp Business app onboarding flow', () => {
    const settingsContent = fs.readFileSync(path.join(__dirname, '../frontend/src/pages/Integrations/WhatsAppSettings.jsx'), 'utf8');

    assert.match(settingsContent, /featureType:\s*'whatsapp_business_app_onboarding'/, 'FB.login extras must enable the Business app onboarding flow via featureType');
    assert.ok(!/sessionInfoVersion/.test(settingsContent), 'sessionInfoVersion is a v2-era input and must not be sent on the current flow');
    assert.match(settingsContent, /FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING/, 'Coexistence finish event must be captured by the session listener');
  });

  // -------------------------------------------------------------------------
  // Scenario 15: contacts/history sync is explicit opt-in and once-only
  // -------------------------------------------------------------------------
  await t.test('15. Data sync initiation is exported, opt-in gated, and once-only guarded', async () => {
    assert.equal(typeof coexistenceService.initiateCoexistenceDataSync, 'function', 'initiateCoexistenceDataSync must be exported');

    const serviceContent = fs.readFileSync(path.join(__dirname, '../services/whatsappCoexistenceService.js'), 'utf8');
    assert.match(serviceContent, /syncContacts = false/, 'syncContacts must default to false (no implicit contacts sync)');
    assert.match(serviceContent, /syncHistory = false/, 'syncHistory must default to false (no implicit history sync)');
    assert.match(serviceContent, /already_requested/, 'Repeat sync initiation must be skipped via the once-only guard');

    await assert.rejects(
      async () => {
        await coexistenceService.initiateCoexistenceDataSync({ phoneNumberId: '123', accessToken: 'x', syncType: 'everything' });
      },
      /Unsupported coexistence sync_type/i,
      'Only smb_app_state_sync and history sync types are permitted'
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 16: declined history sharing and disconnect lifecycle are handled
  // -------------------------------------------------------------------------
  await t.test('16. History decline (error 2593109) and PARTNER_REMOVED disconnection are handled safely', () => {
    assert.equal(typeof coexistenceService.recordCoexistenceHistoryDeclined, 'function', 'recordCoexistenceHistoryDeclined must be exported');
    assert.equal(typeof coexistenceService.recordCoexistenceAccountUpdate, 'function', 'recordCoexistenceAccountUpdate must be exported');

    const controllerContent = fs.readFileSync(path.join(__dirname, '../controllers/whatsappController.js'), 'utf8');
    assert.match(controllerContent, /2593109/, 'Controller must recognize the history-declined error code');

    const serviceContent = fs.readFileSync(path.join(__dirname, '../services/whatsappCoexistenceService.js'), 'utf8');
    assert.match(serviceContent, /PARTNER_REMOVED/, 'PARTNER_REMOVED must mark the coexistence link disconnected');
    assert.match(serviceContent, /declined_by_business/, 'Declined history sharing must be recorded without ingesting messages');
  });

  // -------------------------------------------------------------------------
  // Scenario 17: disconnected coexistence numbers are never treated as send-ready
  // -------------------------------------------------------------------------
  await t.test('17. Disconnected coexistence accounts are blocked from all agent send paths', () => {
    const controllerContent = fs.readFileSync(path.join(__dirname, '../controllers/whatsappController.js'), 'utf8');

    const guards = controllerContent.match(/COEXISTENCE_ACCOUNT_DISCONNECTED/g) || [];
    assert.ok(guards.length >= 2, 'Both sendMessage and startNewChat must reject disconnected coexistence accounts');
    assert.match(controllerContent, /coexistence_status = 'disconnected'\)/, 'Default sender selection must exclude disconnected coexistence accounts');

    const settingsContent = fs.readFileSync(path.join(__dirname, '../frontend/src/pages/Integrations/WhatsAppSettings.jsx'), 'utf8');
    assert.match(settingsContent, /coexistence_status === 'disconnected'/, 'Settings UI must surface the disconnected state on the account');
  });

  // -------------------------------------------------------------------------
  // Scenario 18: disconnected numbers cannot become default; card header has no overlap-prone badge
  // -------------------------------------------------------------------------
  await t.test('18. Default-sender selection is defended and the Hybrid badge cannot overlap the title', () => {
    const controllerContent = fs.readFileSync(path.join(__dirname, '../controllers/whatsappController.js'), 'utf8');
    const guards = controllerContent.match(/COEXISTENCE_ACCOUNT_DISCONNECTED/g) || [];
    assert.ok(guards.length >= 3, 'sendMessage, startNewChat, and setDefaultWhatsAppAccount must all reject disconnected coexistence accounts');
    assert.match(controllerContent, /cannot be set as the default sender/, 'setDefaultWhatsAppAccount must carry the explicit default-sender guard');

    const settingsContent = fs.readFileSync(path.join(__dirname, '../frontend/src/pages/Integrations/WhatsAppSettings.jsx'), 'utf8');
    assert.doesNotMatch(settingsContent, /position: 'absolute', top: 12/, 'Hybrid badge must not be absolutely positioned over the card title');
    assert.match(settingsContent, /الربط مفصول \(Disconnected\)/, 'Status column must render the disconnected state instead of Active');
    assert.match(settingsContent, /⛔ الربط مفصول/, 'Disconnected badge must use neutral separation wording (event semantics pending)');
  });
});
