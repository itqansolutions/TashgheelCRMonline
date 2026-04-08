const db = require('../config/db');
const logger = require('../utils/logger');

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private
exports.getCustomers = async (req, res) => {
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
      ORDER BY c.created_at DESC
    `);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get single customer
// @route   GET /api/customers/:id
// @access  Private
exports.getCustomerById = async (req, res) => {
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
      WHERE c.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Customer not found' });
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
  try {
    const result = await db.query(
      'INSERT INTO customers (name, company_name, email, phone, address, source, source_id, assigned_to, manager_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [name, company_name, email, phone, address, source, source_id, assigned_to || req.user.id, manager_id, status || 'lead']
    );

    // Log the creation
    await logger.logAction(req, null, 'CREATE', 'Customer', result.rows[0].id, result.rows[0]);

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
  try {
    // 1. Get old data for diffing
    const oldResult = await db.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Customer not found' });
    }
    const oldData = oldResult.rows[0];

    // 2. Perform update
    const result = await db.query(
      'UPDATE customers SET name = $1, company_name = $2, email = $3, phone = $4, address = $5, source = $6, source_id = $7, assigned_to = $8, manager_id = $9, status = $10, updated_at = CURRENT_TIMESTAMP WHERE id = $11 RETURNING *',
      [name, company_name, email, phone, address, source, source_id, assigned_to, manager_id, status, req.params.id]
    );

    // 3. Log the update with diff
    const diff = logger.getDiff(oldData, result.rows[0]);
    if (diff) {
      await logger.logAction(req, null, 'UPDATE', 'Customer', req.params.id, diff);
    }

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
  try {
    const result = await db.query('DELETE FROM customers WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Customer not found' });
    }

    // Log the deletion
    await logger.logAction(req, null, 'DELETE', 'Customer', req.params.id, { name: result.rows[0].name });

    res.json({ status: 'success', message: 'Customer deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
