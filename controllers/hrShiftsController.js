const db = require('../config/db');

/**
 * HR Shifts Controller
 * - hr_shifts: تعريف الشيفتات وقواعد الخصم
 * - hr_user_shifts: تعيين الموظفين للشيفتات
 */

// ─── Shifts CRUD ──────────────────────────────────────────────────────────────

// @desc    Get all shifts
// @route   GET /api/hr/shifts
exports.getShifts = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM hr_user_shifts us WHERE us.shift_id = s.id AND us.effective_to IS NULL) as employee_count
      FROM hr_shifts s
      WHERE s.tenant_id = $1
      ORDER BY s.name ASC
    `, [tenant_id]);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[getShifts]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get single shift
// @route   GET /api/hr/shifts/:id
exports.getShiftById = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(
      `SELECT * FROM hr_shifts WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenant_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Shift not found' });
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create shift
// @route   POST /api/hr/shifts
exports.createShift = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { name, start_time, end_time, off_days, grace_minutes, deduction_rules, is_active } = req.body;

  if (!name?.trim()) return res.status(400).json({ status: 'error', message: 'Shift name is required' });
  if (!start_time)   return res.status(400).json({ status: 'error', message: 'Start time is required' });
  if (!end_time)     return res.status(400).json({ status: 'error', message: 'End time is required' });

  try {
    const result = await db.query(`
      INSERT INTO hr_shifts (tenant_id, name, start_time, end_time, off_days, grace_minutes, deduction_rules, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [
      tenant_id, name.trim(), start_time, end_time,
      off_days || [5, 6],
      parseInt(grace_minutes) || 15,
      JSON.stringify(deduction_rules || []),
      is_active !== false
    ]);
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[createShift]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update shift
// @route   PUT /api/hr/shifts/:id
exports.updateShift = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { name, start_time, end_time, off_days, grace_minutes, deduction_rules, is_active } = req.body;
  try {
    const result = await db.query(`
      UPDATE hr_shifts SET
        name = $1, start_time = $2, end_time = $3, off_days = $4,
        grace_minutes = $5, deduction_rules = $6, is_active = $7
      WHERE id = $8 AND tenant_id = $9 RETURNING *
    `, [
      name?.trim(), start_time, end_time,
      off_days || [5, 6],
      parseInt(grace_minutes) || 15,
      JSON.stringify(deduction_rules || []),
      is_active !== false,
      req.params.id, tenant_id
    ]);
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Shift not found' });
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[updateShift]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete shift
// @route   DELETE /api/hr/shifts/:id
exports.deleteShift = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    // Guard: don't delete if employees assigned
    const assigned = await db.query(
      `SELECT COUNT(*) FROM hr_user_shifts WHERE shift_id = $1 AND effective_to IS NULL`,
      [req.params.id]
    );
    if (parseInt(assigned.rows[0].count) > 0) {
      return res.status(400).json({ status: 'error', message: 'Cannot delete — employees are currently assigned to this shift' });
    }
    const result = await db.query(
      `DELETE FROM hr_shifts WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.id, tenant_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Shift not found' });
    res.json({ status: 'success', message: 'Deleted successfully' });
  } catch (err) {
    console.error('[deleteShift]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// ─── User Shifts ──────────────────────────────────────────────────────────────

// @desc    Get all user-shift assignments
// @route   GET /api/hr/user-shifts
exports.getUserShifts = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(`
      SELECT us.*, u.name as employee_name, u.email as employee_email,
             s.name as shift_name, s.start_time, s.end_time, s.off_days
      FROM hr_user_shifts us
      JOIN users u ON us.user_id = u.id
      JOIN hr_shifts s ON us.shift_id = s.id
      WHERE us.tenant_id = $1 AND u.branch_id::text = $2::text
      ORDER BY u.name ASC, us.effective_from DESC
    `, [tenant_id, branch_id]);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[getUserShifts]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get all users with their current shift (for assignment table)
// @route   GET /api/hr/user-shifts/summary
exports.getUserShiftSummary = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(`
      SELECT 
        u.id as user_id, u.name as employee_name, u.badge_number,
        s.id as shift_id, s.name as shift_name, s.start_time, s.end_time,
        us.id as assignment_id, us.effective_from
      FROM users u
      LEFT JOIN hr_user_shifts us ON us.user_id = u.id
        AND us.effective_from <= CURRENT_DATE
        AND (us.effective_to IS NULL OR us.effective_to >= CURRENT_DATE)
      LEFT JOIN hr_shifts s ON us.shift_id = s.id
      WHERE u.tenant_id::text = $1::text AND u.branch_id::text = $2::text
        AND u.is_working = TRUE
      ORDER BY u.name ASC
    `, [tenant_id, branch_id]);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[getUserShiftSummary]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Assign employee to shift
// @route   POST /api/hr/user-shifts
exports.assignUserShift = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { user_id, shift_id, effective_from, effective_to } = req.body;
  if (!user_id || !shift_id) return res.status(400).json({ status: 'error', message: 'Employee and shift are required' });
  try {
    // Close any existing open assignment for this employee
    await db.query(
      `UPDATE hr_user_shifts SET effective_to = $1
       WHERE user_id = $2 AND effective_to IS NULL AND tenant_id = $3`,
      [effective_from || new Date().toISOString().split('T')[0], parseInt(user_id), tenant_id]
    );
    const result = await db.query(`
      INSERT INTO hr_user_shifts (user_id, shift_id, effective_from, effective_to, tenant_id)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (user_id, effective_from) DO UPDATE SET shift_id = EXCLUDED.shift_id
      RETURNING *
    `, [
      parseInt(user_id), parseInt(shift_id),
      effective_from || new Date().toISOString().split('T')[0],
      effective_to || null,
      tenant_id
    ]);
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[assignUserShift]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Remove user shift assignment
// @route   DELETE /api/hr/user-shifts/:id
exports.removeUserShift = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(
      `DELETE FROM hr_user_shifts WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.id, tenant_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Shift assignment not found' });
    res.json({ status: 'success', message: 'Assignment removed successfully' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// Helper exported for hrController.js
exports.getEmployeeShift = async (user_id) => {
  const res = await db.query(`
    SELECT s.start_time, s.end_time, s.grace_minutes, s.deduction_rules, s.off_days
    FROM hr_user_shifts us
    JOIN hr_shifts s ON us.shift_id = s.id
    WHERE us.user_id = $1
      AND us.effective_from <= CURRENT_DATE
      AND (us.effective_to IS NULL OR us.effective_to >= CURRENT_DATE)
      AND s.is_active = TRUE
    ORDER BY us.effective_from DESC
    LIMIT 1
  `, [user_id]);
  // Default shift if not assigned
  return res.rows[0] || { start_time: '09:15', end_time: '17:00', grace_minutes: 0, deduction_rules: [], off_days: [5, 6] };
};
