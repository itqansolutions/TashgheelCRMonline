const { isValidCustomerEmail } = require('../utils/customerValidation');
const db = require('../config/db');
const accessScopeService = require('../services/accessScopeService');
const notificationService = require('../services/notificationService');
const { logAction, logCreate, logUpdate, logDelete, ACTIONS, LOG_LEVELS } = require('../services/loggerService');
const { logActivity } = require('../utils/activityLogger');
const crypto = require('crypto');

// Customer visibility mode (tenants.customer_visibility_mode; migration
// ops/proposals/customer_visibility_mode.sql). Ali 2026-11-25:
//   'scoped' (default): ownership rules enforced on customer detail reads too
//     (404 like deals) - rep sees own, team/department manager sees his people's, admin all.
//   'shared': every user in the tenant/branch can read any customer (list + detail).
// Fail closed to 'scoped' when the column is unreadable (e.g. mid-deploy).
const getCustomerVisibilityMode = async (tenantId) => {
  try {
    const r = await db.query('SELECT customer_visibility_mode FROM tenants WHERE id::text = $1::text', [String(tenantId)]);
    return r.rows[0] && r.rows[0].customer_visibility_mode === 'shared' ? 'shared' : 'scoped';
  } catch (e) {
    return 'scoped';
  }
};

// Scoped-mode access check for customer-by-id reads. Uses the same
// accessScopeService ownership rules as the list endpoint, so list and detail
// stay consistent (invisible in list => 404 by direct id).
const canAccessCustomerScoped = async (user, tenantId, branchId, customerId) => {
  if (user.role === 'admin') return true;
  const scope = await accessScopeService.buildScopePredicate({
    user,
    tableAlias: 'c',
    assigneeCol: 'assigned_to',
    paramIndex: 4
  });
  if (!scope.sql || scope.sql === '1=1') return true;
  const r = await db.query(
    `SELECT 1 FROM customers c WHERE c.id::text = $1::text AND c.tenant_id::text = $2::text AND c.branch_id::text = $3::text AND (${scope.sql}) LIMIT 1`,
    [String(customerId), String(tenantId), String(branchId), ...scope.params]
  );
  return r.rows.length > 0;
};

// Ensure customer columns exist to prevent missing-column 500 crashes
// NOTE: node-postgres (pg) does NOT support multiple SQL statements in one
// db.query() call — each ALTER TABLE must be a separate await.
let customerColumnsEnsured = false;
async function ensureCustomerColumns() {
  if (customerColumnsEnsured) return;
  const run = async (sql) => {
    try { await db.query(sql); } catch (e) { /* ignore – column already exists */ }
  };
  // Add without a DEFAULT so pre-existing rows keep an unknown (NULL) date.
  // The separate default applies only to future inserts; page reads never backfill history.
  await run(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE`);
  await run(`ALTER TABLE customers ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP`);
  await run(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'Direct'`);
  await run(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT`);
  await run(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_form_name VARCHAR(255)`);
  await run(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_form_id VARCHAR(120)`);
  await run(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_lead_id VARCHAR(120)`);
  await run(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS classification_id INTEGER`);
  await run(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS classification_name VARCHAR(100)`);
  await run(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS area_id INTEGER`);
  await run(`
    CREATE TABLE IF NOT EXISTS customer_classifications (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      color VARCHAR(30) DEFAULT '#3b82f6',
      description TEXT,
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS customer_areas (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      color VARCHAR(30) DEFAULT '#0ea5e9',
      description TEXT,
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  customerColumnsEnsured = true;
  console.log('[Customers] Column guard done.');
}

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private
exports.getCustomers = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  // Resolve branch context from request, user profile, or user assigned branches
  let branch_id = req.branchId || req.user?.branch_id || null;

  if (!branch_id && req.user?.role !== 'admin') {
    try {
      const ubRes = await db.query(
        'SELECT branch_id FROM user_branches WHERE user_id::text = $1::text LIMIT 1',
        [req.user.id]
      );
      if (ubRes.rows.length > 0) {
        branch_id = ubRes.rows[0].branch_id;
      } else {
        const mbRes = await db.query(
          'SELECT id FROM branches WHERE tenant_id::text = $1::text AND is_main = true LIMIT 1',
          [tenant_id]
        );
        if (mbRes.rows.length > 0) {
          branch_id = mbRes.rows[0].id;
        }
      }
    } catch (e) {
      console.warn('[Customers API] Non-critical branch lookup error:', e.message);
    }
  }

  // Declare query OUTSIDE try so the catch block can log it
  let query = `
    SELECT
      c.*,
      COALESCE(u.name, 'Unassigned') as assigned_to_name,
      COALESCE(ls.name, 'Direct') as source_name,
      cc.name as classification_name,
      cc.color as classification_color,
      ca.name as area_name,
      ca.color as area_color,
      ld.id as linked_deal_id,
      ld.title as linked_deal_title,
      ld.pipeline_stage as linked_deal_stage,
      ld.value as linked_deal_value,
      ld.unit_id as linked_unit_id,
      ld.unit_number as linked_unit_number,
      ld.unit_name as linked_unit_name,
      ld.unit_project as linked_unit_project,
      ld.pf_listing_reference as pf_listing_reference
    FROM customers c
    LEFT JOIN users u ON c.assigned_to::text = u.id::text AND c.tenant_id::text = u.tenant_id::text
    LEFT JOIN lead_sources ls ON c.source_id::text = ls.id::text
    LEFT JOIN customer_classifications cc ON c.classification_id = cc.id
    LEFT JOIN customer_areas ca ON c.area_id = ca.id
    LEFT JOIN LATERAL (
      SELECT
        d.id,
        d.title,
        d.pipeline_stage,
        d.value,
        d.unit_id,
        ru.unit_number,
        ru.name as unit_name,
        ru.project_name as unit_project,
        COALESCE(
          NULLIF(d.custom_fields->>'pf_listing_reference', ''),
          NULLIF(d.custom_fields->>'pf_listing_id', '')
        ) as pf_listing_reference
      FROM deals d
      LEFT JOIN re_units ru ON d.unit_id::text = ru.id::text AND d.tenant_id::text = ru.tenant_id::text
      WHERE d.tenant_id::text = c.tenant_id::text
        AND d.client_id::text = c.id::text
      ORDER BY d.id DESC
      LIMIT 1
    ) ld ON true
    WHERE c.tenant_id::text = $1::text
      AND ($2::text IS NULL OR c.branch_id::text = $2::text OR c.branch_id IS NULL OR c.branch_id::text = 'default-branch')
  `;
  const params = [tenant_id, branch_id];
  let paramIdx = 3;

  // Centralized Row-Level Scoping: Employee sees own; Manager sees dept + child depts; Admin sees all
  const scope = await accessScopeService.buildScopePredicate({
    user: req.user,
    tableAlias: 'c',
    assigneeCol: 'assigned_to',
    paramIndex: paramIdx
  });
  const visibilityMode = await getCustomerVisibilityMode(tenant_id);
  if (visibilityMode !== 'shared' && scope.sql && scope.sql !== '1=1') {
    query += ` AND ${scope.sql}`;
    params.push(...scope.params);
    paramIdx = scope.nextParamIndex;
  }

  // Dynamic Filters (Sanitized to prevent "invalid input syntax for type integer: '' ")
  if (req.query.classification_id && req.query.classification_id.trim() !== '') {
      if (req.query.classification_id === 'unclassified') {
          query += ` AND c.classification_id IS NULL`;
      } else {
          query += ` AND c.classification_id = $${paramIdx++}`;
          params.push(parseInt(req.query.classification_id));
      }
  }
  if (req.query.area_id && req.query.area_id.trim() !== '') {
      if (req.query.area_id === 'no_area' || req.query.area_id === 'unassigned') {
          query += ` AND c.area_id IS NULL`;
      } else {
          query += ` AND c.area_id = $${paramIdx++}`;
          params.push(parseInt(req.query.area_id));
      }
  }
  if (req.query.source_id && req.query.source_id.trim() !== '') {
      query += ` AND c.source_id = $${paramIdx++}`;
      params.push(parseInt(req.query.source_id));
  }
  if (req.query.meta_form_id && req.query.meta_form_id.trim() !== '') {
      query += ` AND (c.meta_form_id = $${paramIdx} OR c.meta_form_name = $${paramIdx})`;
      params.push(req.query.meta_form_id.trim());
      paramIdx++;
  }
  if (req.query.entity_type && req.query.entity_type.trim() !== '') {
      query += ` AND c.entity_type = $${paramIdx++}`;
      params.push(req.query.entity_type);
  }
  if (req.query.budget_min && req.query.budget_min !== '') {
      query += ` AND c.budget_min >= $${paramIdx++}`;
      params.push(req.query.budget_min);
  }
  if (req.query.budget_max && req.query.budget_max !== '' && Number(req.query.budget_max) > 0) {
      query += ` AND c.budget_max <= $${paramIdx++}`;
      params.push(req.query.budget_max);
  }
  if (req.query.preferred_rooms && req.query.preferred_rooms !== '') {
      query += ` AND c.preferred_rooms = $${paramIdx++}`;
      params.push(parseInt(req.query.preferred_rooms));
  }
  if (req.query.preferred_location && req.query.preferred_location.trim() !== '') {
      query += ` AND c.preferred_location LIKE $${paramIdx++}`;
      params.push(`%${req.query.preferred_location}%`);
  }
  if (req.query.manager_id && req.query.manager_id !== '') {
      query += ` AND c.manager_id = $${paramIdx++}`;
      params.push(req.query.manager_id);
  }
  if (req.query.unassigned === 'true') {
      query += ` AND c.assigned_to IS NULL`;
  }

  query += ` ORDER BY c.created_at DESC NULLS LAST, c.id DESC`;

  try {
    const result = await db.query(query, params);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[Customers API Error]', {
      error: err.message,
      stack: err.stack,
      tenantId: tenant_id,
      branchId: branch_id,
      queryPreview: query.substring(0, 300)
    });
    res.status(500).json({ status: 'error', message: `Database resolution failed: ${err.message}`, data: [] });
  }
};

