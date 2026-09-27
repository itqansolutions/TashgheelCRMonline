const axios = require('axios');
const db = require('../config/db');
const { logCreate } = require('./loggerService');
const { logActivity } = require('../utils/activityLogger');
const { sendWelcomeMessage } = require('./whatsappService');

/**
 * Service to interact with Meta Graph API and ingest Lead Ads leads into CRM
 */

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

/**
 * Fetch leads directly from Meta Graph API for a specific form_id
 * Loops through pagination (paging.next) to ensure all leads are fetched
 * @param {string} formId
 * @param {string} accessToken
 */
async function fetchLeadsFromMeta(formId, accessToken) {
  if (!formId || !accessToken) {
    throw new Error('Form ID and Access Token are required to fetch leads from Meta');
  }

  const cleanFormId = formId.trim();
  let allLeads = [];
  let nextUrl = `${GRAPH_API_BASE}/${cleanFormId}/leads`;
  let params = {
    access_token: accessToken.trim(),
    fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name',
    limit: 100
  };

  while (nextUrl) {
    const response = await axios.get(nextUrl, {
      params,
      timeout: 25000
    });

    const leads = response.data?.data || [];
    allLeads.push(...leads);

    // Follow pagination if available
    if (response.data?.paging?.next) {
      nextUrl = response.data.paging.next;
      params = null; // Next URL already contains query parameters
    } else {
      nextUrl = null;
    }
  }

  return allLeads;
}

/**
 * Parse Meta field_data array into a standard lead object
 * Supports English & Arabic field names commonly used in Meta Lead Ads
 * field_data: [ { name: 'email', values: ['john@example.com'] }, ... ]
 */
function parseFieldData(fieldData = []) {
  const parsed = {
    full_name: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    company_name: '',
    city: '',
    notes: []
  };

  const isMatch = (key, terms) => terms.some(t => key === t || key.includes(t));

  for (const item of fieldData) {
    const key = (item.name || '').toLowerCase().trim();
    const val = Array.isArray(item.values) && item.values.length > 0 ? String(item.values[0]).trim() : '';

    if (!val) continue;

    // Phone detection
    if (isMatch(key, ['phone_number', 'phone', 'mobile', 'tel', 'cell', 'whatsapp', 'contact_number', 'mobile_number', 'phone_no', 'هاتف', 'موبايل', 'جوال', 'تليفون'])) {
      parsed.phone = val;
    } 
    // Email detection
    else if (isMatch(key, ['email', 'e-mail', 'mail', 'بريد', 'ايميل'])) {
      parsed.email = val;
    }
    // Full Name detection
    else if (isMatch(key, ['full_name', 'الاسم بالكامل', 'الاسم_بالكامل']) || (key === 'name' || key === 'الاسم' || key === 'اسم')) {
      parsed.full_name = val;
    }
    // First / Last Name
    else if (isMatch(key, ['first_name', 'الاسم الاول', 'الاسم_الاول'])) {
      parsed.first_name = val;
    } else if (isMatch(key, ['last_name', 'اسم العائلة', 'اللقب'])) {
      parsed.last_name = val;
    }
    // Company / Job / Title
    else if (isMatch(key, ['company_name', 'company', 'job_title', 'work', 'organization', 'شركة', 'الشركة', 'وظيفة', 'الوظيفة', 'عمل'])) {
      parsed.company_name = val;
      parsed.notes.push(`${item.name || 'الوظيفة/الشركة'}: ${val}`);
    }
    // City / Location
    else if (isMatch(key, ['city', 'location', 'address', 'مدينة', 'المدينة', 'عنوان', 'العنوان', 'محافظة', 'المحافظة'])) {
      parsed.city = val;
      parsed.notes.push(`${item.name || 'المدينة'}: ${val}`);
    }
    // Any other custom questions & answers
    else {
      parsed.notes.push(`${item.name}: ${val}`);
    }
  }

  if (!parsed.full_name) {
    parsed.full_name = [parsed.first_name, parsed.last_name].filter(Boolean).join(' ') || 'Meta Lead';
  }

  return parsed;
}

