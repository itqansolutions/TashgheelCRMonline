/**
 * salesTeamController.js — Sales Teams Management Controller (Batch C)
 * 
 * Strict Architecture:
 * - Uses existing employee/user records only.
 * - Reuses accessScopeService.js for department hierarchy & manager scopes.
 * - Enforces multi-tenant isolation on every query and mutation.
 * - Prevents duplicate memberships.
 * - Never deletes employee users or auto-reassigns deals when teams/members are updated.
 */

const db = require('../config/db');
const accessScopeService = require('../services/accessScopeService');

// Helper to check if caller has manager/admin rights over a department
async function verifyDepartmentScope(user, departmentId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'manager' && user.role !== 'supervisor') return false;

  const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(user);
  if (!accessibleDeptIds || accessibleDeptIds.length === 0) return false;
  return accessibleDeptIds.includes(parseInt(departmentId, 10));
}

// ── 1. GET ALL SALES TEAMS ──
exports.getSalesTeams = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const userRole = req.user.role;
  const userId = req.user.id;
  const branch_id = req.branchId || req.query.branch_id;

  try {
    let whereConditions = [`st.tenant_id::text = $1::text`];
    let queryParams = [tenant_id];

    // Branch scoping
    if (branch_id && branch_id !== 'ALL') {
      queryParams.push(String(branch_id));
      whereConditions.push(`(st.branch_id::text = $${queryParams.length}::text OR st.branch_id IS NULL)`);
    }

    // Role-based Access Control
    if (userRole === 'admin') {
      // Unrestricted within tenant
    } else if (userRole === 'manager' || userRole === 'supervisor') {
      const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
      if (accessibleDeptIds && accessibleDeptIds.length > 0) {
        queryParams.push(accessibleDeptIds);
        queryParams.push(userId);
        whereConditions.push(`(st.department_id = ANY($${queryParams.length - 1}::int[]) OR st.manager_id = $${queryParams.length} OR st.leader_id = $${queryParams.length})`);
      } else {
        // Fail closed: manager with no accessible departments only sees teams they manage or lead
        queryParams.push(userId);
        whereConditions.push(`(st.manager_id = $${queryParams.length} OR st.leader_id = $${queryParams.length})`);
      }
    } else {
      // Regular Sales Rep / Employee: Only sees teams where they are a member or the leader
      queryParams.push(userId);
      whereConditions.push(`(
        st.leader_id = $${queryParams.length} OR
        st.id IN (SELECT team_id FROM sales_team_members WHERE user_id = $${queryParams.length} AND tenant_id::text = $1::text)
      )`);
    }

    const sql = `
      SELECT
        st.id, st.name, st.description, st.is_active,
        st.distribution_method, st.max_active_leads_per_rep,
        st.department_id, dep.name as department_name,
        st.branch_id, b.name as branch_name,
        st.manager_id, u_mgr.name as manager_name, u_mgr.email as manager_email,
        st.leader_id, u_lead.name as leader_name, u_lead.email as leader_email,
        st.created_at, st.updated_at,
        COUNT(stm.id)::int as total_members,
        COUNT(stm.id) FILTER (WHERE stm.is_active = true)::int as active_members
      FROM sales_teams st
      LEFT JOIN departments dep ON st.department_id = dep.id
      LEFT JOIN branches b ON st.branch_id::text = b.id::text
      LEFT JOIN users u_mgr ON st.manager_id = u_mgr.id
      LEFT JOIN users u_lead ON st.leader_id = u_lead.id
      LEFT JOIN sales_team_members stm ON stm.team_id = st.id AND stm.tenant_id::text = st.tenant_id::text
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY st.id, dep.name, b.name, u_mgr.name, u_mgr.email, u_lead.name, u_lead.email
      ORDER BY st.is_active DESC, st.name ASC
    `;

    const result = await db.query(sql, queryParams);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[salesTeamController] getSalesTeams error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to load sales teams.' });
  }
};

