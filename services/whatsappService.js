/**
 * WhatsApp Cloud API Service
 * Sends pre-approved WhatsApp template messages to new leads from Meta.
 *
 * Uses Meta's official WhatsApp Business Cloud API (free tier).
 * Phone numbers are normalized to E.164 format (default country: Egypt +20).
 *
 * Credentials are stored per-tenant in the `whatsapp_settings` table so
 * that each organisation can connect its own WhatsApp Business Number.
 */

const axios = require('axios');
const db = require('../config/db');

const WA_API_VERSION = 'v21.0';
const WA_BASE_URL = `https://graph.facebook.com/${WA_API_VERSION}`;

// ---------------------------------------------------------------------------
// Phone Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise an arbitrary phone string to E.164 format.
 * Default country calling code: +20 (Egypt)
 *
 * Examples:
 *   "01012345678"  →  "+201012345678"
 *   "+201012345678" →  "+201012345678"
 *   "1012345678"   →  "+201012345678"
 *   "+971501234567" → "+971501234567"  (already international — left as-is)
 *
 * @param {string} rawPhone
 * @param {string} defaultCountryCode  e.g. "20" for Egypt
 * @returns {string|null}  E.164 string or null if number is invalid/missing
 */
function normalisePhone(rawPhone, defaultCountryCode = '20') {
  if (!rawPhone) return null;

  // Strip everything except digits and the leading '+'
  let cleaned = String(rawPhone).replace(/[\s\-().]/g, '');

  if (!cleaned) return null;

  // Already has a '+' prefix  →  trust it
  if (cleaned.startsWith('+')) {
    return cleaned.length >= 8 ? cleaned : null;
  }

  // Leading "00" international dialling prefix
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
    return cleaned.length >= 8 ? cleaned : null;
  }

  // Leading zero that IS the country trunk prefix (e.g. Egyptian 011xxxxxxxx)
  if (cleaned.startsWith('0')) {
    cleaned = '+' + defaultCountryCode + cleaned.slice(1);
    return cleaned.length >= 8 ? cleaned : null;
  }

  // No prefix at all — assume default country
  cleaned = '+' + defaultCountryCode + cleaned;
  return cleaned.length >= 8 ? cleaned : null;
}

// ---------------------------------------------------------------------------
// Tenant Settings
// ---------------------------------------------------------------------------

/**
 * Fetch WhatsApp settings row for a tenant.
 * Returns null if not configured or not active.
 *
 * @param {string} tenantId
 * @returns {Promise<object|null>}
 */
