'use strict';
/**
 * hr_profiles is what the payroll engine reads for the base salary. users.salary mirrors it for display.
 * Both are written together so an employee with a salary always has a payroll profile.
 */

/** @returns {{ok:true, value:number|undefined}|{ok:false}} undefined means "not provided, leave unchanged" */
function parseSalary(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return { ok: true, value: undefined };
  const n = Number(String(raw).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0 || n > 100000000) return { ok: false };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

async function upsertProfile(q, { userId, tenantId, branchId, salary, hireDate, jobTitle }) {
  await q.query(
    `INSERT INTO hr_profiles (user_id, tenant_id, branch_id, job_title, salary, hire_date, status)
     SELECT u.id, u.tenant_id, COALESCE($3::uuid, u.branch_id), $4, $5, COALESCE($6::date, u.hire_date), 'active'
       FROM users u WHERE u.id = $1 AND u.tenant_id::text = $2::text
     ON CONFLICT (user_id) DO UPDATE SET
       salary = EXCLUDED.salary,
       job_title = COALESCE(EXCLUDED.job_title, hr_profiles.job_title),
       hire_date = COALESCE(EXCLUDED.hire_date, hr_profiles.hire_date),
       branch_id = COALESCE(hr_profiles.branch_id, EXCLUDED.branch_id),
       updated_at = CURRENT_TIMESTAMP
     WHERE hr_profiles.tenant_id::text = EXCLUDED.tenant_id::text`,
    [userId, String(tenantId), branchId || null, jobTitle || null, salary, hireDate || null]
  );
}

/** Save salary on users and hr_profiles. Caller has already validated with parseSalary. */
async function saveSalary(q, { userId, tenantId, branchId, salary, hireDate, jobTitle }) {
  await q.query('UPDATE users SET salary = $1 WHERE id = $2 AND tenant_id::text = $3::text', [salary, userId, String(tenantId)]);
  await upsertProfile(q, { userId, tenantId, branchId, salary, hireDate, jobTitle });
}

/**
 * Payroll fallback: employee has no hr_profiles row yet but users.salary is set (>0).
 * Creates the profile from the user row and returns it, or null when there is nothing to build from.
 */
async function ensureProfileFromUser(q, { userId, tenantId }) {
  const u = await q.query('SELECT salary FROM users WHERE id = $1 AND tenant_id::text = $2::text', [userId, String(tenantId)]);
  const salary = Number(u.rows[0] && u.rows[0].salary);
  if (!Number.isFinite(salary) || salary <= 0) return null;
  await upsertProfile(q, { userId, tenantId, branchId: null, salary, hireDate: null, jobTitle: null });
  const r = await q.query('SELECT * FROM hr_profiles WHERE user_id = $1 AND tenant_id::text = $2::text', [userId, String(tenantId)]);
  return r.rows[0] || null;
}

module.exports = { parseSalary, upsertProfile, saveSalary, ensureProfileFromUser };