// @desc    Get single customer
// @route   GET /api/customers/:id
// @access  Private
exports.getCustomerById = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  if (!branch_id) {
    return res.status(400).json({ status: 'error', message: 'Branch context required for this operation.' });
  }

  await ensureCustomerColumns();

  try {
    if ((await getCustomerVisibilityMode(tenant_id)) === 'scoped'
        && !(await canAccessCustomerScoped(req.user, tenant_id, branch_id, req.params.id))) {
      return res.status(404).json({ status: 'error', message: 'Customer not found or unauthorized' });
    }
    const result = await db.query(`
      SELECT
        c.*,
        COALESCE(u.name, 'Unassigned') as assigned_to_name,
        COALESCE(ls.name, 'Direct') as source_name,
        cc.name as classification_name,
        cc.color as classification_color,
        ca.name as area_name,
        ca.color as area_color
      FROM customers c
      LEFT JOIN users u ON c.assigned_to::text = u.id::text AND c.tenant_id::text = u.tenant_id::text
      LEFT JOIN lead_sources ls ON c.source_id::text = ls.id::text
      LEFT JOIN customer_classifications cc ON c.classification_id = cc.id
      LEFT JOIN customer_areas ca ON c.area_id = ca.id
      WHERE c.id = $1 AND c.tenant_id::text = $2::text AND c.branch_id::text = $3::text
    `, [req.params.id, tenant_id, branch_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Customer not found or unauthorized' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Customer Detail Error]', { error: err.message, tenantId: tenant_id, branchId: branch_id });
    res.status(500).json({ status: 'error', message: 'Failed to resolve customer context' });
  }
};

