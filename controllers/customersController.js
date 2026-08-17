const db = require('../config/db');
const { logCreate, logUpdate, logDelete } = require('../services/loggerService');
const { logActivity } = require('../utils/activityLogger');

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private
exports.getCustomers = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  // CTO Fallback Logic: Resolve branchId from header or user profile to prevent DB crashes
  const branch_id = req.branchId || req.user?.branch_id;

  if (!branch_id) {
    console.warn('[Customers API] Warning: Branch context missing, returning empty set.', { tenant_id });
    return res.json({ status: 'success', data: [] });
  }

  try {
    let query = `
      SELECT 
        c.*, 
        COALESCE(u.name, 'Unassigned') as assigned_to_name,
        COALESCE(ls.name, c.source, 'Direct') as source_name
      FROM customers c
      LEFT JOIN users u ON c.assigned_to::text = u.id::text AND c.tenant_id::text = u.tenant_id::text
      LEFT JOIN lead_sources ls ON c.source_id::text = ls.id::text
      WHERE c.tenant_id::text = $1::text AND c.branch_id::text = $2::text
    `;
    const params = [tenant_id, branch_id];
    let paramIdx = 3;

    // Dynamic Filters (Sanitized to prevent "invalid input syntax for type integer: '' ")
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
        query += ` AND (c.manager_id IS NULL OR c.manager_id = '')`;
    }

    query += ` ORDER BY c.created_at DESC`;

    const result = await db.query(query, params);
    
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[Customers API Error]', {
      error: err.message,
      stack: err.stack,
      tenantId: tenant_id,
      branchId: branch_id,
      query: query
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

  try {
    const result = await db.query(`
      SELECT 
        c.*, 
        COALESCE(u.name, 'Unassigned') as assigned_to_name,
        COALESCE(ls.name, c.source, 'Direct') as source_name
      FROM customers c
      LEFT JOIN users u ON c.assigned_to::text = u.id::text AND c.tenant_id::text = u.tenant_id::text
      LEFT JOIN lead_sources ls ON c.source_id::text = ls.id::text
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
  const { 
    name, company_name, email, phone, address, source_id, assigned_to, manager_id, status,
    entity_type, budget_min, budget_max, preferred_area_min, preferred_area_max, preferred_location, preferred_rooms,
    tax_no, reg_no, is_active, is_blacklisted
  } = req.body;
  const tenant_id = req.user.tenant_id;
  try {
    // Triple Isolation: Inject branch_id with Smart Fallback
    const branch_id = req.branchId || req.user?.branch_id;

    // 🔥 DEFINITIVE SANITIZATION: Handle all falsy/empty string cases for numeric columns
    const cleanSourceId = (source_id && source_id !== '') ? parseInt(source_id) : null;
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
        tax_no, reg_no, is_active, is_blacklisted
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) RETURNING *`,
      [
        name, company_name, email, phone, address, cleanSourceId, cleanAssignedTo, cleanManagerId, status || 'lead', tenant_id, branch_id,
        entity_type || 'customer', cleanBudgetMin, cleanBudgetMax, cleanAreaMin, cleanAreaMax, preferred_location, cleanRooms,
        tax_no || null, reg_no || null, is_active !== false, is_blacklisted === true
      ]
    );

    // NEW Audit Logging (Async)
    logCreate(req, 'Customer', result.rows[0].id, result.rows[0]);

    // Activity Timeline Logging
    await logActivity(tenant_id, req.user, 'customer', result.rows[0].id, 'created', { 
        name: { to: name },
        company_name: { to: company_name }
    });

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
  const { 
    name, company_name, email, phone, address, source_id, assigned_to, manager_id, status,
    entity_type, budget_min, budget_max, preferred_area_min, preferred_area_max, preferred_location, preferred_rooms,
    tax_no, reg_no, is_active, is_blacklisted
  } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    // 1. Get old data for diffing & security check (Triple Isolation)
    const oldResult = await db.query('SELECT * FROM customers WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text', [req.params.id, tenant_id, branch_id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Customer not found or unauthorized for this branch' });
    }
    const oldData = oldResult.rows[0];

    // 🔥 DEFINITIVE SANITIZATION: Prevent SQL Syntax errors on Empty Strings
    const cleanSourceId = (source_id && source_id !== '') ? parseInt(source_id) : null;
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
        tax_no = $17, reg_no = $18, is_active = $19, is_blacklisted = $20,
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = $21 AND tenant_id::text = $22::text AND branch_id::text = $23::text RETURNING *`,
      [
        name, company_name, email, phone, address, cleanSourceId, cleanAssignedTo, cleanManagerId, status, 
        entity_type, cleanBudgetMin, cleanBudgetMax, cleanAreaMin, cleanAreaMax, preferred_location, cleanRooms,
        tax_no || null, reg_no || null,
        is_active !== false ? (is_active !== undefined ? is_active : oldData.is_active) : false,
        is_blacklisted === true ? true : (is_blacklisted !== undefined ? is_blacklisted : oldData.is_blacklisted),
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

    // 3. Get all invoices linked to this customer's deals
    const invoicesResult = await db.query(
      `SELECT inv.id, inv.invoice_number, inv.total_amount, inv.status, inv.due_date, inv.created_at,
              d.title as deal_title
       FROM invoices inv
       LEFT JOIN quotations q ON inv.quotation_id = q.id
       LEFT JOIN deals d ON q.deal_id = d.id
       WHERE d.client_id = $1 AND inv.tenant_id::text = $2::text
       ORDER BY inv.created_at DESC`,
      [customer_id, tenant_id]
    );

    // 4. Get all payments for those invoices
    const paymentsResult = await db.query(
      `SELECT p.id, p.amount, p.payment_method, p.payment_date, p.notes,
              inv.invoice_number
       FROM payments p
       JOIN invoices inv ON p.invoice_id = inv.id
       LEFT JOIN quotations q ON inv.quotation_id = q.id
       LEFT JOIN deals d ON q.deal_id = d.id
       WHERE d.client_id = $1 AND p.tenant_id::text = $2::text
       ORDER BY p.payment_date DESC`,
      [customer_id, tenant_id]
    );

    // 5. Calculate totals
    const totalInvoiced = invoicesResult.rows.reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0);
    const totalPaid = paymentsResult.rows.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const balance = totalInvoiced - totalPaid;

    res.json({
      status: 'success',
      data: {
        customer,
        deals: dealsResult.rows,
        invoices: invoicesResult.rows,
        payments: paymentsResult.rows,
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