// ── 2. GET SINGLE SALES TEAM WITH MEMBERS ──
exports.getSalesTeamById = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const teamId = parseInt(req.params.id, 10);

  if (isNaN(teamId)) {
    return res.status(400).json({ status: 'error', message: 'Invalid team ID.' });
  }

  try {
    const teamRes = await db.query(`
      SELECT
        st.id, st.name, st.description, st.is_active,
        st.distribution_method, st.max_active_leads_per_rep,
        st.department_id, dep.name as department_name,
        st.branch_id, b.name as branch_name,
        st.manager_id, u_mgr.name as manager_name, u_mgr.email as manager_email,
        st.leader_id, u_lead.name as leader_name, u_lead.email as leader_email,
        st.created_at, st.updated_at
      FROM sales_teams st
      LEFT JOIN departments dep ON st.department_id = dep.id
      LEFT JOIN branches b ON st.branch_id::text = b.id::text
      LEFT JOIN users u_mgr ON st.manager_id = u_mgr.id
      LEFT JOIN users u_lead ON st.leader_id = u_lead.id
      WHERE st.id = $1 AND st.tenant_id::text = $2::text
    `, [teamId, tenant_id]);

    if (teamRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Sales team not found.' });
    }

    const team = teamRes.rows[0];

    // Authorization check for non-admin
    if (req.user.role !== 'admin') {
      const isManager = req.user.role === 'manager' || req.user.role === 'supervisor';
      if (isManager) {
        const hasScope = await verifyDepartmentScope(req.user, team.department_id);
        const isDirectHead = team.manager_id === req.user.id || team.leader_id === req.user.id;
        if (!hasScope && !isDirectHead) {
          return res.status(403).json({ status: 'error', message: 'You are not authorized to view this team.' });
        }
      } else {
        // Employee/Sales: check membership or leader role
        const memberCheck = await db.query(`
          SELECT id FROM sales_team_members 
          WHERE team_id = $1 AND user_id = $2 AND tenant_id::text = $3::text
        `, [teamId, req.user.id, tenant_id]);

        if (memberCheck.rows.length === 0 && team.leader_id !== req.user.id) {
          return res.status(403).json({ status: 'error', message: 'You are not a member of this team.' });
        }
      }
    }

    // Fetch members with user details and deal stats
    const membersRes = await db.query(`
      SELECT
        stm.id as membership_id,
        stm.user_id,
        stm.is_active as receiving_leads,
        stm.daily_lead_quota,
        stm.joined_at,
        u.name, u.email, u.phone, u.role,
        u.department_id, dep.name as department_name,
        u.branch_id, b.name as branch_name,
        jt.name as job_title_name,
        COUNT(d.id) FILTER (WHERE d.pipeline_stage NOT IN ('won', 'lost', 'cancelled'))::int as active_deals_count
      FROM sales_team_members stm
      JOIN users u ON stm.user_id = u.id
      LEFT JOIN departments dep ON u.department_id = dep.id
      LEFT JOIN branches b ON u.branch_id::text = b.id::text
      LEFT JOIN job_titles jt ON u.job_title_id = jt.id
      LEFT JOIN deals d ON d.assigned_to = u.id AND d.tenant_id::text = stm.tenant_id::text
      WHERE stm.team_id = $1 AND stm.tenant_id::text = $2::text
      GROUP BY stm.id, stm.user_id, stm.is_active, stm.daily_lead_quota, stm.joined_at,
               u.name, u.email, u.phone, u.role, u.department_id, dep.name, u.branch_id, b.name, jt.name
      ORDER BY stm.is_active DESC, u.name ASC
    `, [teamId, tenant_id]);

    team.members = membersRes.rows;
    res.json({ status: 'success', data: team });
  } catch (err) {
    console.error('[salesTeamController] getSalesTeamById error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to load team details.' });
  }
};

