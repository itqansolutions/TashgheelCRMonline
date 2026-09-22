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

const fs = require('fs');
const path = require('path');
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

  // Already starts with default country code or known country code (e.g. Meta sends '2011xxxxxxxx' or '9665xxxxxxxx')
  const knownPrefixes = [defaultCountryCode, '20', '966', '971', '965', '974', '968', '973', '962', '961', '964', '212', '213', '216', '249', '1'];
  for (const p of knownPrefixes) {
    if (cleaned.startsWith(p) && cleaned.length >= (p.length + 7)) {
      return '+' + cleaned;
    }
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
  if (!accessToken) return null;
  const cleanId = (idOrWabaId || '').trim();

  // 1. Try querying /phone_numbers on cleanId directly (if cleanId is a WABA ID)
  if (cleanId) {
    try {
      const res = await axios.get(`${WA_BASE_URL}/${cleanId}/phone_numbers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000
      });
      const numbers = res.data?.data || [];
      if (numbers.length > 0 && numbers[0].id) {
        console.log(`💡 [WhatsApp] Successfully resolved WABA ID ${cleanId} to Phone Number ID: ${numbers[0].id} (${numbers[0].display_phone_number || ''})`);
        return {
          phoneNumberId: numbers[0].id,
          displayPhoneNumber: numbers[0].display_phone_number,
          verifiedName: numbers[0].verified_name,
          allNumbers: numbers
        };
      }
    } catch (err) {
      console.log(`[WhatsApp] Direct /phone_numbers failed for ID ${cleanId}:`, err.response?.data?.error?.message || err.message);
    }

    // 1.5 If cleanId is a Phone Number ID, inspect it directly and discover parent WABA
    try {
      const directPhoneRes = await axios.get(`${WA_BASE_URL}/${cleanId}`, {
        params: { fields: 'id,display_phone_number,verified_name,code_verification_status,quality_rating,whatsapp_business_account' },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000
      });
      const p = directPhoneRes.data;
      if (p && p.id && p.display_phone_number) {
        console.log(`💡 [WhatsApp] Inspected Phone Number ID ${cleanId}: ${p.display_phone_number} (${p.verified_name || ''})`);
        let allNumbers = [{
          id: p.id,
          display_phone_number: p.display_phone_number,
          verified_name: p.verified_name || 'WhatsApp Business',
          quality_rating: p.quality_rating || 'UNKNOWN'
        }];

        const parentWabaId = p.whatsapp_business_account?.id;
        if (parentWabaId) {
          try {
            const wRes = await axios.get(`${WA_BASE_URL}/${parentWabaId}/phone_numbers`, {
              headers: { Authorization: `Bearer ${accessToken}` },
              timeout: 10000
            });
            const wNumbers = wRes.data?.data || [];
            if (wNumbers.length > 0) {
              allNumbers = wNumbers;
            }
          } catch (e) {
            console.warn(`[WhatsApp] Failed to query parent WABA ${parentWabaId} phone_numbers:`, e.message);
          }
        }

        return {
          phoneNumberId: p.id,
          displayPhoneNumber: p.display_phone_number,
          verifiedName: p.verified_name,
          wabaId: parentWabaId || null,
          allNumbers
        };
      }
    } catch (err) {
      console.log(`[WhatsApp] Direct phone inspect failed for ID ${cleanId}:`, err.response?.data?.error?.message || err.message);
    }
  }

  // 2. Discover via assigned_whatsapp_business_accounts
  try {
    const assignedRes = await axios.get(`${WA_BASE_URL}/me/assigned_whatsapp_business_accounts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000
    });
    const wabas = assignedRes.data?.data || [];
    for (const waba of wabas) {
      if (waba.id) {
        try {
          const pRes = await axios.get(`${WA_BASE_URL}/${waba.id}/phone_numbers`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 10000
          });
          const numbers = pRes.data?.data || [];
          if (numbers.length > 0 && numbers[0].id) {
            console.log(`💡 [WhatsApp] Successfully resolved via assigned WABA ${waba.id} to Phone Number ID: ${numbers[0].id} (${numbers[0].display_phone_number || ''})`);
            return {
              phoneNumberId: numbers[0].id,
              displayPhoneNumber: numbers[0].display_phone_number,
              verifiedName: numbers[0].verified_name,
              allNumbers: numbers
            };
          }
        } catch (e) {}
      }
    }
  } catch (err) {}

  // 3. Discover via client_whatsapp_business_accounts
  try {
    const clientRes = await axios.get(`${WA_BASE_URL}/me/client_whatsapp_business_accounts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000
    });
    const clientWabas = clientRes.data?.data || [];
    for (const waba of clientWabas) {
      if (waba.id) {
        try {
          const pRes = await axios.get(`${WA_BASE_URL}/${waba.id}/phone_numbers`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 10000
          });
          const numbers = pRes.data?.data || [];
          if (numbers.length > 0 && numbers[0].id) {
            console.log(`💡 [WhatsApp] Successfully resolved via client WABA ${waba.id} to Phone Number ID: ${numbers[0].id} (${numbers[0].display_phone_number || ''})`);
            return {
              phoneNumberId: numbers[0].id,
              displayPhoneNumber: numbers[0].display_phone_number,
              verifiedName: numbers[0].verified_name,
              allNumbers: numbers
            };
          }
        } catch (e) {}
      }
    }
  } catch (err) {}

  return null;
}

// In-memory cache for resolved template component structure to avoid retry roundtrips
// Key: `${tenantId || 'global'}:${templateName}` -> 'header' | 'body' | 'header_body' | 'none'
const templateVariantCache = new Map();

/**
 * Low-level call to Meta's WhatsApp Cloud API messages endpoint.
 *
 * @param {object} opts
 * @param {string} opts.phoneNumberId
 * @param {string} opts.accessToken
 * @param {string} opts.toPhone         E.164 normalised number (+201...)
 * @param {string} opts.templateName    Pre-approved template name
 * @param {string} opts.languageCode    e.g. 'ar', 'en_US'
 * @param {Array}  opts.components      Template body parameters
 * @param {string} opts.tenantId        Optional tenant UUID for auto-updating settings
 * @returns {Promise<{success: boolean, messageId: string|null, error: string|null, resolvedPhoneId?: string}>}
 */
async function callWhatsAppApi({ phoneNumberId, accessToken, toPhone, templateName, languageCode, components = [], tenantId = null }) {
  const targetPhoneId = (phoneNumberId || '').trim();
  const cacheKey = `${tenantId || 'global'}:${(templateName || '').trim()}`;
  const cachedVariant = templateVariantCache.get(cacheKey);

  // If we already know this template's component structure, prepare it directly
  let initialComponents = components;
  if (cachedVariant && components && components.length > 0) {
    const textVal = components[0]?.parameters?.[0]?.text || toPhone;
    if (cachedVariant === 'header') {
      initialComponents = [{ type: 'header', parameters: [{ type: 'text', text: textVal }] }];
    } else if (cachedVariant === 'body') {
      initialComponents = [{ type: 'body', parameters: [{ type: 'text', text: textVal }] }];
    } else if (cachedVariant === 'header_body') {
      initialComponents = [
        { type: 'header', parameters: [{ type: 'text', text: textVal }] },
        { type: 'body', parameters: [{ type: 'text', text: textVal }] }
      ];
    } else if (cachedVariant === 'none') {
      initialComponents = [];
    }
  }

  const sendRequest = async (phoneId, customComponents = initialComponents, customLang = languageCode) => {
    const url = `${WA_BASE_URL}/${phoneId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: toPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: customLang },
        ...(customComponents && customComponents.length > 0 ? { components: customComponents } : {})
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

    // 1. Check if error is parameter mismatch (Code 132000 or "number of parameters does not match")
    // e.g. Variable is in HEADER instead of BODY (like: أهلاً / {{1}}), or no variables
    if (rawError?.code === 132000 || apiError.includes('number of parameters') || apiError.includes('expected number of params') || apiError.includes('param')) {
      console.warn(`⚠️ [WhatsApp] Parameter mismatch for '${templateName}'. Auto-adapting (Header vs Body vs None)...`);
      const extractedName = components?.[0]?.parameters?.[0]?.text?.trim() || toPhone;
      const headerComp = { type: 'header', parameters: [{ type: 'text', text: extractedName }] };
      const bodyComp = { type: 'body', parameters: [{ type: 'text', text: extractedName }] };

      const variations = [
        { type: 'header', comps: [headerComp] },            // Case 1: Variable in Header only (e.g. أهلاً أ/ {{1}})
        { type: 'header_body', comps: [headerComp, bodyComp] },  // Case 2: Variables in both Header and Body
        { type: 'none', comps: [] },                      // Case 3: Template without variables
        { type: 'body', comps: [bodyComp] }               // Case 4: Variable in Body only
      ];

      for (const variant of variations) {
        try {
          const vRes = await sendRequest(targetPhoneId, variant.comps);
          const msgId = vRes.data?.messages?.[0]?.id || null;
          console.log(`✅ [WhatsApp] Auto-adaptation SUCCEEDED with variant '${variant.type}'! ID: ${msgId}`);
          templateVariantCache.set(cacheKey, variant.type);
          return { success: true, messageId: msgId, error: null, resolvedPhoneId: targetPhoneId };
        } catch (vErr) {
          // continue testing
        }
      }
    }

    // 2. Check if error is language mismatch or template does not exist (Code 132001)
    if (rawError?.code === 132001 || apiError.includes('does not exist in') || apiError.includes('language')) {
      const isHello = templateName?.toLowerCase().trim() === 'hello_world';

      // Special case: hello_world only exists in en_US and has NO parameters
      if (isHello) {
        try {
          const hwRes = await sendRequest(targetPhoneId, [], 'en_US');
          const msgId = hwRes.data?.messages?.[0]?.id || null;
          console.log(`✅ [WhatsApp] Succeeded with hello_world (en_US, no params)! ID: ${msgId}`);
          return { success: true, messageId: msgId, error: null, resolvedPhoneId: targetPhoneId };
        } catch (hwErr) {}
      }

      // Try fallback languages with all component variations (no params, 1 body param, 1 header param, 2 body params)
      const fallbackLanguages = languageCode === 'en_US' ? ['en', 'en_GB', 'ar', 'ar_EG'] :
                                languageCode === 'en'    ? ['en_US', 'en_GB', 'ar', 'ar_EG'] :
                                languageCode.startsWith('ar') ? ['ar_EG', 'ar_SA', 'ar', 'en', 'en_US'] :
                                ['en', 'en_US', 'ar'];

      const extractedName = components?.[0]?.parameters?.[0]?.text || 'عميلنا الكريم';
      const testVariants = [
        components && components.length > 0 ? components : [{ type: 'header', parameters: [{ type: 'text', text: extractedName }] }],
        [{ type: 'header', parameters: [{ type: 'text', text: extractedName }] }],
        [{ type: 'body', parameters: [{ type: 'text', text: extractedName }] }],
        [
          { type: 'header', parameters: [{ type: 'text', text: extractedName }] },
          { type: 'body', parameters: [{ type: 'text', text: extractedName }] }
        ],
        []
      ];

      console.warn(`⚠️ [WhatsApp] Template/Language mismatch for '${templateName}' (${languageCode}). Testing fallback combinations...`);
      
      for (const altLang of fallbackLanguages) {
        for (const compVariant of testVariants) {
          try {
            const lRes = await sendRequest(targetPhoneId, compVariant, altLang);
            const msgId = lRes.data?.messages?.[0]?.id || null;
            console.log(`✅ [WhatsApp] Succeeded with auto-adapted language '${altLang}'! ID: ${msgId}`);

            if (tenantId) {
              const langCol = altLang.startsWith('ar') ? 'template_language_ar' : 'template_language_en';
              await db.query(
                `UPDATE whatsapp_settings SET ${langCol} = $1, updated_at = NOW() WHERE tenant_id::text = $2::text`,
                [altLang, tenantId]
              ).catch(() => {});
            }

            return { success: true, messageId: msgId, error: null, resolvedPhoneId: targetPhoneId, resolvedLanguage: altLang };
          } catch (lErr) {
            // continue testing
          }
        }
      }

      // If still failing, query Meta for available templates and list them in the error message
      let availableTemplatesMsg = '';
      try {
        const tResult = await fetchApprovedTemplates({ phoneNumberId: targetPhoneId, accessToken });
        if (tResult.success && tResult.templates && tResult.templates.length > 0) {
          const approved = tResult.templates.filter(t => t.status === 'APPROVED');
          if (approved.length > 0) {
            const list = approved.map(t => `'${t.name}' (${t.language})`).join('، ');
            availableTemplatesMsg = ` القوالب المعتمدة (APPROVED) في حسابك على Meta هي: ${list}.`;
          } else {
            availableTemplatesMsg = ` لا توجد قوالب معتمدة (APPROVED) في حسابك على Meta حالياً. القوالب الموجودة في حسابك: ${tResult.templates.map(t => `'${t.name}' (${t.status})`).join('، ')}.`;
          }
        }
      } catch (e) {}

      return {
        success: false,
        messageId: null,
        error: `Meta رفضت القالب '${templateName}' باللغة '${languageCode}' (Error #132001: اسم القالب أو لغته غير مسجلة في Meta).${availableTemplatesMsg} يرجى التأكد من كتابة اسم القالب ولغته بنفس حالة الأحرف بالضبط، أو اضغط على "جلب القوالب من Meta".`
      };
    }

    // 3. Check if error is "Unsupported post request" (Object ID is a WABA ID, App ID, or invalid)
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

      // If cannot auto-resolve, diagnose the exact cause with Meta
      let specificHint = '';
      try {
        const dbg = await axios.get(`https://graph.facebook.com/debug_token`, {
          params: { input_token: accessToken, access_token: accessToken },
          timeout: 8000
        });
        const d = dbg.data?.data;
        if (d) {
          if (String(d.app_id) === String(targetPhoneId)) {
            specificHint = `المعرّف '${targetPhoneId}' هو معرّف التطبيق (App ID) وليس معرّف رقم الهاتف (Phone Number ID)! يرجى الذهاب إلى لوحة Meta for Developers > تطبيقك > WhatsApp > API Setup ونسخ 'Phone number ID' (الموجود أسفل خانة Phone number وليس App ID).`;
          } else if (d.scopes && !d.scopes.includes('whatsapp_business_messaging')) {
            specificHint = `التوكن المستخدم لا يملك صلاحية 'whatsapp_business_messaging' لإرسال الرسائل. يرجى إعادة إنشاء التوكن مع تفعيل هذه الصلاحية.`;
          }
        }
      } catch (dbgErr) {}

      return {
        success: false,
        messageId: null,
        error: specificHint || `Meta رفضت الطلب للمعرّف '${targetPhoneId}'. إذا كان هذا هو معرّف رقم هاتفك الفعلي، فالسبب هو أن الـ Access Token المستخدم لا يملك صلاحية للوصول إلى هذا الرقم أو تم إنشاؤه لتطبيق/حساب تجاري مختلف. تأكد من ربط حساب واتساب بالـ System User في إعدادات Business Settings وإعطائه صلاحية whatsapp_business_messaging.`
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

  // Name fallback: customer registered name or phone number if not registered/empty
  const safeCustomerName = (customerName && customerName.trim() && customerName.trim() !== 'Meta Lead')
    ? customerName.trim()
    : phone;

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
 * @param {string} opts.customerName   Optional resolved customer name
 * @param {string} opts.defaultCountryCode
 * @param {string} opts.tenantId
 * @returns {Promise<{success: boolean, messageId: string|null, error: string|null, resolvedPhoneId?: string}>}
 */
async function sendTestMessage({ phoneNumberId, accessToken, templateName, languageCode, toPhone, customerName = null, defaultCountryCode = '20', tenantId = null }) {
  const e164 = normalisePhone(toPhone, defaultCountryCode);
  if (!e164) {
    return { success: false, messageId: null, error: 'Invalid phone number — could not convert to E.164 format' };
  }

  // If template is hello_world, Meta expects NO parameters and en_US language!
  const isHelloWorld = templateName?.toLowerCase().trim() === 'hello_world';
  // Use registered customer name, or fallback to the phone number if unregistered
  const effectiveName = (customerName && customerName.trim() && customerName.trim() !== 'Meta Lead')
    ? customerName.trim()
    : toPhone;

  const components = isHelloWorld ? [] : [{
    type: 'body',
    parameters: [{ type: 'text', text: effectiveName }]
  }];
  const effectiveLang = isHelloWorld ? 'en_US' : languageCode;

  return callWhatsAppApi({
    phoneNumberId,
    accessToken,
    toPhone: e164,
    templateName,
    languageCode: effectiveLang,
    tenantId,
    components
  });
}

/**
 * Discover approved message templates from Meta WABA account.
 */
async function fetchApprovedTemplates({ phoneNumberId, accessToken, wabaIdInput = null }) {
  if (!accessToken) return { success: false, error: 'Access token required' };
  const targetPhoneId = (phoneNumberId || '').trim();

  let wabaId = (wabaIdInput || '').trim() || null;
  let appId = null;

  // 1. Inspect debug_token to get app_id and extract real WABA ID from WhatsApp granular_scopes
  try {
    const dbgRes = await axios.get(`https://graph.facebook.com/debug_token`, {
      params: { input_token: accessToken, access_token: accessToken },
      timeout: 10000
    });
    const d = dbgRes.data?.data;
    appId = d?.app_id;

    // If wabaIdInput was accidentally the App ID or Phone Number ID, ignore it
    if (wabaId && (String(wabaId) === String(appId) || String(wabaId) === String(targetPhoneId))) {
      wabaId = null;
    }

    if (!wabaId && d?.granular_scopes) {
      for (const gs of d.granular_scopes) {
        // Look specifically for whatsapp_business_management (which attaches to WABA ID)
        if (gs.scope === 'whatsapp_business_management' || gs.scope === 'whatsapp_business_messaging') {
          if (gs.target_ids && gs.target_ids.length > 0) {
            for (const tid of gs.target_ids) {
              if (String(tid) !== String(appId) && String(tid) !== String(targetPhoneId)) {
                wabaId = tid;
                console.log(`💡 [WhatsApp] Extracted real WABA ID from ${gs.scope}: ${wabaId}`);
                break;
              }
            }
          }
        }
        if (wabaId) break;
      }
    }
  } catch (err) {
    console.log('[WhatsApp] Could not inspect granular_scopes:', err.message);
  }

  // 2. Try resolving WABA ID from Phone Number ID (only if not matching App ID)
  if (!wabaId && targetPhoneId && String(targetPhoneId) !== String(appId)) {
    try {
      const pRes = await axios.get(`${WA_BASE_URL}/${targetPhoneId}?fields=whatsapp_business_account`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000
      });
      const resolved = pRes.data?.whatsapp_business_account?.id;
      if (resolved && String(resolved) !== String(appId)) {
        wabaId = resolved;
      }
    } catch (err) {
      console.log('[WhatsApp] Could not get WABA ID directly from phone number:', err.response?.data?.error?.message || err.message);
    }
  }

  // 3. If not found, try assigned_whatsapp_business_accounts
  if (!wabaId) {
    try {
      const assignedRes = await axios.get(`${WA_BASE_URL}/me/assigned_whatsapp_business_accounts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000
      });
      const wabas = assignedRes.data?.data || [];
      for (const w of wabas) {
        if (w.id && String(w.id) !== String(appId)) {
          wabaId = w.id;
          break;
        }
      }
    } catch (err) {}
  }

  // 4. If still not found, try client_whatsapp_business_accounts
  if (!wabaId) {
    try {
      const clientRes = await axios.get(`${WA_BASE_URL}/me/client_whatsapp_business_accounts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000
      });
      const clientWabas = clientRes.data?.data || [];
      for (const w of clientWabas) {
        if (w.id && String(w.id) !== String(appId)) {
          wabaId = w.id;
          break;
        }
      }
    } catch (err) {}
  }

  if (!wabaId) {
    return {
      success: false,
      error: 'تعذر تحديد معرّف حساب واتساب التجاري (WABA ID) تلقائياً. يرجى نسخه من لوحة تحكم Meta Developers تحت: WhatsApp > API Setup > "WhatsApp Business Account ID" ووضعه في خانة WABA ID بالأعلى.'
    };
  }

  // Fetch templates from WABA
  try {
    const tRes = await axios.get(`${WA_BASE_URL}/${wabaId}/message_templates`, {
      params: {
        fields: 'id,name,status,language,category,components',
        limit: 100
      },
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 12000
    });
    const allTemplates = tRes.data?.data || [];
    return {
      success: true,
      wabaId,
      templates: allTemplates
    };
  } catch (err) {
    const rawErr = err.response?.data?.error;
    const errMsg = rawErr?.message || err.message;
    if (errMsg.includes('Tried accessing nonexisting field') || rawErr?.code === 100) {
      return {
        success: false,
        error: `المعرّف '${wabaId}' ليس معرّف حساب واتساب تجاري (WABA ID). يرجى نسخ المعرّف الموجود في صفحة API Setup تحت خانة "WhatsApp Business Account ID".`
      };
    }
    return {
      success: false,
      error: `فشل جلب القوالب من Meta: ${errMsg}`
    };
  }
}

/**
 * Perform a deep diagnostic test of the WhatsApp credentials and permissions.
 *
 * Checks:
 * 1. Is access token set and valid?
 * 2. Token debug info (App ID, scopes, expiry, user type)
 * 3. Phone Number ID accessibility (can the token read this phone number?)
 */
async function diagnoseWhatsAppConnection(tenantId) {
  const settings = await getWhatsAppSettings(tenantId);
  if (!settings) {
    return {
      status: 'error',
      message: 'لم يتم حفظ أي إعدادات لواتساب لهذا الحساب حتى الآن.'
    };
  }

  const { phone_number_id, access_token, template_name } = settings;

  if (!access_token) {
    return {
      status: 'error',
      message: 'لم يتم العثور على Access Token محفوظ في النظام. يرجى إدخال التوكن والضغط على حفظ.'
    };
  }

  const report = {
    phoneNumberId: phone_number_id,
    templateName: template_name,
    tokenValid: false,
    tokenInfo: null,
    phoneAccessible: false,
    phoneDetails: null,
    steps: []
  };

  // Step 1: Check token validity via /debug_token or /me
  try {
    const debugRes = await axios.get(`https://graph.facebook.com/debug_token`, {
      params: { input_token: access_token, access_token: access_token },
      timeout: 10000
    });
    const d = debugRes.data?.data;
    report.tokenValid = d?.is_valid || false;
    report.tokenInfo = {
      appId: d?.app_id,
      application: d?.application,
      type: d?.type,
      scopes: d?.scopes || [],
      expiresAt: d?.expires_at ? new Date(d.expires_at * 1000).toLocaleString('ar-EG') : 'دائم (Permanent)'
    };
    report.steps.push({
      step: 'التحقق من التوكن (Token Validation)',
      status: 'success',
      detail: `التوكن صالح وتابع للتطبيق: ${d?.application || d?.app_id || 'Meta App'} | نوع التوكن: ${d?.type || 'User'} | الصلاحيات: ${(d?.scopes || []).join(', ') || 'لا توجد صلاحيات'}`
    });
  } catch (tErr) {
    try {
      const meRes = await axios.get(`${WA_BASE_URL}/me`, {
        headers: { Authorization: `Bearer ${access_token}` },
        timeout: 10000
      });
      report.tokenValid = true;
      report.tokenInfo = meRes.data;
      report.steps.push({
        step: 'التحقق من التوكن (Token Validation)',
        status: 'success',
        detail: `التوكن متصل بنجاح مع Meta`
      });
    } catch (meErr) {
      const errDetail = tErr.response?.data?.error?.message || tErr.message;
      report.steps.push({
        step: 'التحقق من التوكن (Token Validation)',
        status: 'failed',
        detail: `التوكن غير صالح أو منتهي الصلاحية: ${errDetail}`
      });
      return {
        status: 'error',
        message: `التوكن غير صالح في Meta: ${errDetail}`,
        report
      };
    }
  }

  // Step 2: Try to inspect the Phone Number ID directly
  if (phone_number_id) {
    if (report.tokenInfo?.appId && String(report.tokenInfo.appId) === String(phone_number_id).trim()) {
      report.steps.push({
        step: 'التحقق من معرّف رقم الهاتف (Phone Number ID)',
        status: 'failed',
        detail: `المعرّف المدخل (${phone_number_id}) هو معرّف التطبيق (App ID) وليس معرّف رقم الهاتف! يرجى نسخه من لوحة تحكم Meta Developers تحت: WhatsApp > API Setup > Phone number ID.`
      });
    } else {
      try {
        const phoneRes = await axios.get(`${WA_BASE_URL}/${phone_number_id}`, {
          params: { fields: 'id,display_phone_number,verified_name,code_verification_status,quality_rating' },
          headers: { Authorization: `Bearer ${access_token}` },
          timeout: 10000
        });
        report.phoneAccessible = true;
        report.phoneDetails = phoneRes.data;
        report.steps.push({
          step: 'التحقق من معرّف رقم الهاتف (Phone Number ID)',
          status: 'success',
          detail: `تم التحقق بنجاح! الرقم: ${phoneRes.data.display_phone_number} (${phoneRes.data.verified_name || ''}) - حالة التحقق: ${phoneRes.data.code_verification_status || 'OK'}`
        });
      } catch (pErr) {
        const pErrMsg = pErr.response?.data?.error?.message || pErr.message;
        const pErrCode = pErr.response?.data?.error?.code;

        // Try to discover phone numbers
        const discovered = await resolveActualPhoneNumberId(phone_number_id, access_token);
        if (discovered && discovered.phoneNumberId) {
          report.steps.push({
            step: 'التحقق من معرّف رقم الهاتف (Phone Number ID)',
            status: 'warning',
            detail: `المعرّف (${phone_number_id}) هو معرّف حساب تجاري (WABA ID). تم العثور على رقم الهاتف التابع له: ${discovered.displayPhoneNumber} (معرّف الهاتف: ${discovered.phoneNumberId}). يمكنك الضغط على "جلب أرقام الهواتف" لاختياره مباشرة.`
          });
        } else {
          report.steps.push({
            step: 'التحقق من معرّف رقم الهاتف (Phone Number ID)',
            status: 'failed',
            detail: `لا يمكن لهذا التوكن الوصول إلى معرّف الرقم (${phone_number_id}): ${pErrMsg} (Code: ${pErrCode})`
          });
        }
      }
    }
  }

  return {
    status: report.phoneAccessible ? 'success' : 'warning',
    report
  };
}

/**
 * Broadcast a WhatsApp template campaign to multiple recipients.
 * Handles phone normalization, API rate-limiting delays, and detailed logging.
 */
async function broadcastWhatsAppCampaign({
  tenantId,
  campaignId,
  templateName,
  languageCode,
  recipients = [], // Array of { customerId, name, phone }
  customParam = null,
  userId = null
}) {
  const settings = await getWhatsAppSettings(tenantId);
  if (!settings) {
    throw new Error('WhatsApp settings not configured for this organization');
  }

  const { phone_number_id, access_token, default_country_code } = settings;
  if (!phone_number_id || !access_token) {
    throw new Error('Active Phone Number ID and Access Token are required');
  }

  // Resolve active/default account_id for proper chat association
  let resolvedAccountId = null;
  try {
    const accRes = await db.query(`
      SELECT id FROM whatsapp_accounts
      WHERE tenant_id::text = $1::text 
      ORDER BY (phone_number_id = $2) DESC, is_default DESC, id ASC
      LIMIT 1
    `, [tenantId, phone_number_id]);
    if (accRes.rows.length > 0) resolvedAccountId = accRes.rows[0].id;
  } catch (e) {
    console.warn('[broadcastWhatsAppCampaign account lookup warning]', e.message);
  }

  const isHelloWorld = templateName?.toLowerCase().trim() === 'hello_world';
  const effectiveLang = isHelloWorld ? 'en_US' : (languageCode || 'en');

  let successCount = 0;
  let failedCount = 0;
  const logs = [];

  for (const recipient of recipients) {
    const rawPhone = recipient.phone;
    const normPhone = normalisePhone(rawPhone, default_country_code || '20');

    if (!normPhone) {
      failedCount++;
      const errReason = 'Invalid phone number format';
      logs.push({
        campaign_id: campaignId,
        customer_id: recipient.customerId || null,
        customer_name: recipient.name || 'Unknown',
        phone: rawPhone || 'N/A',
        status: 'failed',
        error_message: errReason
      });

      // Save recipient log to db
      try {
        await db.query(`
          INSERT INTO whatsapp_campaign_recipients 
            (campaign_id, customer_id, customer_name, phone, status, error_message)
          VALUES ($1, $2, $3, $4, 'failed', $5)
        `, [campaignId, recipient.customerId || null, recipient.name || 'Unknown', rawPhone || 'N/A', errReason]);
      } catch (e) {
        console.error('[WhatsApp Campaign] DB Recipient Log Insert Error:', e.message);
      }
      continue;
    }

    // Prepare components
    let components = [];
    if (!isHelloWorld) {
      // 1. Registered customer name takes priority
      let recipientName = (recipient.name || '').trim();
      if (!recipientName || recipientName.toLowerCase() === 'meta lead') {
        // 2. Fallback to customParam if provided, otherwise recipient's phone number
        recipientName = (customParam || '').trim() || recipient.phone || rawPhone;
      }
      components = [{
        type: 'body',
        parameters: [{ type: 'text', text: recipientName }]
      }];
    }

    try {
      const result = await callWhatsAppApi({
        phoneNumberId: phone_number_id,
        accessToken: access_token,
        toPhone: normPhone,
        templateName,
        languageCode: effectiveLang,
        tenantId,
        components
      });

      if (result.success) {
        successCount++;
        const messageId = result.messageId || null;
        await db.query(`
          INSERT INTO whatsapp_campaign_recipients 
            (campaign_id, customer_id, customer_name, phone, status, message_id, sent_at)
          VALUES ($1, $2, $3, $4, 'sent', $5, NOW())
        `, [campaignId, recipient.customerId || null, recipient.name || '', normPhone, messageId]);

        // Mirror campaign message into WhatsApp Chat Conversation
        try {
          const rawStr = String(rawPhone || '').trim();
          const phoneVariants = Array.from(new Set([
            normPhone,
            rawStr,
            `+${rawStr}`,
            rawStr ? rawStr.replace(/^\+/, '') : null,
            normPhone.replace(/^\+/, ''),
            normPhone.startsWith('+20') ? `0${normPhone.slice(3)}` : null
          ].filter(Boolean)));

          let convId = null;
          const existingConv = await db.query(`
            SELECT id, contact_name, customer_id FROM whatsapp_conversations
            WHERE tenant_id::text = $1::text 
              AND phone_number = ANY($2::text[])
            ORDER BY last_message_at DESC NULLS LAST
            LIMIT 1
          `, [tenantId, phoneVariants]);

          const campaignMsgBody = `[Campaign: ${templateName}]`;

          if (existingConv.rows.length > 0) {
            convId = existingConv.rows[0].id;
            await db.query(`
              UPDATE whatsapp_conversations
              SET last_message_body = $1,
                  last_message_at = NOW(),
                  last_message_direction = 'outbound',
                  account_id = COALESCE(whatsapp_conversations.account_id, $2),
                  customer_id = COALESCE(whatsapp_conversations.customer_id, $3),
                  contact_name = COALESCE(whatsapp_conversations.contact_name, $4),
                  updated_at = NOW()
              WHERE id = $5
            `, [campaignMsgBody, resolvedAccountId, recipient.customerId || null, recipient.name || null, convId]);
          } else {
            const newConv = await db.query(`
              INSERT INTO whatsapp_conversations (
                tenant_id, account_id, phone_number, contact_name, customer_id,
                last_message_body, last_message_at, last_message_direction,
                unread_count, created_at, updated_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'outbound', 0, NOW(), NOW())
              RETURNING id
            `, [
              tenantId,
              resolvedAccountId,
              normPhone,
              recipient.name || normPhone,
              recipient.customerId || null,
              campaignMsgBody
            ]);
            convId = newConv.rows[0]?.id;
          }

          if (convId) {
            await db.query(`
              INSERT INTO whatsapp_messages (
                conversation_id, tenant_id, account_id, meta_message_id,
                direction, sender_type, sender_id, message_type, body, template_name, status, created_at
              )
              VALUES ($1, $2, $3, $4, 'outbound', 'system', $5, 'template', $6, $7, 'sent', NOW())
              ON CONFLICT (meta_message_id) DO NOTHING
            `, [
              convId,
              tenantId,
              resolvedAccountId,
              messageId,
              userId || null,
              campaignMsgBody,
              templateName
            ]);
          }
        } catch (chatErr) {
          console.warn('[WhatsApp Campaign Chat Mirror Error]:', chatErr.message);
        }
      } else {
        failedCount++;
        await db.query(`
          INSERT INTO whatsapp_campaign_recipients 
            (campaign_id, customer_id, customer_name, phone, status, error_message)
          VALUES ($1, $2, $3, $4, 'failed', $5)
        `, [campaignId, recipient.customerId || null, recipient.name || '', normPhone, result.error || 'Failed to send']);
      }
    } catch (sendErr) {
      failedCount++;
      const errMsg = sendErr.response?.data?.error?.message || sendErr.message;
      await db.query(`
        INSERT INTO whatsapp_campaign_recipients 
          (campaign_id, customer_id, customer_name, phone, status, error_message)
        VALUES ($1, $2, $3, $4, 'failed', $5)
      `, [campaignId, recipient.customerId || null, recipient.name || '', normPhone, errMsg]);
    }

    // Small delay to respect WhatsApp API rate limits
    await new Promise(r => setTimeout(r, 120));
  }

  // Update campaign summary
  await db.query(`
    UPDATE whatsapp_campaigns
    SET successful_count = $1,
        failed_count = $2,
        status = 'completed'
    WHERE id = $3
  `, [successCount, failedCount, campaignId]);

  return {
    success: true,
    total: recipients.length,
    successfulCount: successCount,
    failedCount
  };
}

// ---------------------------------------------------------------------------
// Direct Free-Form Text Messaging (Within 24h Customer Service Window)
// ---------------------------------------------------------------------------

/**
 * Send a direct free-form text message to a customer.
 * Subject to Meta's 24-hour customer service window rule.
 *
 * @param {object} params
 * @param {string} params.phoneNumberId
 * @param {string} params.accessToken
 * @param {string} params.toPhone
 * @param {string} params.text
 * @returns {Promise<{success: boolean, messageId?: string, code?: string|number, error?: string}>}
 */
async function sendDirectTextMessage({ phoneNumberId, accessToken, toPhone, text }) {
  if (!phoneNumberId || !accessToken || !toPhone || !text) {
    return { success: false, error: 'Missing required parameters for direct WhatsApp message' };
  }

  const normPhone = normalisePhone(toPhone);
  if (!normPhone) {
    return { success: false, error: `Invalid recipient phone number: ${toPhone}` };
  }

  const url = `${WA_BASE_URL}/${phoneNumberId.trim()}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normPhone,
    type: 'text',
    text: {
      preview_url: false,
      body: String(text).trim()
    }
  };

  try {
    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const messageId = res.data?.messages?.[0]?.id || null;
    return { success: true, messageId };
  } catch (err) {
    const metaError = err.response?.data?.error;
    const errorCode = metaError?.code;
    const errorMessage = metaError?.message || err.message;
    console.error(`[WhatsApp Direct Send Error] Code ${errorCode}:`, errorMessage);

    if (errorCode === 131047) {
      return {
        success: false,
        code: 'WINDOW_EXPIRED',
        error: 'Customer service window (24h) has expired. Please send an approved template to continue.'
      };
    }

    return {
      success: false,
      code: errorCode || 'SEND_FAILED',
      error: errorMessage
    };
  }
}

// ---------------------------------------------------------------------------
// Inbound Media Downloader & Persistent Storage
// ---------------------------------------------------------------------------

const MIME_EXTENSION_MAP = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/amr': 'amr',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'application/pdf': 'pdf',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt'
};

/**
 * Downloads media from Meta's temporary storage and saves it persistently to CRM uploads.
 *
 * @param {object} params
 * @param {string} params.mediaId
 * @param {string} params.accessToken
 * @param {string} params.tenantId
 * @returns {Promise<string|null>} Relative local path (e.g. /uploads/whatsapp/...) or null on failure
 */
async function downloadAndStoreMedia({ mediaId, accessToken, tenantId }) {
  if (!mediaId || !accessToken) return null;

  try {
    // 1. Get temporary media URL from Meta Graph API
    const metaRes = await axios.get(`${WA_BASE_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken.trim()}` },
      timeout: 10000
    });

    const tempUrl = metaRes.data?.url;
    const mimeType = metaRes.data?.mime_type || 'application/octet-stream';
    if (!tempUrl) return null;

    // 2. Download binary stream
    const fileRes = await axios.get(tempUrl, {
      headers: { Authorization: `Bearer ${accessToken.trim()}` },
      responseType: 'arraybuffer',
      timeout: 25000
    });

    const ext = MIME_EXTENSION_MAP[mimeType] || 'bin';
    const targetDir = path.join(__dirname, '..', 'uploads', 'whatsapp', String(tenantId || 'global'));
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const safeFilename = `${mediaId}.${ext}`;
    const filePath = path.join(targetDir, safeFilename);
    fs.writeFileSync(filePath, Buffer.from(fileRes.data));

    return `/uploads/whatsapp/${String(tenantId || 'global')}/${safeFilename}`;
  } catch (err) {
    console.error(`[WhatsApp Media Download Error] MediaID ${mediaId}:`, err.response?.data || err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// WABA Phone Number Discovery & Multi-Number Sync
// ---------------------------------------------------------------------------

/**
 * Discover and synchronize all registered phone numbers for a WABA into whatsapp_accounts.
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} [params.wabaId]
 * @param {string} [params.accessToken]
 * @returns {Promise<Array>} List of upserted whatsapp_accounts rows
 */
async function syncWabaPhoneNumbers({ tenantId, wabaId, accessToken }) {
  let token = accessToken;
  let targetWaba = wabaId;
  let targetPhoneId = null;

  const sRes = await db.query(
    'SELECT access_token, phone_number_id, waba_id FROM whatsapp_settings WHERE tenant_id::text = $1::text',
    [tenantId]
  );
  if (sRes.rows.length > 0) {
    token = token || sRes.rows[0].access_token;
    targetWaba = targetWaba || sRes.rows[0].waba_id;
    targetPhoneId = sRes.rows[0].phone_number_id;
  }

  if (!token) {
    throw new Error('No WhatsApp access token available for this organization');
  }

  const foundNumbersMap = new Map();

  const addNumber = (num) => {
    if (!num || !num.id) return;
    const strId = String(num.id).trim();
    if (!foundNumbersMap.has(strId)) {
      foundNumbersMap.set(strId, {
        id: strId,
        display_phone_number: num.display_phone_number || num.id,
        verified_name: num.verified_name || 'WhatsApp Business',
        quality_rating: num.quality_rating || 'UNKNOWN'
      });
    }
  };

  // 1. If we have a WABA ID, query its phone numbers directly
  if (targetWaba) {
    try {
      const pRes = await axios.get(`${WA_BASE_URL}/${targetWaba}/phone_numbers`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      });
      const arr = pRes.data?.data || [];
      arr.forEach(addNumber);
    } catch (e) {
      console.warn('[WhatsApp] Direct WABA fetch failed:', e.response?.data?.error?.message || e.message);
    }
  }

  // 2. Inspect the configured phone number ID directly to get verified details and parent WABA
  const phoneToInspect = targetPhoneId || (!targetWaba?.startsWith('waba_') ? targetWaba : null);
  if (phoneToInspect) {
    try {
      const directPhoneRes = await axios.get(`${WA_BASE_URL}/${phoneToInspect}`, {
        params: { fields: 'id,display_phone_number,verified_name,code_verification_status,quality_rating,whatsapp_business_account' },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      });
      const p = directPhoneRes.data;
      if (p && p.id && p.display_phone_number) {
        addNumber(p);

        // Discovered parent WABA ID: fetch all numbers under it and persist WABA ID
        const parentWabaId = p.whatsapp_business_account?.id;
        if (parentWabaId) {
          try {
            await db.query(
              `UPDATE whatsapp_settings 
               SET waba_id = $1 
               WHERE tenant_id::text = $2::text AND (waba_id IS NULL OR waba_id = '')`,
              [parentWabaId, tenantId]
            );

            const wRes = await axios.get(`${WA_BASE_URL}/${parentWabaId}/phone_numbers`, {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 10000
            });
            const wArr = wRes.data?.data || [];
            wArr.forEach(addNumber);
          } catch (wErr) {
            console.warn('[WhatsApp] Sister numbers fetch failed for WABA:', wErr.response?.data?.error?.message || wErr.message);
          }
        }
      }
    } catch (e) {
      console.warn('[WhatsApp] Direct phone inspect failed:', e.response?.data?.error?.message || e.message);
    }
  }

  // 3. Fallback to general discovery
  if (foundNumbersMap.size === 0) {
    const resolved = await resolveActualPhoneNumberId(targetWaba || targetPhoneId, token);
    if (resolved?.allNumbers && resolved.allNumbers.length > 0) {
      resolved.allNumbers.forEach(addNumber);
    } else if (resolved?.phoneNumberId) {
      addNumber({
        id: resolved.phoneNumberId,
        display_phone_number: resolved.displayPhoneNumber,
        verified_name: resolved.verifiedName
      });
    }
  }

  const numbers = Array.from(foundNumbersMap.values());

  if (numbers.length === 0) {
    throw new Error('No WhatsApp phone numbers found for this Meta Business account.');
  }

  const upserted = [];
  for (const num of numbers) {
    const res = await db.query(`
      INSERT INTO whatsapp_accounts (
        tenant_id, phone_number_id, display_phone_number, verified_name, quality_rating, is_active
      )
      VALUES ($1, $2, $3, $4, $5, TRUE)
      ON CONFLICT (tenant_id, phone_number_id)
      DO UPDATE SET
        display_phone_number = EXCLUDED.display_phone_number,
        verified_name = EXCLUDED.verified_name,
        quality_rating = EXCLUDED.quality_rating,
        is_active = TRUE,
        updated_at = NOW()
      RETURNING *
    `, [
      tenantId,
      num.id,
      num.display_phone_number || num.id,
      num.verified_name || 'Business Account',
      num.quality_rating || 'UNKNOWN'
    ]);
    upserted.push(res.rows[0]);
  }

  // If no default number exists, mark the first one as default
  await db.query(`
    UPDATE whatsapp_accounts 
    SET is_default = TRUE 
    WHERE id = (
      SELECT id FROM whatsapp_accounts 
      WHERE tenant_id::text = $1::text AND is_active = TRUE 
      ORDER BY id ASC LIMIT 1
    )
    AND NOT EXISTS (
      SELECT 1 FROM whatsapp_accounts 
      WHERE tenant_id::text = $1::text AND is_default = TRUE AND is_active = TRUE
    )
  `, [tenantId]);

  return upserted;
}

module.exports = {
  sendWelcomeMessage,
  sendTestMessage,
  callWhatsAppApi,
  sendDirectTextMessage,
  downloadAndStoreMedia,
  syncWabaPhoneNumbers,
  normalisePhone,
  getWhatsAppSettings,
  resolveActualPhoneNumberId,
  diagnoseWhatsAppConnection,
  fetchApprovedTemplates,
  broadcastWhatsAppCampaign
};

