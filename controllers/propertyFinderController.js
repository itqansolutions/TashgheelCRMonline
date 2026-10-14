const db = require('../config/db');
const crypto = require('crypto');
const PropertyFinderClient = require('../services/propertyFinderClient');
const propertyFinderSyncService = require('../services/propertyFinderSyncService');
const { encrypt, decrypt, maskSecret } = require('../utils/encryption');

/**
 * 🏢 Property Finder Integration Controller
 * Strictly enforces tenant context, credential encryption, and audit logging.
 */

// 1. Get Integration Settings
exports.getSettings = async (req, res) => {
  const tenantId = req.user?.tenant_id ? String(req.user.tenant_id) : null;
  if (!tenantId) {
    return res.status(400).json({ status: 'error', message: 'Tenant context missing.' });
  }

  try {
    const result = await db.query(
      `SELECT * FROM property_finder_settings WHERE tenant_id::text = $1::text`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      return res.json({
        status: 'success',
        data: {
          tenant_id: tenantId,
          environment: 'sandbox',
          country_code: 'EG',
          is_enabled: false,
          is_connected: false,
          listing_sync_enabled: true,
          lead_sync_enabled: true,
          auto_publish: false,
          has_credentials: false,
          api_key_masked: '',
          api_secret_masked: '',
          webhook_status: 'unregistered',
          last_sync_at: null,
          last_sync_status: 'never_run',
          last_error_message: null
        }
      });
    }

    const row = result.rows[0];
    const apiKeyDecrypted = row.api_key_encrypted ? decrypt(row.api_key_encrypted) : '';
    const apiSecretDecrypted = row.api_secret_encrypted ? decrypt(row.api_secret_encrypted) : '';

    res.json({
      status: 'success',
      data: {
        tenant_id: row.tenant_id,
        environment: row.environment,
        country_code: row.country_code || 'EG',
        is_enabled: row.is_enabled,
        is_connected: row.is_connected,
        listing_sync_enabled: row.listing_sync_enabled,
        lead_sync_enabled: row.lead_sync_enabled,
        auto_publish: row.auto_publish,
        has_credentials: Boolean(apiKeyDecrypted && apiSecretDecrypted),
        api_key_masked: maskSecret(apiKeyDecrypted),
        api_secret_masked: maskSecret(apiSecretDecrypted),
        webhook_status: row.webhook_status,
        webhook_subscription_id: row.webhook_subscription_id,
        default_assigned_to: row.default_assigned_to,
        default_lead_source_id: row.default_lead_source_id,
        last_sync_at: row.last_sync_at,
        last_sync_status: row.last_sync_status,
        last_error_message: row.last_error_message,
        created_at: row.created_at,
        updated_at: row.updated_at
      }
    });
  } catch (err) {
    console.error('[PF Settings Error]:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to retrieve integration settings.' });
  }
};

