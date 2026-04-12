const db = require('../config/db');
const { logCreate, logUpdate, logDelete } = require('../services/loggerService');

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private
exports.getCustomers = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(`
      SELECT 
        c.*, 
        u.name as assigned_to_name,
        m.name as manager_name,
        ls.name as source_name
      FROM customers c
      LEFT JOIN users u ON c.assigned_to = u.id
      LEFT JOIN users m ON c.manager_id = m.id
      LEFT JOIN lead_sources ls ON c.source_id = ls.id
      WHERE c.tenant_id = $1 AND c.branch_id = $2
      ORDER BY c.created_at DESC
    `, [tenant_id, req.branchId]);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('CRITICAL: getCustomers failed:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to retrieve customers' });
  }
};

// @desc    Get single customer
// @route   GET /api/customers/:id
// @access  Private
exports.getCustomerById = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(`
      SELECT 
        c.*, 
        u.name as assigned_to_name,
        m.name as manager_name,
        ls.name as source_name
      FROM customers c
      LEFT JOIN users u ON c.assigned_to = u.id
      LEFT JOIN users m ON c.manager_id = m.id
      LEFT JOIN lead_sources ls ON c.source_id = ls.id
      WHERE c.id = $1 AND c.tenant_id = $2 AND c.branch_id = $3
    `, [req.params.id, tenant_id, req.branchId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Customer not found or unauthorized' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create customer
// @route   POST /api/customers
// @access  Private
exports.createCustomer = async (req, res) => {
  const { name, company_name, email, phone, address, source, source_id, assigned_to, manager_id, status } = req.body;
  const tenant_id = req.user.tenant_id;
  try {
    // Triple Isolation: Inject branch_id
    const branch_id = req.branchId;

    const result = await db.query(
      'INSERT INTO customers (name, company_name, email, phone, address, source_id, assigned_to, manager_id, status, tenant_id, branch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
      [name, company_name, email, phone, address, source_id, assigned_to || req.user.id, manager_id, status || 'lead', tenant_id, branch_id]
    );

    // NEW Audit Logging (Async)
    logCreate(req, 'Customer', result.rows[0].id, result.rows[0]);

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Private
exports.updateCustomer = async (req, res) => {
  const { name, company_name, email, phone, address, source, source_id, assigned_to, manager_id, status } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId;
  try {
    // 1. Get old data for diffing & security check (Triple Isolation)
    const oldResult = await db.query('SELECT * FROM customers WHERE id = $1 AND tenant_id = $2 AND branch_id = $3', [req.params.id, tenant_id, branch_id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Customer not found or unauthorized for this branch' });
    }
    const oldData = oldResult.rows[0];

    // 2. Perform update
    const result = await db.query(
      'UPDATE customers SET name = $1, company_name = $2, email = $3, phone = $4, address = $5, source_id = $6, assigned_to = $7, manager_id = $8, status = $9, updated_at = CURRENT_TIMESTAMP WHERE id = $10 AND tenant_id = $11 AND branch_id = $12 RETURNING *',
      [name, company_name, email, phone, address, source_id, assigned_to, manager_id, status, req.params.id, tenant_id, branch_id]
    );

    // NEW Audit Logging with automated Diff Calculation
    logUpdate(req, 'Customer', req.params.id, oldData, result.rows[0]);

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete customer
// @route   DELETE /api/customers/:id
// @access  Private
exports.deleteCustomer = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId;
  try {
    const result = await db.query('DELETE FROM customers WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 RETURNING *', [req.params.id, tenant_id, branch_id]);
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
