// Reject audit log for attendance geofence refusals. Best-effort: never blocks or changes the 403 response.
// Stores distance and accuracy only, never raw GPS coordinates. 90-day retention.
const db = require('../config/db');
const RETENTION_DAYS = 90;
const LOGGED = new Set(['GEO_OUTSIDE_AREA', 'GEO_FIX_STALE', 'GEO_FIX_REQUIRED', 'GEO_FIX_INVALID', 'GEO_MOBILE_ONLY']);
let lastPurge = 0;
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== undefined ? Number(v) : null);

async function recordReject({ tenant, branch, user, mode, err }) {
  try {
    if (!err || !LOGGED.has(err.code)) return false;
    const d = err.details || {};
    await db.query(
      `INSERT INTO hr_attendance_location_rejects(tenant_id,branch_id,user_id,mode,reason_code,distance_m,accuracy_m,radius_m,fix_age_seconds)
       VALUES($1::uuid,$2::uuid,$3::integer,$4,$5,$6,$7,$8,$9)`,
      [String(tenant), String(branch), Number(user), mode === 'out' ? 'out' : 'in', err.code, num(d.distance_m), num(d.accuracy_m), num(d.radius_m), num(d.fix_age_seconds)]
    );
    if (Date.now() - lastPurge > 3600000) {
      lastPurge = Date.now();
      await db.query(`DELETE FROM hr_attendance_location_rejects WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')`, [RETENTION_DAYS]);
    }
    return true;
  } catch (e) {
    console.error('[AttendanceRejectLog] not recorded:', e.code || e.message);
    return false;
  }
}

async function listRejects({ tenant, branch, days = 30, limit = 100 }) {
  const d = Math.min(Math.max(parseInt(days, 10) || 30, 1), RETENTION_DAYS);
  const l = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const r = await db.query(
    `SELECT r.id,r.user_id,u.name AS user_name,r.mode,r.reason_code,r.distance_m,r.accuracy_m,r.radius_m,r.fix_age_seconds,r.created_at
     FROM hr_attendance_location_rejects r LEFT JOIN users u ON u.id=r.user_id AND u.tenant_id::text=r.tenant_id::text
     WHERE r.tenant_id::text=$1::text AND r.branch_id::text=$2::text AND r.created_at >= NOW() - ($3::int * INTERVAL '1 day')
     ORDER BY r.created_at DESC LIMIT $4`,
    [String(tenant), String(branch), d, l]
  );
  return r.rows;
}
module.exports = { recordReject, listRejects, RETENTION_DAYS };