// @desc    Create customer
// @route   POST /api/customers
// @access  Private
exports.createCustomer = async (req, res) => {
  if (!isValidCustomerEmail(req.body.email)) return res.status(400).json({ status: 'error', message: 'Invalid email address', field: 'email' });
  const {
    name, company_name, email, phone, address, source_id, assigned_to, manager_id, status,
    entity_type, budget_min, budget_max, preferred_area_min, preferred_area_max, preferred_location, preferred_rooms,
    tax_no, reg_no, is_active, is_blacklisted, classification_id, area_id
  } = req.body;
  const tenant_id = req.user.tenant_id;
  try {
    await ensureCustomerColumns();
    // Triple Isolation: Inject branch_id with Smart Fallback
    const branch_id = req.branchId || req.user?.branch_id;

    // 🔥 DEFINITIVE SANITIZATION: Handle all falsy/empty string cases for numeric columns
    const cleanSourceId = (source_id && source_id !== '') ? parseInt(source_id) : null;
    const cleanClassificationId = (classification_id && classification_id !== '') ? parseInt(classification_id) : null;
    const cleanAreaId = (area_id && area_id !== '') ? parseInt(area_id) : null;
    const cleanBudgetMin = (budget_min && budget_min !== '') ? parseFloat(budget_min) : 0;
    const cleanBudgetMax = (budget_max && budget_max !== '') ? parseFloat(budget_max) : 0;
    const cleanAreaMin = (preferred_area_min && preferred_area_min !== '') ? parseFloat(preferred_area_min) : 0;
    const cleanAreaMax = (preferred_area_max && preferred_area_max !== '') ? parseFloat(preferred_area_max) : 0;
    const cleanRooms = (preferred_rooms && preferred_rooms !== '') ? parseInt(preferred_rooms) : 0;
    const cleanManagerId = (manager_id && manager_id !== '') ? manager_id : null;
    const cleanAssignedTo = (assigned_to && assigned_to !== '') ? assigned_to : req.user.id;

    const result = await db.query(
      `INSERT INTO customers (
        name, company_name, email, phone, address, source_id, assigned_to, manager_id, status, tenant_id, branch_id,
        entity_type, budget_min, budget_max, preferred_area_min, preferred_area_max, preferred_location, preferred_rooms,
        tax_no, reg_no, is_active, is_blacklisted, classification_id, area_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24) RETURNING *`,
      [
        name, company_name, email, phone, address, cleanSourceId, cleanAssignedTo, cleanManagerId, status || 'lead', tenant_id, branch_id,
        entity_type || 'customer', cleanBudgetMin, cleanBudgetMax, cleanAreaMin, cleanAreaMax, preferred_location, cleanRooms,
        tax_no || null, reg_no || null, is_active !== false, is_blacklisted === true, cleanClassificationId, cleanAreaId
      ]
    );

    // NEW Audit Logging (Async)
    logCreate(req, 'Customer', result.rows[0].id, result.rows[0]);

    // Activity Timeline Logging
    await logActivity(tenant_id, req.user, 'customer', result.rows[0].id, 'created', {
        name: { to: name },
        company_name: { to: company_name }
    });

    // Trigger automated greeting sequence if configured for manual_customer trigger
    if (phone) {
      try {
        const { triggerGreetingIfConfigured } = require('../services/chatbotRunnerService');
        triggerGreetingIfConfigured({
          tenantId: tenant_id,
          branchId: branch_id,
          customerId: result.rows[0].id,
          phone,
          name,
          triggerType: 'manual_customer'
        }).catch(e => console.warn('[Manual Customer Greeting Warning]:', e.message));
      } catch (e) {
        // non-blocking
      }
    }
    // Dispatch assignment notification if assigned to another user
    if (cleanAssignedTo && String(cleanAssignedTo) !== String(req.user.id)) {
      notificationService.notifyAssignment({
        tenantId: tenant_id,
        branchId: branch_id,
        recipientUserId: cleanAssignedTo,
        assignedByUserId: req.user.id,
        assignedByName: req.user.name,
        entityType: 'Customer / Lead',
        entityName: name,
        link: '/contacts/customers'
      }).catch(e => console.warn('[Customer Assignment Notification Warning]:', e.message));

      // Emit Domain Event: lead.assigned (Messaging & Notification Layer)
      try {
        const { eventBus } = require('../src/infrastructure/events/LocalEventBus');
        const DomainEvent = require('../src/infrastructure/events/DomainEvent');
        await eventBus.publish(new DomainEvent({
          eventName: 'lead.assigned',
          tenantId: tenant_id,
          branchId: branch_id,
          aggregateType: 'Customer',
          aggregateId: result.rows[0].id,
          payload: {
            leadId: result.rows[0].id,
            leadName: name,
            leadPhone: phone,
            assignedTo: cleanAssignedTo,
            assignedByUserId: req.user.id,
            assignedByName: req.user.name
          },
          actorId: req.user.id
        }));
      } catch (e) {
        // non-blocking
      }
    }

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Create Customer Error]', err.message);
    res.status(500).json({ status: 'error', message: `Server error: ${err.message}` });
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Private
exports.updateCustomer = async (req, res) => {
  if (!isValidCustomerEmail(req.body.email)) return res.status(400).json({ status: 'error', message: 'Invalid email address', field: 'email' });
  const {
    name, company_name, email, phone, address, source_id, assigned_to, manager_id, status,
    entity_type, budget_min, budget_max, preferred_area_min, preferred_area_max, preferred_location, preferred_rooms,
    tax_no, reg_no, is_active, is_blacklisted, classification_id, area_id
  } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    // Scoped visibility mode: a rep cannot write a customer he cannot see (404 like detail)
    if ((await getCustomerVisibilityMode(tenant_id)) === 'scoped'
        && !(await canAccessCustomerScoped(req.user, tenant_id, branch_id, req.params.id))) {
      return res.status(404).json({ status: 'error', message: 'Customer not found or unauthorized' });
    }
    await ensureCustomerColumns();
    // 1. Get old data for diffing & security check (Triple Isolation)
    const oldResult = await db.query('SELECT * FROM customers WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text', [req.params.id, tenant_id, branch_id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Customer not found or unauthorized for this branch' });
    }
    const oldData = oldResult.rows[0];

    // 🔥 DEFINITIVE SANITIZATION: Prevent SQL Syntax errors on Empty Strings
    const cleanSourceId = (source_id && source_id !== '') ? parseInt(source_id) : null;
    const cleanClassificationId = (classification_id !== undefined && classification_id !== '') ?
      (classification_id ? parseInt(classification_id) : null) :
      (classification_id === '' || classification_id === null ? null : oldData.classification_id);
    const cleanAreaId = (area_id !== undefined && area_id !== '') ?
      (area_id ? parseInt(area_id) : null) :
      (area_id === '' || area_id === null ? null : oldData.area_id);
    const cleanBudgetMin = (budget_min && budget_min !== '') ? parseFloat(budget_min) : 0;
    const cleanBudgetMax = (budget_max && budget_max !== '') ? parseFloat(budget_max) : 0;
    const cleanAreaMin = (preferred_area_min && preferred_area_min !== '') ? parseFloat(preferred_area_min) : 0;
    const cleanAreaMax = (preferred_area_max && preferred_area_max !== '') ? parseFloat(preferred_area_max) : 0;
    const cleanRooms = (preferred_rooms && preferred_rooms !== '') ? parseInt(preferred_rooms) : 0;
    const cleanManagerId = (manager_id && manager_id !== '') ? manager_id : null;
    const cleanAssignedTo = (assigned_to && assigned_to !== '') ? assigned_to : oldData.assigned_to;

    // 2. Perform update
    const result = await db.query(
      `UPDATE customers SET
        name = $1, company_name = $2, email = $3, phone = $4, address = $5, source_id = $6, assigned_to = $7, manager_id = $8, status = $9,
        entity_type = $10, budget_min = $11, budget_max = $12, preferred_area_min = $13, preferred_area_max = $14, preferred_location = $15, preferred_rooms = $16,
        tax_no = $17, reg_no = $18, is_active = $19, is_blacklisted = $20, classification_id = $21, area_id = $22,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $23 AND tenant_id::text = $24::text AND branch_id::text = $25::text RETURNING *`,
      [
        name, company_name, email, phone, address, cleanSourceId, cleanAssignedTo, cleanManagerId, status,
        entity_type, cleanBudgetMin, cleanBudgetMax, cleanAreaMin, cleanAreaMax, preferred_location, cleanRooms,
        tax_no || null, reg_no || null,
        is_active !== false ? (is_active !== undefined ? is_active : oldData.is_active) : false,
        is_blacklisted === true ? true : (is_blacklisted !== undefined ? is_blacklisted : oldData.is_blacklisted),
        cleanClassificationId, cleanAreaId,
        req.params.id, tenant_id, branch_id
      ]
    );

    // NEW Audit Logging with automated Diff Calculation
    logUpdate(req, 'Customer', req.params.id, oldData, result.rows[0]);

    // Activity Timeline Logging
    if (assigned_to && assigned_to !== oldData.assigned_to) {
        await logActivity(tenant_id, req.user, 'customer', req.params.id, 'assigned', {
            assigned_to: { from: oldData.assigned_to, to: assigned_to }
        });
        if (String(assigned_to) !== String(req.user.id)) {
          notificationService.notifyAssignment({
            tenantId: tenant_id,
            branchId: branch_id,
            recipientUserId: assigned_to,
            assignedByUserId: req.user.id,
            assignedByName: req.user.name,
            entityType: 'Customer / Lead',
            entityName: result.rows[0]?.name || oldData.name,
            link: '/contacts/customers'
          }).catch(e => console.warn('[Customer Reassignment Notification Warning]:', e.message));

          // Emit Domain Event: lead.assigned (Messaging & Notification Layer)
          try {
            const { eventBus } = require('../src/infrastructure/events/LocalEventBus');
            const DomainEvent = require('../src/infrastructure/events/DomainEvent');
            await eventBus.publish(new DomainEvent({
              eventName: 'lead.assigned',
              tenantId: tenant_id,
              branchId: branch_id,
              aggregateType: 'Customer',
              aggregateId: req.params.id,
              payload: {
                leadId: req.params.id,
                leadName: result.rows[0]?.name || oldData.name,
                leadPhone: result.rows[0]?.phone || oldData.phone,
                assignedTo: assigned_to,
                assignedByUserId: req.user.id,
                assignedByName: req.user.name
              },
              actorId: req.user.id
            }));
          } catch (e) {
            // non-blocking
          }
        }
    } else {
        await logActivity(tenant_id, req.user, 'customer', req.params.id, 'updated', {
            fields_updated: { to: Object.keys(req.body) }
        });
    }


    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Update Customer Error]', err.message);
    res.status(500).json({ status: 'error', message: `Server error: ${err.message}` });
  }
};

