const db = require('../config/db');
const { logCreate, logUpdate, logDelete } = require('../services/loggerService');

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
      LEFT JOIN users u ON c.assigned_to::text = u.id::text
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
      LEFT JOIN users u ON c.assigned_to::text = u.id::text
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
    entity_type, budget_min, budget_max, preferred_area_min, preferred_area_max, preferred_location, preferred_rooms
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
        entity_type, budget_min, budget_max, preferred_area_min, preferred_area_max, preferred_location, preferred_rooms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *`,
      [
        name, company_name, email, phone, address, cleanSourceId, cleanAssignedTo, cleanManagerId, status || 'lead', tenant_id, branch_id,
        entity_type || 'customer', cleanBudgetMin, cleanBudgetMax, cleanAreaMin, cleanAreaMax, preferred_location, cleanRooms
      ]
    );

    // NEW Audit Logging (Async)
    logCreate(req, 'Customer', result.rows[0].id, result.rows[0]);

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
    entity_type, budget_min, budget_max, preferred_area_min, preferred_area_max, preferred_location, preferred_rooms
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
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = $17 AND tenant_id::text = $18::text AND branch_id::text = $19::text RETURNING *`,
      [
        name, company_name, email, phone, address, cleanSourceId, cleanAssignedTo, cleanManagerId, status, 
        entity_type, cleanBudgetMin, cleanBudgetMax, cleanAreaMin, cleanAreaMax, preferred_location, cleanRooms,
        req.params.id, tenant_id, branch_id
      ]
    );

    // NEW Audit Logging with automated Diff Calculation
    logUpdate(req, 'Customer', req.params.id, oldData, result.rows[0]);

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
