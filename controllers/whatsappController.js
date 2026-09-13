/**
 * WhatsApp Settings Controller
 * Handles CRUD for per-tenant WhatsApp Business Cloud API credentials
 * and dispatches test messages.
 */

const db = require('../config/db');
const { sendTestMessage } = require('../services/whatsappService');

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
    await db.query(
      `INSERT INTO whatsapp_settings (
         tenant_id, phone_number_id, access_token,
         template_name, template_language_ar, template_language_en,
         send_arabic, send_english, default_country_code, is_active,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         phone_number_id      = EXCLUDED.phone_number_id,
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
        cleanToken,
        template_name.trim(),
        (template_language_ar || 'ar').trim(),
        (template_language_en || 'en_US').trim(),
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

  const { to_phone, language } = req.body;

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

    if (!s.phone_number_id || !s.access_token || !s.template_name) {
      return res.status(400).json({ status: 'error', message: 'Phone Number ID, Access Token and Template Name are all required.' });
    }

    const langCode = language === 'en' ? (s.template_language_en || 'en_US') : (s.template_language_ar || 'ar');

    const result = await sendTestMessage({
      phoneNumberId: s.phone_number_id,
      accessToken: s.access_token,
      templateName: s.template_name,
      languageCode: langCode,
      toPhone: to_phone,
      defaultCountryCode: s.default_country_code || '20'
    });

    if (result.success) {
      res.json({ status: 'success', message: `Test message sent successfully! Message ID: ${result.messageId}` });
    } else {
      res.status(400).json({ status: 'error', message: `WhatsApp API Error: ${result.error}` });
    }
  } catch (err) {
    console.error('[WhatsApp sendTest]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};
