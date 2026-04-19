const db = require('../config/db');
const { logAction, logUpdate, ACTIONS } = require('../services/loggerService');

// @desc    Get all branches for the tenant
// @route   GET /api/branches
// @access  Private
exports.getBranches = async (req, res) => {
  const tenant_id = req.user.tenant_id;

  try {
    const result = await db.query(
      'SELECT * FROM branches WHERE tenant_id::text = $1::text ORDER BY name ASC',
      [tenant_id]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create a new branch
// @route   POST /api/branches
// @access  Private (Admin)
exports.createBranch = async (req, res) => {
  const { name, address, phone } = req.body;
  const tenant_id = req.user.tenant_id;

  if (req.user.role !== 'admin') {
    return res.status(403).json({ status: 'error', message: 'Only administrators can create branches' });
  }

  try {
    const result = await db.query(
      'INSERT INTO branches (name, address, phone, tenant_id) VALUES ($1, $2, $3, $4::text) RETURNING *',
      [name, address, phone, tenant_id]
    );

    logAction({ req, action: ACTIONS.CREATE, entityType: 'Branch', entityId: result.rows[0].id });

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update branch details
// @route   PUT /api/branches/:id
// @access  Private (Admin)
exports.updateBranch = async (req, res) => {
  const { id } = req.params;
  const { name, address, phone } = req.body;
  const tenant_id = req.user.tenant_id;

  if (req.user.role !== 'admin') {
    return res.status(403).json({ status: 'error', message: 'Only administrators can edit branches' });
  }

  try {
    // Audit check
    const oldResult = await db.query('SELECT * FROM branches WHERE id::text = $1::text AND tenant_id::text = $2::text', [id, tenant_id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Branch not found' });
    }

    const result = await db.query(
      'UPDATE branches SET name = $1, address = $2, phone = $3 WHERE id::text = $4::text AND tenant_id::text = $5::text RETURNING *',
      [name || oldResult.rows[0].name, address || oldResult.rows[0].address, phone || oldResult.rows[0].phone, id, tenant_id]
    );

    logUpdate(req, 'Branch', id, oldResult.rows[0], result.rows[0]);

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete branch
// @route   DELETE /api/branches/:id
// @access  Private (Admin)
exports.deleteBranch = async (req, res) => {
  const { id } = req.params;
  const tenant_id = req.user.tenant_id;

  if (req.user.role !== 'admin') {
    return res.status(403).json({ status: 'error', message: 'Only administrators can delete branches' });
  }

  try {
    // 1. Double check Main Branch protection
    const checkResult = await db.query('SELECT is_main FROM branches WHERE id::text = $1::text AND tenant_id::text = $2::text', [id, tenant_id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Branch not found' });
    }
    
    if (checkResult.rows[0].is_main) {
      return res.status(403).json({ 
        status: 'error', 
        message: 'Security Restriction: The Main Branch cannot be deleted as it serves as the organizational foundation.' 
      });
    }

    const result = await db.query('DELETE FROM branches WHERE id::text = $1::text AND tenant_id::text = $2::text RETURNING *', [id, tenant_id]);

    logAction({ req, action: ACTIONS.DELETE, entityType: 'Branch', entityId: id });

    res.json({ status: 'success', message: 'Branch deleted successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Log a user branch switch
// @route   POST /api/branches/log-switch
// @access  Private
exports.logBranchSwitch = async (req, res) => {
  const { branchId, branchName } = req.body;
  const tenant_id = req.user.tenant_id;

  try {
    const checkResult = await db.query('SELECT id FROM branches WHERE id::text = $1::text AND tenant_id::text = $2::text', [branchId, tenant_id]);
    if (checkResult.rows.length > 0) {
      logAction({
        req,
        action: ACTIONS.BRANCH_SWITCH,
        entityType: 'Branch',
        entityId: branchId,
        details: { message: `User switched workspace to ${branchName || branchId}` },
        level: 'INFO'
      });
    }
    
    res.json({ status: 'success' });
  } catch (err) {
    console.error('Audit Log Error:', err.message);
    res.json({ status: 'success' });
  }
};
