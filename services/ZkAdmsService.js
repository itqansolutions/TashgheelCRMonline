const db = require('../config/db');

/**
 * ZKTeco ADMS Push Service
 * ========================================================
 * الماكينة هي اللي بتتصل بالسيرفر (Push) — Cloud Compatible
 * لا TCP، لا SDK — HTTP بسيط
 *
 * Endpoints الماكينة بتكلمها:
 *   POST /iclock/cdata      ← سجلات الحضور (ATTLOG)
 *   GET  /iclock/getrequest ← الماكينة بتسأل لو في أوامر
 *   POST /iclock/devicecmd  ← تأكيد تنفيذ الأوامر
 * ========================================================
 */

// Helper: parse ATTLOG line
// Format: "UserID\tTimestamp\tStatus\tVerify\tWorkCode\t..."
const parseAttLog = (line) => {
  const clean = line.replace(/^ATTLOG\s+/, '').trim();
  const parts = clean.split('\t');
  if (parts.length < 2) return null;
  return {
    badge_number: parts[0].trim(),
    timestamp: parts[1].trim(),          // "2025-08-17 09:05:00"
    attend_date: parts[1].trim().split(' ')[0],
    verify_type: parts[3] || '0',        // 0=punch, 1=finger, 4=face
  };
};

// Helper: apply shift deduction rules
const applyDeductionRules = (rules, late_minutes) => {
  if (!rules || rules.length === 0) return 0;
  for (const rule of rules) {
    if (late_minutes >= rule.from_min && late_minutes <= rule.to_min) {
      return parseFloat(rule.deduct_days) || 0;
    }
  }
  return 0;
};

// Helper: get device by serial number → register if new
const getOrRegisterDevice = async (sn) => {
  if (!sn) return null;
  let res = await db.query(
    `SELECT * FROM hr_attendance_devices WHERE serial_number = $1 AND is_active = TRUE LIMIT 1`,
    [sn]
  );
  if (res.rows.length > 0) {
    // Update last_seen & push count
    await db.query(
      `UPDATE hr_attendance_devices SET last_seen = NOW(), total_pushes = total_pushes + 1 WHERE serial_number = $1`,
      [sn]
    );
    return res.rows[0];
  }
  // Auto-register new device (unassigned tenant — admin can claim later)
  console.log(`[ADMS] New device seen: SN=${sn}. Auto-registering...`);
  const inserted = await db.query(
    `INSERT INTO hr_attendance_devices (name, serial_number, last_seen, total_pushes)
     VALUES ($1, $2, NOW(), 1) RETURNING *`,
    [`ZKTeco Device (${sn})`, sn]
  );
  return inserted.rows[0];
};

// Helper: find user by badge_number within the device's tenant
const findUserByBadge = async (badge_number, tenant_id) => {
  if (!badge_number || !tenant_id) return null;
  const res = await db.query(
    `SELECT id FROM users WHERE badge_number = $1 AND tenant_id::text = $2::text`,
    [String(badge_number), String(tenant_id)]
  );
  return res.rows[0] || null;
};

// Core: process a single attendance record
const processAttendanceRecord = async (badge_number, timestamp, attend_date, device) => {
  if (!device || !device.tenant_id) return;

  const user = await findUserByBadge(badge_number, device.tenant_id);
  if (!user) {
    // Badge not mapped — skip silently
    return;
  }

  // Idempotent upsert:
  // First punch of the day → check_in
  // Second punch → check_out
  // More punches → update check_out with the latest
  await db.query(`
    INSERT INTO hr_attendance (
      user_id, tenant_id, branch_id, check_in, attendance_date, source
    ) VALUES ($1, $2, $3, $4::timestamptz, $5::date, 'device')
    ON CONFLICT (user_id, attendance_date)
    DO UPDATE SET
      check_out = CASE
        WHEN EXCLUDED.check_in > hr_attendance.check_in THEN EXCLUDED.check_in
        ELSE hr_attendance.check_out
      END,
      work_hours = CASE
        WHEN EXCLUDED.check_in > hr_attendance.check_in THEN
          ROUND(EXTRACT(EPOCH FROM (EXCLUDED.check_in - hr_attendance.check_in)) / 3600.0, 2)
        ELSE hr_attendance.work_hours
      END
  `, [user.id, device.tenant_id, device.branch_id, timestamp, attend_date]);
};

/**
 * Register ADMS routes on the Express app
 * IMPORTANT: Call this BEFORE auth middleware — devices don't send JWT
 */
module.exports = (app) => {

  // ──────────────────────────────────────────────────────
  // ① Main data push endpoint
  // The device POSTs here with ATTLOG data
  // ──────────────────────────────────────────────────────
  app.post('/iclock/cdata', async (req, res) => {
    try {
      const sn = req.query.SN || req.query.sn || '';
      let body = '';

      // Collect raw body (plain text)
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const device = await getOrRegisterDevice(sn);

          // Parse ATTLOG lines from body
          if (body && body.includes('ATTLOG')) {
            const lines = body.split('\n').filter(l => l.trim().startsWith('ATTLOG'));
            let processed = 0;
            for (const line of lines) {
              const parsed = parseAttLog(line);
              if (parsed) {
                await processAttendanceRecord(
                  parsed.badge_number,
                  parsed.timestamp,
                  parsed.attend_date,
                  device
                );
                processed++;
              }
            }
            console.log(`[ADMS] SN=${sn}: processed ${processed} attendance records`);
          }

          // ZKTeco REQUIRES exactly "OK" to stop retrying
          res.set('Content-Type', 'text/plain');
          res.send('OK');
        } catch (innerErr) {
          console.error('[ADMS] cdata processing error:', innerErr.message);
          res.send('OK'); // Always OK to prevent device spam
        }
      });
    } catch (err) {
      console.error('[ADMS] cdata outer error:', err.message);
      res.send('OK');
    }
  });

  // ──────────────────────────────────────────────────────
  // ② Device polls for commands from server
  // Respond with commands or empty OK
  // ──────────────────────────────────────────────────────
  app.get('/iclock/getrequest', async (req, res) => {
    try {
      const sn = req.query.SN || '';
      await getOrRegisterDevice(sn); // Update last_seen
      // Future: queue commands (sync time, etc.)
      res.set('Content-Type', 'text/plain');
      res.send('OK');
    } catch (err) {
      res.send('OK');
    }
  });

  // ──────────────────────────────────────────────────────
  // ③ Device confirms command execution
  // ──────────────────────────────────────────────────────
  app.post('/iclock/devicecmd', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send('OK');
  });

  console.log('✅ [ADMS] ZKTeco Push routes registered: /iclock/cdata, /iclock/getrequest, /iclock/devicecmd');
};

// Export helpers for use in hrController.js
module.exports.applyDeductionRules = applyDeductionRules;
