const db = require('../config/db');
const { fetchLeadsFromMeta, ingestLead } = require('../services/metaService');

// Helper to auto-create meta_forms table if not yet executed
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

      CREATE INDEX IF NOT EXISTS idx_meta_forms_form_id ON meta_forms(form_id);
      CREATE INDEX IF NOT EXISTS idx_meta_forms_tenant_id ON meta_forms(tenant_id);

      ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_lead_id VARCHAR(120);
      CREATE INDEX IF NOT EXISTS idx_customers_meta_lead_id ON customers(meta_lead_id);
    `);
    tableEnsured = true;
  } catch (err) {
    console.error('Error ensuring meta_forms table:', err.message);
  }
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
      LEFT JOIN lead_sources ls ON mf.lead_source_id::text = ls.id::text
      WHERE mf.tenant_id::text = $1::text
      ORDER BY mf.created_at DESC
    `, [tenant_id]);

    // Mask the access tokens in response for security
    const masked = result.rows.map(row => ({
      ...row,
      page_access_token: row.page_access_token ? `••••••••${row.page_access_token.slice(-4)}` : '',
      has_token: !!row.page_access_token
    }));

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
  const cleanSourceId = lead_source_id && lead_source_id !== '' ? parseInt(lead_source_id) : null;
  const cleanAssignedTo = assigned_to && assigned_to !== '' ? parseInt(assigned_to) : null;

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

    res.status(201).json({ status: 'success', data: result.rows[0], message: 'Meta Form configured successfully' });
  } catch (err) {
    console.error('[createMetaForm]', err.message);
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

  const cleanSourceId = lead_source_id && lead_source_id !== '' ? parseInt(lead_source_id) : null;
  const cleanAssignedTo = assigned_to && assigned_to !== '' ? parseInt(assigned_to) : null;

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

    res.json({ status: 'success', data: result.rows[0], message: 'Form updated' });
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
  const branch_id = req.branchId || req.user?.branch_id || 'default-branch';

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

    // Check for access token: Form level token, or global settings token
    let token = form.page_access_token;
    if (!token) {
      const globalToken = await db.query("SELECT value FROM settings WHERE key = 'meta_default_access_token'");
      if (globalToken.rows.length > 0 && globalToken.rows[0].value) {
        token = globalToken.rows[0].value;
      }
    }

    if (!token) {
      return res.status(400).json({
        status: 'error',
        message: 'No Page Access Token configured for this form or in global Meta settings. Please provide a token.'
      });
    }

    // 2. Fetch leads from Meta Graph API
    const metaLeads = await fetchLeadsFromMeta(form.form_id, token);

    let createdCount = 0;
    let skippedCount = 0;

    for (const lead of metaLeads) {
      const result = await ingestLead({
        lead,
        formRecord: form,
        tenantId: tenant_id,
        branchId: branch_id,
        reqUser: req.user
      });

      if (result.status === 'created') {
        createdCount++;
      } else {
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
      WHERE id = $2
    `, [createdCount, form.id]);

    res.json({
      status: 'success',
      data: {
        total_fetched: metaLeads.length,
        created: createdCount,
        skipped: skippedCount
      },
      message: `Sync complete! ${createdCount} new leads imported (${skippedCount} already existed).`
    });
  } catch (err) {
    console.error('[syncFormLeads Error]', err.response?.data || err.message);
    const metaErrorMsg = err.response?.data?.error?.message || err.message;
    res.status(500).json({
      status: 'error',
      message: `Meta Sync Failed: ${metaErrorMsg}`
    });
  }
};

// @desc    Get Meta global integration credentials (default page token, verify token)
// @route   GET /api/meta/settings
// @access  Private
exports.getMetaSettings = async (req, res) => {
  try {
    const keys = ['meta_default_access_token', 'meta_webhook_verify_token', 'meta_app_id'];
    const result = await db.query('SELECT key, value FROM settings WHERE key = ANY($1)', [keys]);

    const map = {};
    for (const row of result.rows) {
      map[row.key] = row.value;
    }

    res.json({
      status: 'success',
      data: {
        meta_app_id: map['meta_app_id'] || '',
        meta_webhook_verify_token: map['meta_webhook_verify_token'] || 'tashgheel_meta_lead_token',
        has_default_access_token: !!map['meta_default_access_token']
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Update Meta global integration credentials
// @route   POST /api/meta/settings
// @access  Private (Admin)
exports.updateMetaSettings = async (req, res) => {
  const { meta_default_access_token, meta_webhook_verify_token, meta_app_id } = req.body;

  try {
    const items = [
      { key: 'meta_webhook_verify_token', val: meta_webhook_verify_token },
      { key: 'meta_app_id', val: meta_app_id }
    ];

    if (meta_default_access_token && meta_default_access_token.trim() !== '') {
      items.push({ key: 'meta_default_access_token', val: meta_default_access_token.trim() });
    }

    for (const item of items) {
      if (item.val !== undefined) {
        await db.query(
          'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP',
          [item.key, item.val]
        );
      }
    }

    res.json({ status: 'success', message: 'Meta settings updated' });
  } catch (err) {
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
    // Look up verification token in settings
    let expectedToken = 'tashgheel_meta_lead_token';
    try {
      const dbToken = await db.query("SELECT value FROM settings WHERE key = 'meta_webhook_verify_token'");
      if (dbToken.rows.length > 0 && dbToken.rows[0].value) {
        expectedToken = dbToken.rows[0].value;
      }
    } catch (e) {}

    if (mode === 'subscribe' && token === expectedToken) {
      console.log('✅ [Meta Webhook] Handshake verified successfully!');
      return res.status(200).send(challenge);
    } else {
      console.warn('⚠️ [Meta Webhook] Verification token mismatch.');
      return res.sendStatus(403);
    }
  }

  res.sendStatus(400);
};

// @desc    Meta Webhook Lead Receiver (Real-time leadgen event)
// @route   POST /api/meta/webhook
// @access  Public
exports.handleWebhookEvent = async (req, res) => {
  const body = req.body;

  // Immediately acknowledge Meta to prevent timeout/retries
  res.status(200).send('EVENT_RECEIVED');

  if (body.object === 'page') {
    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        if (change.field === 'leadgen') {
          const leadgen = change.value;
          const formId = String(leadgen.form_id || '').trim();
          const leadgenId = String(leadgen.leadgen_id || '').trim();

          console.log(`📥 [Meta Webhook] Leadgen event received for form_id: ${formId}, leadgen_id: ${leadgenId}`);

          try {
            await ensureMetaFormsTable();

            // Find matching form record
            const formRes = await db.query('SELECT * FROM meta_forms WHERE form_id = $1 AND is_active = TRUE', [formId]);
            if (formRes.rows.length === 0) {
              console.warn(`[Meta Webhook] No active form configured for form_id ${formId}`);
              continue;
            }

            for (const form of formRes.rows) {
              // Resolve token
              let token = form.page_access_token;
              if (!token) {
                const gRes = await db.query("SELECT value FROM settings WHERE key = 'meta_default_access_token'");
                if (gRes.rows.length > 0) token = gRes.rows[0].value;
              }

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
                  tenantId: form.tenant_id,
                  branchId: form.branch_id || 'default-branch'
                });

                if (ingestRes.status === 'created') {
                  await db.query(`
                    UPDATE meta_forms 
                    SET lead_count = lead_count + 1, last_synced_at = CURRENT_TIMESTAMP 
                    WHERE id = $1
                  `, [form.id]);
                  console.log(`🎉 [Meta Webhook] Ingested customer #${ingestRes.customer.id} (${ingestRes.customer.name})`);
                }
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