// 2. Save or Update Integration Settings
exports.saveSettings = async (req, res) => {
  const tenantId = req.user?.tenant_id ? String(req.user.tenant_id) : null;
  if (!tenantId) {
    return res.status(400).json({ status: 'error', message: 'Tenant context missing.' });
  }

  const {
    api_key,
    api_secret,
    environment,
    country_code,
    is_enabled,
    listing_sync_enabled,
    lead_sync_enabled,
    auto_publish,
    default_assigned_to,
    default_lead_source_id
  } = req.body;

  try {
    // Check existing settings
    const existing = await db.query(
      `SELECT * FROM property_finder_settings WHERE tenant_id::text = $1::text`,
      [tenantId]
    );

    const existingRow = existing.rows[0] || {};
    let encryptedKey = existingRow.api_key_encrypted || null;
    let encryptedSecret = existingRow.api_secret_encrypted || null;
    let encryptedWebhookSecret = existingRow.webhook_secret_encrypted || null;

    // Only update credentials if a non-masked value was submitted
    if (api_key && !api_key.includes('••••')) {
      encryptedKey = encrypt(api_key.trim());
    }
    if (api_secret && !api_secret.includes('••••')) {
      encryptedSecret = encrypt(api_secret.trim());
    }

    // Auto-generate webhook secret if missing
    if (!encryptedWebhookSecret) {
      const generatedWebhookSecret = crypto.randomBytes(24).toString('hex');
      encryptedWebhookSecret = encrypt(generatedWebhookSecret);
    }

    const finalEnvironment = environment !== undefined
      ? (environment === 'production' ? 'production' : 'sandbox')
      : (existingRow.environment || 'sandbox');
    const finalCountryCode = country_code !== undefined
      ? (country_code ? country_code.toUpperCase() : 'EG')
      : (existingRow.country_code || 'EG');
    const finalIsEnabled = is_enabled !== undefined
      ? Boolean(is_enabled)
      : (existingRow.is_enabled ?? false);
    const finalListingSync = listing_sync_enabled !== undefined
      ? Boolean(listing_sync_enabled)
      : (existingRow.listing_sync_enabled ?? true);
    const finalLeadSync = lead_sync_enabled !== undefined
      ? Boolean(lead_sync_enabled)
      : (existingRow.lead_sync_enabled ?? true);
    const finalAutoPublish = auto_publish !== undefined
      ? Boolean(auto_publish)
      : (existingRow.auto_publish ?? false);
    const finalAssignedTo = default_assigned_to !== undefined
      ? (default_assigned_to || null)
      : (existingRow.default_assigned_to || null);
    const finalLeadSourceId = default_lead_source_id !== undefined
      ? (default_lead_source_id || null)
      : (existingRow.default_lead_source_id || null);

    const upsertSql = `
      INSERT INTO property_finder_settings (
        tenant_id, api_key_encrypted, api_secret_encrypted, environment, country_code,
        is_enabled, listing_sync_enabled, lead_sync_enabled, auto_publish,
        webhook_secret_encrypted, default_assigned_to, default_lead_source_id, updated_at
      ) VALUES (
        $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP
      )
      ON CONFLICT (tenant_id) DO UPDATE SET
        api_key_encrypted = COALESCE($2, property_finder_settings.api_key_encrypted),
        api_secret_encrypted = COALESCE($3, property_finder_settings.api_secret_encrypted),
        environment = $4,
        country_code = $5,
        is_enabled = $6,
        listing_sync_enabled = $7,
        lead_sync_enabled = $8,
        auto_publish = $9,
        webhook_secret_encrypted = COALESCE($10, property_finder_settings.webhook_secret_encrypted),
        default_assigned_to = $11,
        default_lead_source_id = $12,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const result = await db.query(upsertSql, [
      tenantId,
      encryptedKey,
      encryptedSecret,
      finalEnvironment,
      finalCountryCode,
      finalIsEnabled,
      finalListingSync,
      finalLeadSync,
      finalAutoPublish,
      encryptedWebhookSecret,
      finalAssignedTo,
      finalLeadSourceId
    ]);

    await propertyFinderSyncService.logIntegrationEvent(
      tenantId,
      'settings_updated',
      'Property Finder integration configuration updated.'
    );

    res.json({
      status: 'success',
      message: 'Integration settings saved successfully.',
      data: {
        environment: finalEnvironment,
        country_code: finalCountryCode,
        is_enabled: finalIsEnabled,
        listing_sync_enabled: finalListingSync,
        lead_sync_enabled: finalLeadSync,
        is_connected: result.rows[0].is_connected
      }
    });
  } catch (err) {
    console.error('[PF Save Settings Error]:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to save integration settings.' });
  }
};

// 3. Test Connection
exports.testConnection = async (req, res) => {
  const tenantId = req.user?.tenant_id ? String(req.user.tenant_id) : null;
  if (!tenantId) {
    return res.status(400).json({ status: 'error', message: 'Tenant context missing.' });
  }

  try {
    const { client } = await propertyFinderSyncService.getClientForTenant(tenantId);
    const result = await client.testConnection();

    await db.query(
      `UPDATE property_finder_settings 
       SET is_connected = $1, last_error_message = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE tenant_id::text = $3::text`,
      [result.success, result.success ? null : result.message, tenantId]
    );

    await propertyFinderSyncService.logIntegrationEvent(
      tenantId,
      result.success ? 'connection_test_success' : 'connection_test_failed',
      result.message,
      null,
      result.success ? 'info' : 'warn'
    );

    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: result.message || 'Connection test failed with Property Finder.'
      });
    }

    res.json({
      status: 'success',
      data: result
    });
  } catch (err) {
    console.error('[PF Test Connection Error]:', err.message);
    await db.query(
      `UPDATE property_finder_settings 
       SET is_connected = false, last_error_message = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE tenant_id::text = $2::text`,
      [err.message, tenantId]
    );
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// 4. Safely Disconnect
exports.disconnect = async (req, res) => {
  const tenantId = req.user?.tenant_id ? String(req.user.tenant_id) : null;
  if (!tenantId) {
    return res.status(400).json({ status: 'error', message: 'Tenant context missing.' });
  }

  try {
    await db.query(
      `UPDATE property_finder_settings 
       SET is_connected = false, is_enabled = false, 
           api_key_encrypted = NULL, api_secret_encrypted = NULL,
           webhook_status = 'unregistered', updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id::text = $1::text`,
      [tenantId]
    );

    await propertyFinderSyncService.logIntegrationEvent(
      tenantId,
      'disconnected',
      'Property Finder account was disconnected safely. Local properties and leads were preserved.'
    );

    res.json({
      status: 'success',
      message: 'Property Finder account disconnected safely.'
    });
  } catch (err) {
    console.error('[PF Disconnect Error]:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to disconnect account.' });
  }
};

/**
 * Helper to map sync & operation errors to appropriate HTTP status codes.
 * Precondition / Configuration issues -> 400 Bad Request
 * Upstream Provider errors (RFC 7807) -> Upstream Status (401, 403, 422, etc.)
 * Internal / Unexpected errors -> 500 Internal Server Error
 */
function mapSyncErrorToResponse(err, res, context = 'Operation') {
  const msg = err.message || '';

  // Configuration & Precondition checks (Client/Tenant configuration error)
  if (
    msg.includes('currently disabled') ||
    msg.includes('not configured') ||
    msg.includes('credentials are missing') ||
    msg.includes('Lead sync is disabled')
  ) {
    return res.status(400).json({
      status: 'error',
      code: 'INTEGRATION_PRECONDITION_FAILED',
      message: msg
    });
  }

  // Upstream / API errors carrying HTTP status from PropertyFinderClient (e.g. 401, 403, 404, 429, 502)
  if (err.status && typeof err.status === 'number' && err.status >= 400 && err.status < 600) {
    return res.status(err.status).json({
      status: 'error',
      code: err.code || 'PROVIDER_API_ERROR',
      message: msg,
      details: err.details || null
    });
  }

  // Internal Server / Database / unexpected error
  return res.status(500).json({
    status: 'error',
    code: 'INTERNAL_SERVER_ERROR',
    message: msg
  });
}

// 5. Trigger Listing Import
exports.triggerImport = async (req, res) => {
  const tenantId = req.user?.tenant_id ? String(req.user.tenant_id) : null;
  if (!tenantId) {
    return res.status(400).json({ status: 'error', message: 'Tenant context missing.' });
  }

  try {
    const stats = await propertyFinderSyncService.importListings(tenantId, req.body || {});
    res.json({
      status: 'success',
      message: `Import completed: ${stats.created} units created, ${stats.linkedExisting} linked, ${stats.updated} updated.`,
      data: stats
    });
  } catch (err) {
    console.error('[PF Import Error]:', err.message);
    return mapSyncErrorToResponse(err, res, 'Listing Import');
  }
};

// 5b. Trigger Lead Poll (GET /leads) - complements webhooks
exports.triggerLeadSync = async (req, res) => {
  const tenantId = req.user?.tenant_id ? String(req.user.tenant_id) : null;
  if (!tenantId) {
    return res.status(400).json({ status: 'error', message: 'Tenant context missing.' });
  }

  try {
    const stats = await propertyFinderSyncService.pullLeads(tenantId, { fullBackfill: Boolean(req.body?.fullBackfill) });
    res.json({
      status: 'success',
      message: `Lead sync completed: ${stats.created} new, ${stats.duplicates} already imported, ${stats.errors.length} errors.`,
      data: stats
    });
  } catch (err) {
    console.error('[PF Lead Sync Error]:', err.message);
    return mapSyncErrorToResponse(err, res, 'Lead Sync');
  }
};

// 6. Publish Unit to Property Finder
exports.publishUnit = async (req, res) => {
  const tenantId = req.user?.tenant_id ? String(req.user.tenant_id) : null;
  const { unitId } = req.params;

  if (!tenantId || !unitId) {
    return res.status(400).json({ status: 'error', message: 'Tenant ID and Unit ID are required.' });
  }

  try {
    const result = await propertyFinderSyncService.publishUnit(tenantId, unitId);
    res.json({
      status: 'success',
      message: 'Unit successfully submitted to Property Finder.',
      data: result
    });
  } catch (err) {
    console.error('[PF Publish Error]:', err.message);
    res.status(400).json({
      status: 'error',
      message: err.message,
      validationErrors: err.validationErrors || null
    });
  }
};

// 7. Unpublish Unit from Property Finder
exports.unpublishUnit = async (req, res) => {
  const tenantId = req.user?.tenant_id ? String(req.user.tenant_id) : null;
  const { unitId } = req.params;

  if (!tenantId || !unitId) {
    return res.status(400).json({ status: 'error', message: 'Tenant ID and Unit ID are required.' });
  }

  try {
    const result = await propertyFinderSyncService.unpublishUnit(tenantId, unitId);
    res.json({
      status: 'success',
      message: 'Unit listing unpublished successfully.',
      data: result
    });
  } catch (err) {
    console.error('[PF Unpublish Error]:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// 8. Get Publication Status for a Unit
exports.getUnitPublicationStatus = async (req, res) => {
  const tenantId = req.user?.tenant_id ? String(req.user.tenant_id) : null;
  const { unitId } = req.params;

  if (!tenantId || !unitId) {
    return res.status(400).json({ status: 'error', message: 'Tenant ID and Unit ID are required.' });
  }

  try {
    const result = await db.query(
      `SELECT * FROM property_finder_listing_mappings 
       WHERE tenant_id::text = $1::text AND unit_id::text = $2::text`,
      [tenantId, unitId]
    );

    if (result.rows.length === 0) {
      return res.json({
        status: 'success',
        data: {
          publication_status: 'not_published',
          external_listing_id: null,
          portal_url: null,
          last_synced_at: null
        }
      });
    }

    res.json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// 9. Integration Logs
exports.getLogs = async (req, res) => {
  const tenantId = req.user?.tenant_id ? String(req.user.tenant_id) : null;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

  if (!tenantId) {
    return res.status(400).json({ status: 'error', message: 'Tenant context missing.' });
  }

  try {
    const result = await db.query(
      `SELECT * FROM property_finder_event_logs 
       WHERE tenant_id::text = $1::text 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [tenantId, limit]
    );

    res.json({
      status: 'success',
      data: result.rows || []
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// 10. Webhook Inbound Receiver (Public, Constant-Time HMAC Signature Check)
exports.handleWebhook = async (req, res) => {
  const tenantId = req.params?.tenantId || req.query?.tenant_id || req.headers['x-tenant-id'];
  const providerSignature = req.headers['x-pf-signature'] || req.headers['x-hub-signature-256'] || req.headers['x-signature'];
  const providerEventId = req.headers['x-pf-event-id'] || req.body?.event_id || `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  if (!tenantId) {
    return res.status(400).json({ status: 'error', message: 'Tenant identifier missing in webhook callback.' });
  }

  try {
    // 1. Fetch tenant webhook secret
    const settingsRes = await db.query(
      `SELECT webhook_secret_encrypted, is_enabled FROM property_finder_settings WHERE tenant_id::text = $1::text`,
      [tenantId]
    );

    if (settingsRes.rows.length === 0 || !settingsRes.rows[0].is_enabled) {
      return res.status(404).json({ status: 'error', message: 'Integration not active for target tenant.' });
    }

    const encryptedSecret = settingsRes.rows[0].webhook_secret_encrypted;
    const webhookSecret = encryptedSecret ? decrypt(encryptedSecret) : null;

    // 2. Mandatory authentication. Fail closed: with no secret configured we cannot authenticate the
    //    sender, so the request is rejected rather than allowing unauthenticated lead injection.
    // NOTE: HMAC-SHA256 over the raw body is OUR implemented scheme. We could not verify (docs are
    // partner-gated) that Property Finder signs deliveries this way or which header it uses; confirm at
    // the live smoke test and adjust here (header names / algorithm) if the provider differs.
    if (!webhookSecret) {
      console.warn(`[Property Finder Webhook] Rejected: no webhook secret configured for tenant ${tenantId}`);
      return res.status(401).json({ status: 'error', message: 'Webhook secret is not configured for this tenant.' });
    }
    {
      if (!providerSignature) {
        console.warn(`[Property Finder Webhook] Missing signature header rejected for tenant ${tenantId}`);
        return res.status(401).json({ status: 'error', message: 'Missing required webhook signature header.' });
      }

      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
      const expectedHash = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      const cleanHeader = providerSignature.replace(/^sha256=/, '');

      const expBuf = Buffer.from(expectedHash, 'hex');
      const sigBuf = Buffer.from(cleanHeader, 'hex');

      if (expBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expBuf, sigBuf)) {
        console.warn(`[Property Finder Webhook] Invalid signature rejected for tenant ${tenantId}`);
        return res.status(401).json({ status: 'error', message: 'Invalid webhook signature.' });
      }
    }

    // 3. Process Event Asynchronously
    const eventType = req.body?.event || req.body?.type || 'lead.created';
    const payload = req.body?.data || req.body;

    const result = await propertyFinderSyncService.processWebhookEvent(tenantId, providerEventId, eventType, payload);

    return res.status(200).json({
      status: 'success',
      received: true,
      eventId: providerEventId,
      state: result.status
    });
  } catch (err) {
    console.error('[Property Finder Webhook Error]:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to process webhook event.' });
  }
};
