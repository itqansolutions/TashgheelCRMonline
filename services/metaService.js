const axios = require('axios');
const db = require('../config/db');
const { logCreate } = require('./loggerService');
const { logActivity } = require('../utils/activityLogger');

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

/**
 * Ingest a lead into the customers table for the given tenant & branch
 * Handles:
 *  - Resolving or auto-creating 'FaceBook Campaigns' source
 *  - Upserting if lead exists (updating phone, notes, source, form info)
 *  - Saving full formatted notes & responses
 */
async function ingestLead({ lead, formRecord, tenantId, branchId, reqUser = null }) {
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
      'SELECT id, name, phone, email, notes FROM customers WHERE meta_lead_id = $1 LIMIT 1',
      [metaLeadId]
    );
    if (existing.rows.length > 0) {
      existingCustomer = existing.rows[0];
    }
  }

  if (!existingCustomer && (parsed.phone || parsed.email)) {
    const checkDuplicate = await db.query(
      `SELECT id, name, phone, email, notes FROM customers 
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

  // 4. UPSERT: If customer already exists, UPDATE missing data and align branch/tenant
  if (existingCustomer) {
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

    return { status: 'updated', customer: updated.rows[0] };
  }

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
  const newCustomer = result.rows[0];

  // Activity logger
  try {
    await logActivity(tenantId, reqUser || { id: assignedTo, name: 'Meta Integration' }, 'customer', newCustomer.id, 'created', {
      name: { to: newCustomer.name },
      source: { to: `Meta Lead Ads: ${formRecord.form_name || formRecord.form_id}` }
    });
  } catch (actErr) {
    console.warn('[Meta Ingest Activity Log]', actErr.message);
  }

  return { status: 'created', customer: newCustomer };
}

module.exports = {
  fetchLeadsFromMeta,
  parseFieldData,
  ingestLead
};