async function getWhatsAppSettings(tenantId) {
  try {
    const result = await db.query(
      `SELECT phone_number_id, access_token, template_name,
              template_language_ar, template_language_en,
              send_arabic, send_english, default_country_code, is_active
       FROM whatsapp_settings
       WHERE tenant_id::text = $1::text`,
      [tenantId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return row.is_active ? row : null;
  } catch (err) {
    console.error('[WhatsApp] Failed to load settings:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Core API Call
// ---------------------------------------------------------------------------

/**
 * Attempt to resolve a Phone Number ID if the user accidentally provided
 * a WhatsApp Business Account ID (WABA ID).
 * 
 * Calls GET https://graph.facebook.com/v21.0/{id}/phone_numbers
 * Returns the first active phone number ID found, or null.
 */
async function resolveActualPhoneNumberId(idOrWabaId, accessToken) {
  if (!idOrWabaId || !accessToken) return null;
  try {
    const res = await axios.get(`${WA_BASE_URL}/${idOrWabaId}/phone_numbers`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000
    });
    const numbers = res.data?.data || [];
    if (numbers.length > 0 && numbers[0].id) {
      console.log(`💡 [WhatsApp] Successfully resolved WABA ID ${idOrWabaId} to Phone Number ID: ${numbers[0].id} (${numbers[0].display_phone_number || ''})`);
      return {
        phoneNumberId: numbers[0].id,
        displayPhoneNumber: numbers[0].display_phone_number,
        verifiedName: numbers[0].verified_name,
        allNumbers: numbers
      };
    }
  } catch (err) {
    console.log(`[WhatsApp] Failed to resolve phone numbers for ID ${idOrWabaId}:`, err.response?.data?.error?.message || err.message);
  }
  return null;
}

/**
 * Call the WhatsApp Cloud API to send a template message.
 *
 * @param {string} phoneNumberId   Meta Phone Number ID (from WhatsApp settings)
 * @param {string} accessToken     Permanent system-user token
 * @param {string} toPhone         E.164 formatted recipient number
 * @param {string} templateName    Pre-approved template name
 * @param {string} languageCode    e.g. 'ar', 'en_US'
 * @param {Array}  components      Template body parameters
 * @param {string} tenantId        Optional tenant UUID for auto-updating settings
 * @returns {Promise<{success: boolean, messageId: string|null, error: string|null, resolvedPhoneId?: string}>}
 */
async function callWhatsAppApi({ phoneNumberId, accessToken, toPhone, templateName, languageCode, components = [], tenantId = null }) {
  const targetPhoneId = (phoneNumberId || '').trim();

  const sendRequest = async (phoneId) => {
    const url = `${WA_BASE_URL}/${phoneId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: toPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 ? { components } : {})
      }
    };

    return axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
  };

  try {
    const response = await sendRequest(targetPhoneId);
    const messageId = response.data?.messages?.[0]?.id || null;
    console.log(`✅ [WhatsApp] Message sent to ${toPhone} | template: ${templateName} | lang: ${languageCode} | id: ${messageId}`);
    return { success: true, messageId, error: null, resolvedPhoneId: targetPhoneId };
  } catch (err) {
    const rawError = err.response?.data?.error;
    const apiError = rawError?.message || err.message;

    // Check if error is "Unsupported post request" (Object ID is a WABA ID, App ID, or invalid)
    if (apiError.includes('Unsupported post request') || (rawError?.code === 100 && rawError?.error_subcode === 33)) {
      console.warn(`⚠️ [WhatsApp] ID '${targetPhoneId}' rejected by Meta as not supporting /messages. Checking if it's a WABA ID...`);
      const resolved = await resolveActualPhoneNumberId(targetPhoneId, accessToken);
      if (resolved && resolved.phoneNumberId && resolved.phoneNumberId !== targetPhoneId) {
        console.log(`🔄 [WhatsApp] Retrying message send with resolved Phone Number ID: ${resolved.phoneNumberId}`);
        try {
          const retryRes = await sendRequest(resolved.phoneNumberId);
          const messageId = retryRes.data?.messages?.[0]?.id || null;
          console.log(`✅ [WhatsApp] Retry SUCCEEDED with Phone Number ID ${resolved.phoneNumberId}! Message ID: ${messageId}`);

          // Automatically fix in database if tenantId provided
          if (tenantId) {
            try {
              await db.query(
                `UPDATE whatsapp_settings SET phone_number_id = $1, updated_at = NOW() WHERE tenant_id::text = $2::text`,
                [resolved.phoneNumberId, tenantId]
              );
              console.log(`💾 [WhatsApp] Automatically updated database phone_number_id to ${resolved.phoneNumberId} for tenant ${tenantId}`);
            } catch (dbErr) {
              console.warn('[WhatsApp] Could not update DB phone_number_id:', dbErr.message);
            }
          }

          return { success: true, messageId, error: null, resolvedPhoneId: resolved.phoneNumberId };
        } catch (retryErr) {
          const retryApiErr = retryErr.response?.data?.error?.message || retryErr.message;
          return {
            success: false,
            messageId: null,
            error: `تم العثور على معرّف رقم الهاتف '${resolved.phoneNumberId}' (${resolved.displayPhoneNumber || ''})، ولكن تعذر الإرسال: ${retryApiErr}`
          };
        }
      }

      // If cannot auto-resolve, provide a clear, helpful explanation in Arabic and English
      return {
        success: false,
        messageId: null,
        error: `المعرّف '${targetPhoneId}' غير صالح لإرسال الرسائل مباشرة. هذا المعرّف يخص حساب واتساب للأعمال (WABA ID) وليس معرّف رقم الهاتف (Phone Number ID). يرجى فتح Meta Developers ثم الانتقال إلى: WhatsApp > API Setup ونسخ المعرّف الموجود تحت خانة "Phone number ID" ولصقه في الإعدادات.`
      };
    }

    console.error(`❌ [WhatsApp] Failed to send to ${toPhone}:`, apiError);
    return { success: false, messageId: null, error: apiError };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a WhatsApp welcome template message to a new lead.
 *
 * If the tenant has both Arabic and English templates enabled, TWO messages
 * are dispatched (one per language). A single failure does not block the other.
 *
 * The message body must contain exactly one variable placeholder {{1}} = customer name.
 *
 * @param {object} opts
 * @param {string} opts.phone        Raw phone string from the lead form
 * @param {string} opts.customerName Customer full name (substituted for {{1}})
 * @param {string} opts.tenantId     UUID of the tenant
 * @returns {Promise<{sent: boolean, results: Array}>}
 */
async function sendWelcomeMessage({ phone, customerName, tenantId }) {
  const settings = await getWhatsAppSettings(tenantId);

  if (!settings) {
    console.log('[WhatsApp] No active WhatsApp settings for tenant', tenantId, '— skipping.');
    return { sent: false, results: [] };
  }

  const e164 = normalisePhone(phone, settings.default_country_code || '20');
  if (!e164) {
    console.warn('[WhatsApp] Cannot normalise phone number:', phone, '— skipping.');
    return { sent: false, results: [] };
  }

  // Name fallback so the template placeholder is never blank
  const safeCustomerName = (customerName || '').trim() || 'عميلنا الكريم';

  // Template body parameter (position 1)
  const nameComponent = {
    type: 'body',
    parameters: [{ type: 'text', text: safeCustomerName }]
  };

  const results = [];

  // Arabic template
  if (settings.send_arabic && settings.template_language_ar) {
    const res = await callWhatsAppApi({
      phoneNumberId: settings.phone_number_id,
      accessToken: settings.access_token,
      toPhone: e164,
      templateName: settings.template_name,
      languageCode: settings.template_language_ar,
      tenantId,
      components: [nameComponent]
    });
    results.push({ language: settings.template_language_ar, ...res });
  }

  // English template
  if (settings.send_english && settings.template_language_en) {
    const res = await callWhatsAppApi({
      phoneNumberId: settings.phone_number_id,
      accessToken: settings.access_token,
      toPhone: e164,
      templateName: settings.template_name,
      languageCode: settings.template_language_en,
      tenantId,
      components: [nameComponent]
    });
    results.push({ language: settings.template_language_en, ...res });
  }

  const sent = results.length > 0 && results.some(r => r.success);
  return { sent, results };
}

/**
 * Send a single test WhatsApp message (used from the settings UI).
 *
 * @param {object} opts
 * @param {string} opts.phoneNumberId
 * @param {string} opts.accessToken
 * @param {string} opts.templateName
 * @param {string} opts.languageCode
 * @param {string} opts.toPhone        Raw phone string
 * @param {string} opts.defaultCountryCode
 * @param {string} opts.tenantId
 * @returns {Promise<{success: boolean, messageId: string|null, error: string|null, resolvedPhoneId?: string}>}
 */
async function sendTestMessage({ phoneNumberId, accessToken, templateName, languageCode, toPhone, defaultCountryCode = '20', tenantId = null }) {
  const e164 = normalisePhone(toPhone, defaultCountryCode);
  if (!e164) {
    return { success: false, messageId: null, error: 'Invalid phone number — could not convert to E.164 format' };
  }

  return callWhatsAppApi({
    phoneNumberId,
    accessToken,
    toPhone: e164,
    templateName,
    languageCode,
    tenantId,
    components: [{
      type: 'body',
      parameters: [{ type: 'text', text: 'Test Lead' }]
    }]
  });
}

module.exports = {
  sendWelcomeMessage,
  sendTestMessage,
  normalisePhone,
  getWhatsAppSettings,
  resolveActualPhoneNumberId
};