// @desc    Delete customer
// @route   DELETE /api/customers/:id
// @access  Private
exports.deleteCustomer = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId;
  try {
    // Scoped visibility mode: a rep cannot delete a customer he cannot see (404 like detail)
    if ((await getCustomerVisibilityMode(tenant_id)) === 'scoped'
        && !(await canAccessCustomerScoped(req.user, tenant_id, branch_id, req.params.id))) {
      return res.status(404).json({ status: 'error', message: 'Customer not found or unauthorized' });
    }
    const result = await db.query('DELETE FROM customers WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text RETURNING *', [req.params.id, tenant_id, branch_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Customer not found or unauthorized for this branch' });
    }

    // NEW Audit Logging
    logDelete(req, 'Customer', req.params.id, { name: result.rows[0].name });

    res.json({ status: 'success', message: 'Customer deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get customer account statement (invoices + payments + settlements)
// @route   GET /api/customers/:id/statement
// @access  Private
exports.getCustomerStatement = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  const customer_id = req.params.id;

  try {
    if ((await getCustomerVisibilityMode(tenant_id)) === 'scoped'
        && !(await canAccessCustomerScoped(req.user, tenant_id, branch_id, customer_id))) {
      return res.status(404).json({ status: 'error', message: 'Customer not found or unauthorized' });
    }
    // 1. Verify customer belongs to this tenant/branch
    const custResult = await db.query(
      'SELECT * FROM customers WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text',
      [customer_id, tenant_id, branch_id]
    );
    if (custResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Customer not found' });
    }
    const customer = custResult.rows[0];

    // 2. Get all deals for this customer
    const dealsResult = await db.query(
      `SELECT d.id, d.title, d.value, d.pipeline_stage, d.created_at
       FROM deals d
       WHERE d.client_id = $1 AND d.tenant_id::text = $2::text
       ORDER BY d.created_at DESC`,
      [customer_id, tenant_id]
    );

    // 3. Get all invoices for this customer (direct, via deal, or via sales order)
    const invoicesResult = await db.query(
      `SELECT inv.id, inv.invoice_number, inv.total_amount, inv.status, inv.due_date, inv.created_at,
              COALESCE(d.title, inv.notes) as deal_title
       FROM invoices inv
       LEFT JOIN quotations q ON inv.quotation_id::text = q.id::text
       LEFT JOIN deals d ON COALESCE(inv.deal_id::text, q.deal_id::text) = d.id::text
       WHERE (inv.client_id::text = $1::text OR inv.customer_id::text = $1::text OR d.client_id::text = $1::text)
         AND inv.tenant_id::text = $2::text
       ORDER BY inv.created_at DESC`,
      [customer_id, tenant_id]
    );

    // 4. Get all payments for those invoices (Invoice-Linked Receipts)
    const paymentsResult = await db.query(
      `SELECT p.id, p.amount, p.payment_method, p.payment_date, p.notes,
              inv.invoice_number,
              COALESCE(fv.voucher_number, 'PMT-' || p.id::text) as voucher_number
       FROM payments p
       JOIN invoices inv ON p.invoice_id::text = inv.id::text
       LEFT JOIN quotations q ON inv.quotation_id::text = q.id::text
       LEFT JOIN deals d ON COALESCE(inv.deal_id::text, q.deal_id::text) = d.id::text
       LEFT JOIN finance_vouchers fv ON p.voucher_id::text = fv.id::text
       WHERE (inv.client_id::text = $1::text OR inv.customer_id::text = $1::text OR d.client_id::text = $1::text)
         AND p.tenant_id::text = $2::text
         AND (COALESCE(p.status, 'active') != 'cancelled')
       ORDER BY p.payment_date DESC`,
      [customer_id, tenant_id]
    );

    // 4B. Phase G-4: Get On-Account Receipts (finance_vouchers with customer_id and NO invoice_id)
    const onAccountVouchersResult = await db.query(
      `SELECT fv.id, fv.amount, fv.payment_method, fv.voucher_date as payment_date, fv.notes,
              fv.voucher_number as invoice_number,
              fv.voucher_number
       FROM finance_vouchers fv
       WHERE fv.customer_id::text = $1::text
         AND fv.tenant_id::text = $2::text
         AND fv.voucher_type = 'receipt'
         AND fv.invoice_id IS NULL
         AND (COALESCE(fv.status, 'active') != 'cancelled')
       ORDER BY fv.voucher_date DESC`,
      [customer_id, tenant_id]
    );

    // Combine invoice-linked payments and on-account receipts for client payments view
    const allPayments = [
      ...paymentsResult.rows,
      ...onAccountVouchersResult.rows
    ].sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));

    // 5. Calculate totals (Zero double-counting: invoices = debit, payments + on-account vouchers = credit)
    const totalInvoiced = invoicesResult.rows.reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0);
    const totalInvoicePaid = paymentsResult.rows.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const totalOnAccountPaid = onAccountVouchersResult.rows.reduce((sum, v) => sum + parseFloat(v.amount || 0), 0);
    const totalPaid = totalInvoicePaid + totalOnAccountPaid;
    const balance = totalInvoiced - totalPaid;

    res.json({
      status: 'success',
      data: {
        customer,
        deals: dealsResult.rows,
        invoices: invoicesResult.rows,
        payments: allPayments,
        summary: {
          total_invoiced: totalInvoiced,
          total_paid: totalPaid,
          balance
        }
      }
    });
  } catch (err) {
    console.error('[Customer Statement Error]', err.message);
    res.status(500).json({ status: 'error', message: `Server error: ${err.message}` });
  }
};

