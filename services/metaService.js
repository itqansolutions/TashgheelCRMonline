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
 * @param {string} formId
 * @param {string} accessToken
 */
async function fetchLeadsFromMeta(formId, accessToken) {
  if (!formId || !accessToken) {
    throw new Error('Form ID and Access Token are required to fetch leads from Meta');
  }

  const cleanFormId = formId.trim();
  const url = `${GRAPH_API_BASE}/${cleanFormId}/leads`;

  const response = await axios.get(url, {
    params: {
      access_token: accessToken.trim(),
      fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name',
      limit: 100
    },
    timeout: 20000
  });

  return response.data?.data || [];
}

/**
 * Parse Meta field_data array into a standard lead object
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

  for (const item of fieldData) {
    const key = (item.name || '').toLowerCase().trim();
    const val = Array.isArray(item.values) && item.values.length > 0 ? String(item.values[0]).trim() : '';

    if (!val) continue;

    if (key === 'full_name' || key === 'name' || key.includes('full_name')) {
      parsed.full_name = val;
    } else if (key === 'first_name' || key.includes('first_name')) {
      parsed.first_name = val;
    } else if (key === 'last_name' || key.includes('last_name')) {
      parsed.last_name = val;
    } else if (key === 'email' || key.includes('email')) {
      parsed.email = val;
    } else if (key === 'phone_number' || key === 'phone' || key.includes('phone')) {
      parsed.phone = val;
    } else if (key === 'company_name' || key.includes('company')) {
      parsed.company_name = val;
    } else if (key === 'city' || key.includes('city')) {
      parsed.city = val;
    } else {
      // Custom questions or extra fields
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
 * Prevents duplicates by meta_lead_id or matching phone/email
 */
async function ingestLead({ lead, formRecord, tenantId, branchId, reqUser = null }) {
  const metaLeadId = lead.id;
  const parsed = parseFieldData(lead.field_data);

  // 1. Check if lead already imported via meta_lead_id
  if (metaLeadId) {
    const existing = await db.query(
      'SELECT id, name FROM customers WHERE meta_lead_id = $1 AND tenant_id::text = $2::text LIMIT 1',
      [metaLeadId, tenantId]
    );
    if (existing.rows.length > 0) {
      return { status: 'skipped', reason: 'duplicate_meta_id', customer: existing.rows[0] };
    }
  }

  // 2. Check by phone or email if provided
  if (parsed.phone || parsed.email) {
    const checkDuplicate = await db.query(
      `SELECT id, name FROM customers 
       WHERE tenant_id::text = $1::text 
         AND (
           ($2::text <> '' AND phone = $2) 
           OR ($3::text <> '' AND email = $3)
         )
       LIMIT 1`,
      [tenantId, parsed.phone || '', parsed.email || '']
    );
    if (checkDuplicate.rows.length > 0) {
      // Update meta_lead_id if missing
      await db.query(
        'UPDATE customers SET meta_lead_id = COALESCE(meta_lead_id, $1) WHERE id = $2',
        [metaLeadId, checkDuplicate.rows[0].id]
      );
      return { status: 'skipped', reason: 'duplicate_contact', customer: checkDuplicate.rows[0] };
    }
  }

  // 3. Prepare notes / address
  let extraNotes = [];
  if (lead.campaign_name) extraNotes.push(`Campaign: ${lead.campaign_name}`);
  if (lead.ad_name) extraNotes.push(`Ad: ${lead.ad_name}`);
  if (formRecord.form_name) extraNotes.push(`Meta Form: ${formRecord.form_name} (ID: ${formRecord.form_id})`);
  if (parsed.notes.length > 0) extraNotes.push(`Form Responses:\n${parsed.notes.join('\n')}`);
  const combinedAddress = [parsed.city, extraNotes.join(' | ')].filter(Boolean).join(' - ');

  const assignedTo = formRecord.assigned_to || (reqUser ? reqUser.id : null);
  const sourceId = formRecord.lead_source_id || null;

  // 4. Insert customer
  const insertQuery = `
    INSERT INTO customers (
      name, company_name, email, phone, address, 
      source_id, assigned_to, status, tenant_id, branch_id,
      entity_type, is_active, meta_lead_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `;

  const values = [
    parsed.full_name,
    parsed.company_name || null,
    parsed.email || null,
    parsed.phone || null,
    combinedAddress || 'Source: Meta Ads',
    sourceId,
    assignedTo,
    'lead',
    tenantId,
    branchId || 'default-branch',
    'customer',
    true,
    metaLeadId
  ];

  const result = await db.query(insertQuery, values);
  const newCustomer = result.rows[0];

  // Activity logger
  try {
    await logActivity(tenantId, reqUser || { id: assignedTo, name: 'Meta Integration' }, 'customer', newCustomer.id, 'created', {
      name: { to: newCustomer.name },
      source: { to: `Meta Lead Ads Form: ${formRecord.form_name || formRecord.form_id}` }
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