// ── 3. CREATE SALES TEAM ──
exports.createSalesTeam = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const userRole = req.user.role;
  const {
    name,
    description,
    department_id,
    branch_id,
    manager_id,
    leader_id,
    distribution_method = 'least_loaded',
    max_active_leads_per_rep = 20
  } = req.body;

  // Authorization: admin or manager/supervisor only
  if (userRole !== 'admin' && userRole !== 'manager' && userRole !== 'supervisor') {
    return res.status(403).json({ status: 'error', message: 'Insufficient permissions to create sales teams.' });
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ status: 'error', message: 'Team name is required.' });
  }

  const cleanDeptId = parseInt(department_id, 10);
  if (isNaN(cleanDeptId)) {
    return res.status(400).json({ status: 'error', message: 'A valid department_id is required.' });
  }

  // Verify manager scope over the specified department
  if (userRole !== 'admin') {
    const hasScope = await verifyDepartmentScope(req.user, cleanDeptId);
    if (!hasScope) {
      return res.status(403).json({ status: 'error', message: 'You do not have administrative authority over this department.' });
    }
  }

  try {
    // 1. Verify department exists and belongs to tenant
    const deptCheck = await db.query(
      `SELECT id FROM departments WHERE id = $1 AND tenant_id::text = $2::text`,
      [cleanDeptId, tenant_id]
    );
    if (deptCheck.rows.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Specified department does not exist in this tenant.' });
    }

    // 2. Verify branch if provided
    let cleanBranchId = branch_id ? String(branch_id).trim() : null;
    if (cleanBranchId && cleanBranchId !== '' && cleanBranchId !== 'null') {
      const branchCheck = await db.query(
        `SELECT id FROM branches WHERE id::text = $1::text AND tenant_id::text = $2::text`,
        [cleanBranchId, tenant_id]
      );
      if (branchCheck.rows.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Specified branch does not exist in this tenant.' });
      }
    } else {
      cleanBranchId = null;
    }

    // 3. Verify manager_id if provided
    let cleanManagerId = manager_id ? parseInt(manager_id, 10) : null;
    if (cleanManagerId) {
      const mgrCheck = await db.query(
        `SELECT id FROM users WHERE id = $1 AND tenant_id::text = $2::text AND COALESCE(is_working, true) = true`,
        [cleanManagerId, tenant_id]
      );
      if (mgrCheck.rows.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Designated manager does not exist or is inactive in this tenant.' });
      }
    }

    // 4. Verify leader_id if provided
    let cleanLeaderId = leader_id ? parseInt(leader_id, 10) : null;
    if (cleanLeaderId) {
      const leaderCheck = await db.query(
        `SELECT id FROM users WHERE id = $1 AND tenant_id::text = $2::text AND COALESCE(is_working, true) = true`,
        [cleanLeaderId, tenant_id]
      );
      if (leaderCheck.rows.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Designated team leader does not exist or is inactive in this tenant.' });
      }
    }

    // 5. Check name uniqueness within tenant
    const nameCheck = await db.query(
      `SELECT id FROM sales_teams WHERE LOWER(name) = LOWER($1) AND tenant_id::text = $2::text`,
      [name.trim(), tenant_id]
    );
    if (nameCheck.rows.length > 0) {
      return res.status(409).json({ status: 'error', message: 'A sales team with this name already exists in this tenant.' });
    }

    const validDistributionMethods = ['least_loaded', 'round_robin', 'manual'];
    const distMethod = validDistributionMethods.includes(distribution_method) ? distribution_method : 'least_loaded';
    const maxLeads = parseInt(max_active_leads_per_rep, 10) || 20;

    const insertRes = await db.query(`
      INSERT INTO sales_teams (
        tenant_id, branch_id, department_id, name, description,
        manager_id, leader_id, is_active, distribution_method, max_active_leads_per_rep
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9)
      RETURNING *
    `, [
      tenant_id, cleanBranchId, cleanDeptId, name.trim(), description || null,
      cleanManagerId, cleanLeaderId, distMethod, maxLeads
    ]);

    res.status(201).json({ status: 'success', data: insertRes.rows[0] });
  } catch (err) {
    console.error('[salesTeamController] createSalesTeam error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to create sales team.' });
  }
};