// @desc    Get Customer 360 Aggregation (Overview, Deals, General Sales, Finance, Real Estate, Unified Timeline)
// @route   GET /api/customers/:id/360
// @access  Private
exports.getCustomer360 = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  const customer_id = req.params.id;

  if (!branch_id) {
    return res.status(400).json({ status: 'error', message: 'Branch context required for this operation.' });
  }

  await ensureCustomerColumns();

  try {
    if ((await getCustomerVisibilityMode(tenant_id)) === 'scoped'
        && !(await canAccessCustomerScoped(req.user, tenant_id, branch_id, customer_id))) {
      return res.status(404).json({ status: 'error', message: 'Customer not found or unauthorized' });
    }
    // 1. Fetch customer with strict tenant and branch isolation
    const custResult = await db.query(`
      SELECT
        c.*,
        COALESCE(u.name, 'Unassigned') as assigned_to_name,
        COALESCE(ls.name, 'Direct') as source_name,
        cc.name as classification_name,
        cc.color as classification_color,
        ca.name as area_name,
        ca.color as area_color,
        b.name as branch_name
      FROM customers c
      LEFT JOIN users u ON c.assigned_to::text = u.id::text AND c.tenant_id::text = u.tenant_id::text
      LEFT JOIN lead_sources ls ON c.source_id::text = ls.id::text
      LEFT JOIN customer_classifications cc ON c.classification_id::text = cc.id::text
      LEFT JOIN customer_areas ca ON c.area_id::text = ca.id::text
      LEFT JOIN branches b ON c.branch_id::text = b.id::text
      WHERE c.id::text = $1::text AND c.tenant_id::text = $2::text AND c.branch_id::text = $3::text
    `, [customer_id, tenant_id, branch_id]);

    if (custResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Customer not found or unauthorized' });
    }
    const customer = custResult.rows[0];

    // 2. Parallel aggregation queries across all relevant modules
    const [
      dealsRes,
      quotationsRes,
      salesOrdersRes,
      deliveryNotesRes,
      invoicesRes,
      returnsRes,
      paymentsRes,
      onAccountVouchersRes,
      activitiesRes,
      reContractsRes,
      reInstallmentsRes,
      reHandoversRes,
      reVouchersRes
    ] = await Promise.all([
      // Deals
      db.query(`
        SELECT d.*, u.name as assigned_to_name, p.name as product_name,
               ru.unit_number, ru.name as unit_name, ru.project_name as unit_project_name, ru.status as unit_status,
               ru.reservation_expires_at as unit_reservation_expires_at,
               ru.reservation_extended_at as unit_reservation_extended_at
        FROM deals d
        LEFT JOIN users u ON d.assigned_to::text = u.id::text
        LEFT JOIN products p ON d.product_id::text = p.id::text
        LEFT JOIN re_units ru ON d.unit_id::text = ru.id::text AND d.tenant_id::text = ru.tenant_id::text
        WHERE d.client_id::text = $1::text AND d.tenant_id::text = $2::text
        ORDER BY d.created_at DESC
      `, [customer_id, tenant_id]),

      // Quotations
      db.query(`
        SELECT q.id, q.deal_id, q.total_amount, q.status, q.valid_until, q.expiry_date, q.created_at,
               COALESCE(d.title, 'General Quotation') as deal_title
        FROM quotations q
        LEFT JOIN deals d ON q.deal_id::text = d.id::text
        WHERE (q.client_id::text = $1::text OR d.client_id::text = $1::text)
          AND q.tenant_id::text = $2::text
        ORDER BY q.created_at DESC
      `, [customer_id, tenant_id]),

      // Sales Orders
      db.query(`
        SELECT so.id, so.number, so.deal_id, so.quotation_id, so.order_date, so.expected_delivery,
               so.status, so.accounting_status, so.total_amount, so.created_at,
               COALESCE(d.title, 'Direct Order') as deal_title,
               u.name as assigned_to_name
        FROM sales_orders so
        LEFT JOIN deals d ON so.deal_id::text = d.id::text
        LEFT JOIN users u ON so.assigned_to::text = u.id::text
        WHERE (so.customer_id::text = $1::text OR d.client_id::text = $1::text)
          AND so.tenant_id::text = $2::text
        ORDER BY so.created_at DESC
      `, [customer_id, tenant_id]),

      // Delivery Notes
      db.query(`
        SELECT dn.id, dn.number, dn.sales_order_id, dn.delivery_date, dn.status,
               dn.accounting_status, dn.notes, dn.created_at,
               so.number as sales_order_number,
               w.name as warehouse_name
        FROM delivery_notes dn
        LEFT JOIN sales_orders so ON dn.sales_order_id::text = so.id::text
        LEFT JOIN warehouses w ON dn.warehouse_id::text = w.id::text
        WHERE dn.customer_id::text = $1::text
          AND dn.tenant_id::text = $2::text
        ORDER BY dn.created_at DESC
      `, [customer_id, tenant_id]),

      // Invoices
      db.query(`
        SELECT inv.id, inv.invoice_number, inv.total_amount, inv.status, inv.due_date,
               inv.sales_order_id, inv.accounting_status, inv.created_at,
               COALESCE(d.title, inv.notes) as deal_title,
               so.number as sales_order_number
        FROM invoices inv
        LEFT JOIN sales_orders so ON inv.sales_order_id::text = so.id::text
        LEFT JOIN quotations q ON inv.quotation_id::text = q.id::text
        LEFT JOIN deals d ON COALESCE(inv.deal_id::text, q.deal_id::text) = d.id::text
        WHERE (inv.client_id::text = $1::text OR inv.customer_id::text = $1::text OR d.client_id::text = $1::text)
          AND inv.tenant_id::text = $2::text
        ORDER BY inv.created_at DESC
      `, [customer_id, tenant_id]),

      // Sales Returns
      db.query(`
        SELECT sr.id, sr.number, sr.delivery_note_id, sr.return_date, sr.status,
               sr.accounting_status, sr.total_amount, sr.created_at,
               dn.number as delivery_note_number
        FROM sales_returns sr
        LEFT JOIN delivery_notes dn ON sr.delivery_note_id::text = dn.id::text
        WHERE sr.customer_id::text = $1::text
          AND sr.tenant_id::text = $2::text
        ORDER BY sr.created_at DESC
      `, [customer_id, tenant_id]),

      // Invoice-Linked Payments
      db.query(`
        SELECT p.id, p.amount, p.payment_method, p.payment_date, p.notes,
               p.invoice_id, inv.invoice_number,
               COALESCE(fv.voucher_number, 'PMT-' || p.id::text) as voucher_number,
               fv.id as voucher_id
        FROM payments p
        JOIN invoices inv ON p.invoice_id::text = inv.id::text
        LEFT JOIN quotations q ON inv.quotation_id::text = q.id::text
        LEFT JOIN deals d ON COALESCE(inv.deal_id::text, q.deal_id::text) = d.id::text
        LEFT JOIN finance_vouchers fv ON p.voucher_id::text = fv.id::text
        WHERE (inv.client_id::text = $1::text OR inv.customer_id::text = $1::text OR d.client_id::text = $1::text)
          AND p.tenant_id::text = $2::text
          AND (COALESCE(p.status, 'active') != 'cancelled')
        ORDER BY p.payment_date DESC
      `, [customer_id, tenant_id]),

      // On-Account Receipts
      db.query(`
        SELECT fv.id, fv.voucher_number, fv.amount, fv.payment_method, fv.voucher_date, fv.notes,
               fv.status, fv.reference_no,
               u.name as created_by_name
        FROM finance_vouchers fv
        LEFT JOIN users u ON fv.created_by::text = u.id::text
        WHERE fv.customer_id::text = $1::text
          AND fv.tenant_id::text = $2::text
          AND fv.voucher_type = 'receipt'
          AND fv.invoice_id IS NULL
          AND (COALESCE(fv.status, 'active') != 'cancelled')
        ORDER BY fv.voucher_date DESC
      `, [customer_id, tenant_id]),

      // Activities (CRM interactions)
      db.query(`
        SELECT a.*, COALESCE(u.name, a.actor_name, 'System') as user_name
        FROM activities a
        LEFT JOIN users u ON a.user_id::text = u.id::text
        WHERE a.tenant_id::text = $1::text
          AND (
            (LOWER(a.entity_type) = 'customer' AND a.entity_id::text = $2::text)
            OR (LOWER(a.entity_type) = 'deal' AND a.entity_id::text IN (
                 SELECT id::text FROM deals WHERE client_id::text = $2::text AND tenant_id::text = $1::text
               ))
          )
        ORDER BY a.created_at DESC
        LIMIT 50
      `, [tenant_id, customer_id]),

      // Real Estate: Contracts
      db.query(`
        SELECT c.*, u.unit_number, p.name as project_name
        FROM re_contracts c
        LEFT JOIN re_units u ON c.unit_id::text = u.id::text
        LEFT JOIN re_projects p ON u.project_id::text = p.id::text
        WHERE c.customer_id::text = $1::text AND c.tenant_id::text = $2::text
        ORDER BY c.created_at DESC
      `, [customer_id, tenant_id]),

      // Real Estate: Installments
      db.query(`
        SELECT inst.*, c.contract_number, u.unit_number
        FROM re_installments inst
        JOIN re_contracts c ON inst.contract_id::text = c.id::text
        LEFT JOIN re_units u ON c.unit_id::text = u.id::text
        WHERE c.customer_id::text = $1::text AND inst.tenant_id::text = $2::text
        ORDER BY inst.due_date ASC
      `, [customer_id, tenant_id]),

      // Real Estate: Handovers
      db.query(`
        SELECT h.*, c.contract_number, u.unit_number
        FROM re_handovers h
        LEFT JOIN re_contracts c ON h.contract_id::text = c.id::text
        LEFT JOIN re_units u ON h.unit_id::text = u.id::text
        WHERE h.customer_id::text = $1::text AND h.tenant_id::text = $2::text
        ORDER BY h.created_at DESC
      `, [customer_id, tenant_id]),

      // Real Estate: Collections / Vouchers
      db.query(`
        SELECT fv.id, fv.voucher_number, fv.amount, fv.payment_method, fv.voucher_date, fv.notes,
               fv.status, fv.deal_id, fv.contract_id, fv.installment_id,
               c.contract_number, u.unit_number
        FROM finance_vouchers fv
        LEFT JOIN re_contracts c ON fv.contract_id::text = c.id::text
        LEFT JOIN re_units u ON c.unit_id::text = u.id::text
        WHERE fv.customer_id::text = $1::text
          AND fv.tenant_id::text = $2::text
          AND fv.voucher_type = 'receipt'
          AND (fv.contract_id IS NOT NULL OR fv.installment_id IS NOT NULL OR fv.deal_id::text IN (
            SELECT id::text FROM deals WHERE client_id::text = $1::text AND tenant_id::text = $2::text AND (unit_id IS NOT NULL OR project_id IS NOT NULL)
          ))
          AND (COALESCE(fv.status, 'active') != 'cancelled')
        ORDER BY fv.voucher_date DESC
      `, [customer_id, tenant_id])
    ]);

    // 3. Financial calculations verified against G-4 Source of Truth
    const totalInvoiced = invoicesRes.rows.reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0);
    const totalInvoicePaid = paymentsRes.rows.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const totalOnAccountPaid = onAccountVouchersRes.rows.reduce((sum, v) => sum + parseFloat(v.amount || 0), 0);
    const totalCollected = totalInvoicePaid + totalOnAccountPaid;
    const outstandingBalance = totalInvoiced - totalCollected;

    // Overdue balance (invoices past due date that are not fully paid)
    const now = new Date();
    const overdueInvoices = invoicesRes.rows.filter(inv => {
      return inv.due_date && new Date(inv.due_date) < now && inv.status !== 'paid';
    });
    const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0);

    // 4. Construct Unified Chronological Timeline
    // Merges CRM activities + key document milestones into a single sorted stream
    const timelineItems = [];

    // A. CRM Activities
    for (const act of activitiesRes.rows) {
      const metaObj = typeof act.meta === 'string' ? (() => { try { return JSON.parse(act.meta); } catch (_) { return {}; } })() : (act.meta || {});
      const changes = metaObj?.changes || {};
      const detailsStr = typeof act.details === 'string'
        ? act.details
        : (act.details && typeof act.details === 'object' && typeof act.details.note === 'string' ? act.details.note : '');

      let message = '';
      if (typeof changes?.note?.to === 'string' && changes.note.to.trim()) {
        message = changes.note.to.trim();
      } else if (changes?.pipeline_stage?.to) {
        message = `Moved from ${changes.pipeline_stage.from || 'Unknown'} → ${changes.pipeline_stage.to}`;
      } else if (Array.isArray(changes?.fields_updated?.to) && changes.fields_updated.to.length > 0) {
        message = `Updated ${changes.fields_updated.to.join(', ')}`;
      } else if (typeof act.title === 'string' && act.title.trim()) {
        message = act.title.trim();
      } else if (detailsStr && detailsStr.trim()) {
        message = detailsStr.trim();
      } else {
        message = String(act.action || act.activity_type || 'Interaction');
      }

      timelineItems.push({
        id: `act-${act.id}`,
        timestamp: act.created_at,
        source: 'crm',
        type: String(act.action || act.activity_type || 'interaction'),
        actor_name: String(act.user_name || 'System'),
        title: act.action && typeof act.action === 'string' ? act.action.toUpperCase() : 'Interaction',
        description: String(message || ''),
        meta: metaObj
      });
    }

    // B. Deals
    for (const d of dealsRes.rows) {
      timelineItems.push({
        id: `deal-${d.id}`,
        timestamp: d.created_at,
        source: 'deal',
        type: 'deal_created',
        actor_name: d.assigned_to_name || 'System',
        title: `🤝 Deal Created`,
        description: `Deal "${d.title}" (${Number(d.value || 0).toLocaleString()} EGP) - Stage: ${d.pipeline_stage}`,
        meta: { deal_id: d.id, stage: d.pipeline_stage, value: d.value }
      });
    }

    // C. Quotations
    for (const q of quotationsRes.rows) {
      timelineItems.push({
        id: `quot-${q.id}`,
        timestamp: q.created_at,
        source: 'quotation',
        type: 'quotation_issued',
        actor_name: 'Sales',
        title: `📄 Quotation Issued`,
        description: `Quotation for ${q.deal_title} (${Number(q.total_amount || 0).toLocaleString()} EGP) - Status: ${q.status}`,
        meta: { quotation_id: q.id, status: q.status }
      });
    }

    // D. Sales Orders
    for (const so of salesOrdersRes.rows) {
      timelineItems.push({
        id: `so-${so.id}`,
        timestamp: so.created_at,
        source: 'sales_order',
        type: 'order_placed',
        actor_name: so.assigned_to_name || 'Sales',
        title: `🛒 Sales Order ${so.number || ''}`,
        description: `Order ${so.number || `#${so.id}`} (${Number(so.total_amount || 0).toLocaleString()} EGP) - Status: ${so.status}`,
        meta: { order_id: so.id, status: so.status }
      });
    }

    // E. Delivery Notes
    for (const dn of deliveryNotesRes.rows) {
      timelineItems.push({
        id: `dn-${dn.id}`,
        timestamp: dn.created_at,
        source: 'delivery_note',
        type: 'delivery_dispatched',
        actor_name: 'Warehouse',
        title: `🚚 Delivery Note ${dn.number || ''}`,
        description: `Delivery ${dn.number || `#${dn.id}`} from ${dn.warehouse_name || 'Warehouse'} - Status: ${dn.status}`,
        meta: { delivery_id: dn.id, status: dn.status }
      });
    }

    // F. Invoices
    for (const inv of invoicesRes.rows) {
      timelineItems.push({
        id: `inv-${inv.id}`,
        timestamp: inv.created_at,
        source: 'invoice',
        type: 'invoice_issued',
        actor_name: 'Finance',
        title: `🧾 Invoice ${inv.invoice_number || ''}`,
        description: `Invoice ${inv.invoice_number || `#${inv.id}`} for ${Number(inv.total_amount || 0).toLocaleString()} EGP - Status: ${inv.status}`,
        meta: { invoice_id: inv.id, status: inv.status }
      });
    }

    // G. Payments & Vouchers
    for (const p of paymentsRes.rows) {
      timelineItems.push({
        id: `pmt-${p.id}`,
        timestamp: p.payment_date || p.created_at,
        source: 'payment',
        type: 'payment_received',
        actor_name: 'Treasury',
        title: `💵 Payment Received (${p.voucher_number})`,
        description: `Collected ${Number(p.amount || 0).toLocaleString()} EGP for Invoice ${p.invoice_number || ''} via ${p.payment_method || 'Cash'}`,
        meta: { payment_id: p.id, voucher_number: p.voucher_number, amount: p.amount }
      });
    }

    for (const v of onAccountVouchersRes.rows) {
      timelineItems.push({
        id: `vouch-${v.id}`,
        timestamp: v.voucher_date || v.created_at,
        source: 'voucher',
        type: 'on_account_receipt',
        actor_name: v.created_by_name || 'Treasury',
        title: `💼 On-Account Receipt (${v.voucher_number})`,
        description: `Received on-account credit ${Number(v.amount || 0).toLocaleString()} EGP via ${v.payment_method || 'Cash'}`,
        meta: { voucher_id: v.id, voucher_number: v.voucher_number, amount: v.amount }
      });
    }

    // H. Sales Returns
    for (const sr of returnsRes.rows) {
      timelineItems.push({
        id: `sr-${sr.id}`,
        timestamp: sr.created_at,
        source: 'return',
        type: 'return_recorded',
        actor_name: 'Warehouse/Sales',
        title: `🔄 Sales Return ${sr.number || ''}`,
        description: `Return ${sr.number || `#${sr.id}`} linked to Delivery ${sr.delivery_note_number || ''} - Status: ${sr.status}`,
        meta: { return_id: sr.id, status: sr.status }
      });
    }

    // I. Real Estate Contracts
    for (const c of reContractsRes.rows) {
      timelineItems.push({
        id: `rec-${c.id}`,
        timestamp: c.contract_date || c.created_at,
        source: 'contract',
        type: 'contract_signed',
        actor_name: 'Legal/RE',
        title: `📜 Real Estate Contract (${c.contract_number})`,
        description: `Contract for Unit ${c.unit_number || 'N/A'} in ${c.project_name || 'Project'} (${Number(c.contract_value || 0).toLocaleString()} EGP) - Status: ${c.status}`,
        meta: { contract_id: c.id, unit_number: c.unit_number }
      });
    }

    // J. Real Estate Collections / Installment Payments
    for (const rv of reVouchersRes.rows) {
      timelineItems.push({
        id: `rev-${rv.id}`,
        timestamp: rv.voucher_date || rv.created_at,
        source: 're_collection',
        type: 're_payment_received',
        actor_name: 'Treasury/RE',
        title: `🏢 Property Collection (${rv.voucher_number})`,
        description: `Collected ${Number(rv.amount || 0).toLocaleString()} EGP ${rv.contract_number ? `for Contract ${rv.contract_number}` : ''} ${rv.unit_number ? `(Unit ${rv.unit_number})` : ''} via ${rv.payment_method || 'Cash'}`,
        meta: { voucher_id: rv.id, voucher_number: rv.voucher_number, amount: rv.amount }
      });
    }

    // Sort combined timeline descending (newest first)
    timelineItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Filter deals with reservations
    const reservationsList = dealsRes.rows.filter(d => {
      const stage = (d.pipeline_stage || '').toLowerCase();
      return stage.includes('reserv') || d.unit_reservation_expires_at || (d.unit_id && d.unit_status === 'Reserved');
    });

    // Determine if Real Estate section should be shown
    const hasRealEstateData = reContractsRes.rows.length > 0 ||
                              reInstallmentsRes.rows.length > 0 ||
                              reHandoversRes.rows.length > 0 ||
                              reVouchersRes.rows.length > 0 ||
                              reservationsList.length > 0 ||
                              dealsRes.rows.some(d => d.unit_id || d.project_id);

    // 5. Build structured response
    res.json({
      status: 'success',
      data: {
        customer,
        summary: {
          total_invoiced: totalInvoiced,
          total_collected: totalCollected,
          outstanding_balance: outstandingBalance,
          overdue_amount: overdueAmount,
          deals_count: dealsRes.rows.length,
          sales_orders_count: salesOrdersRes.rows.length,
          invoices_count: invoicesRes.rows.length,
          contracts_count: reContractsRes.rows.length,
          reservations_count: reservationsList.length,
          has_real_estate: hasRealEstateData
        },
        deals: dealsRes.rows,
        general_sales: {
          quotations: quotationsRes.rows,
          sales_orders: salesOrdersRes.rows,
          delivery_notes: deliveryNotesRes.rows,
          invoices: invoicesRes.rows,
          sales_returns: returnsRes.rows
        },
        finance: {
          invoices: invoicesRes.rows,
          linked_payments: paymentsRes.rows,
          on_account_vouchers: onAccountVouchersRes.rows,
          total_invoiced: totalInvoiced,
          total_collected: totalCollected,
          outstanding_balance: outstandingBalance,
          overdue_amount: overdueAmount
        },
        real_estate: {
          reservations: reservationsList,
          contracts: reContractsRes.rows,
          installments: reInstallmentsRes.rows,
          collections: reVouchersRes.rows,
          handovers: reHandoversRes.rows
        },
        timeline: timelineItems
      }
    });
  } catch (err) {
    console.error('Error fetching customer 360:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch customer 360 data' });
  }
};

