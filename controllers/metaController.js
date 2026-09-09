const db = require('../config/db');
const crypto = require('crypto');
const { fetchLeadsFromMeta, ingestLead } = require('../services/metaService');

// Helper to auto-create Meta tables if the explicit migration has not run yet.
let tableEnsured = false;
async function ensureMetaFormsTable() {
  if (tableEnsured) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS meta_forms (
        id SERIAL PRIMARY KEY,
        form_id VARCHAR(120) NOT NULL,
        form_name VARCHAR(255) NOT NULL,
        page_name VARCHAR(255),
        page_access_token TEXT,
        lead_source_id INTEGER REFERENCES lead_sources(id) ON DELETE SET NULL,
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_active BOOLEAN DEFAULT TRUE,
        last_synced_at TIMESTAMP WITH TIME ZONE,
        lead_count INTEGER DEFAULT 0,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        branch_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_tenant_form_id UNIQUE (tenant_id, form_id)
      );
    `);

    // Credentials are deliberately separate from `settings`: that table is
    // shared by the application and its contents are exposed to public
    // branding reads. Meta credentials must belong to exactly one tenant.
    await db.query(`
      CREATE TABLE IF NOT EXISTS meta_integration_settings (
        tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        meta_app_id VARCHAR(255),
        meta_app_secret TEXT,
        meta_webhook_verify_token TEXT,
        meta_default_access_token TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_meta_forms_form_id ON meta_forms(form_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_meta_forms_tenant_id ON meta_forms(tenant_id);`);
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_integration_settings_verify_token
      ON meta_integration_settings (meta_webhook_verify_token)
      WHERE meta_webhook_verify_token IS NOT NULL AND meta_webhook_verify_token <> '';
    `);
    await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_lead_id VARCHAR(120);`);
    await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;`);
    await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_form_name VARCHAR(255);`);
    await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_form_id VARCHAR(120);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_customers_meta_lead_id ON customers(meta_lead_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_customers_meta_form_id ON customers(meta_form_id);`);

    // A real Meta form must not be configured by multiple organizations. Do
    // not silently delete legacy duplicates; log them and reject all new
    // duplicates in the controller until an administrator resolves them.
    const duplicateFormIds = await db.query(`
      SELECT form_id
      FROM meta_forms
      GROUP BY form_id
      HAVING COUNT(*) > 1
      LIMIT 1
    `);
    if (duplicateFormIds.rows.length === 0) {
      await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_forms_unique_form_id ON meta_forms(form_id);`);
    } else {
      console.error(`[Meta Integration] Duplicate form ID ${duplicateFormIds.rows[0].form_id} needs manual ownership resolution.`);
    }

    tableEnsured = true;
  } catch (err) {
    console.error('Error ensuring meta_forms table:', err.message);
  }
}

function parseOptionalId(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

async function validateTenantRelations(tenantId, leadSourceId, assignedTo) {
  if (leadSourceId !== null) {
    const source = await db.query(
      'SELECT 1 FROM lead_sources WHERE id = $1 AND tenant_id::text = $2::text',
      [leadSourceId, tenantId]
    );
    if (source.rows.length === 0) {
      throw new Error('Lead source does not belong to this organization');
    }
  }

  if (assignedTo !== null) {
    const user = await db.query(
      'SELECT 1 FROM users WHERE id = $1 AND tenant_id::text = $2::text',
      [assignedTo, tenantId]
    );
    if (user.rows.length === 0) {
      throw new Error('Assigned user does not belong to this organization');
    }
  }
}

async function getMetaSettingsForTenant(tenantId) {
  const result = await db.query(
    `SELECT meta_app_id, meta_app_secret, meta_webhook_verify_token, meta_default_access_token
     FROM meta_integration_settings
     WHERE tenant_id::text = $1::text`,
    [tenantId]
  );
  return result.rows[0] || {};
}

function serializeMetaForm(form) {
  return {
    ...form,
    page_access_token: form.page_access_token ? `••••••••${form.page_access_token.slice(-4)}` : '',
    has_token: !!form.page_access_token
  };
}

function matchesMetaSignature(rawBody, appSecret, signature) {
  if (!rawBody || !appSecret || !signature || !signature.startsWith('sha256=')) return false;

  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signature, 'utf8');

  return expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function resolveWebhookTenant(req) {
  const signature = req.get('x-hub-signature-256');
  const result = await db.query(`
    SELECT tenant_id, meta_app_secret
    FROM meta_integration_settings
    WHERE meta_app_secret IS NOT NULL AND meta_app_secret <> ''
  `);

  const matchingTenants = result.rows.filter(({ meta_app_secret }) =>
    matchesMetaSignature(req.rawBody, meta_app_secret, signature)
  );

  return matchingTenants.length === 1 ? matchingTenants[0].tenant_id : null;
}

// @desc    Get all configured Meta Form IDs for tenant
// @route   GET /api/meta/forms
// @access  Private
exports.getMetaForms = async (req, res) => {
  await ensureMetaFormsTable();
  const tenant_id = req.user.tenant_id;

  try {
    const result = await db.query(`
      SELECT 
        mf.*,
        COALESCE(u.name, 'Unassigned') as assigned_to_name,
        COALESCE(ls.name, 'Meta Lead Ads') as lead_source_name
      FROM meta_forms mf
      LEFT JOIN users u ON mf.assigned_to::text = u.id::text AND mf.tenant_id::text = u.tenant_id::text
      LEFT JOIN lead_sources ls ON mf.lead_source_id::text = ls.id::text AND mf.tenant_id::text = ls.tenant_id::text
      WHERE mf.tenant_id::text = $1::text
      ORDER BY mf.created_at DESC
    `, [tenant_id]);

    // Mask the access tokens in response for security
    const masked = result.rows.map(serializeMetaForm);

    res.json({ status: 'success', data: masked });
  } catch (err) {
    console.error('[getMetaForms]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Add a new Meta Form ID
// @route   POST /api/meta/forms
// @access  Private
exports.createMetaForm = async (req, res) => {
  await ensureMetaFormsTable();
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || 'default-branch';
  const { form_id, form_name, page_name, page_access_token, lead_source_id, assigned_to } = req.body;

  if (!form_id || !form_name) {
    return res.status(400).json({ status: 'error', message: 'Form ID and Form Name are required' });
  }

  const cleanFormId = String(form_id).trim();
  const cleanFormName = String(form_name).trim();
  if (!cleanFormId || !cleanFormName) {
    return res.status(400).json({ status: 'error', message: 'Form ID and Form Name are required' });
  }
  let cleanSourceId;
  let cleanAssignedTo;

  try {
    cleanSourceId = parseOptionalId(lead_source_id, 'Lead source ID');
    cleanAssignedTo = parseOptionalId(assigned_to, 'Assigned user ID');
    await validateTenantRelations(tenant_id, cleanSourceId, cleanAssignedTo);

    const ownership = await db.query(
      'SELECT tenant_id FROM meta_forms WHERE form_id = $1 LIMIT 1',
      [cleanFormId]
    );
    if (ownership.rows.length > 0 && String(ownership.rows[0].tenant_id) !== String(tenant_id)) {
      return res.status(409).json({ status: 'error', message: 'This Meta Form ID is already connected to another organization' });
    }
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }

  try {
    const insertQuery = `
      INSERT INTO meta_forms (
        form_id, form_name, page_name, page_access_token,
        lead_source_id, assigned_to, tenant_id, branch_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (tenant_id, form_id) 
      DO UPDATE SET
        form_name = EXCLUDED.form_name,
        page_name = EXCLUDED.page_name,
        page_access_token = COALESCE(NULLIF(EXCLUDED.page_access_token, ''), meta_forms.page_access_token),
        lead_source_id = EXCLUDED.lead_source_id,
        assigned_to = EXCLUDED.assigned_to,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await db.query(insertQuery, [
      cleanFormId, cleanFormName, page_name || null, page_access_token ? page_access_token.trim() : null,
      cleanSourceId, cleanAssignedTo, tenant_id, branch_id
    ]);

    res.status(201).json({ status: 'success', data: serializeMetaForm(result.rows[0]), message: 'Meta Form configured successfully' });
  } catch (err) {
    console.error('[createMetaForm]', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ status: 'error', message: 'This Meta Form ID is already connected to another organization' });
    }
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Update a Meta Form configuration
// @route   PUT /api/meta/forms/:id
// @access  Private
exports.updateMetaForm = async (req, res) => {
  await ensureMetaFormsTable();
  const tenant_id = req.user.tenant_id;
  const { form_name, page_name, page_access_token, lead_source_id, assigned_to, is_active } = req.body;

  let cleanSourceId;
  let cleanAssignedTo;

  try {
    cleanSourceId = parseOptionalId(lead_source_id, 'Lead source ID');
    cleanAssignedTo = parseOptionalId(assigned_to, 'Assigned user ID');
    await validateTenantRelations(tenant_id, cleanSourceId, cleanAssignedTo);
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }

  try {
    let updateSql = `
      UPDATE meta_forms 
      SET 
        form_name = COALESCE($1, form_name),
        page_name = COALESCE($2, page_name),
        lead_source_id = $3,
        assigned_to = $4,
        is_active = COALESCE($5, is_active),
        updated_at = CURRENT_TIMESTAMP
    `;
    const params = [form_name, page_name, cleanSourceId, cleanAssignedTo, is_active];
    let pIdx = 6;

    if (page_access_token && page_access_token.trim() !== '') {
      updateSql += `, page_access_token = $${pIdx++}`;
      params.push(page_access_token.trim());
    }

    updateSql += ` WHERE id = $${pIdx++} AND tenant_id::text = $${pIdx++}::text RETURNING *`;
    params.push(req.params.id, tenant_id);

    const result = await db.query(updateSql, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Meta Form not found' });
    }

    res.json({ status: 'success', data: serializeMetaForm(result.rows[0]), message: 'Form updated' });
  } catch (err) {
    console.error('[updateMetaForm]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Delete a Meta Form configuration
// @route   DELETE /api/meta/forms/:id
// @access  Private
exports.deleteMetaForm = async (req, res) => {
  await ensureMetaFormsTable();
  const tenant_id = req.user.tenant_id;

  try {
    const result = await db.query(
      'DELETE FROM meta_forms WHERE id = $1 AND tenant_id::text = $2::text RETURNING *',
      [req.params.id, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Meta Form not found' });
    }

    res.json({ status: 'success', message: 'Meta Form removed successfully' });
  } catch (err) {
    console.error('[deleteMetaForm]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Sync leads immediately for a specific Meta Form ID
// @route   POST /api/meta/forms/:id/sync
// @access  Private
exports.syncFormLeads = async (req, res) => {
  await ensureMetaFormsTable();
  const tenant_id = req.user.tenant_id;
  // Smart branch_id fallback matching customersController
  let branch_id = req.branchId || req.user?.branch_id;
  if (!branch_id) {
    try {
      const bRes = await db.query('SELECT id FROM branches WHERE tenant_id::text = $1::text LIMIT 1', [tenant_id]);
      if (bRes.rows.length > 0) branch_id = bRes.rows[0].id;
    } catch (e) {}
  }
  if (!branch_id) branch_id = 'default-branch';

  try {
    // 1. Fetch form configuration
    const formRes = await db.query(
      'SELECT * FROM meta_forms WHERE id = $1 AND tenant_id::text = $2::text',
      [req.params.id, tenant_id]
    );

    if (formRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Meta Form configuration not found' });
    }

    const form = formRes.rows[0];

    // Check for a form-level token, or this tenant's default token.
    let token = form.page_access_token;
    if (!token) {
      const tenantSettings = await getMetaSettingsForTenant(tenant_id);
      token = tenantSettings.meta_default_access_token;
    }

    if (!token) {
      return res.status(400).json({
        status: 'error',
        message: 'No Page Access Token found. Enter an Access Token for this form or in your organization credentials.'
      });
    }

    // 2. Fetch leads from Meta Graph API
    let metaLeads = [];
    try {
      metaLeads = await fetchLeadsFromMeta(form.form_id, token);
    } catch (fetchErr) {
      const metaErr = fetchErr.response?.data?.error?.message || fetchErr.message;
      return res.status(400).json({
        status: 'error',
        message: `Meta API Error: ${metaErr}`
      });
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const lead of metaLeads) {
      try {
        const result = await ingestLead({
          lead,
          formRecord: form,
          tenantId: tenant_id,
          branchId: branch_id,
          reqUser: req.user
        });

        if (result.status === 'created') {
          createdCount++;
        } else if (result.status === 'updated') {
          updatedCount++;
        } else {
          skippedCount++;
        }
      } catch (ingestErr) {
        console.warn('[Ingest Lead Error]', ingestErr.message);
        skippedCount++;
      }
    }

    // 3. Update sync timestamp and total lead count
    await db.query(`
      UPDATE meta_forms 
      SET 
        last_synced_at = CURRENT_TIMESTAMP,
        lead_count = lead_count + $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND tenant_id::text = $3::text
    `, [createdCount, form.id, tenant_id]);

    res.json({
      status: 'success',
      data: {
        total_fetched: metaLeads.length,
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount
      },
      message: `Sync complete! ${createdCount} new leads imported, ${updatedCount} existing leads updated with phone and details.`
    });
  } catch (err) {
    console.error('[syncFormLeads Error]', err.response?.data || err.message, err.stack);
    const metaErrorMsg = err.response?.data?.error?.message || err.message;
    res.status(500).json({
      status: 'error',
      message: `Meta Sync Failed: ${metaErrorMsg}`
    });
  }
};

// @desc    Get customers imported from a specific Meta Form
// @route   GET /api/meta/forms/:id/customers
// @access  Private
exports.getFormCustomers = async (req, res) => {
  await ensureMetaFormsTable();
  const tenant_id = req.user.tenant_id;
  try {
    const formRes = await db.query(
      'SELECT id, form_id, form_name FROM meta_forms WHERE id = $1 AND tenant_id::text = $2::text',
      [req.params.id, tenant_id]
    );
    if (formRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Meta Form not found' });
    }
    const form = formRes.rows[0];

    const result = await db.query(`
      SELECT 
        c.*, 
        COALESCE(u.name, 'Unassigned') as assigned_to_name,
        COALESCE(ls.name, c.source, 'FaceBook Campaigns') as source_name
      FROM customers c
      LEFT JOIN users u ON c.assigned_to::text = u.id::text AND c.tenant_id::text = u.tenant_id::text
      LEFT JOIN lead_sources ls ON c.source_id::text = ls.id::text
      WHERE c.tenant_id::text = $1::text 
        AND (c.meta_form_id = $2 OR c.meta_form_name = $3)
      ORDER BY c.created_at DESC
    `, [tenant_id, form.form_id, form.form_name]);

    res.json({
      status: 'success',
      data: result.rows,
      form: form
    });
  } catch (err) {
    console.error('[getFormCustomers Error]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Get the current tenant's Meta integration credentials
// @route   GET /api/meta/settings
// @access  Private
exports.getMetaSettings = async (req, res) => {
  await ensureMetaFormsTable();
  try {
    const settings = await getMetaSettingsForTenant(req.user.tenant_id);

    res.json({
      status: 'success',
      data: {
        meta_app_id: settings.meta_app_id || '',
        meta_webhook_verify_token: settings.meta_webhook_verify_token || '',
        has_default_access_token: !!settings.meta_default_access_token,
        has_app_secret: !!settings.meta_app_secret
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Update the current tenant's Meta integration credentials
// @route   POST /api/meta/settings
// @access  Private (Admin)
exports.updateMetaSettings = async (req, res) => {
  await ensureMetaFormsTable();
  const {
    meta_default_access_token,
    meta_webhook_verify_token,
    meta_app_id,
    meta_app_secret
  } = req.body;

  const verifyToken = String(meta_webhook_verify_token || '').trim();
  if (!verifyToken) {
    return res.status(400).json({ status: 'error', message: 'Webhook verify token is required' });
  }

  try {
    await db.query(`
      INSERT INTO meta_integration_settings (
        tenant_id,
        meta_app_id,
        meta_app_secret,
        meta_webhook_verify_token,
        meta_default_access_token
      ) VALUES ($1, $2, NULLIF($3, ''), $4, NULLIF($5, ''))
      ON CONFLICT (tenant_id) DO UPDATE SET
        meta_app_id = EXCLUDED.meta_app_id,
        meta_app_secret = COALESCE(NULLIF(EXCLUDED.meta_app_secret, ''), meta_integration_settings.meta_app_secret),
        meta_webhook_verify_token = EXCLUDED.meta_webhook_verify_token,
        meta_default_access_token = COALESCE(NULLIF(EXCLUDED.meta_default_access_token, ''), meta_integration_settings.meta_default_access_token),
        updated_at = CURRENT_TIMESTAMP
    `, [
      req.user.tenant_id,
      String(meta_app_id || '').trim() || null,
      String(meta_app_secret || '').trim(),
      verifyToken,
      String(meta_default_access_token || '').trim()
    ]);

    res.json({ status: 'success', message: 'Meta settings updated' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ status: 'error', message: 'Webhook verify token is already in use by another organization' });
    }
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Meta Webhook Verification (Handshake from Meta App)
// @route   GET /api/meta/webhook
// @access  Public
exports.handleWebhookVerification = async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    try {
      await ensureMetaFormsTable();
      const matchingTenant = await db.query(
        `SELECT tenant_id
         FROM meta_integration_settings
         WHERE meta_webhook_verify_token = $1
         LIMIT 2`,
        [token]
      );

      if (mode === 'subscribe' && matchingTenant.rows.length === 1) {
        console.log(`✅ [Meta Webhook] Handshake verified for tenant ${matchingTenant.rows[0].tenant_id}`);
        return res.status(200).send(challenge);
      }
    } catch (err) {
      console.error('[Meta Webhook] Verification lookup failed:', err.message);
    }

    console.warn('⚠️ [Meta Webhook] Verification token mismatch.');
    return res.sendStatus(403);
  }

  res.sendStatus(400);
};

// @desc    Meta Webhook Lead Receiver (Real-time leadgen event)
// @route   POST /api/meta/webhook
// @access  Public
exports.handleWebhookEvent = async (req, res) => {
  let tenantId;
  try {
    await ensureMetaFormsTable();
    tenantId = await resolveWebhookTenant(req);
  } catch (err) {
    console.error('[Meta Webhook] Signature validation failed:', err.message);
    return res.sendStatus(500);
  }

  if (!tenantId) {
    console.warn('⚠️ [Meta Webhook] Rejected event with an invalid signature or ambiguous tenant.');
    return res.sendStatus(403);
  }

  // Acknowledge only after the Meta HMAC signature has been verified.
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body || {};
  if (body.object === 'page') {
    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        if (change.field === 'leadgen') {
          const leadgen = change.value;
          const formId = String(leadgen.form_id || '').trim();
          const leadgenId = String(leadgen.leadgen_id || '').trim();

          console.log(`📥 [Meta Webhook] Leadgen event received for form_id: ${formId}, leadgen_id: ${leadgenId}`);

          try {
            // A signed event maps to one tenant, then to one configured form.
            const formRes = await db.query(
              `SELECT * FROM meta_forms
               WHERE form_id = $1 AND tenant_id::text = $2::text AND is_active = TRUE`,
              [formId, tenantId]
            );
            if (formRes.rows.length === 0) {
              console.warn(`[Meta Webhook] No active form configured for tenant ${tenantId}, form_id ${formId}`);
              continue;
            }

            const form = formRes.rows[0];
            const tenantSettings = await getMetaSettingsForTenant(tenantId);
            const token = form.page_access_token || tenantSettings.meta_default_access_token;

            if (!token) {
              console.warn(`[Meta Webhook] No access token found to download leadgen_id ${leadgenId}`);
              continue;
            }

            // Fetch this single lead details from Graph API
            const axios = require('axios');
            const leadDetailRes = await axios.get(`https://graph.facebook.com/v19.0/${leadgenId}`, {
              params: {
                access_token: token,
                fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name'
              },
              timeout: 15000
            });

            if (leadDetailRes.data) {
              const ingestRes = await ingestLead({
                lead: leadDetailRes.data,
                formRecord: form,
                tenantId,
                branchId: form.branch_id || 'default-branch'
              });

              if (ingestRes.status === 'created') {
                await db.query(`
                  UPDATE meta_forms
                  SET lead_count = lead_count + 1, last_synced_at = CURRENT_TIMESTAMP
                  WHERE id = $1 AND tenant_id::text = $2::text
                `, [form.id, tenantId]);
                console.log(`🎉 [Meta Webhook] Ingested customer #${ingestRes.customer.id} (${ingestRes.customer.name})`);
              }
            }
          } catch (hookErr) {
            console.error('[Meta Webhook Processing Error]', hookErr.response?.data || hookErr.message);
          }
        }
      }
    }
  }
};
