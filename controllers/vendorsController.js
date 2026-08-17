const db = require('../config/db');
const { logCreate, logUpdate, logDelete } = require('../services/loggerService');

// @desc    Get all vendors
// @route   GET /api/vendors
// @access  Private
exports.getVendors = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  if (!branch_id) {
    return res.json({ status: 'success', data: [] });
  }

  try {
    const result = await db.query(
      `SELECT * FROM vendors 
       WHERE tenant_id::text = $1::text AND branch_id::text = $2::text
       ORDER BY created_at DESC`,
      [tenant_id, branch_id]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[Vendors API Error]', err.message);
    res.status(500).json({ status: 'error', message: `Server error: ${err.message}` });
  }
};

// @desc    Get single vendor
// @route   GET /api/vendors/:id
// @access  Private
exports.getVendorById = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    const result = await db.query(
      `SELECT * FROM vendors WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text`,
      [req.params.id, tenant_id, branch_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Vendor not found' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Vendor Detail Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create vendor
// @route   POST /api/vendors
// @access  Private
exports.createVendor = async (req, res) => {
  const { name, phone, address, tax_no, reg_no } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  if (!name || !name.trim()) {
    return res.status(400).json({ status: 'error', message: 'Vendor name is required' });
  }

  try {
    const result = await db.query(
      `INSERT INTO vendors (name, phone, address, tax_no, reg_no, tenant_id, branch_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name.trim(), phone || null, address || null, tax_no || null, reg_no || null, tenant_id, branch_id]
    );
    logCreate(req, 'Vendor', result.rows[0].id, result.rows[0]);
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Create Vendor Error]', err.message);
    res.status(500).json({ status: 'error', message: `Server error: ${err.message}` });
  }
};

// @desc    Update vendor
// @route   PUT /api/vendors/:id
// @access  Private
exports.updateVendor = async (req, res) => {
  const { name, phone, address, tax_no, reg_no } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    const oldResult = await db.query(
      'SELECT * FROM vendors WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text',
      [req.params.id, tenant_id, branch_id]
    );
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Vendor not found' });
    }

    const result = await db.query(
      `UPDATE vendors SET name=$1, phone=$2, address=$3, tax_no=$4, reg_no=$5, updated_at=CURRENT_TIMESTAMP
       WHERE id=$6 AND tenant_id::text=$7::text AND branch_id::text=$8::text RETURNING *`,
      [name, phone || null, address || null, tax_no || null, reg_no || null, req.params.id, tenant_id, branch_id]
    );
    logUpdate(req, 'Vendor', req.params.id, oldResult.rows[0], result.rows[0]);
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Update Vendor Error]', err.message);
    res.status(500).json({ status: 'error', message: `Server error: ${err.message}` });
  }
};

// @desc    Delete vendor
// @route   DELETE /api/vendors/:id
// @access  Private
exports.deleteVendor = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    const result = await db.query(
      'DELETE FROM vendors WHERE id=$1 AND tenant_id::text=$2::text AND branch_id::text=$3::text RETURNING *',
      [req.params.id, tenant_id, branch_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Vendor not found' });
    }
    logDelete(req, 'Vendor', req.params.id, { name: result.rows[0].name });
    res.json({ status: 'success', message: 'Vendor deleted' });
  } catch (err) {
    console.error('[Delete Vendor Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