// Helper to compute deterministic hash for idempotency integrity check
function computeAssignmentPayloadHash({ customer_ids, target_user_id, team_id, distribution_method, active_branch_id, only_if_unassigned }) {
  const normalized = {
    customer_ids: Array.from(new Set(customer_ids.map(Number))).sort((a, b) => a - b),
    target_user_id: target_user_id ? Number(target_user_id) : null,
    team_id: team_id ? Number(team_id) : null,
    distribution_method: team_id ? (distribution_method || 'least_loaded') : null,
    active_branch_id: active_branch_id ? String(active_branch_id) : null,
    // include the flag only when set so pre-deploy idempotency keys keep their hashes
    ...(only_if_unassigned === true ? { only_if_unassigned: true } : {})
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

// @desc    Bulk assign leads/customers to sales representative or sales team
// @route   POST /api/customers/bulk-assign
// @access  Private (Admin, Manager, Supervisor)
exports.bulkAssignLeads = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { customer_ids, target_user_id, team_id, distribution_method = 'least_loaded', only_if_unassigned } = req.body;
  const onlyIfUnassigned = only_if_unassigned === true || only_if_unassigned === 'true';

  if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
    return res.status(400).json({ status: 'error', message: 'customer_ids array is required and must not be empty.' });
  }

  // Validate targets: either target_user_id or team_id, never both or neither
  if ((!target_user_id && !team_id) || (target_user_id && team_id)) {
    return res.status(400).json({ status: 'error', message: 'Either target_user_id or team_id must be provided (not both).' });
  }

  // Validate distribution_method when team_id is provided
  if (team_id && distribution_method !== 'least_loaded' && distribution_method !== 'round_robin') {
    return res.status(400).json({ status: 'error', message: "Invalid distribution_method. Must be 'least_loaded' or 'round_robin'." });
  }

  const endpoint = 'POST /customers/bulk-assign';
  const rawIdempotencyKey = req.headers['idempotency-key'] || req.body?.idempotency_key;
  const effectiveIdempotencyKey = (rawIdempotencyKey && String(rawIdempotencyKey).trim()) 
    ? String(rawIdempotencyKey).trim() 
    : crypto.randomUUID();

  const active_branch_id = req.branchId || req.user?.branch_id || null;
  const payloadHash = computeAssignmentPayloadHash({
    customer_ids,
    target_user_id,
    team_id,
    distribution_method,
    active_branch_id,
    only_if_unassigned: onlyIfUnassigned
  });

  const client = db.connect ? await db.connect() : await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Transaction-Scoped Advisory Lock for concurrency control
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2::text))',
      [tenant_id, effectiveIdempotencyKey]
    );

    // 2. Authoritative Database-Time Replay Evaluation
    const idempotencyRes = await client.query(`
      SELECT 
          status, 
          request_hash, 
          user_id,
          response_code, 
          response_body, 
          created_at,
          (clock_timestamp() <= created_at + INTERVAL '24 hours') AS is_within_ttl
      FROM request_idempotency
      WHERE tenant_id = $1 AND endpoint = $2 AND idempotency_key = $3
      FOR SHARE
    `, [tenant_id, endpoint, effectiveIdempotencyKey]);

    if (idempotencyRes.rows.length > 0) {
      const record = idempotencyRes.rows[0];

      // A. Check Expiration (strictly enforced by clock_timestamp)
      if (!record.is_within_ttl || record.status === 'expired') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          status: 'error',
          code: 'IDEMPOTENCY_KEY_EXPIRED',
          message: 'This idempotency key has expired (exceeded 24 hours). Please generate a new unique key.'
        });
      }

      // B. Check Payload Hash Integrity
      if (record.request_hash !== payloadHash) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          status: 'error',
          code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
          message: 'Idempotency key was previously used with a different request payload.'
        });
      }

      // C. Cross-user isolation check
      if (record.user_id !== req.user.id && req.user.role !== 'admin') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          status: 'error',
          code: 'IDEMPOTENCY_USER_MISMATCH',
          message: 'This idempotency key was registered by another user.'
        });
      }

      // Valid Replay: Commit lock and return exact stored response
      await client.query('COMMIT');
      res.setHeader('X-Idempotency-Replay', 'true');
      return res.status(record.response_code || 200).json(record.response_body);
    }

    // ── Fresh Execution Path ──

    // 3. Verify Caller Account & Active Branch Authorization
    const callerRes = await client.query(
      `SELECT id, role, branch_id 
       FROM users 
       WHERE id = $1 AND tenant_id::text = $2::text 
       FOR SHARE`,
      [req.user.id, tenant_id]
    );

    if (callerRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ status: 'error', message: 'Caller account is inactive or unauthorized.' });
    }
    const caller = callerRes.rows[0];

    if (active_branch_id && caller.role !== 'admin') {
      const ubCheck = await client.query(
        'SELECT 1 FROM user_branches WHERE user_id::text = $1::text AND branch_id::text = $2::text LIMIT 1',
        [caller.id, active_branch_id]
      );
      if (ubCheck.rows.length === 0 && String(caller.branch_id) !== String(active_branch_id)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ status: 'error', message: 'Caller is not authorized for the active branch.' });
      }
    }

    let targetUser = null;
    let members = [];

    // 4. Validate Target Rep (Mode A)
    if (target_user_id) {
      const targetUserRes = await client.query(
        `SELECT id, name, role, COALESCE(is_working, true) as is_working, branch_id 
         FROM users 
         WHERE id = $1 AND tenant_id::text = $2::text 
         FOR SHARE`,
        [target_user_id, tenant_id]
      );
      if (targetUserRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ status: 'error', message: 'Target sales representative not found.' });
      }
      targetUser = targetUserRes.rows[0];

      if (!targetUser.is_working) {
        await client.query('ROLLBACK');
        return res.status(422).json({ status: 'error', message: 'Target sales representative is inactive or not currently working.' });
      }

      if (active_branch_id && caller.role !== 'admin') {
        const targetUb = await client.query(
          'SELECT 1 FROM user_branches WHERE user_id::text = $1::text AND branch_id::text = $2::text LIMIT 1',
          [targetUser.id, active_branch_id]
        );
        if (targetUb.rows.length === 0 && String(targetUser.branch_id) !== String(active_branch_id)) {
          await client.query('ROLLBACK');
          return res.status(422).json({ status: 'error', message: 'Target sales representative is not authorized for the active branch.' });
        }
      }
    }

    // 5. Validate Target Team (Mode B)
    if (team_id) {
      const teamRes = await client.query(
        'SELECT id, name, branch_id, is_active FROM sales_teams WHERE id = $1 AND tenant_id::text = $2::text FOR SHARE',
        [team_id, tenant_id]
      );
      if (teamRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ status: 'error', message: 'Selected sales team not found.' });
      }
      const team = teamRes.rows[0];
      if (!team.is_active) {
        await client.query('ROLLBACK');
        return res.status(422).json({ status: 'error', message: 'Selected sales team is inactive.' });
      }

      if (team.branch_id && active_branch_id && String(team.branch_id) !== String(active_branch_id) && caller.role !== 'admin') {
        await client.query('ROLLBACK');
        return res.status(422).json({ status: 'error', message: 'Selected sales team does not belong to active branch.' });
      }

      // Query eligible members with deterministic tie-breaking (ORDER BY current_load ASC, stm.user_id ASC)
      const membersRes = await client.query(`
        SELECT stm.user_id, u.name,
          (SELECT COUNT(*)::int FROM customers c WHERE c.assigned_to = stm.user_id AND c.tenant_id::text = $1::text) as current_load
        FROM sales_team_members stm
        JOIN users u ON stm.user_id = u.id
        WHERE stm.team_id = $2 
          AND stm.tenant_id::text = $1::text 
          AND stm.is_active = true
          AND COALESCE(u.is_working, true) = true
          AND (
            $3::text IS NULL
            OR u.branch_id::text = $3::text 
            OR EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id::text = u.id::text AND ub.branch_id::text = $3::text)
          )
        ORDER BY current_load ASC, stm.user_id ASC
        FOR SHARE OF stm, u
      `, [tenant_id, team_id, active_branch_id]);

      if (membersRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(422).json({ status: 'error', message: 'Selected sales team has no eligible active members in this branch.' });
      }
      members = membersRes.rows;
    }

    // 6. Lock Customers in Deterministic Order (ORDER BY id ASC FOR UPDATE)
    const uniqueCustomerIds = Array.from(new Set(customer_ids.map(Number))).sort((a, b) => a - b);
    const customersRes = await client.query(
      `SELECT id, name, phone, branch_id, assigned_to, tenant_id 
       FROM customers 
       WHERE id = ANY($1::int[]) AND tenant_id::text = $2::text 
       ORDER BY id ASC 
       FOR UPDATE`,
      [uniqueCustomerIds, tenant_id]
    );

    if (customersRes.rows.length !== uniqueCustomerIds.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'One or more customer records not found.' });
    }

    // Branch authorization check on customers
    for (const cust of customersRes.rows) {
      if (active_branch_id && cust.branch_id && String(cust.branch_id) !== String(active_branch_id) && caller.role !== 'admin') {
        await client.query('ROLLBACK');
        return res.status(403).json({ status: 'error', message: `Customer ID ${cust.id} does not belong to authorized branch.` });
      }
    }

    // 7. Execute Assignment, Activity Logging, and Event Preparation
    let assignedCount = 0;
    const assignments = [];
    const pendingEvents = [];
    const skipped = [];

    if (target_user_id) {
      const updateRes = await client.query(
        `UPDATE customers 
         SET assigned_to = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ANY($2::int[]) AND tenant_id::text = $3::text${onlyIfUnassigned ? ' AND assigned_to IS NULL' : ''}
         RETURNING id`,
        [target_user_id, uniqueCustomerIds, tenant_id]
      );
      const assignedIds = new Set(updateRes.rows.map(r => r.id));
      assignedCount = assignedIds.size;

      for (const cust of customersRes.rows) {
        if (!assignedIds.has(cust.id)) {
          skipped.push({ customer_id: cust.id, name: cust.name });
          continue;
        }
        assignments.push({ customer_id: cust.id, assigned_to: target_user_id });

        await logActivity(tenant_id, req.user, 'customer', cust.id, 'reassigned', {
          assigned_to: target_user_id,
          assigned_to_name: targetUser.name
        }, client);

        pendingEvents.push({
          eventName: 'lead.assigned',
          tenantId: tenant_id,
          branchId: cust.branch_id || active_branch_id,
          aggregateType: 'Customer',
          aggregateId: cust.id,
          payload: {
            leadId: cust.id,
            leadName: cust.name,
            leadPhone: cust.phone,
            assignedTo: target_user_id,
            assignedByUserId: req.user.id,
            assignedByName: req.user.name
          },
          actorId: req.user.id
        });
      }
    } else {
      let memberIdx = 0;
      for (const cust of customersRes.rows) {
        const selectedMember = distribution_method === 'least_loaded'
          ? members.sort((a, b) => a.current_load - b.current_load)[0]
          : members[memberIdx % members.length];

        const memberUpdate = await client.query(
          `UPDATE customers SET assigned_to = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id::text = $3::text${onlyIfUnassigned ? ' AND assigned_to IS NULL' : ''} RETURNING id`,
          [selectedMember.user_id, cust.id, tenant_id]
        );
        if (memberUpdate.rows.length === 0) {
          skipped.push({ customer_id: cust.id, name: cust.name });
          continue;
        }
        selectedMember.current_load++;
        memberIdx++;
        assignedCount++;

        assignments.push({ customer_id: cust.id, assigned_to: selectedMember.user_id });

        await logActivity(tenant_id, req.user, 'customer', cust.id, 'reassigned', {
          assigned_to: selectedMember.user_id,
          assigned_to_name: selectedMember.name
        }, client);

        pendingEvents.push({
          eventName: 'lead.assigned',
          tenantId: tenant_id,
          branchId: cust.branch_id || active_branch_id,
          aggregateType: 'Customer',
          aggregateId: cust.id,
          payload: {
            leadId: cust.id,
            leadName: cust.name,
            leadPhone: cust.phone,
            assignedTo: selectedMember.user_id,
            assignedByUserId: req.user.id,
            assignedByName: req.user.name
          },
          actorId: req.user.id
        });
      }
    }

    let message;
    if (assignedCount === 0 && skipped.length > 0) {
      message = `No leads were assigned; ${skipped.length} already ${skipped.length === 1 ? 'has' : 'have'} an owner.`;
    } else {
      message = target_user_id
        ? `Successfully assigned ${assignedCount} leads to ${targetUser.name}.`
        : `Successfully distributed ${assignedCount} leads across ${members.length} team members.`;
      if (skipped.length > 0) {
        message += ` ${skipped.length} skipped (already assigned).`;
      }
    }
    const responseBody = {
      status: 'success',
      message,
      assigned_count: assignedCount,
      distribution_method: team_id ? distribution_method : 'direct',
      assignments,
      skipped_count: skipped.length,
      skipped
    };

    // 8. Atomic Insert of Idempotency Record
    await client.query(`
      INSERT INTO request_idempotency (
        tenant_id, endpoint, idempotency_key, request_hash, user_id, status, response_code, response_body
      ) VALUES ($1, $2, $3, $4, $5, 'completed', 200, $6)
      ON CONFLICT (tenant_id, endpoint, idempotency_key) DO UPDATE
      SET status = 'completed', response_code = 200, response_body = EXCLUDED.response_body, updated_at = CURRENT_TIMESTAMP
    `, [tenant_id, endpoint, effectiveIdempotencyKey, payloadHash, req.user.id, JSON.stringify(responseBody)]);

    // 9. Commit Transaction Atomically
    await client.query('COMMIT');

    // 10. Post-Commit Event Emission (Safe Error Boundary)
    setImmediate(async () => {
      for (const evt of pendingEvents) {
        try {
          const { eventBus } = require('../src/infrastructure/events/LocalEventBus');
          const DomainEvent = require('../src/infrastructure/events/DomainEvent');
          await eventBus.publish(new DomainEvent(evt));
        } catch (eErr) {
          console.error('[BulkAssign PostCommit Event Error]:', eErr.message);
        }
      }
    });

    return res.json(responseBody);

  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      // rollback error suppressed
    }
    console.error('[bulkAssignLeads error]:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to assign leads.' });
  } finally {
    client.release();
  }
};

