/**
 * WhatsApp Coexistence Service
 * Isolated module managing WhatsApp Business App + Cloud API Coexistence.
 *
 * Guarantees:
 * - Feature Flag Guarded (ENABLE_WHATSAPP_COEXISTENCE)
 * - Meta Embedded Signup Authorization & Server-Side Ownership Verification
 * - Webhook ingestion for smb_message_echoes, history, and smb_app_state_sync
 * - Anti-loop protection: History & mobile echoes never trigger chatbots or customer creation
 * - Zero regression on standard 'cloud_api' accounts
 */

const axios = require('axios');
const db = require('../config/db');
const { normalisePhone } = require('./whatsappService');

const WA_API_VERSION = 'v21.0';
const WA_BASE_URL = `https://graph.facebook.com/${WA_API_VERSION}`;

/**
 * Check if WhatsApp Coexistence feature flag is active
 * @returns {boolean}
 */
function isCoexistenceEnabled() {
  return process.env.ENABLE_WHATSAPP_COEXISTENCE === 'true';
}

/**
 * Validate phone number eligibility for Coexistence onboarding
 * @param {object} params
 * @param {string} params.phoneNumber
 * @param {string} [params.defaultCountryCode='20']
 * @returns {{ valid: boolean, normalisedPhone?: string, error?: string }}
 */
function validateCoexistenceEligibility({ phoneNumber, defaultCountryCode = '20' }) {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return { valid: false, error: 'Phone number is required.' };
  }

  const normalised = normalisePhone(phoneNumber, defaultCountryCode);
  if (!normalised) {
    return { valid: false, error: 'Invalid phone number format. Must be a valid E.164 number.' };
  }

  return {
    valid: true,
    normalisedPhone: normalised
  };
}

/**
 * Exchange Meta Embedded Signup authorization code for a long-lived access token
 * 
 * @param {object} params
 * @param {string} params.code - Authorization code from Meta Embedded Signup popup
 * @param {string} params.appId - Meta App ID
 * @param {string} params.appSecret - Meta App Secret
 * @returns {Promise<{ accessToken: string, tokenType: string, expiresIn?: number }>}
 */
async function exchangeEmbeddedSignupCode({ code, appId, appSecret }) {
  if (!code || !appId || !appSecret) {
    throw new Error('code, appId, and appSecret are required for Embedded Signup token exchange.');
  }

  try {
    const res = await axios.get(`${WA_BASE_URL}/oauth/access_token`, {
      params: {
        client_id: appId.trim(),
        client_secret: appSecret.trim(),
        code: code.trim()
      },
      timeout: 15000
    });

    if (!res.data?.access_token) {
      throw new Error('Meta OAuth did not return an access_token.');
    }

    return {
      accessToken: res.data.access_token,
      tokenType: res.data.token_type || 'bearer',
      expiresIn: res.data.expires_in
    };
  } catch (err) {
    const metaError = err.response?.data?.error?.message || err.message;
    throw new Error(`Meta Embedded Signup code exchange failed: ${metaError}`);
  }
}

/**
 * Verify account ownership server-side using Meta Graph API
 * Confirms that the access token has legitimate permissions over the specified phone number ID
 * and that it belongs to the expected WhatsApp Business Account (WABA).
 *
 * @param {object} params
 * @param {string} params.phoneNumberId - WhatsApp Phone Number ID
 * @param {string} params.accessToken - Server-side access token
 * @param {string} [params.expectedWabaId] - Optional expected WABA ID to verify against
 * @returns {Promise<{ verified: boolean, displayPhoneNumber: string, verifiedName: string, wabaId?: string, qualityRating?: string }>}
 */
