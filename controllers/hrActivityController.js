const db = require('../config/db');

/**
 * HR Activity Types & Balances Controller
 */

// ─── Activity Types ───────────────────────────────────────────────────────────

// @desc    Get all activity types for tenant
// @route   GET /api/hr/activity-types
exports.getActivityTypes = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(
      `SELECT * FROM hr_activity_types WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenant_id]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[getActivityTypes]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create activity type
// @route   POST /api/hr/activity-types
exports.createActivityType = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { name, unit, start_post, end_post, min_value, max_value, is_active } = req.body;
  if (!name?.trim()) return res.status(400).json({ status: 'error', message: 'Activity name is required' });
  try {
    const result = await db.query(
      `INSERT INTO hr_activity_types (tenant_id, name, unit, start_post, end_post, min_value, max_value, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        tenant_id, name.trim(),
        unit || 'hours',
        parseInt(start_post) || 0,
        parseInt(end_post) || 0,
        parseFloat(min_value) || 0,
        parseFloat(max_value) || 30,
        is_active !== false
      ]
    );
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[createActivityType]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update activity type
// @route   PUT /api/hr/activity-types/:id
exports.updateActivityType = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { name, unit, start_post, end_post, min_value, max_value, is_active } = req.body;
  try {
    const result = await db.query(
      `UPDATE hr_activity_types SET
        name = $1, unit = $2, start_post = $3, end_post = $4,
        min_value = $5, max_value = $6, is_active = $7
       WHERE id = $8 AND tenant_id = $9 RETURNING *`,
      [
        name?.trim(), unit || 'hours',
        parseInt(start_post) || 0, parseInt(end_post) || 0,
        parseFloat(min_value) || 0, parseFloat(max_value) || 30,
        is_active !== false,
        req.params.id, tenant_id
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Activity type not found' });
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[updateActivityType]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete activity type
// @route   DELETE /api/hr/activity-types/:id
exports.deleteActivityType = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(
      `DELETE FROM hr_activity_types WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.id, tenant_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Activity type not found' });
    res.json({ status: 'success', message: 'Deleted successfully' });
  } catch (err) {
    // FK constraint — balances exist
    if (err.code === '23503') {
      return res.status(400).json({ status: 'error', message: 'Cannot delete — balances are linked to this activity' });
    }
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// ─── Activity Balances ────────────────────────────────────────────────────────

// @desc    Get activity balances
// @route   GET /api/hr/activity-balances
//          Query: ?user_id=&month=&year=&activity_type_id=
exports.getActivityBalances = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  const { user_id, month, year, activity_type_id } = req.query;

  let query = `
    SELECT b.*, u.name as employee_name, at.name as activity_name, at.unit
    FROM hr_activity_balances b
    JOIN users u ON b.user_id = u.id
    JOIN hr_activity_types at ON b.activity_type_id = at.id
    WHERE b.tenant_id = $1
  `;
  const params = [tenant_id];
  let i = 2;

  if (user_id) { query += ` AND b.user_id = $${i++}`; params.push(parseInt(user_id)); }
  if (month)   { query += ` AND b.period_month = $${i++}`; params.push(parseInt(month)); }
  if (year)    { query += ` AND b.period_year = $${i++}`; params.push(parseInt(year)); }
  if (activity_type_id) { query += ` AND b.activity_type_id = $${i++}`; params.push(parseInt(activity_type_id)); }

  // If employee (not admin/manager), only see own balances
  if (req.user.role === 'employee') {
    query += ` AND b.user_id = $${i++}`;
    params.push(req.user.id);
  }

  query += ` ORDER BY b.period_year DESC, b.period_month DESC, u.name ASC`;

  try {
    const result = await db.query(query, params);
    // Compute remaining dynamically
    const data = result.rows.map(r => ({
      ...r,
      remaining: parseFloat(r.allocated) - parseFloat(r.used)
    }));
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[getActivityBalances]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create activity balance
// @route   POST /api/hr/activity-balances
exports.createActivityBalance = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  const { user_id, activity_type_id, period_month, period_year, allocated, notes } = req.body;

  if (!user_id || !activity_type_id || !period_month || !period_year) {
    return res.status(400).json({ status: 'error', message: 'Employee, activity, and period are required' });
  }
  try {
    const result = await db.query(
      `INSERT INTO hr_activity_balances
        (tenant_id, branch_id, user_id, activity_type_id, period_month, period_year, allocated, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id, activity_type_id, period_month, period_year)
       DO UPDATE SET allocated = EXCLUDED.allocated, notes = EXCLUDED.notes
       RETURNING *`,
      [tenant_id, branch_id, parseInt(user_id), parseInt(activity_type_id),
       parseInt(period_month), parseInt(period_year),
       parseFloat(allocated) || 0, notes || null]
    );
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[createActivityBalance]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update activity balance
// @route   PUT /api/hr/activity-balances/:id
exports.updateActivityBalance = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { allocated, used, notes } = req.body;
  try {
    const result = await db.query(
      `UPDATE hr_activity_balances SET allocated = $1, used = $2, notes = $3
       WHERE id = $4 AND tenant_id = $5 RETURNING *`,
      [parseFloat(allocated) || 0, parseFloat(used) || 0, notes || null, req.params.id, tenant_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Balance record not found' });
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[updateActivityBalance]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete activity balance
// @route   DELETE /api/hr/activity-balances/:id
exports.deleteActivityBalance = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(
      `DELETE FROM hr_activity_balances WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.id, tenant_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Balance record not found' });
    res.json({ status: 'success', message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