// ── 4. UPDATE SALES TEAM ──
exports.updateSalesTeam = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const userRole = req.user.role;
  const teamId = parseInt(req.params.id, 10);

  if (isNaN(teamId)) {
    return res.status(400).json({ status: 'error', message: 'Invalid team ID.' });
  }

  // Authorization: admin or manager/supervisor only
  if (userRole !== 'admin' && userRole !== 'manager' && userRole !== 'supervisor') {
    return res.status(403).json({ status: 'error', message: 'Insufficient permissions to update sales teams.' });
  }

  try {
    const existingRes = await db.query(
      `SELECT * FROM sales_teams WHERE id = $1 AND tenant_id::text = $2::text`,
      [teamId, tenant_id]
    );

    if (existingRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Sales team not found.' });
    }

    const currentTeam = existingRes.rows[0];

    // Check manager authority on existing team
    if (userRole !== 'admin') {
      const hasScope = await verifyDepartmentScope(req.user, currentTeam.department_id);
      if (!hasScope) {
        return res.status(403).json({ status: 'error', message: 'You do not have administrative authority over this team.' });
      }
    }

    const {
      name,
      description,
      department_id,
      branch_id,
      manager_id,
      leader_id,
      distribution_method,
      max_active_leads_per_rep,
      is_active
    } = req.body;

    let targetDeptId = currentTeam.department_id;
    if (department_id !== undefined && department_id !== null) {
      targetDeptId = parseInt(department_id, 10);
      if (isNaN(targetDeptId)) {
        return res.status(400).json({ status: 'error', message: 'Invalid department ID.' });
      }
      // If department changed, verify authority on new department
      if (userRole !== 'admin' && targetDeptId !== currentTeam.department_id) {
        const hasNewScope = await verifyDepartmentScope(req.user, targetDeptId);
        if (!hasNewScope) {
          return res.status(403).json({ status: 'error', message: 'You do not have administrative authority over the new department.' });
        }
      }
      const deptCheck = await db.query(
        `SELECT id FROM departments WHERE id = $1 AND tenant_id::text = $2::text`,
        [targetDeptId, tenant_id]
      );
      if (deptCheck.rows.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Department does not exist in this tenant.' });
      }
    }

    let targetName = currentTeam.name;
    if (name !== undefined) {
      if (!name || !name.trim()) {
        return res.status(400).json({ status: 'error', message: 'Team name cannot be empty.' });
      }
      targetName = name.trim();
      const dupCheck = await db.query(
        `SELECT id FROM sales_teams WHERE LOWER(name) = LOWER($1) AND tenant_id::text = $2::text AND id != $3`,
        [targetName, tenant_id, teamId]
      );
      if (dupCheck.rows.length > 0) {
        return res.status(409).json({ status: 'error', message: 'Another sales team already uses this name.' });
      }
    }

    let targetManagerId = currentTeam.manager_id;
    if (manager_id !== undefined) {
      if (manager_id === null || manager_id === '' || manager_id === 'null') {
        targetManagerId = null;
      } else {
        const parsedMgr = parseInt(manager_id, 10);
        const mgrCheck = await db.query(
          `SELECT id FROM users WHERE id = $1 AND tenant_id::text = $2::text AND COALESCE(is_working, true) = true`,
          [parsedMgr, tenant_id]
        );
        if (mgrCheck.rows.length === 0) {
          return res.status(400).json({ status: 'error', message: 'Manager does not exist or is inactive in this tenant.' });
        }
        targetManagerId = parsedMgr;
      }
    }

    let targetLeaderId = currentTeam.leader_id;
    if (leader_id !== undefined) {
      if (leader_id === null || leader_id === '' || leader_id === 'null') {
        targetLeaderId = null;
      } else {
        const parsedLead = parseInt(leader_id, 10);
        const leadCheck = await db.query(
          `SELECT id FROM users WHERE id = $1 AND tenant_id::text = $2::text AND COALESCE(is_working, true) = true`,
          [parsedLead, tenant_id]
        );
        if (leadCheck.rows.length === 0) {
          return res.status(400).json({ status: 'error', message: 'Team leader does not exist or is inactive in this tenant.' });
        }
        targetLeaderId = parsedLead;
      }
    }

    let targetBranchId = currentTeam.branch_id;
    if (branch_id !== undefined) {
      if (branch_id === null || branch_id === '' || branch_id === 'null') {
        targetBranchId = null;
      } else {
        const branchCheck = await db.query(
          `SELECT id FROM branches WHERE id::text = $1::text AND tenant_id::text = $2::text`,
          [String(branch_id).trim(), tenant_id]
        );
        if (branchCheck.rows.length === 0) {
          return res.status(400).json({ status: 'error', message: 'Branch does not exist in this tenant.' });
        }
        targetBranchId = String(branch_id).trim();
      }
    }

    const targetDesc = description !== undefined ? description : currentTeam.description;
    const targetDist = distribution_method !== undefined ? distribution_method : currentTeam.distribution_method;
    const targetMaxLeads = max_active_leads_per_rep !== undefined ? parseInt(max_active_leads_per_rep, 10) : currentTeam.max_active_leads_per_rep;
    const targetActive = is_active !== undefined ? Boolean(is_active) : currentTeam.is_active;

    const updateRes = await db.query(`
      UPDATE sales_teams SET
        name = $1,
        description = $2,
        department_id = $3,
        branch_id = $4,
        manager_id = $5,
        leader_id = $6,
        distribution_method = $7,
        max_active_leads_per_rep = $8,
        is_active = $9,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $10 AND tenant_id::text = $11::text
      RETURNING *
    `, [
      targetName, targetDesc, targetDeptId, targetBranchId,
      targetManagerId, targetLeaderId, targetDist, targetMaxLeads,
      targetActive, teamId, tenant_id
    ]);

    res.json({ status: 'success', data: updateRes.rows[0] });
  } catch (err) {
    console.error('[salesTeamController] updateSalesTeam error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to update sales team.' });
  }
};