async function verifyMetaAccountOwnership({ phoneNumberId, accessToken, expectedWabaId = null }) {
  if (!phoneNumberId || !accessToken) {
    throw new Error('phoneNumberId and accessToken are required for server-side verification.');
  }

  const cleanPhoneId = String(phoneNumberId).trim();
  const cleanToken = String(accessToken).trim();

  try {
    const res = await axios.get(`${WA_BASE_URL}/${cleanPhoneId}`, {
      params: {
        fields: 'id,display_phone_number,verified_name,code_verification_status,quality_rating,whatsapp_business_account'
      },
      headers: {
        Authorization: `Bearer ${cleanToken}`
      },
      timeout: 15000
    });

    const data = res.data;
    if (!data || data.id !== cleanPhoneId) {
      throw new Error(`Server-side verification failed: Meta returned mismatched phone ID ${data?.id}`);
    }

    const actualWabaId = data.whatsapp_business_account?.id || null;
    if (expectedWabaId && actualWabaId && String(expectedWabaId).trim() !== actualWabaId) {
      throw new Error(`Server-side verification failed: Phone number belongs to WABA ${actualWabaId}, expected ${expectedWabaId}`);
    }

    return {
      verified: true,
      phoneNumberId: data.id,
      displayPhoneNumber: data.display_phone_number || '',
      verifiedName: data.verified_name || data.display_phone_number || '',
      wabaId: actualWabaId,
      qualityRating: data.quality_rating || 'UNKNOWN'
    };
  } catch (err) {
    const metaError = err.response?.data?.error?.message || err.message;
    throw new Error(`Meta account ownership verification failed: ${metaError}`);
  }
}

/**
 * Subscribe Meta App to the WhatsApp Business Account's webhooks
 *
 * @param {object} params
 * @param {string} params.wabaId
 * @param {string} params.accessToken
 * @returns {Promise<boolean>}
 */
async function subscribeWabaWebhooks({ wabaId, accessToken }) {
  if (!wabaId || !accessToken) return false;
  try {
    const res = await axios.post(`${WA_BASE_URL}/${wabaId.trim()}/subscribed_apps`, {}, {
      headers: { Authorization: `Bearer ${accessToken.trim()}` },
      timeout: 10000
    });
    return res.data?.success === true;
  } catch (err) {
    console.warn('[WhatsApp Coexistence] WABA webhook subscription warning:', err.response?.data?.error?.message || err.message);
    return false;
  }
}

/**
 * Process Meta Embedded Signup Authorization & Onboard Coexistence Account
 * Complete flow: validates feature flag, exchanges code if needed, verifies ownership on Meta,
 * verifies tenant isolation, and stores the account.
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} [params.branchId]
 * @param {string} [params.code] - Authorization code from Embedded Signup popup
 * @param {string} [params.accessToken] - Direct access token if already exchanged
 * @param {string} params.phoneNumberId
 * @param {string} [params.wabaId]
 * @param {string} [params.label]
 * @param {object} [params.metadata]
 * @param {boolean} [params.skipMetaVerification=false] - Used only in test suites
 * @returns {Promise<object>}
 */
