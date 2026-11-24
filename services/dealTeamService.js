'use strict';
// Transactional team/employee assignment validation for deals.
// A deal may be owned by a team (assigned_team_id) with an optional employee
// (assigned_to) who must be a member of that team. A team-only deal keeps
// assigned_to NULL: no actor is silently made the owner.
class AssignmentError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';
function parseTeamId(v) {
  if (isBlank(v)) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new AssignmentError('INVALID_TEAM', 'Invalid team.');
  return n;
}

/**
 * Locks the team row and the employee's membership row (FOR SHARE) inside the
 * caller's transaction and validates tenant, branch, activity and membership.
 * `client` must be a transaction client.
 */
async function validateTeamAssignment(client, { tenantId, branchId, teamId, employeeId }) {
  const t = await client.query(
    `SELECT id, tenant_id, branch_id, is_active FROM sales_teams
     WHERE id = $1 AND tenant_id::text = $2::text FOR SHARE`, [teamId, String(tenantId)]);
  const team = t.rows[0];
  if (!team || team.is_active === false) throw new AssignmentError('INVALID_TEAM', 'The selected team does not exist or is inactive.');
  if (branchId && team.branch_id && String(team.branch_id) !== String(branchId)) {
    throw new AssignmentError('TEAM_BRANCH_MISMATCH', 'The selected team belongs to a different branch.');
  }
  if (!isBlank(employeeId)) {
    const m = await client.query(
      `SELECT stm.user_id FROM sales_team_members stm
       JOIN users u ON u.id = stm.user_id AND u.tenant_id::text = stm.tenant_id::text
       WHERE stm.team_id = $1 AND stm.tenant_id::text = $2::text AND stm.user_id::text = $3::text
       FOR SHARE OF stm`, [teamId, String(tenantId), String(employeeId)]);
    if (m.rows.length === 0) throw new AssignmentError('EMPLOYEE_NOT_TEAM_MEMBER', 'The selected employee is not a member of the selected team.');
  }
  return team;
}

async function requireTenantUser(client, tenantId, userId) {
  const r = await client.query('SELECT id FROM users WHERE id::text = $1::text AND tenant_id::text = $2::text LIMIT 1', [String(userId), String(tenantId)]);
  if (r.rows.length === 0) throw new AssignmentError('INVALID_ASSIGNEE', 'The assigned user does not exist or does not belong to this organization.');
}

module.exports = { AssignmentError, validateTeamAssignment, requireTenantUser, parseTeamId, isBlank };