// ── 5. ARCHIVE / SAFELY DISABLE SALES TEAM ──
exports.deleteSalesTeam = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const userRole = req.user.role;
  const teamId = parseInt(req.params.id, 10);

  if (isNaN(teamId)) {
    return res.status(400).json({ status: 'error', message: 'Invalid team ID.' });
  }

  if (userRole !== 'admin' && userRole !== 'manager' && userRole !== 'supervisor') {
    return res.status(403).json({ status: 'error', message: 'Insufficient permissions to delete or archive sales teams.' });
  }

  try {
    const existingRes = await db.query(
      `SELECT * FROM sales_teams WHERE id = $1 AND tenant_id::text = $2::text`,
      [teamId, tenant_id]
    );

    if (existingRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Sales team not found.' });
    }

    const currentTeam = existingRes.rows[0];

    if (userRole !== 'admin') {
      const hasScope = await verifyDepartmentScope(req.user, currentTeam.department_id);
      if (!hasScope) {
        return res.status(403).json({ status: 'error', message: 'You do not have administrative authority over this team.' });
      }
    }

    // Safe disabling/archival policy:
    // Teams are deactivated, preserving team members, deals, and audit history.
    await db.query(`
      UPDATE sales_teams SET
        is_active = false,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id::text = $2::text
    `, [teamId, tenant_id]);

    res.status(200).json({
      status: 'success',
      message: 'Sales team archived and deactivated safely. No deals or users were deleted.'
    });
  } catch (err) {
    console.error('[salesTeamController] deleteSalesTeam error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to archive sales team.' });
  }
};

// ── 6. GET ELIGIBLE EMPLOYEES FOR TEAM MEMBERSHIP ──
exports.getEligibleEmployees = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const userRole = req.user.role;
  const branch_id = req.branchId || req.query.branch_id;

  try {
    let whereConditions = [
      `u.tenant_id::text = $1::text`,
      `COALESCE(u.is_working, true) = true`
    ];
    let queryParams = [tenant_id];

    // Branch scoping
    if (branch_id && branch_id !== 'ALL') {
      queryParams.push(String(branch_id));
      whereConditions.push(`(u.branch_id::text = $${queryParams.length}::text OR u.branch_id IS NULL)`);
    }

    // Role-based scoping for managers
    if (userRole === 'admin') {
      // Unrestricted within tenant
    } else if (userRole === 'manager' || userRole === 'supervisor') {
      const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
      if (accessibleDeptIds && accessibleDeptIds.length > 0) {
        queryParams.push(accessibleDeptIds);
        queryParams.push(req.user.id);
        whereConditions.push(`(u.department_id = ANY($${queryParams.length - 1}::int[]) OR u.id = $${queryParams.length})`);
      } else {
        // Fail closed
        queryParams.push(req.user.id);
        whereConditions.push(`u.id = $${queryParams.length}`);
      }
    } else {
      // Regular employees can only view themselves
      queryParams.push(req.user.id);
      whereConditions.push(`u.id = $${queryParams.length}`);
    }

    const sql = `
      SELECT
        u.id, u.name, u.email, u.phone, u.role,
        u.department_id, dep.name as department_name,
        u.branch_id, b.name as branch_name,
        u.job_title_id, jt.name as job_title_name
      FROM users u
      LEFT JOIN departments dep ON u.department_id = dep.id
      LEFT JOIN branches b ON u.branch_id::text = b.id::text
      LEFT JOIN job_titles jt ON u.job_title_id = jt.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY u.name ASC
    `;

    const result = await db.query(sql, queryParams);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[salesTeamController] getEligibleEmployees error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to load eligible employees.' });
  }
};

