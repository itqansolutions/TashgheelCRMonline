/**
 * WhatsApp Settings Controller
 * Handles CRUD for per-tenant WhatsApp Business Cloud API credentials
 * and dispatches test messages.
 */

const db = require('../config/db');
const {
  sendTestMessage,
  resolveActualPhoneNumberId,
  diagnoseWhatsAppConnection,
  fetchApprovedTemplates
} = require('../services/whatsappService');

// ---------------------------------------------------------------------------
// Ensure the settings table exists (lazy migration, same pattern as Meta)
// ---------------------------------------------------------------------------
let tableReady = false;
async function ensureWhatsAppTable() {
  if (tableReady) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_settings (
        tenant_id             UUID        PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        phone_number_id       VARCHAR(255) NOT NULL DEFAULT '',
        waba_id               VARCHAR(255) NOT NULL DEFAULT '',
        access_token          TEXT         NOT NULL DEFAULT '',
        template_name         VARCHAR(100) NOT NULL DEFAULT '',
        template_language_ar  VARCHAR(20)  NOT NULL DEFAULT 'ar',
        template_language_en  VARCHAR(20)  NOT NULL DEFAULT 'en_US',
        send_arabic           BOOLEAN      NOT NULL DEFAULT TRUE,
        send_english          BOOLEAN      NOT NULL DEFAULT FALSE,
        default_country_code  VARCHAR(10)  NOT NULL DEFAULT '20',
        is_active             BOOLEAN      NOT NULL DEFAULT FALSE,
        created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    await db.query(`ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS waba_id VARCHAR(255) DEFAULT '';`);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_whatsapp_settings_tenant_id
      ON whatsapp_settings(tenant_id);
    `);
    tableReady = true;
  } catch (err) {
    console.error('[WhatsApp] Table ensure error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// GET /api/whatsapp/settings
// ---------------------------------------------------------------------------
exports.getWhatsAppSettings = async (req, res) => {
  await ensureWhatsAppTable();
  const tenantId = req.user.tenant_id;

  try {
    const result = await db.query(
      `SELECT
         phone_number_id,
         waba_id,
         template_name,
         template_language_ar,
         template_language_en,
         send_arabic,
         send_english,
         default_country_code,
         is_active,
         access_token,
         (access_token IS NOT NULL AND access_token <> '') AS has_access_token
       FROM whatsapp_settings
       WHERE tenant_id::text = $1::text`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      return res.json({
        status: 'success',
        data: {
          phone_number_id: '',
          waba_id: '',
          template_name: '',
          template_language_ar: 'ar',
          template_language_en: 'en_US',
          send_arabic: true,
          send_english: false,
          default_country_code: '20',
          is_active: false,
          has_access_token: false,
          token_preview: ''
        }
      });
    }

    const row = result.rows[0];
    const rawToken = row.access_token || '';
    const tokenPreview = rawToken.length > 10
      ? `${rawToken.slice(0, 6)}••••••••${rawToken.slice(-4)}`
      : (rawToken ? '••••••••' : '');

    delete row.access_token; // Mask full token from API responses

    res.json({
      status: 'success',
      data: {
        ...row,
        token_preview: tokenPreview
      }
    });
  } catch (err) {
    console.error('[WhatsApp getSettings]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ---------------------------------------------------------------------------
// POST /api/whatsapp/settings
// ---------------------------------------------------------------------------
exports.updateWhatsAppSettings = async (req, res) => {
  await ensureWhatsAppTable();
  const tenantId = req.user.tenant_id;

  const {
    phone_number_id,
    waba_id,
    access_token,
    template_name,
    template_language_ar,
    template_language_en,
    send_arabic,
    send_english,
    default_country_code,
    is_active
  } = req.body;

  if (!phone_number_id || !phone_number_id.trim()) {
    return res.status(400).json({ status: 'error', message: 'Phone Number ID is required' });
  }
  if (!template_name || !template_name.trim()) {
    return res.status(400).json({ status: 'error', message: 'Template Name is required' });
  }

  const cleanToken = (access_token || '').trim();

  try {
    let cleanLangAr = (template_language_ar || 'ar').trim();
    if (!cleanLangAr || cleanLangAr.length > 7 || !/^[a-z]{2}(_[A-Z]{2})?$/.test(cleanLangAr)) {
      cleanLangAr = 'ar';
    }
    let cleanLangEn = (template_language_en || 'en_US').trim();
    if (!cleanLangEn || cleanLangEn.length > 7 || !/^[a-z]{2}(_[A-Z]{2})?$/.test(cleanLangEn)) {
      cleanLangEn = 'en_US';
    }

    await db.query(
      `INSERT INTO whatsapp_settings (
         tenant_id, phone_number_id, waba_id, access_token,
         template_name, template_language_ar, template_language_en,
         send_arabic, send_english, default_country_code, is_active,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         phone_number_id      = EXCLUDED.phone_number_id,
         waba_id              = EXCLUDED.waba_id,
         access_token         = CASE 
                                  WHEN EXCLUDED.access_token <> '' THEN EXCLUDED.access_token 
                                  ELSE whatsapp_settings.access_token 
                                END,
         template_name        = EXCLUDED.template_name,
         template_language_ar = EXCLUDED.template_language_ar,
         template_language_en = EXCLUDED.template_language_en,
         send_arabic          = EXCLUDED.send_arabic,
         send_english         = EXCLUDED.send_english,
         default_country_code = EXCLUDED.default_country_code,
         is_active            = EXCLUDED.is_active,
         updated_at           = NOW()`,
      [
        tenantId,
        phone_number_id.trim(),
        (waba_id || '').trim(),
        cleanToken,
        template_name.trim(),
        cleanLangAr,
        cleanLangEn,
        send_arabic !== false,
        send_english === true,
        (default_country_code || '20').trim(),
        is_active === true
      ]
    );

    const tokenPreview = cleanToken.length > 10
      ? `${cleanToken.slice(0, 6)}••••••••${cleanToken.slice(-4)}`
      : (cleanToken ? '••••••••' : '');

    res.json({
      status: 'success',
      message: 'WhatsApp settings saved successfully',
      data: {
        has_access_token: true,
        token_preview: tokenPreview
      }
    });
  } catch (err) {
    console.error('[WhatsApp updateSettings]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ---------------------------------------------------------------------------
// POST /api/whatsapp/test
// Sends a real test message so the admin can verify everything is wired up
// ---------------------------------------------------------------------------
exports.sendTestWhatsApp = async (req, res) => {
  await ensureWhatsAppTable();
  const tenantId = req.user.tenant_id;

  const { to_phone, language, language_code, template_name } = req.body;

  if (!to_phone) {
    return res.status(400).json({ status: 'error', message: 'Recipient phone number is required' });
  }

  try {
    // Load stored settings (we'll use whatever is saved for this tenant)
    const settingsRes = await db.query(
      `SELECT phone_number_id, access_token, template_name,
              template_language_ar, template_language_en, default_country_code
       FROM whatsapp_settings
       WHERE tenant_id::text = $1::text`,
      [tenantId]
    );

    if (settingsRes.rows.length === 0) {
      return res.status(400).json({ status: 'error', message: 'WhatsApp is not configured yet. Please save your settings first.' });
    }

    const s = settingsRes.rows[0];

    const targetTemplate = (template_name || s.template_name || '').trim();
    if (!s.phone_number_id || !s.access_token || !targetTemplate) {
      return res.status(400).json({ status: 'error', message: 'Phone Number ID, Access Token and Template Name are all required.' });
    }

    let langCode = (language_code || '').trim() || (language === 'en' ? (s.template_language_en || 'en') : (s.template_language_ar || 'ar'));
    if (!langCode || langCode.length > 7 || !/^[a-z]{2}(_[A-Z]{2})?$/.test(langCode)) {
      langCode = language === 'en' ? 'en' : 'ar';
    }

    const result = await sendTestMessage({
      phoneNumberId: s.phone_number_id,
      accessToken: s.access_token,
      templateName: targetTemplate,
      languageCode: langCode,
      toPhone: to_phone,
      defaultCountryCode: s.default_country_code || '20',
      tenantId
    });

    if (result.success) {
      let msg = `تم إرسال الرسالة التجريبية بنجاح! معرّف الرسالة: ${result.messageId}`;
      if (result.resolvedPhoneId && result.resolvedPhoneId !== s.phone_number_id) {
        msg += ` (ملاحظة: تم تصحيح معرّف الهاتف تلقائياً من ${s.phone_number_id} إلى ${result.resolvedPhoneId} وحفظه في الإعدادات)`;
      }
      res.json({
        status: 'success',
        message: msg,
        data: {
          resolvedPhoneId: result.resolvedPhoneId || s.phone_number_id
        }
      });
    } else {
      res.status(400).json({ status: 'error', message: `WhatsApp API Error: ${result.error}` });
    }
  } catch (err) {
    console.error('[WhatsApp sendTest]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ---------------------------------------------------------------------------
// GET /api/whatsapp/phone-numbers
// Discovers real Phone Number IDs attached to a WABA account from Meta Graph API
// ---------------------------------------------------------------------------
exports.fetchPhoneNumbersFromMeta = async (req, res) => {
  await ensureWhatsAppTable();
  const tenantId = req.user.tenant_id;
  const wabaIdInput = req.query.waba_id;

  try {
    const sRes = await db.query(
      `SELECT phone_number_id, access_token FROM whatsapp_settings WHERE tenant_id::text = $1::text`,
      [tenantId]
    );

    if (sRes.rows.length === 0 || !sRes.rows[0].access_token) {
      return res.status(400).json({ status: 'error', message: 'يرجى إدخال وحفظ Access Token أولاً' });
    }

    const token = sRes.rows[0].access_token;
    const searchId = (wabaIdInput || sRes.rows[0].phone_number_id || '').trim();

    if (!searchId) {
      return res.status(400).json({ status: 'error', message: 'يرجى إدخال معرّف الحساب WABA ID أولاً' });
    }

    const resolved = await resolveActualPhoneNumberId(searchId, token);
    if (resolved && resolved.allNumbers && resolved.allNumbers.length > 0) {
      return res.json({
        status: 'success',
        data: resolved.allNumbers,
        message: `تم العثور على ${resolved.allNumbers.length} رقم مسجل في حساب واتساب`
      });
    }

    res.status(404).json({
      status: 'error',
      message: 'لم يتم العثور على أرقام هواتف لهذا المعرّف. تأكد من أن المعرّف هو WhatsApp Business Account ID وأن التوكن يملك صلاحيات كافية.'
    });
  } catch (err) {
    console.error('[WhatsApp fetchPhoneNumbers]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ---------------------------------------------------------------------------
// GET /api/whatsapp/diagnose
// Deep diagnostic check of token validity and phone number access
// ---------------------------------------------------------------------------
exports.diagnoseWhatsApp = async (req, res) => {
  await ensureWhatsAppTable();
  const tenantId = req.user.tenant_id;

  try {
    const result = await diagnoseWhatsAppConnection(tenantId);
    res.json(result);
  } catch (err) {
    console.error('[WhatsApp diagnose]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ---------------------------------------------------------------------------
// GET /api/whatsapp/templates
// Discovers approved message templates attached to the tenant's WABA account
// ---------------------------------------------------------------------------
exports.fetchTemplatesFromMeta = async (req, res) => {
  await ensureWhatsAppTable();
  const tenantId = req.user.tenant_id;

  try {
    const sRes = await db.query(
      `SELECT phone_number_id, waba_id, access_token FROM whatsapp_settings WHERE tenant_id::text = $1::text`,
      [tenantId]
    );

    if (sRes.rows.length === 0 || !sRes.rows[0].access_token) {
      return res.status(400).json({ status: 'error', message: 'يرجى إدخال وحفظ Access Token أولاً' });
    }

    const token = sRes.rows[0].access_token;
    const phoneId = (sRes.rows[0].phone_number_id || '').trim();
    const wabaIdInput = (req.query.waba_id || sRes.rows[0].waba_id || '').trim();

    if (!phoneId && !wabaIdInput) {
      return res.status(400).json({ status: 'error', message: 'يرجى إدخال وحفظ Phone Number ID أولاً' });
    }

    const result = await fetchApprovedTemplates({ phoneNumberId: phoneId, accessToken: token, wabaIdInput });
    if (result.success) {
      return res.json({
        status: 'success',
        data: result.templates,
        wabaId: result.wabaId,
        message: `تم العثور على ${result.templates.length} قالب في حسابك على Meta`
      });
    }

    res.status(400).json({
      status: 'error',
      message: result.error || 'تعذر جلب القوالب من Meta'
    });
  } catch (err) {
    console.error('[WhatsApp fetchTemplates]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};