let metaCustomersTableReady = false;
async function ensureCustomerMetaColumns() {
  if (metaCustomersTableReady) return;
  try {
    await db.query(`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_lead_id VARCHAR(255);
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_form_name VARCHAR(255);
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_form_id VARCHAR(255);
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_welcome_sent BOOLEAN DEFAULT FALSE;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_welcome_sent_at TIMESTAMPTZ;
    `);
    metaCustomersTableReady = true;
  } catch (err) {
    console.warn('[Meta Columns Ensure]', err.message);
  }
}

/**
 * Ingest a lead into the customers table for the given tenant & branch
 * Handles:
 *  - Resolving or auto-creating 'FaceBook Campaigns' source
 *  - Upserting if lead exists (updating phone, notes, source, form info)
 *  - Saving full formatted notes & responses
 *  - Dispatching WhatsApp welcome message and tracking delivery
 */
async function ingestLead({ lead, formRecord, tenantId, branchId, reqUser = null }) {
  await ensureCustomerMetaColumns();

  const metaLeadId = String(lead.id || '').trim();
  const parsed = parseFieldData(lead.field_data);

  // 1. Resolve Lead Source -> Defaults strictly to 'FaceBook Campaigns'
  let sourceId = formRecord.lead_source_id || null;
  if (!sourceId) {
    try {
      const srcCheck = await db.query(
        `SELECT id FROM lead_sources 
         WHERE tenant_id::text = $1::text 
           AND LOWER(TRIM(name)) IN ('facebook campaigns', 'facebook', 'meta lead ads', 'facebook ads')
         LIMIT 1`,
        [tenantId]
      );
      if (srcCheck.rows.length > 0) {
        sourceId = srcCheck.rows[0].id;
      } else {
        const newSrc = await db.query(
          `INSERT INTO lead_sources (name, tenant_id) VALUES ($1, $2) RETURNING id`,
          ['FaceBook Campaigns', tenantId]
        );
        sourceId = newSrc.rows[0].id;
      }
    } catch (sErr) {
      console.warn('[Meta Lead Source Resolution]', sErr.message);
    }
  }

  // 2. Prepare Structured Notes
  let notesLines = [];
  if (formRecord.form_name) notesLines.push(`📋 Form: ${formRecord.form_name}`);
  if (formRecord.form_id) notesLines.push(`🆔 Form ID: ${formRecord.form_id}`);
  if (lead.campaign_name) notesLines.push(`📢 Campaign: ${lead.campaign_name}`);
  if (lead.adset_name) notesLines.push(`🎯 AdSet: ${lead.adset_name}`);
  if (lead.ad_name) notesLines.push(`🖼️ Ad: ${lead.ad_name}`);
  if (lead.created_time) notesLines.push(`🕒 Submitted: ${new Date(lead.created_time).toLocaleString('en-US')}`);
  if (parsed.company_name) notesLines.push(`💼 Job/Company: ${parsed.company_name}`);

  if (parsed.notes.length > 0) {
    notesLines.push(`\n--- إجابات النموذج (Form Responses) ---`);
    notesLines.push(...parsed.notes);
  }
  const formattedNotes = notesLines.join('\n');

  // Address fallback
  const combinedAddress = [parsed.city, formRecord.form_name ? `Meta Form: ${formRecord.form_name}` : ''].filter(Boolean).join(' - ') || 'Source: Meta Ads';
  const assignedTo = formRecord.assigned_to || (reqUser ? reqUser.id : null);

  // 3. Duplicate Detection: Check by meta_lead_id OR by phone/email
  let existingCustomer = null;

  if (metaLeadId) {
    const existing = await db.query(
      'SELECT id, name, phone, email, notes, meta_lead_id, whatsapp_welcome_sent FROM customers WHERE meta_lead_id = $1 LIMIT 1',
      [metaLeadId]
    );
    if (existing.rows.length > 0) {
      existingCustomer = existing.rows[0];
    }
  }

  if (!existingCustomer && (parsed.phone || parsed.email)) {
    const checkDuplicate = await db.query(
      `SELECT id, name, phone, email, notes, meta_lead_id, whatsapp_welcome_sent FROM customers 
       WHERE tenant_id::text = $1::text 
         AND (
           ($2::text <> '' AND phone = $2) 
           OR ($3::text <> '' AND email = $3)
         )
       LIMIT 1`,
      [tenantId, parsed.phone || '', parsed.email || '']
    );
    if (checkDuplicate.rows.length > 0) {
      existingCustomer = checkDuplicate.rows[0];
    }
  }

  let status = 'created';
  let targetCustomer = null;
  let shouldSendWhatsApp = false;

  // 4. UPSERT: If customer already exists, UPDATE missing data and align branch/tenant
  if (existingCustomer) {
    status = 'updated';
    const updateQuery = `
      UPDATE customers 
      SET 
        phone = COALESCE(NULLIF($1, ''), phone),
        company_name = COALESCE(NULLIF($2, ''), company_name),
        notes = $3,
        address = COALESCE(NULLIF(address, ''), $4),
        source_id = COALESCE(source_id, $5),
        source = 'FaceBook Campaigns',
        meta_lead_id = COALESCE(meta_lead_id, $6),
        meta_form_name = $7,
        meta_form_id = $8,
        branch_id = COALESCE(NULLIF($9, ''), branch_id),
        tenant_id = COALESCE(NULLIF($10, ''), tenant_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
      RETURNING *
    `;

    const safeBranchId = (branchId && branchId !== 'default-branch') ? branchId : null;

    const updated = await db.query(updateQuery, [
      parsed.phone || null,
      parsed.company_name || null,
      formattedNotes,
      combinedAddress,
      sourceId,
      metaLeadId || null,
      formRecord.form_name || null,
      String(formRecord.form_id || '').trim(),
      safeBranchId,
      tenantId || null,
      existingCustomer.id
    ]);

    targetCustomer = updated.rows[0];

    // Determine if we should send WhatsApp to existing customer:
    // Send if:
    // 1. Welcome message was NEVER sent to this customer (!existingCustomer.whatsapp_welcome_sent)
    // 2. OR this is a NEW lead submission (metaLeadId is present and differs from previous meta_lead_id)
    const isNewSubmission = Boolean(metaLeadId && existingCustomer.meta_lead_id && String(existingCustomer.meta_lead_id) !== String(metaLeadId));
    const neverReceived = !existingCustomer.whatsapp_welcome_sent;
    
    if (neverReceived || isNewSubmission) {
      shouldSendWhatsApp = true;
    }
  } else {
    // 5. INSERT: Customer does not exist yet -> Create fresh record
    const insertQuery = `
      INSERT INTO customers (
        name, company_name, email, phone, address, notes,
        source_id, source, assigned_to, status, tenant_id, branch_id,
        entity_type, is_active, meta_lead_id, meta_form_name, meta_form_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;

    const safeBranchId = (branchId && branchId !== 'default-branch') ? branchId : null;

    const values = [
      parsed.full_name,
      parsed.company_name || null,
      parsed.email || null,
      parsed.phone || null,
      combinedAddress,
      formattedNotes,
      sourceId,
      'FaceBook Campaigns',
      assignedTo,
      'lead',
      tenantId,
      safeBranchId,
      'customer',
      true,
      metaLeadId || null,
      formRecord.form_name || null,
      String(formRecord.form_id || '').trim()
    ];

    const result = await db.query(insertQuery, values);
    targetCustomer = result.rows[0];
    status = 'created';
    shouldSendWhatsApp = true;

    // Activity logger
    try {
      await logActivity(tenantId, reqUser || { id: assignedTo, name: 'Meta Integration' }, 'customer', targetCustomer.id, 'created', {
        name: { to: targetCustomer.name },
        source: { to: `Meta Lead Ads: ${formRecord.form_name || formRecord.form_id}` }
      });
    } catch (actErr) {
      console.warn('[Meta Ingest Activity Log]', actErr.message);
    }
  }

/**
 * Resolves dynamic template variables mapping ({1}, {2}, {3}, ...) into WhatsApp components
 */
async function resolveTemplateVariables({ formRecord, targetCustomer, lead = {}, tenantId, defaultName }) {
  let product = null;
  let assignedUser = null;
  let branch = null;
  let tenant = null;

  // 1. Fetch linked product if configured
  if (formRecord?.product_id) {
    try {
      const pRes = await db.query(
        'SELECT id, name, sku, description, selling_price, category FROM products WHERE id = $1 AND tenant_id::text = $2::text LIMIT 1',
        [formRecord.product_id, tenantId]
      );
      if (pRes.rows.length > 0) product = pRes.rows[0];
    } catch (pErr) {
      console.warn('[Resolve Variables] Error fetching product:', pErr.message);
    }
  }

  // 2. Fetch assigned user
  const userId = formRecord?.assigned_to || targetCustomer?.assigned_to;
  if (userId) {
    try {
      const uRes = await db.query(
        'SELECT id, name, email, phone, role FROM users WHERE id = $1 AND tenant_id::text = $2::text LIMIT 1',
        [userId, tenantId]
      );
      if (uRes.rows.length > 0) assignedUser = uRes.rows[0];
    } catch (uErr) {
      console.warn('[Resolve Variables] Error fetching user:', uErr.message);
    }
  }

  // 3. Fetch branch
  const branchId = formRecord?.branch_id || targetCustomer?.branch_id;
  if (branchId && branchId !== 'default-branch') {
    try {
      const bRes = await db.query(
        'SELECT id, name, address, phone FROM branches WHERE id::text = $1::text LIMIT 1',
        [branchId]
      );
      if (bRes.rows.length > 0) branch = bRes.rows[0];
    } catch (bErr) {
      console.warn('[Resolve Variables] Error fetching branch:', bErr.message);
    }
  }

  // 4. Fetch tenant info
  if (tenantId) {
    try {
      const tRes = await db.query('SELECT id, name FROM tenants WHERE id::text = $1::text LIMIT 1', [tenantId]);
      if (tRes.rows.length > 0) tenant = tRes.rows[0];
    } catch (tErr) {}
  }

  // 5. Determine variable mapping: Form override -> Meta Settings -> WhatsApp Settings -> Fallback
  let mapping = [];
  if (Array.isArray(formRecord?.variable_mapping) && formRecord.variable_mapping.length > 0) {
    mapping = formRecord.variable_mapping;
  } else if (typeof formRecord?.variable_mapping === 'string') {
    try {
      const parsed = JSON.parse(formRecord.variable_mapping);
      if (Array.isArray(parsed) && parsed.length > 0) mapping = parsed;
    } catch {}
  }

  if (mapping.length === 0) {
    try {
      const mRes = await db.query(
        'SELECT default_variable_mapping, default_template_name FROM meta_integration_settings WHERE tenant_id::text = $1::text LIMIT 1',
        [tenantId]
      );
      if (mRes.rows.length > 0 && Array.isArray(mRes.rows[0].default_variable_mapping) && mRes.rows[0].default_variable_mapping.length > 0) {
        mapping = mRes.rows[0].default_variable_mapping;
      }
    } catch {}
  }

  if (mapping.length === 0) {
    try {
      const wRes = await db.query(
        'SELECT variable_mapping FROM whatsapp_settings WHERE tenant_id::text = $1::text LIMIT 1',
        [tenantId]
      );
      if (wRes.rows.length > 0 && Array.isArray(wRes.rows[0].variable_mapping) && wRes.rows[0].variable_mapping.length > 0) {
        mapping = wRes.rows[0].variable_mapping;
      }
    } catch {}
  }

  // Fallback default: position 1 = customer name
  if (mapping.length === 0) {
    mapping = [{ index: 1, type: 'customer_name', fallback: defaultName || 'عميلنا العزيز' }];
  }

  // Sort mapping by index (1, 2, 3...)
  mapping.sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0));

  const customVars = formRecord?.custom_variables || {};

  const parameters = [];
  for (const item of mapping) {
    const fallback = item.fallback || '—';
    let val = '';

    switch (item.type) {
      case 'customer_name':
        val = (targetCustomer.name && targetCustomer.name.trim() !== 'Meta Lead') ? targetCustomer.name.trim() : (item.fallback || defaultName || 'عميلنا العزيز');
        break;
      case 'customer_phone':
        val = targetCustomer.phone || fallback;
        break;
      case 'customer_company':
        val = targetCustomer.company_name || fallback;
        break;
      case 'customer_city':
        val = targetCustomer.address || fallback;
        break;
      case 'customer_email':
        val = targetCustomer.email || fallback;
        break;
      case 'product_name':
        val = product?.name || fallback || 'منتجنا المميز';
        break;
      case 'product_price':
        val = product?.selling_price !== undefined && product?.selling_price !== null ? String(product.selling_price) : fallback;
        break;
      case 'product_sku':
        val = product?.sku || fallback;
        break;
      case 'product_category':
        val = product?.category || fallback;
        break;
      case 'product_description':
        val = product?.description || fallback;
        break;
      case 'employee_name':
        val = assignedUser?.name || fallback || 'فريق المبيعات';
        break;
      case 'employee_phone':
        val = assignedUser?.phone || fallback;
        break;
      case 'employee_email':
        val = assignedUser?.email || fallback;
        break;
      case 'form_name':
        val = formRecord?.form_name || fallback;
        break;
      case 'campaign_name':
        val = lead?.campaign_name || formRecord?.form_name || fallback;
        break;
      case 'branch_name':
        val = branch?.name || fallback || 'الفرع الرئيسي';
        break;
      case 'company_name':
      case 'tenant_name':
        val = tenant?.name || fallback || 'خدمة العملاء';
        break;
      case 'custom_text':
        val = item.custom_value || customVars[item.index] || fallback;
        break;
      default:
        val = item.custom_value || fallback;
        break;
    }

    const cleanText = String(val || '').trim() || fallback || '—';
    parameters.push({ type: 'text', text: cleanText });
  }

  const components = [
    {
      type: 'body',
      parameters
    }
  ];

  const templateName = (formRecord?.template_name && formRecord.template_name.trim()) || null;
  const languageCode = (formRecord?.template_language && formRecord.template_language.trim()) || null;

  return { components, templateName, languageCode, product, assignedUser };
}

  // 🟢 WhatsApp Welcome Message
  // Fires asynchronously — a failure here never blocks lead creation/sync.
  let whatsappSent = false;
  if (shouldSendWhatsApp && targetCustomer && targetCustomer.phone) {
    try {
      // Use customer's name if valid, or their phone number if not registered/Meta Lead
      const customerDisplayName = (targetCustomer.name && targetCustomer.name.trim() && targetCustomer.name.trim() !== 'Meta Lead')
        ? targetCustomer.name.trim()
        : targetCustomer.phone;

      const resolved = await resolveTemplateVariables({
        formRecord,
        targetCustomer,
        lead,
        tenantId,
        defaultName: customerDisplayName
      });

      const { triggerGreetingIfConfigured } = require('./chatbotRunnerService');
      const greetResult = await triggerGreetingIfConfigured({
        phone: targetCustomer.phone,
        name: customerDisplayName,
        customerId: targetCustomer.id,
        tenantId,
        triggerType: 'meta_lead',
        customTemplateName: resolved.templateName,
        customComponents: resolved.components,
        customLanguage: resolved.languageCode
      });

      if (greetResult.sent) {
        whatsappSent = true;
        await db.query(
          `UPDATE customers SET whatsapp_welcome_sent = TRUE, whatsapp_welcome_sent_at = NOW() WHERE id = $1`,
          [targetCustomer.id]
        ).catch(() => {});
        console.log(`📱 [WhatsApp] Auto-greeting successfully sent to Meta lead #${targetCustomer.id} (${customerDisplayName}) with ${resolved.components[0].parameters.length} variable(s)`);
      } else {
        const waResult = await sendWelcomeMessage({
          phone: targetCustomer.phone,
          customerName: customerDisplayName,
          tenantId,
          templateName: resolved.templateName,
          components: resolved.components,
          languageCode: resolved.languageCode
        });

        if (waResult.sent) {
          whatsappSent = true;
          await db.query(
            `UPDATE customers SET whatsapp_welcome_sent = TRUE, whatsapp_welcome_sent_at = NOW() WHERE id = $1`,
            [targetCustomer.id]
          ).catch(() => {});
          console.log(`📱 [WhatsApp] Welcome message successfully sent to customer #${targetCustomer.id} (${customerDisplayName}) with ${resolved.components[0].parameters.length} variable(s)`);
        }
      }
    } catch (waErr) {
      console.warn('[WhatsApp Welcome Message Error]', waErr.message);
    }
  }

  return { status, customer: targetCustomer, whatsappSent };
}

module.exports = {
  fetchLeadsFromMeta,
  parseFieldData,
  ingestLead
};