// ── 7. ADD EXISTING EMPLOYEE TO TEAM ──
exports.addTeamMember = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const userRole = req.user.role;
  const teamId = parseInt(req.params.id, 10);
  const { user_id, daily_lead_quota = 5, is_active = true } = req.body;

  if (isNaN(teamId)) {
    return res.status(400).json({ status: 'error', message: 'Invalid team ID.' });
  }

  const cleanUserId = parseInt(user_id, 10);
  if (isNaN(cleanUserId)) {
    return res.status(400).json({ status: 'error', message: 'Valid existing user_id is required.' });
  }

  // Authorization: admin or manager/supervisor only
  if (userRole !== 'admin' && userRole !== 'manager' && userRole !== 'supervisor') {
    return res.status(403).json({ status: 'error', message: 'Insufficient permissions to manage team members.' });
  }

  try {
    // 1. Verify team exists in tenant
    const teamRes = await db.query(
      `SELECT * FROM sales_teams WHERE id = $1 AND tenant_id::text = $2::text`,
      [teamId, tenant_id]
    );

    if (teamRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Sales team not found.' });
    }

    const team = teamRes.rows[0];

    // Check manager authority over team's department
    if (userRole !== 'admin') {
      const hasScope = await verifyDepartmentScope(req.user, team.department_id);
      if (!hasScope) {
        return res.status(403).json({ status: 'error', message: 'You do not have administrative authority over this team.' });
      }
    }

    // 2. Verify target employee exists in users, belongs to SAME tenant, and is active
    const userRes = await db.query(
      `SELECT id, name, email, department_id, branch_id, is_working FROM users WHERE id = $1 AND tenant_id::text = $2::text`,
      [cleanUserId, tenant_id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Employee not found in this company.' });
    }

    const employee = userRes.rows[0];
    if (employee.is_working === false) {
      return res.status(400).json({ status: 'error', message: 'Cannot add an inactive/terminated employee to a sales team.' });
    }

    // 3. Manager scope check on the employee
    if (userRole !== 'admin') {
      const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
      if (employee.department_id && accessibleDeptIds && !accessibleDeptIds.includes(employee.department_id)) {
        return res.status(403).json({ status: 'error', message: 'You cannot add employees from departments outside your administrative scope.' });
      }
    }

    // 4. Duplicate Membership Check
    const dupCheck = await db.query(
      `SELECT id FROM sales_team_members WHERE team_id = $1 AND user_id = $2 AND tenant_id::text = $3::text`,
      [teamId, cleanUserId, tenant_id]
    );

    if (dupCheck.rows.length > 0) {
      return res.status(409).json({
        status: 'error',
        message: 'Employee is already a member of this team.',
        code: 'DUPLICATE_MEMBERSHIP'
      });
    }

    const quota = parseInt(daily_lead_quota, 10) || 5;
    const activeStatus = Boolean(is_active);

    const insertRes = await db.query(`
      INSERT INTO sales_team_members (
        tenant_id, team_id, user_id, is_active, daily_lead_quota
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [tenant_id, teamId, cleanUserId, activeStatus, quota]);

    res.status(201).json({
      status: 'success',
      message: 'Employee assigned to sales team successfully.',
      data: insertRes.rows[0]
    });
  } catch (err) {
    console.error('[salesTeamController] addTeamMember error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to add employee to sales team.' });
  }
};

// ── 8. UPDATE TEAM MEMBER STATUS / QUOTA ──
exports.updateTeamMember = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const userRole = req.user.role;
  const teamId = parseInt(req.params.id, 10);
  const memberUserId = parseInt(req.params.userId, 10);

  if (isNaN(teamId) || isNaN(memberUserId)) {
    return res.status(400).json({ status: 'error', message: 'Invalid team or user ID.' });
  }

  try {
    const teamRes = await db.query(
      `SELECT * FROM sales_teams WHERE id = $1 AND tenant_id::text = $2::text`,
      [teamId, tenant_id]
    );

    if (teamRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Sales team not found.' });
    }

    const team = teamRes.rows[0];

    // Authorization: Admin, Department Manager, OR the Team's Operational Leader
    let isAuthorized = userRole === 'admin';
    if (!isAuthorized && (userRole === 'manager' || userRole === 'supervisor')) {
      isAuthorized = await verifyDepartmentScope(req.user, team.department_id);
    }
    if (!isAuthorized && team.leader_id === req.user.id) {
      // Team leader can toggle member's receiving status (e.g. for leave)
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return res.status(403).json({ status: 'error', message: 'Insufficient permissions to update team member.' });
    }

    const memberRes = await db.query(
      `SELECT * FROM sales_team_members WHERE team_id = $1 AND user_id = $2 AND tenant_id::text = $3::text`,
      [teamId, memberUserId, tenant_id]
    );

    if (memberRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Employee is not a member of this team.' });
    }

    const currentMember = memberRes.rows[0];
    const { is_active, daily_lead_quota } = req.body;

    const newActive = is_active !== undefined ? Boolean(is_active) : currentMember.is_active;
    const newQuota = daily_lead_quota !== undefined ? parseInt(daily_lead_quota, 10) : currentMember.daily_lead_quota;

    const updateRes = await db.query(`
      UPDATE sales_team_members SET
        is_active = $1,
        daily_lead_quota = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE team_id = $3 AND user_id = $4 AND tenant_id::text = $5::text
      RETURNING *
    `, [newActive, newQuota, teamId, memberUserId, tenant_id]);

    res.json({
      status: 'success',
      message: 'Team member settings updated successfully.',
      data: updateRes.rows[0]
    });
  } catch (err) {
    console.error('[salesTeamController] updateTeamMember error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to update team member.' });
  }
};

// ── 9. REMOVE MEMBER FROM TEAM (SAFE UNASSIGNMENT) ──
exports.removeTeamMember = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const userRole = req.user.role;
  const teamId = parseInt(req.params.id, 10);
  const memberUserId = parseInt(req.params.userId, 10);

  if (isNaN(teamId) || isNaN(memberUserId)) {
    return res.status(400).json({ status: 'error', message: 'Invalid team or user ID.' });
  }

  // Authorization: admin or manager/supervisor only
  if (userRole !== 'admin' && userRole !== 'manager' && userRole !== 'supervisor') {
    return res.status(403).json({ status: 'error', message: 'Insufficient permissions to remove team members.' });
  }

  try {
    const teamRes = await db.query(
      `SELECT * FROM sales_teams WHERE id = $1 AND tenant_id::text = $2::text`,
      [teamId, tenant_id]
    );

    if (teamRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Sales team not found.' });
    }

    const team = teamRes.rows[0];

    if (userRole !== 'admin') {
      const hasScope = await verifyDepartmentScope(req.user, team.department_id);
      if (!hasScope) {
        return res.status(403).json({ status: 'error', message: 'You do not have administrative authority over this team.' });
      }
    }

    const deleteRes = await db.query(`
      DELETE FROM sales_team_members 
      WHERE team_id = $1 AND user_id = $2 AND tenant_id::text = $3::text
      RETURNING id, user_id
    `, [teamId, memberUserId, tenant_id]);

    if (deleteRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Employee is not a member of this team.' });
    }

    // Crucial safety guarantee:
    // Notice we ONLY deleted from sales_team_members.
    // The employee user in users is untouched.
    // The employee's assigned deals in deals are untouched.
    res.status(200).json({
      status: 'success',
      message: 'Employee removed from sales team successfully. User account and assigned deals remain intact.'
    });
  } catch (err) {
    console.error('[salesTeamController] removeTeamMember error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to remove team member.' });
  }
};
