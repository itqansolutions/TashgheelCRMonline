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

  const sendRequest = async (phoneId, customComponents = components, customLang = languageCode) => {
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
    if (rawError?.code === 132000 || apiError.includes('number of parameters') || apiError.includes('expected number of params')) {
      console.warn(`⚠️ [WhatsApp] Parameter mismatch for '${templateName}'. Auto-adapting (Header vs Body vs None)...`);
      const extractedName = components?.[0]?.parameters?.[0]?.text || 'عميلنا الكريم';
      const headerComp = { type: 'header', parameters: [{ type: 'text', text: extractedName }] };
      const bodyComp = { type: 'body', parameters: [{ type: 'text', text: extractedName }] };

      const variations = [
        [headerComp],            // Case 1: Variable in Header only (e.g. أهلاً / {{1}})
        [headerComp, bodyComp],  // Case 2: Variables in both Header and Body
        [],                      // Case 3: Template without variables
        [bodyComp]               // Case 4: Variable in Body only
      ];

      for (const variant of variations) {
        try {
          const vRes = await sendRequest(targetPhoneId, variant);
          const msgId = vRes.data?.messages?.[0]?.id || null;
          console.log(`✅ [WhatsApp] Auto-adaptation SUCCEEDED with component variant! ID: ${msgId}`);
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

      // Try fallback languages with both with-params and without-params
      const fallbackLanguages = languageCode.startsWith('ar') ? ['en_US', 'en'] : ['ar', 'en_US', 'en'];
      console.warn(`⚠️ [WhatsApp] Template/Language mismatch for '${templateName}' (${languageCode}). Testing fallback combinations...`);
      
      for (const altLang of fallbackLanguages) {
        for (const compVariant of [components, []]) {
          try {
            const lRes = await sendRequest(targetPhoneId, compVariant, altLang);
            const msgId = lRes.data?.messages?.[0]?.id || null;
            console.log(`✅ [WhatsApp] Succeeded with fallback language '${altLang}'! ID: ${msgId}`);
            return { success: true, messageId: msgId, error: null, resolvedPhoneId: targetPhoneId };
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

  // If template is hello_world, Meta expects NO parameters and en_US language!
  const isHelloWorld = templateName?.toLowerCase().trim() === 'hello_world';
  const components = isHelloWorld ? [] : [{
    type: 'body',
    parameters: [{ type: 'text', text: 'Test Lead' }]
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
async function fetchApprovedTemplates({ phoneNumberId, accessToken }) {
  if (!accessToken) return { success: false, error: 'Access token required' };
  const targetPhoneId = (phoneNumberId || '').trim();

  let wabaId = null;

  // 1. Try resolving WABA ID from Phone Number ID
  if (targetPhoneId) {
    try {
      const pRes = await axios.get(`${WA_BASE_URL}/${targetPhoneId}?fields=whatsapp_business_account`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000
      });
      wabaId = pRes.data?.whatsapp_business_account?.id;
    } catch (err) {
      console.log('[WhatsApp] Could not get WABA ID directly from phone number:', err.response?.data?.error?.message || err.message);
    }
  }

  // 2. If not found, try assigned_whatsapp_business_accounts
  if (!wabaId) {
    try {
      const assignedRes = await axios.get(`${WA_BASE_URL}/me/assigned_whatsapp_business_accounts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000
      });
      const wabas = assignedRes.data?.data || [];
      if (wabas.length > 0 && wabas[0].id) {
        wabaId = wabas[0].id;
      }
    } catch (err) {}
  }

  // 3. If still not found, try client_whatsapp_business_accounts
  if (!wabaId) {
    try {
      const clientRes = await axios.get(`${WA_BASE_URL}/me/client_whatsapp_business_accounts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000
      });
      const clientWabas = clientRes.data?.data || [];
      if (clientWabas.length > 0 && clientWabas[0].id) {
        wabaId = clientWabas[0].id;
      }
    } catch (err) {}
  }

  if (!wabaId) {
    return {
      success: false,
      error: 'تعذر تحديد حساب واتساب التجاري (WABA) المرتبط بهذا التوكن أو رقم الهاتف.'
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
    const errMsg = err.response?.data?.error?.message || err.message;
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

module.exports = {
  sendWelcomeMessage,
  sendTestMessage,
  normalisePhone,
  getWhatsAppSettings,
  resolveActualPhoneNumberId,
  diagnoseWhatsAppConnection,
  fetchApprovedTemplates
};