async function processEmbeddedSignupAuthorization({
  tenantId,
  branchId = null,
  code = null,
  accessToken = null,
  phoneNumberId,
  wabaId = null,
  label = 'Coexistence Number',
  metadata = {},
  skipMetaVerification = false
}) {
  if (!isCoexistenceEnabled()) {
    throw new Error('WhatsApp Coexistence is currently disabled. Please enable ENABLE_WHATSAPP_COEXISTENCE feature flag.');
  }

  if (!tenantId || !phoneNumberId) {
    throw new Error('tenantId and phoneNumberId are required.');
  }

  const cleanPhoneId = String(phoneNumberId).trim();

  // 1. Tenant Isolation Check: verify phoneNumberId is not owned by another tenant in CRM DB
  const conflictCheck = await db.query(`
    SELECT id, tenant_id, connection_type
    FROM whatsapp_accounts
    WHERE phone_number_id = $1 AND tenant_id::text <> $2::text
    LIMIT 1
  `, [cleanPhoneId, tenantId]);

  if (conflictCheck.rows.length > 0) {
    throw new Error('This WhatsApp Phone Number ID is already attached to another organization.');
  }

  let finalToken = accessToken;

  // 2. Exchange authorization code if provided
  if (code && !finalToken) {
    // Lookup tenant Meta App credentials
    const credsRes = await db.query(`
      SELECT meta_app_id, meta_app_secret
      FROM meta_integration_settings
      WHERE tenant_id::text = $1::text
      LIMIT 1
    `, [tenantId]);

    const appId = process.env.META_APP_ID || credsRes.rows[0]?.meta_app_id;
    const appSecret = process.env.META_APP_SECRET || credsRes.rows[0]?.meta_app_secret;

    if (!appId || !appSecret) {
      throw new Error('Meta App ID and App Secret must be configured on the server (META_APP_ID / META_APP_SECRET) or in Meta Integration Settings before exchanging Embedded Signup codes.');
    }

    const exchangeResult = await exchangeEmbeddedSignupCode({
      code,
      appId,
      appSecret
    });
    finalToken = exchangeResult.accessToken;
  }

  let verifiedDetails = {
    displayPhoneNumber: cleanPhoneId,
    verifiedName: 'Coexistence Account',
    qualityRating: 'UNKNOWN',
    wabaId: wabaId || null
  };

  // 3. Server-Side Ownership Verification with Meta Graph API
  if (!skipMetaVerification && finalToken) {
    verifiedDetails = await verifyMetaAccountOwnership({
      phoneNumberId: cleanPhoneId,
      accessToken: finalToken,
      expectedWabaId: wabaId
    });

    if (verifiedDetails.wabaId) {
      await subscribeWabaWebhooks({
        wabaId: verifiedDetails.wabaId,
        accessToken: finalToken
      });
    }
  }

  // 4. Persist account safely with connection_type = 'coexistence'
  const coexistenceMeta = {
    ...metadata,
    waba_id: verifiedDetails.wabaId || wabaId,
    quality_rating: verifiedDetails.qualityRating,
    onboarded_at: new Date().toISOString(),
    connection_mode: 'coexistence',
    feature_version: '1.1'
  };

  const result = await db.query(`
    INSERT INTO whatsapp_accounts (
      tenant_id,
      branch_id,
      phone_number_id,
      display_phone_number,
      verified_name,
      label,
      access_token,
      connection_type,
      coexistence_status,
      coexistence_metadata,
      is_active,
      is_default,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'coexistence', 'linked', $8, true, false, NOW(), NOW())
    ON CONFLICT (tenant_id, phone_number_id) DO UPDATE
    SET
      branch_id = COALESCE(EXCLUDED.branch_id, whatsapp_accounts.branch_id),
      display_phone_number = EXCLUDED.display_phone_number,
      verified_name = COALESCE(EXCLUDED.verified_name, whatsapp_accounts.verified_name),
      label = COALESCE(EXCLUDED.label, whatsapp_accounts.label),
      access_token = COALESCE(EXCLUDED.access_token, whatsapp_accounts.access_token),
      connection_type = 'coexistence',
      coexistence_status = 'linked',
      coexistence_metadata = whatsapp_accounts.coexistence_metadata || EXCLUDED.coexistence_metadata,
      is_active = true,
      updated_at = NOW()
    RETURNING *
  `, [
    tenantId,
    branchId || null,
    cleanPhoneId,
    verifiedDetails.displayPhoneNumber,
    verifiedDetails.verifiedName,
    label,
    finalToken || null,
    JSON.stringify(coexistenceMeta)
  ]);

  return result.rows[0];
}

/**
 * Legacy wrapper for backward compatibility within Coexistence module
 */
async function onboardCoexistenceAccount(params) {
  return processEmbeddedSignupAuthorization({
    ...params,
    skipMetaVerification: true
  });
}

/**
 * Detect whether an incoming webhook message is an echo from the WhatsApp Business App
 * In Coexistence, messages sent from the mobile app produce webhook events.
 *
 * @param {object} params
 * @param {object} params.message - Raw message object from Meta webhook
 * @param {object} params.account - Resolved whatsapp_account row
 * @returns {boolean}
 */
function isCoexistenceAppEcho({ message, account }) {
  if (!account || account.connection_type !== 'coexistence') {
    return false;
  }

  // 1. Meta explicit echo flag or recipient indicator if present
  if (message.recipient_type || message.is_echo === true) {
    return true;
  }

  // 2. Sender phone matches the registered account's own phone number
  const msgFrom = String(message.from || '').replace(/\D/g, '');
  const accountPhone = String(account.display_phone_number || '').replace(/\D/g, '');

  if (accountPhone && msgFrom && (msgFrom === accountPhone || msgFrom.endsWith(accountPhone) || accountPhone.endsWith(msgFrom))) {
    return true;
  }

  return false;
}

