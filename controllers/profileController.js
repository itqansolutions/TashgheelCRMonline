const db = require('../config/db');

// @desc    Get profile tasks (lazy loaded)
// @route   GET /api/profile/tasks
// @access  Private
exports.getTasks = async (req, res) => {
  const tenant_id = String(req.user.tenant_id);
  const branch_id = String(req.branchId || req.user?.branch_id);
  const isTeamView = req.query.team === 'true' && req.user.role === 'manager';

  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  try {
    let query = `
      SELECT t.*, ts.name as status_name, ts.color as status_color 
      FROM tasks t
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.tenant_id::text = $1::text AND t.branch_id::text = $2::text
    `;
    const params = [tenant_id, branch_id];

    if (isTeamView) {
      query += ` AND t.assigned_to IN (SELECT id FROM users WHERE manager_id = $3)`;
      params.push(req.user.id);
    } else {
      query += ` AND t.assigned_to = $3`;
      params.push(req.user.id);
    }

    query += ` ORDER BY t.created_at DESC LIMIT $4 OFFSET $5`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[Profile API Tasks Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get profile deals (lazy loaded)
// @route   GET /api/profile/deals
// @access  Private
exports.getDeals = async (req, res) => {
  const tenant_id = String(req.user.tenant_id);
  const branch_id = String(req.branchId || req.user?.branch_id);
  const isTeamView = req.query.team === 'true' && req.user.role === 'manager';

  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  try {
    let query = `
      SELECT d.*, c.name as client_name 
      FROM deals d
      LEFT JOIN customers c ON d.client_id::text = c.id::text
      WHERE d.tenant_id::text = $1::text AND d.branch_id::text = $2::text
    `;
    const params = [tenant_id, branch_id];

    if (isTeamView) {
      query += ` AND d.assigned_to IN (SELECT id FROM users WHERE manager_id = $3)`;
      params.push(req.user.id);
    } else {
      query += ` AND d.assigned_to = $3`;
      params.push(req.user.id);
    }

    query += ` ORDER BY d.created_at DESC LIMIT $4 OFFSET $5`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[Profile API Deals Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get profile customers (lazy loaded)
// @route   GET /api/profile/customers
// @access  Private
exports.getCustomers = async (req, res) => {
  const tenant_id = String(req.user.tenant_id);
  const branch_id = String(req.branchId || req.user?.branch_id);
  const isTeamView = req.query.team === 'true' && req.user.role === 'manager';

  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  try {
    let query = `
      SELECT c.* 
      FROM customers c
      WHERE c.tenant_id::text = $1::text AND c.branch_id::text = $2::text
    `;
    const params = [tenant_id, branch_id];

    if (isTeamView) {
      query += ` AND c.assigned_to IN (SELECT id FROM users WHERE manager_id = $3)`;
      params.push(req.user.id);
    } else {
      query += ` AND c.assigned_to = $3`;
      params.push(req.user.id);
    }

    query += ` ORDER BY c.created_at DESC LIMIT $4 OFFSET $5`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[Profile API Customers Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get profile units (lazy loaded)
// @route   GET /api/profile/units
// @access  Private
exports.getUnits = async (req, res) => {
  const tenant_id = String(req.user.tenant_id);
  const branch_id = String(req.branchId || req.user?.branch_id);
  const isTeamView = req.query.team === 'true' && req.user.role === 'manager';

  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  try {
    let query = `
      SELECT u.* 
      FROM re_units u
      WHERE u.tenant_id::text = $1::text AND u.branch_id::text = $2::text
    `;
    const params = [tenant_id, branch_id];

    if (isTeamView) {
      query += ` AND u.assigned_to IN (SELECT id FROM users WHERE manager_id = $3)`;
      params.push(req.user.id);
    } else {
      query += ` AND u.assigned_to = $3`;
      params.push(req.user.id);
    }

    query += ` ORDER BY u.created_at DESC LIMIT $4 OFFSET $5`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[Profile API Units Error]', err.message);
    // Ignore relation "re_units" does not exist error if template is not real_estate
    if (err.code === '42P01') {
        return res.json({ status: 'success', data: [] });
    }
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
