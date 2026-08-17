const db = require('../config/db');

/**
 * HR Attendance Devices Controller
 * ZKTeco machines managed via ADMS Push Protocol
 */

// @desc    Get all devices
// @route   GET /api/hr/devices
exports.getDevices = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(`
      SELECT d.*, b.name as branch_name,
        CASE WHEN d.last_seen > NOW() - INTERVAL '5 minutes' THEN 'online' ELSE 'offline' END as connection_status
      FROM hr_attendance_devices d
      LEFT JOIN branches b ON d.branch_id = b.id
      WHERE d.tenant_id = $1
      ORDER BY d.name ASC
    `, [tenant_id]);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[getDevices]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create / register device manually
// @route   POST /api/hr/devices
exports.createDevice = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  const { name, serial_number, ip_address, location } = req.body;
  if (!name?.trim()) return res.status(400).json({ status: 'error', message: 'اسم الجهاز مطلوب' });
  try {
    const result = await db.query(`
      INSERT INTO hr_attendance_devices (tenant_id, branch_id, name, serial_number, ip_address, location)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [tenant_id, branch_id, name.trim(), serial_number || null, ip_address || null, location || null]);
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[createDevice]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update device
// @route   PUT /api/hr/devices/:id
exports.updateDevice = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  const { name, serial_number, ip_address, location, is_active } = req.body;
  try {
    const result = await db.query(`
      UPDATE hr_attendance_devices SET
        name = $1, serial_number = $2, ip_address = $3, location = $4,
        is_active = $5, branch_id = $6
      WHERE id = $7 AND tenant_id = $8 RETURNING *
    `, [name?.trim(), serial_number || null, ip_address || null, location || null,
        is_active !== false, branch_id, req.params.id, tenant_id]);
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'الجهاز غير موجود' });
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete device
// @route   DELETE /api/hr/devices/:id
exports.deleteDevice = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(
      `DELETE FROM hr_attendance_devices WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.id, tenant_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'الجهاز غير موجود' });
    res.json({ status: 'success', message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// ─── Badge Numbers ────────────────────────────────────────────────────────────

// @desc    Get all employees with their badge numbers
// @route   GET /api/hr/devices/badge-numbers
exports.getBadgeNumbers = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(`
      SELECT u.id, u.name, u.email, u.badge_number, u.is_working,
             d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.tenant_id::text = $1::text AND u.branch_id::text = $2::text
      ORDER BY u.name ASC
    `, [tenant_id, branch_id]);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[getBadgeNumbers]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update badge number for a user
// @route   PUT /api/hr/devices/badge-numbers/:user_id
exports.updateBadgeNumber = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { badge_number } = req.body;
  try {
    // Check uniqueness within tenant
    if (badge_number) {
      const dup = await db.query(
        `SELECT id FROM users WHERE badge_number = $1 AND tenant_id::text = $2::text AND id != $3`,
        [badge_number, tenant_id, req.params.user_id]
      );
      if (dup.rows.length > 0) {
        return res.status(400).json({ status: 'error', message: 'هذا الـ Badge Number مستخدم بالفعل من موظف آخر' });
      }
    }
    const result = await db.query(
      `UPDATE users SET badge_number = $1 WHERE id = $2 AND tenant_id::text = $3::text RETURNING id, name, badge_number`,
      [badge_number || null, req.params.user_id, tenant_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'الموظف غير موجود' });
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[updateBadgeNumber]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Claim / link an auto-registered device to this tenant
// @route   POST /api/hr/devices/:id/claim
exports.claimDevice = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  const { name, location } = req.body;
  try {
    const result = await db.query(`
      UPDATE hr_attendance_devices
      SET tenant_id = $1, branch_id = $2, name = COALESCE($3, name), location = $4
      WHERE id = $5 AND (tenant_id IS NULL OR tenant_id = $1)
      RETURNING *
    `, [tenant_id, branch_id, name || null, location || null, req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'الجهاز غير موجود أو مرتبط بمستأجر آخر' });
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get recent attendance from a device
// @route   GET /api/hr/devices/:id/recent
exports.getDeviceRecentAttendance = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const deviceRes = await db.query(
      `SELECT * FROM hr_attendance_devices WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenant_id]
    );
    if (deviceRes.rows.length === 0) return res.status(404).json({ status: 'error', message: 'الجهاز غير موجود' });

    const result = await db.query(`
      SELECT a.*, u.name as employee_name, u.badge_number
      FROM hr_attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.tenant_id = $1 AND a.source = 'device'
      ORDER BY a.check_in DESC LIMIT 50
    `, [tenant_id]);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