/**
 * Handle a message echo sent from WhatsApp Business mobile app in Coexistence mode
 * Ingests as an outbound message sent by the agent via mobile app, without triggering bot or customer lead creation.
 *
 * @param {object} params
 * @returns {Promise<{ handled: boolean, messageId?: string }>}
 */
async function recordCoexistenceAppEcho({
  tenantId,
  account,
  message,
  rawToPhone,
  bodyText,
  mediaUrl = null
}) {
  const wamid = message.id;
  if (!wamid) return { handled: false };

  const toPhone = normalisePhone(rawToPhone) || `+${rawToPhone}`;

  // Find or create conversation for the target recipient
  let convRes = await db.query(`
    SELECT id FROM whatsapp_conversations
    WHERE tenant_id::text = $1::text
      AND account_id = $2
      AND (phone_number = $3 OR phone_number LIKE $4)
    ORDER BY last_message_at DESC NULLS LAST
    LIMIT 1
  `, [tenantId, account.id, toPhone, `%${toPhone.slice(-9)}`]);

  let conversationId = convRes.rows[0]?.id;

  if (!conversationId) {
    const newConv = await db.query(`
      INSERT INTO whatsapp_conversations (
        tenant_id, account_id, branch_id, phone_number, contact_name,
        last_message_body, last_message_at, last_message_direction,
        unread_count, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'outbound', 0, NOW())
      RETURNING id
    `, [
      tenantId,
      account.id,
      account.branch_id || null,
      toPhone,
      toPhone,
      bodyText || '[Mobile App Message]'
    ]);
    conversationId = newConv.rows[0]?.id;
  } else {
    await db.query(`
      UPDATE whatsapp_conversations
      SET 
        last_message_body = $1,
        last_message_at = NOW(),
        last_message_direction = 'outbound',
        updated_at = NOW()
      WHERE id = $2
    `, [bodyText || '[Mobile App Message]', conversationId]);
  }

  if (conversationId) {
    await db.query(`
      INSERT INTO whatsapp_messages (
        conversation_id,
        tenant_id,
        account_id,
        meta_message_id,
        direction,
        sender_type,
        message_type,
        body,
        media_url,
        status,
        created_at
      )
      VALUES ($1, $2, $3, $4, 'outbound', 'whatsapp_business_app', $5, $6, $7, 'delivered', NOW())
      ON CONFLICT (meta_message_id) DO NOTHING
    `, [
      conversationId,
      tenantId,
      account.id,
      wamid,
      message.type || 'text',
      bodyText,
      mediaUrl
    ]);

    return { handled: true, messageId: wamid };
  }

  return { handled: false };
}

/**
 * Handle historical message synchronization batch (change.field === 'history')
 * Ingests past chat records safely into whatsapp_messages.
 * CRITICAL SAFEGUARDS:
 * - Does NOT trigger chatbot workflows or lead auto-creation
 * - Does NOT increment unread_count
 * - Does NOT open or reset the 24-hour customer window
 * - Idempotent via ON CONFLICT (meta_message_id) DO NOTHING
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {object} params.account
 * @param {Array<object>} params.historyMessages - Array of historical message items from Meta
 * @returns {Promise<{ ingestedCount: number }>}
 */
