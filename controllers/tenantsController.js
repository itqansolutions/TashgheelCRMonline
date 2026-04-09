const db = require('../config/db');
const { logAction, logUpdate, ACTIONS } = require('../services/loggerService');

// @desc    Get tenant details
// @route   GET /api/tenants/:id
// @access  Private (Admin)
exports.getTenantById = async (req, res) => {
  const { id } = req.params;
  const tenant_id = req.user.tenant_id;

  // Security check: user can only see their own tenant
  if (id !== tenant_id) {
    return res.status(403).json({ status: 'error', message: 'Unauthorized access to tenant data' });
  }

  try {
    const result = await db.query('SELECT * FROM tenants WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Tenant not found' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update tenant details
// @route   PUT /api/tenants/:id
// @access  Private (Admin)
exports.updateTenant = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const tenant_id = req.user.tenant_id;

  // Security check
  if (id !== tenant_id) {
    return res.status(403).json({ status: 'error', message: 'Unauthorized access to tenant data' });
  }

  try {
    // 1. Get old data for audit
    const oldResult = await db.query('SELECT * FROM tenants WHERE id = $1', [id]);
    const oldData = oldResult.rows[0];

    // 2. Update
    const result = await db.query(
      'UPDATE tenants SET name = $1 WHERE id = $2 RETURNING *',
      [name, id]
    );

    // Audit Logging
    logUpdate(req, 'Tenant', id, oldData, result.rows[0]);

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
