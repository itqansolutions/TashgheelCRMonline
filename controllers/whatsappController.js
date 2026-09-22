/**
 * WhatsApp Settings Controller
 * Handles CRUD for per-tenant WhatsApp Business Cloud API credentials
 * and dispatches test messages.
 */

const crypto = require('crypto');
const db = require('../config/db');
const {
  sendTestMessage,
  sendDirectTextMessage,
  downloadAndStoreMedia,
  syncWabaPhoneNumbers,
  resolveActualPhoneNumberId,
  diagnoseWhatsAppConnection,
  fetchApprovedTemplates,
  broadcastWhatsAppCampaign,
  normalisePhone,
  callWhatsAppApi
} = require('../services/whatsappService');

// ---------------------------------------------------------------------------
// Ensure the settings and campaigns tables exist (lazy migration)
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

    // WhatsApp Campaigns Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name              VARCHAR(255) NOT NULL,
        template_name     VARCHAR(100) NOT NULL,
        language_code     VARCHAR(20) NOT NULL DEFAULT 'en',
        filter_criteria   JSONB DEFAULT '{}',
        total_recipients  INTEGER DEFAULT 0,
        successful_count  INTEGER DEFAULT 0,
        failed_count      INTEGER DEFAULT 0,
        status            VARCHAR(50) DEFAULT 'completed',
        created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_tenant_id ON whatsapp_campaigns(tenant_id);
    `);

    // WhatsApp Campaign Recipients Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_campaign_recipients (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id   UUID NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
        customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        customer_name VARCHAR(255) DEFAULT '',
        phone         VARCHAR(50) NOT NULL,
        status        VARCHAR(50) DEFAULT 'pending',
        message_id    VARCHAR(255),
        error_message TEXT,
        sent_at       TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_whatsapp_recipients_campaign_id ON whatsapp_campaign_recipients(campaign_id);
    `);

    // 1. WhatsApp Accounts Table (Multi-number support)
    await db.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_accounts (
        id SERIAL PRIMARY KEY,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        branch_id VARCHAR(255),
        phone_number_id VARCHAR(100) NOT NULL,
        display_phone_number VARCHAR(50) NOT NULL,
        verified_name VARCHAR(255),
        label VARCHAR(100),
        access_token TEXT,
        is_default BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        quality_rating VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT unique_tenant_whatsapp_phone_number UNIQUE (tenant_id, phone_number_id)
      );
      CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_phone_id ON whatsapp_accounts(phone_number_id);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_tenant ON whatsapp_accounts(tenant_id);
    `);

    await db.query(`ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS meta_app_secret TEXT;`);
    await db.query(`ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS meta_webhook_verify_token TEXT;`);

    // 2. WhatsApp Conversations Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        branch_id VARCHAR(255),
        account_id INTEGER REFERENCES whatsapp_accounts(id) ON DELETE SET NULL,
        assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        phone_number VARCHAR(50) NOT NULL,
        contact_name VARCHAR(255),
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        last_message_body TEXT,
        last_message_at TIMESTAMPTZ DEFAULT NOW(),
        last_message_direction VARCHAR(10) DEFAULT 'inbound',
        unread_count INTEGER DEFAULT 0,
        window_expires_at TIMESTAMPTZ,
        is_archived BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT unique_tenant_account_chat UNIQUE (tenant_id, phone_number, account_id)
      );
      CREATE INDEX IF NOT EXISTS idx_wa_conv_tenant ON whatsapp_conversations(tenant_id, account_id);
      CREATE INDEX IF NOT EXISTS idx_wa_conv_assigned ON whatsapp_conversations(assigned_user_id);
      CREATE INDEX IF NOT EXISTS idx_wa_conv_phone ON whatsapp_conversations(phone_number);
      CREATE INDEX IF NOT EXISTS idx_wa_conv_last_msg ON whatsapp_conversations(last_message_at DESC);
    `);

    await db.query(`ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;`);
    await db.query(`ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS window_expires_at TIMESTAMPTZ;`);
    await db.query(`ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;`);

    // 3. WhatsApp Messages Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        account_id INTEGER REFERENCES whatsapp_accounts(id) ON DELETE SET NULL,
        meta_message_id VARCHAR(255) UNIQUE,
        direction VARCHAR(10) NOT NULL,
        sender_type VARCHAR(20) NOT NULL DEFAULT 'agent',
        sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        message_type VARCHAR(30) NOT NULL DEFAULT 'text',
        body TEXT,
        template_name VARCHAR(100),
        media_url TEXT,
        status VARCHAR(20) DEFAULT 'sent',
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_wa_msgs_conv ON whatsapp_messages(conversation_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_wa_msgs_meta_id ON whatsapp_messages(meta_message_id);
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

    // Lookup customer name in CRM if to_phone is a registered customer
    const cleanPhone = to_phone.replace(/[\s\-().]/g, '');
    const last9 = cleanPhone.slice(-9);

    let customerName = '';
    let foundInCrm = false;
    try {
      const custRes = await db.query(
        `SELECT name, phone FROM customers 
         WHERE tenant_id::text = $1::text 
           AND (
             phone = $2 
             OR phone = $3 
             OR phone LIKE $4
           )
         ORDER BY updated_at DESC
         LIMIT 1`,
        [tenantId, to_phone, cleanPhone, `%${last9}`]
      );
      if (custRes.rows.length > 0 && custRes.rows[0].name && custRes.rows[0].name.trim() && custRes.rows[0].name.trim() !== 'Meta Lead') {
        customerName = custRes.rows[0].name.trim();
        foundInCrm = true;
      }
    } catch (cErr) {
      console.warn('[WhatsApp sendTest] Customer lookup warning:', cErr.message);
    }

    // "لو العميل مش مسجل يتكتب رقم تليفونه"
    if (!customerName) {
      customerName = to_phone;
    }

    const result = await sendTestMessage({
      phoneNumberId: s.phone_number_id,
      accessToken: s.access_token,
      templateName: targetTemplate,
      languageCode: langCode,
      toPhone: to_phone,
      customerName,
      defaultCountryCode: s.default_country_code || '20',
      tenantId
    });

    if (result.success) {
      let msg = `تم إرسال الرسالة التجريبية بنجاح إلى ${to_phone}!`;
      if (foundInCrm) {
        msg += ` (الاسم المستخدم في الرسالة من النظام: "${customerName}")`;
      } else {
        msg += ` (الرقم غير مسجل كعميل، تم استخدام رقم الهاتف "${customerName}" في الرسالة)`;
      }
      if (result.resolvedPhoneId && result.resolvedPhoneId !== s.phone_number_id) {
        msg += ` (ملاحظة: تم تصحيح معرّف الهاتف تلقائياً من ${s.phone_number_id} إلى ${result.resolvedPhoneId} وحفظه في الإعدادات)`;
      }
      res.json({
        status: 'success',
        message: msg,
        data: {
          resolvedPhoneId: result.resolvedPhoneId || s.phone_number_id,
          customerName,
          foundInCrm
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

// ---------------------------------------------------------------------------
// GET /api/whatsapp/campaigns
// List all WhatsApp campaigns for the tenant
// ---------------------------------------------------------------------------
exports.getCampaigns = async (req, res) => {
  await ensureWhatsAppTable();
  const tenantId = req.user.tenant_id;

  try {
    const result = await db.query(
      `SELECT c.*, u.name as creator_name
       FROM whatsapp_campaigns c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.tenant_id::text = $1::text
       ORDER BY c.created_at DESC`,
      [tenantId]
    );

    res.json({
      status: 'success',
      data: result.rows
    });
  } catch (err) {
    console.error('[WhatsApp getCampaigns]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ---------------------------------------------------------------------------
// GET /api/whatsapp/campaigns/:id
// Get details and recipient delivery logs for a specific campaign
// ---------------------------------------------------------------------------
exports.getCampaignDetails = async (req, res) => {
  await ensureWhatsAppTable();
  const tenantId = req.user.tenant_id;
  const { id } = req.params;

  try {
    const campRes = await db.query(
      `SELECT c.*, u.name as creator_name
       FROM whatsapp_campaigns c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id::text = $1::text AND c.tenant_id::text = $2::text`,
      [id, tenantId]
    );

    if (campRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Campaign not found' });
    }

    const recipientsRes = await db.query(
      `SELECT * FROM whatsapp_campaign_recipients
       WHERE campaign_id::text = $1::text
       ORDER BY sent_at DESC NULLS LAST, id ASC`,
      [id]
    );

    res.json({
      status: 'success',
      data: {
        campaign: campRes.rows[0],
        recipients: recipientsRes.rows
      }
    });
  } catch (err) {
    console.error('[WhatsApp getCampaignDetails]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ---------------------------------------------------------------------------
// POST /api/whatsapp/campaigns/send
// Broadcast a WhatsApp template to selected customers
// ---------------------------------------------------------------------------
exports.sendCampaign = async (req, res) => {
  await ensureWhatsAppTable();
  const tenantId = req.user.tenant_id;
  const userId = req.user.id;

  const {
    name,
    template_name,
    language_code = 'en',
    customer_ids = [],
    filter_criteria = {},
    custom_param = null
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ status: 'error', message: 'Campaign name is required' });
  }

  if (!template_name || !template_name.trim()) {
    return res.status(400).json({ status: 'error', message: 'Template name is required' });
  }

  if (!customer_ids || customer_ids.length === 0) {
    return res.status(400).json({ status: 'error', message: 'At least one customer must be selected' });
  }

  try {
    // 1. Fetch the selected customers and their phone numbers
    const custRes = await db.query(
      `SELECT id, name, phone, classification_id, area_id 
       FROM customers 
       WHERE tenant_id::text = $1::text AND id = ANY($2::int[])`,
      [tenantId, customer_ids]
    );

    const customers = custRes.rows;
    if (customers.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No valid customers found for the specified IDs' });
    }

    // 2. Create the campaign record
    const insertRes = await db.query(
      `INSERT INTO whatsapp_campaigns 
        (tenant_id, name, template_name, language_code, filter_criteria, total_recipients, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'processing', $7)
       RETURNING id`,
      [tenantId, name.trim(), template_name.trim(), language_code.trim(), JSON.stringify(filter_criteria), customers.length, userId]
    );

    const campaignId = insertRes.rows[0].id;

    // 3. Trigger broadcast (supports async response with broadcastWhatsAppCampaign)
    const recipients = customers.map(c => ({
      customerId: c.id,
      name: c.name,
      phone: c.phone
    }));

    const broadcastResult = await broadcastWhatsAppCampaign({
      tenantId,
      campaignId,
      templateName: template_name.trim(),
      languageCode: language_code.trim(),
      recipients,
      customParam: custom_param
    });

    res.json({
      status: 'success',
      message: `Campaign executed successfully: ${broadcastResult.successfulCount} sent, ${broadcastResult.failedCount} failed`,
      data: {
        campaignId,
        ...broadcastResult
      }
    });

  } catch (err) {
    console.error('[WhatsApp sendCampaign]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ===========================================================================
// MULTI-NUMBER ACCOUNTS MANAGEMENT
// ===========================================================================

// @desc    Get all connected WhatsApp accounts for tenant
// @route   GET /api/whatsapp/accounts
exports.getWhatsAppAccounts = async (req, res) => {
  const tenantId = req.user.tenant_id;
  await ensureWhatsAppTable();

  try {
    const result = await db.query(`
      SELECT id, tenant_id, branch_id, phone_number_id, display_phone_number,
             verified_name, label, is_default, is_active, quality_rating, created_at, updated_at
      FROM whatsapp_accounts
      WHERE tenant_id::text = $1::text
      ORDER BY is_default DESC, id ASC
    `, [tenantId]);

    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[WhatsApp getWhatsAppAccounts]', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to retrieve WhatsApp accounts' });
  }
};

// @desc    Sync phone numbers from Meta WABA for tenant
// @route   POST /api/whatsapp/accounts/sync
exports.syncWhatsAppAccounts = async (req, res) => {
  const tenantId = req.user.tenant_id;
  await ensureWhatsAppTable();

  try {
    const accounts = await syncWabaPhoneNumbers({ tenantId });
    res.json({
      status: 'success',
      message: `Successfully synchronized ${accounts.length} WhatsApp numbers from Meta`,
      data: accounts
    });
  } catch (err) {
    console.error('[WhatsApp syncWhatsAppAccounts]', err.message);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to sync WhatsApp numbers' });
  }
};

// @desc    Set primary default WhatsApp account
// @route   POST /api/whatsapp/accounts/:id/default
exports.setDefaultWhatsAppAccount = async (req, res) => {
  const tenantId = req.user.tenant_id;
  const accountId = req.params.id;
  await ensureWhatsAppTable();

  try {
    await db.query('BEGIN');
    await db.query(`
      UPDATE whatsapp_accounts 
      SET is_default = (id = $1)
      WHERE tenant_id::text = $2::text
    `, [accountId, tenantId]);
    await db.query('COMMIT');

    res.json({ status: 'success', message: 'Default WhatsApp number updated' });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('[WhatsApp setDefaultWhatsAppAccount]', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to set default WhatsApp account' });
  }
};

// @desc    Toggle account active status (soft-disable/enable)
// @route   PATCH /api/whatsapp/accounts/:id/toggle
exports.toggleWhatsAppAccount = async (req, res) => {
  const tenantId = req.user.tenant_id;
  const accountId = req.params.id;
  await ensureWhatsAppTable();

  try {
    const result = await db.query(`
      UPDATE whatsapp_accounts
      SET is_active = NOT is_active, updated_at = NOW()
      WHERE id = $1 AND tenant_id::text = $2::text
      RETURNING *
    `, [accountId, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Account not found' });
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[WhatsApp toggleWhatsAppAccount]', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to update account status' });
  }
};

// ===========================================================================
// WHATSAPP CHAT & CONVERSATIONS
// ===========================================================================

// @desc    Get conversations with search and assignment filtering
// @route   GET /api/whatsapp/conversations
exports.getConversations = async (req, res) => {
  const tenantId = req.user.tenant_id;
  const userId = req.user.id;
  const { accountId, scope, search } = req.query;
  await ensureWhatsAppTable();

  try {
    let query = `
      SELECT 
        c.id, c.tenant_id, c.branch_id, c.account_id, c.assigned_user_id,
        c.phone_number, c.contact_name, c.customer_id, c.last_message_body,
        c.last_message_at, c.last_message_direction, c.unread_count,
        c.window_expires_at, c.is_archived, c.created_at, c.updated_at,
        u.name AS assigned_user_name,
        a.display_phone_number AS account_phone_number,
        a.label AS account_label,
        cust.name AS customer_actual_name,
        cust.email AS customer_email
      FROM whatsapp_conversations c
      LEFT JOIN whatsapp_accounts a ON c.account_id = a.id
      LEFT JOIN users u ON c.assigned_user_id = u.id
      LEFT JOIN customers cust ON c.customer_id = cust.id
      WHERE c.tenant_id::text = $1::text
    `;
    const params = [tenantId];

    if (accountId && accountId !== 'all') {
      params.push(accountId);
      query += ` AND c.account_id = $${params.length}`;
    }

    if (scope === 'my') {
      params.push(userId);
      query += ` AND c.assigned_user_id = $${params.length}`;
    } else if (scope === 'unassigned') {
      query += ` AND c.assigned_user_id IS NULL`;
    }

    if (search && String(search).trim()) {
      params.push(`%${String(search).trim()}%`);
      const sIdx = params.length;
      query += ` AND (c.contact_name ILIKE $${sIdx} OR c.phone_number ILIKE $${sIdx} OR c.last_message_body ILIKE $${sIdx} OR cust.name ILIKE $${sIdx})`;
    }

    query += ` ORDER BY c.last_message_at DESC NULLS LAST LIMIT 100`;

    const result = await db.query(query, params);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[WhatsApp getConversations]', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to retrieve conversations' });
  }
};

// @desc    Get chronological messages for a conversation
// @route   GET /api/whatsapp/conversations/:id/messages
exports.getMessages = async (req, res) => {
  const tenantId = req.user.tenant_id;
  const conversationId = req.params.id;
  await ensureWhatsAppTable();

  try {
    const convRes = await db.query(`
      SELECT 
        c.*,
        u.name AS assigned_user_name,
        a.display_phone_number AS account_phone_number,
        a.label AS account_label,
        cust.name AS customer_actual_name,
        cust.email AS customer_email
      FROM whatsapp_conversations c
      LEFT JOIN whatsapp_accounts a ON c.account_id = a.id
      LEFT JOIN users u ON c.assigned_user_id = u.id
      LEFT JOIN customers cust ON c.customer_id = cust.id
      WHERE c.id::text = $1::text AND c.tenant_id::text = $2::text
    `, [conversationId, tenantId]);

    if (convRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Conversation not found' });
    }

    const messagesRes = await db.query(`
      SELECT m.*, u.name AS sender_name
      FROM whatsapp_messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id::text = $1::text AND m.tenant_id::text = $2::text
      ORDER BY m.created_at ASC
    `, [conversationId, tenantId]);

    // Reset unread count
    await db.query(`
      UPDATE whatsapp_conversations 
      SET unread_count = 0 
      WHERE id::text = $1::text AND tenant_id::text = $2::text
    `, [conversationId, tenantId]);

    res.json({
      status: 'success',
      data: {
        conversation: convRes.rows[0],
        messages: messagesRes.rows
      }
    });
  } catch (err) {
    console.error('[WhatsApp getMessages]', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to retrieve messages' });
  }
};

// @desc    Send direct message or template in conversation
// @route   POST /api/whatsapp/conversations/:id/messages
exports.sendMessage = async (req, res) => {
  const tenantId = req.user.tenant_id;
  const userId = req.user.id;
  const conversationId = req.params.id;
  const { body, message_type = 'text', template_name, language_code = 'ar' } = req.body;
  await ensureWhatsAppTable();

  try {
    // 1. Fetch conversation details and resolve tokens with COALESCE override
    const convRes = await db.query(`
      SELECT 
        c.*,
        a.phone_number_id AS account_phone_number_id,
        COALESCE(a.access_token, s.access_token) AS access_token,
        s.phone_number_id AS default_phone_id
      FROM whatsapp_conversations c
      LEFT JOIN whatsapp_accounts a ON c.account_id = a.id
      LEFT JOIN whatsapp_settings s ON c.tenant_id = s.tenant_id
      WHERE c.id::text = $1::text AND c.tenant_id::text = $2::text
    `, [conversationId, tenantId]);

    if (convRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Conversation not found' });
    }

    const conv = convRes.rows[0];
    const phoneNumberId = conv.account_phone_number_id || conv.default_phone_id;
    const accessToken = conv.access_token;

    if (!phoneNumberId || !accessToken) {
      return res.status(400).json({ status: 'error', message: 'WhatsApp sender number or credentials not configured' });
    }

    let sendResult = null;

    if (message_type === 'template') {
      if (!template_name) {
        return res.status(400).json({ status: 'error', message: 'Template name is required' });
      }

      sendResult = await callWhatsAppApi({
        phoneNumberId,
        accessToken,
        toPhone: conv.phone_number,
        templateName: template_name.trim(),
        languageCode: (language_code || 'ar').trim(),
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: conv.contact_name || conv.phone_number }]
          }
        ],
        tenantId
      });
    } else {
      if (!body || !String(body).trim()) {
        return res.status(400).json({ status: 'error', message: 'Message text cannot be empty' });
      }

      sendResult = await sendDirectTextMessage({
        phoneNumberId,
        accessToken,
        toPhone: conv.phone_number,
        text: String(body).trim()
      });
    }

    // 2. Authoritative check on Meta Error #131047 (Customer service window closed)
    if (!sendResult.success) {
      if (sendResult.code === 'WINDOW_EXPIRED' || sendResult.code === 131047) {
        await db.query(`
          UPDATE whatsapp_conversations
          SET window_expires_at = NOW()
          WHERE id::text = $1::text
        `, [conversationId]);

        return res.status(400).json({
          status: 'error',
          code: 'WINDOW_EXPIRED',
          message: 'The 24-hour customer service window has expired. Please send an approved template to continue conversation.'
        });
      }

      return res.status(400).json({
        status: 'error',
        message: sendResult.error || 'Failed to dispatch WhatsApp message'
      });
    }

    // 3. Outbound Message Insertion with Meta's wamid
    const wamid = sendResult.messageId;
    const msgText = message_type === 'template' ? `[Template: ${template_name}]` : String(body).trim();

    const insertRes = await db.query(`
      INSERT INTO whatsapp_messages (
        conversation_id, tenant_id, account_id, meta_message_id,
        direction, sender_type, sender_id, message_type, body, template_name, status, created_at
      )
      VALUES ($1, $2, $3, $4, 'outbound', 'agent', $5, $6, $7, $8, 'sent', NOW())
      RETURNING *
    `, [
      conversationId,
      tenantId,
      conv.account_id || null,
      wamid,
      userId,
      message_type,
      msgText,
      message_type === 'template' ? template_name : null
    ]);

    // 4. Update conversation summary
    await db.query(`
      UPDATE whatsapp_conversations
      SET last_message_body = $1,
          last_message_at = NOW(),
          last_message_direction = 'outbound'
      WHERE id::text = $2::text
    `, [msgText, conversationId]);

    res.json({
      status: 'success',
      data: insertRes.rows[0]
    });

  } catch (err) {
    console.error('[WhatsApp sendMessage]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Start a new chat thread (creates conversation & optionally dispatches first message)
// @route   POST /api/whatsapp/conversations/start
exports.startNewChat = async (req, res) => {
  const tenantId = req.user.tenant_id;
  const userId = req.user.id;
  const {
    account_id,
    phone_number,
    customer_id,
    contact_name,
    initial_message,
    message_type = 'template',
    template_name,
    language_code = 'ar'
  } = req.body;
  await ensureWhatsAppTable();

  try {
    const normPhone = normalisePhone(phone_number);
    if (!normPhone) {
      return res.status(400).json({ status: 'error', message: 'Valid recipient phone number is required' });
    }

    // 1. Resolve Account ID
    let resolvedAccountId = account_id;
    if (!resolvedAccountId) {
      const aRes = await db.query(`
        SELECT id FROM whatsapp_accounts
        WHERE tenant_id::text = $1::text AND is_active = TRUE
        ORDER BY is_default DESC, id ASC LIMIT 1
      `, [tenantId]);
      if (aRes.rows.length > 0) resolvedAccountId = aRes.rows[0].id;
    }

    // 2. Resolve Customer Info if matching customer exists
    let effectiveName = contact_name;
    let effectiveCustomerId = customer_id || null;
    if (!effectiveCustomerId) {
      const cRes = await db.query(`
        SELECT id, name FROM customers
        WHERE tenant_id::text = $1::text AND (phone = $2 OR phone = $3)
        LIMIT 1
      `, [tenantId, phone_number, normPhone]);
      if (cRes.rows.length > 0) {
        effectiveCustomerId = cRes.rows[0].id;
        effectiveName = effectiveName || cRes.rows[0].name;
      }
    }

    // 3. Idempotent conversation upsert
    const upsertRes = await db.query(`
      INSERT INTO whatsapp_conversations (
        tenant_id, account_id, assigned_user_id, phone_number, contact_name, customer_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id, phone_number, account_id)
      DO UPDATE SET
        contact_name = COALESCE(EXCLUDED.contact_name, whatsapp_conversations.contact_name),
        customer_id = COALESCE(EXCLUDED.customer_id, whatsapp_conversations.customer_id)
      RETURNING *
    `, [
      tenantId,
      resolvedAccountId || null,
      userId,
      normPhone,
      effectiveName || normPhone,
      effectiveCustomerId
    ]);

    const conversation = upsertRes.rows[0];

    // 4. Send initial message if requested
    let messageRow = null;
    if (template_name || initial_message) {
      const mockReq = {
        user: req.user,
        params: { id: conversation.id },
        body: {
          message_type: template_name ? 'template' : (message_type || 'text'),
          template_name,
          language_code,
          body: initial_message || `Hello`
        }
      };
      // Internal invoke
      const mockRes = {
        json: (data) => { messageRow = data.data; },
        status: () => ({ json: (d) => { messageRow = null; } })
      };
      try {
        await exports.sendMessage(mockReq, mockRes);
      } catch (e) {
        console.warn('[startNewChat initial message warning]:', e.message);
      }
    }

    res.json({
      status: 'success',
      data: {
        conversation,
        initialMessage: messageRow
      }
    });

  } catch (err) {
    console.error('[WhatsApp startNewChat]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Assign conversation to agent
// @route   PATCH /api/whatsapp/conversations/:id/assign
exports.assignConversation = async (req, res) => {
  const tenantId = req.user.tenant_id;
  const conversationId = req.params.id;
  const { assigned_user_id } = req.body;
  await ensureWhatsAppTable();

  try {
    const result = await db.query(`
      UPDATE whatsapp_conversations
      SET assigned_user_id = $1, updated_at = NOW()
      WHERE id::text = $2::text AND tenant_id::text = $3::text
      RETURNING *
    `, [assigned_user_id || null, conversationId, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Conversation not found' });
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[WhatsApp assignConversation]', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to assign conversation' });
  }
};

// ===========================================================================
// WEBHOOK VERIFICATION & EVENT RECEIVER
// ===========================================================================

// Helper for defensive HMAC SHA-256 signature verification
function verifyMetaSignature(req, appSecret) {
  const signatureHeader = req.headers['x-hub-signature-256'];
  if (!signatureHeader || !signatureHeader.startsWith('sha256=') || !req.rawBody) {
    return false;
  }
  try {
    const signatureHash = signatureHeader.slice(7);
    const expectedHash = crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex');
    const sigBuf = Buffer.from(signatureHash, 'utf8');
    const expBuf = Buffer.from(expectedHash, 'utf8');
    if (sigBuf.length !== expBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch (err) {
    return false;
  }
}

// @desc    Meta Webhook Verification (Handshake)
// @route   GET /api/whatsapp/webhook
exports.handleWebhookVerification = async (req, res) => {
  await ensureWhatsAppTable();
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode !== 'subscribe' || !token) {
    return res.status(400).send('Invalid verification request');
  }

  try {
    // Check if token matches any tenant settings
    const matchRes = await db.query(`
      SELECT tenant_id FROM whatsapp_settings WHERE meta_webhook_verify_token = $1
      UNION
      SELECT tenant_id FROM meta_integration_settings WHERE meta_webhook_verify_token = $1
    `, [token]);

    if (matchRes.rows.length > 0 || (process.env.META_WEBHOOK_VERIFY_TOKEN && token === process.env.META_WEBHOOK_VERIFY_TOKEN)) {
      console.log('✅ [WhatsApp Webhook] Handshake verified successfully');
      return res.status(200).send(challenge);
    }

    console.warn('⚠️ [WhatsApp Webhook] Token mismatch for token:', token);
    return res.status(403).send('Forbidden: Token mismatch');
  } catch (err) {
    console.error('[WhatsApp Webhook Verify Error]', err.message);
    return res.status(500).send('Server Error');
  }
};

// @desc    Meta Webhook Event Ingestion (Real-Time Inbound Messages & Monotonic Statuses)
// @route   POST /api/whatsapp/webhook
exports.handleWebhookEvent = async (req, res) => {
  await ensureWhatsAppTable();

  // Acknowledge Meta immediately with 200 OK to prevent duplicate retries
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account' || !body.entry) {
      return;
    }

    for (const entry of body.entry) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;
        const value = change.value || {};
        const metadata = value.metadata || {};
        const phoneNumberId = metadata.phone_number_id;

        if (!phoneNumberId) continue;

        // 1. Multi-Tenant Routing via phone_number_id with COALESCE token resolution
        let tenantRow = null;
        const accountRes = await db.query(`
          SELECT 
            a.id AS account_id,
            a.tenant_id,
            a.branch_id,
            COALESCE(a.access_token, s.access_token) AS access_token,
            s.meta_app_secret
          FROM whatsapp_accounts a
          LEFT JOIN whatsapp_settings s ON a.tenant_id = s.tenant_id
          WHERE a.phone_number_id = $1 AND a.is_active = TRUE
        `, [phoneNumberId]);

        if (accountRes.rows.length > 0) {
          tenantRow = accountRes.rows[0];
        } else {
          // Fallback to whatsapp_settings
          const sRes = await db.query(`
            SELECT NULL AS account_id, tenant_id, NULL AS branch_id, access_token, meta_app_secret
            FROM whatsapp_settings
            WHERE phone_number_id = $1 AND is_active = TRUE
          `, [phoneNumberId]);
          if (sRes.rows.length > 0) tenantRow = sRes.rows[0];
        }

        if (!tenantRow) {
          console.warn(`[WhatsApp Webhook] Unrecognized phone_number_id: ${phoneNumberId}`);
          continue;
        }

        const { account_id, tenant_id, branch_id, access_token, meta_app_secret } = tenantRow;

        // 2. Defensive HMAC Signature verification if secret configured
        if (meta_app_secret && !verifyMetaSignature(req, meta_app_secret)) {
          console.warn(`[WhatsApp Webhook] Signature verification failed for tenant ${tenant_id}`);
          continue;
        }

        // 3. Inbound Messages Pipeline
        const messages = value.messages || [];
        const contacts = value.contacts || [];

        for (const msg of messages) {
          const wamid = msg.id;
          const fromPhone = normalisePhone(msg.from) || `+${msg.from}`;
          const profileContact = contacts.find(c => c.wa_id === msg.from);
          const contactProfileName = profileContact?.profile?.name;

          // Resolve existing customer in CRM
          let customerId = null;
          let customerName = contactProfileName || fromPhone;
          const cFind = await db.query(`
            SELECT id, name FROM customers
            WHERE tenant_id::text = $1::text AND (phone = $2 OR phone = $3)
            LIMIT 1
          `, [tenant_id, msg.from, fromPhone]);

          if (cFind.rows.length > 0) {
            customerId = cFind.rows[0].id;
            customerName = cFind.rows[0].name || customerName;
          }

          // Inbound Message Body & Media extraction
          const msgType = msg.type || 'text';
          let bodyText = '';
          let mediaUrl = null;

          if (msgType === 'text') {
            bodyText = msg.text?.body || '';
          } else if (msgType === 'image') {
            bodyText = msg.image?.caption || '[Image]';
            if (msg.image?.id) {
              mediaUrl = await downloadAndStoreMedia({ mediaId: msg.image.id, accessToken: access_token, tenantId: tenant_id });
            }
          } else if (msgType === 'document') {
            bodyText = msg.document?.filename || '[Document]';
            if (msg.document?.id) {
              mediaUrl = await downloadAndStoreMedia({ mediaId: msg.document.id, accessToken: access_token, tenantId: tenant_id });
            }
          } else if (msgType === 'audio') {
            bodyText = '[Audio Message]';
            if (msg.audio?.id) {
              mediaUrl = await downloadAndStoreMedia({ mediaId: msg.audio.id, accessToken: access_token, tenantId: tenant_id });
            }
          } else if (msgType === 'video') {
            bodyText = msg.video?.caption || '[Video]';
            if (msg.video?.id) {
              mediaUrl = await downloadAndStoreMedia({ mediaId: msg.video.id, accessToken: access_token, tenantId: tenant_id });
            }
          } else if (msgType === 'button') {
            bodyText = msg.button?.text || '[Button Click]';
          } else if (msgType === 'interactive') {
            bodyText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[Interactive Reply]';
          } else {
            bodyText = `[${msgType} message]`;
          }

          // 4. Idempotent Conversation Upsert with Atomic unread_count increment & 24h Window
          const convUpsert = await db.query(`
            INSERT INTO whatsapp_conversations (
              tenant_id, account_id, phone_number, contact_name, customer_id,
              last_message_body, last_message_at, last_message_direction,
              unread_count, window_expires_at, branch_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'inbound', 1, NOW() + INTERVAL '24 hours', $7)
            ON CONFLICT (tenant_id, phone_number, account_id)
            DO UPDATE SET
              last_message_body = EXCLUDED.last_message_body,
              last_message_at = NOW(),
              last_message_direction = 'inbound',
              unread_count = whatsapp_conversations.unread_count + 1,
              window_expires_at = NOW() + INTERVAL '24 hours',
              contact_name = COALESCE(EXCLUDED.contact_name, whatsapp_conversations.contact_name),
              customer_id = COALESCE(EXCLUDED.customer_id, whatsapp_conversations.customer_id)
            RETURNING id
          `, [
            tenant_id,
            account_id,
            fromPhone,
            customerName,
            customerId,
            bodyText,
            branch_id
          ]);

          const conversationId = convUpsert.rows[0]?.id;

          // 5. Idempotent Message Insertion (ON CONFLICT wamid DO NOTHING)
          if (conversationId && wamid) {
            await db.query(`
              INSERT INTO whatsapp_messages (
                conversation_id, tenant_id, account_id, meta_message_id,
                direction, sender_type, message_type, body, media_url, status, created_at
              )
              VALUES ($1, $2, $3, $4, 'inbound', 'customer', $5, $6, $7, 'delivered', NOW())
              ON CONFLICT (meta_message_id) DO NOTHING
            `, [
              conversationId,
              tenant_id,
              account_id,
              wamid,
              msgType,
              bodyText,
              mediaUrl
            ]);
          }

          console.log(`📥 [WhatsApp Webhook] Inbound message ingested from ${fromPhone} for tenant ${tenant_id}`);
        }

        // 6. Independent Status Webhook Pipeline (Monotonic Status Transitions)
        const statuses = value.statuses || [];
        for (const st of statuses) {
          const wamid = st.id;
          const status = st.status; // 'sent', 'delivered', 'read', 'failed'
          const errors = st.errors || [];
          const errorMsg = errors.length > 0 ? `${errors[0].code}: ${errors[0].message || errors[0].title}` : null;

          if (!wamid || !status) continue;

          // Monotonic guard: status can only advance forward (e.g. read cannot be downgraded to delivered)
          await db.query(`
            UPDATE whatsapp_messages
            SET status = $1,
                error_message = COALESCE($2, error_message)
            WHERE meta_message_id = $3
              AND (
                status = 'pending'
                OR (status = 'sent' AND $1 IN ('delivered', 'read', 'failed'))
                OR (status = 'delivered' AND $1 IN ('read', 'failed'))
              )
          `, [status, errorMsg, wamid]);
        }
      }
    }
  } catch (err) {
    console.error('[WhatsApp Webhook Event Error]', err.message);
  }
};