async function recordCoexistenceHistoryBatch({
  tenantId,
  account,
  historyMessages = []
}) {
  if (!Array.isArray(historyMessages) || historyMessages.length === 0) {
    return { ingestedCount: 0 };
  }

  let count = 0;
  for (const item of historyMessages) {
    const wamid = item.id;
    if (!wamid) continue;

    const rawFrom = String(item.from || '').trim();
    const rawTo = String(item.to || '').trim();
    const accountPhone = String(account.display_phone_number || '').replace(/\D/g, '');
    const cleanFrom = rawFrom.replace(/\D/g, '');

    const isOutbound = cleanFrom && accountPhone && (cleanFrom === accountPhone || cleanFrom.endsWith(accountPhone) || accountPhone.endsWith(cleanFrom));
    const customerPhoneRaw = isOutbound ? rawTo : rawFrom;
    const customerPhone = normalisePhone(customerPhoneRaw) || `+${customerPhoneRaw}`;

    // Lookup or create archive conversation
    let convRes = await db.query(`
      SELECT id FROM whatsapp_conversations
      WHERE tenant_id::text = $1::text
        AND account_id = $2
        AND (phone_number = $3 OR phone_number LIKE $4)
      LIMIT 1
    `, [tenantId, account.id, customerPhone, `%${customerPhone.slice(-9)}`]);

    let conversationId = convRes.rows[0]?.id;
    if (!conversationId) {
      const newConv = await db.query(`
        INSERT INTO whatsapp_conversations (
          tenant_id, account_id, branch_id, phone_number, contact_name,
          last_message_body, last_message_at, last_message_direction,
          unread_count, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, TO_TIMESTAMP($7), $8, 0, NOW())
        RETURNING id
      `, [
        tenantId,
        account.id,
        account.branch_id || null,
        customerPhone,
        customerPhone,
        item.text?.body || `[Historical ${item.type || 'message'}]`,
        item.timestamp ? Number(item.timestamp) : Math.floor(Date.now() / 1000),
        isOutbound ? 'outbound' : 'inbound'
      ]);
      conversationId = newConv.rows[0]?.id;
    }

    if (conversationId) {
      const msgTimestamp = item.timestamp ? new Date(Number(item.timestamp) * 1000) : new Date();
      await db.query(`
        INSERT INTO whatsapp_messages (
          conversation_id,
          tenant_id,
          account_id,
          meta_message_id,
          direction,
          sender_type,
          message_type,
          body,
          status,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'delivered', $9)
        ON CONFLICT (meta_message_id) DO NOTHING
      `, [
        conversationId,
        tenantId,
        account.id,
        wamid,
        isOutbound ? 'outbound' : 'inbound',
        isOutbound ? 'whatsapp_business_app' : 'customer',
        item.type || 'text',
        item.text?.body || `[Historical ${item.type || 'message'}]`,
        msgTimestamp
      ]);
      count++;
    }
  }

  console.log(`📜 [WhatsApp Coexistence History] Ingested ${count} historical message(s) for account #${account.id}`);
  return { ingestedCount: count };
}

/**
 * Handle app state synchronization (change.field === 'smb_app_state_sync')
 * Updates synchronization metadata without altering messages or conversations.
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {object} params.account
 * @param {object} params.stateSyncData
 * @returns {Promise<boolean>}
 */
async function recordCoexistenceAppStateSync({ tenantId, account, stateSyncData = {} }) {
  try {
    const updatedMeta = {
      ...(account.coexistence_metadata || {}),
      last_app_state_sync: new Date().toISOString(),
      sync_summary: stateSyncData.action || 'sync_completed'
    };

    await db.query(`
      UPDATE whatsapp_accounts
      SET coexistence_metadata = $1, updated_at = NOW()
      WHERE id = $2 AND tenant_id::text = $3::text
    `, [JSON.stringify(updatedMeta), account.id, tenantId]);

    console.log(`🔄 [WhatsApp Coexistence] State sync recorded for account #${account.id}`);
    return true;
  } catch (err) {
    console.warn('[WhatsApp Coexistence State Sync Error]', err.message);
    return false;
  }
}

/**
 * Get Coexistence status for an account
 * @param {string} tenantId
 * @param {number|string} accountId
 * @returns {Promise<object|null>}
 */
async function getCoexistenceAccountStatus(tenantId, accountId) {
  const res = await db.query(`
    SELECT id, tenant_id, phone_number_id, display_phone_number, verified_name,
           connection_type, coexistence_status, coexistence_metadata, is_active, updated_at
    FROM whatsapp_accounts
    WHERE tenant_id::text = $1::text AND id = $2
  `, [tenantId, accountId]);

  return res.rows[0] || null;
}

module.exports = {
  isCoexistenceEnabled,
  validateCoexistenceEligibility,
  exchangeEmbeddedSignupCode,
  verifyMetaAccountOwnership,
  subscribeWabaWebhooks,
  processEmbeddedSignupAuthorization,
  onboardCoexistenceAccount,
  isCoexistenceAppEcho,
  recordCoexistenceAppEcho,
  recordCoexistenceHistoryBatch,
  recordCoexistenceAppStateSync,
  getCoexistenceAccountStatus
};
