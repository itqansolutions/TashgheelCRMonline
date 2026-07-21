const db = require('../config/db');

// @desc    Get profile tasks (lazy loaded)
// @route   GET /api/profile/tasks
// @access  Private
exports.getTasks = async (req, res) => {
  const tenant_id = String(req.user.tenant_id);
  const branch_id = req.branchId || req.user?.branch_id;
  const isTeamView = req.query.team === 'true' && req.user.role === 'manager';

  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  try {
    let whereClauses = [`t.tenant_id::text = $1::text`];
    const params = [tenant_id];
    let idx = 2;

    if (branch_id && branch_id !== 'undefined') {
      whereClauses.push(`t.branch_id::text = $${idx}::text`);
      params.push(String(branch_id));
      idx++;
    }

    if (isTeamView) {
      whereClauses.push(`t.assigned_to IN (SELECT id FROM users WHERE manager_id = $${idx})`);
      params.push(req.user.id);
      idx++;
    } else {
      whereClauses.push(`t.assigned_to = $${idx}`);
      params.push(req.user.id);
      idx++;
    }

    const whereSql = whereClauses.join(' AND ');

    // Total Count Query
    const countRes = await db.query(`SELECT COUNT(*)::int as total FROM tasks t WHERE ${whereSql}`, params);
    const total = countRes.rows[0]?.total || 0;

    // Data Query
    const dataQuery = `
      SELECT t.*, ts.name as status_name, ts.color as status_color 
      FROM tasks t
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      WHERE ${whereSql}
      ORDER BY t.created_at DESC 
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    params.push(limit, offset);

    const result = await db.query(dataQuery, params);
    res.json({ status: 'success', data: result.rows, total });
  } catch (err) {
    console.error('[Profile API Tasks Error]', err.message);
    res.status(500).json({ status: 'error', message: err.message, data: [], total: 0 });
  }
};

// @desc    Get profile deals (lazy loaded)
// @route   GET /api/profile/deals
// @access  Private
exports.getDeals = async (req, res) => {
  const tenant_id = String(req.user.tenant_id);
  const branch_id = req.branchId || req.user?.branch_id;
  const isTeamView = req.query.team === 'true' && req.user.role === 'manager';

  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  try {
    let whereClauses = [`d.tenant_id::text = $1::text`];
    const params = [tenant_id];
    let idx = 2;

    if (branch_id && branch_id !== 'undefined') {
      whereClauses.push(`d.branch_id::text = $${idx}::text`);
      params.push(String(branch_id));
      idx++;
    }

    if (isTeamView) {
      whereClauses.push(`d.assigned_to IN (SELECT id FROM users WHERE manager_id = $${idx})`);
      params.push(req.user.id);
      idx++;
    } else {
      whereClauses.push(`d.assigned_to = $${idx}`);
      params.push(req.user.id);
      idx++;
    }

    const whereSql = whereClauses.join(' AND ');

    const countRes = await db.query(`SELECT COUNT(*)::int as total FROM deals d WHERE ${whereSql}`, params);
    const total = countRes.rows[0]?.total || 0;

    const dataQuery = `
      SELECT d.*, c.name as client_name 
      FROM deals d
      LEFT JOIN customers c ON d.client_id::text = c.id::text
      WHERE ${whereSql}
      ORDER BY d.created_at DESC 
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    params.push(limit, offset);

    const result = await db.query(dataQuery, params);
    res.json({ status: 'success', data: result.rows, total });
  } catch (err) {
    console.error('[Profile API Deals Error]', err.message);
    res.status(500).json({ status: 'error', message: err.message, data: [], total: 0 });
  }
};

// @desc    Get profile customers (lazy loaded)
// @route   GET /api/profile/customers
// @access  Private
exports.getCustomers = async (req, res) => {
  const tenant_id = String(req.user.tenant_id);
  const branch_id = req.branchId || req.user?.branch_id;
  const isTeamView = req.query.team === 'true' && req.user.role === 'manager';

  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  try {
    let whereClauses = [`c.tenant_id::text = $1::text`];
    const params = [tenant_id];
    let idx = 2;

    if (branch_id && branch_id !== 'undefined') {
      whereClauses.push(`c.branch_id::text = $${idx}::text`);
      params.push(String(branch_id));
      idx++;
    }

    if (isTeamView) {
      whereClauses.push(`c.assigned_to IN (SELECT id FROM users WHERE manager_id = $${idx})`);
      params.push(req.user.id);
      idx++;
    } else {
      whereClauses.push(`c.assigned_to = $${idx}`);
      params.push(req.user.id);
      idx++;
    }

    const whereSql = whereClauses.join(' AND ');

    const countRes = await db.query(`SELECT COUNT(*)::int as total FROM customers c WHERE ${whereSql}`, params);
    const total = countRes.rows[0]?.total || 0;

    const dataQuery = `
      SELECT c.* 
      FROM customers c
      WHERE ${whereSql}
      ORDER BY c.created_at DESC 
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    params.push(limit, offset);

    const result = await db.query(dataQuery, params);
    res.json({ status: 'success', data: result.rows, total });
  } catch (err) {
    console.error('[Profile API Customers Error]', err.message);
    res.status(500).json({ status: 'error', message: err.message, data: [], total: 0 });
  }
};

// @desc    Get profile units (lazy loaded)
// @route   GET /api/profile/units
// @access  Private
exports.getUnits = async (req, res) => {
  const tenant_id = String(req.user.tenant_id);
  const branch_id = req.branchId || req.user?.branch_id;
  const isTeamView = req.query.team === 'true' && req.user.role === 'manager';

  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  try {
    let whereClauses = [`u.tenant_id::text = $1::text`];
    const params = [tenant_id];
    let idx = 2;

    if (branch_id && branch_id !== 'undefined') {
      whereClauses.push(`u.branch_id::text = $${idx}::text`);
      params.push(String(branch_id));
      idx++;
    }

    if (isTeamView) {
      whereClauses.push(`u.assigned_to IN (SELECT id FROM users WHERE manager_id = $${idx})`);
      params.push(req.user.id);
      idx++;
    } else {
      whereClauses.push(`u.assigned_to = $${idx}`);
      params.push(req.user.id);
      idx++;
    }

    const whereSql = whereClauses.join(' AND ');

    const countRes = await db.query(`SELECT COUNT(*)::int as total FROM re_units u WHERE ${whereSql}`, params);
    const total = countRes.rows[0]?.total || 0;

    const dataQuery = `
      SELECT u.* 
      FROM re_units u
      WHERE ${whereSql}
      ORDER BY u.created_at DESC 
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    params.push(limit, offset);

    const result = await db.query(dataQuery, params);
    res.json({ status: 'success', data: result.rows, total });
  } catch (err) {
    console.error('[Profile API Units Error]', err.message);
    if (err.code === '42P01') {
        return res.json({ status: 'success', data: [], total: 0 });
    }
    res.status(500).json({ status: 'error', message: err.message, data: [], total: 0 });
  }
};
