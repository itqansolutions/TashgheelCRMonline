const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');
const salesTeamController = require('../controllers/salesTeamController');
const accessScopeService = require('../services/accessScopeService');

const originalDbQuery = db.query;

test('Batch C: Sales Teams Management & Employee-Based Membership', async (t) => {
  t.afterEach(() => {
    db.query = originalDbQuery;
  });

  // ── 1. Adding existing employees only & rejecting nonexistent/inactive ─────
  await t.test('1. Employee validation: Rejects nonexistent or inactive employees', async () => {
    // 1A. Nonexistent employee -> 404
    db.query = async (sql, params) => {
      if (sql.includes('FROM sales_teams WHERE id =')) {
        return { rows: [{ id: 10, tenant_id: 'tenant-1', department_id: 100, is_active: true }] };
      }
      if (sql.includes('FROM users WHERE id =')) {
        return { rows: [] }; // Not found in users table
      }
      return { rows: [] };
    };

    let statusCode = null;
    let jsonResponse = null;
    const req1 = {
      user: { id: 1, role: 'admin', tenant_id: 'tenant-1' },
      params: { id: '10' },
      body: { user_id: 999 }
    };
    const res1 = {
      status: (code) => { statusCode = code; return res1; },
      json: (data) => { jsonResponse = data; }
    };

    await salesTeamController.addTeamMember(req1, res1);
    assert.equal(statusCode, 404);
    assert.equal(jsonResponse.status, 'error');
    assert.match(jsonResponse.message, /Employee not found/);

    // 1B. Inactive employee (is_working: false) -> 400
    db.query = async (sql, params) => {
      if (sql.includes('FROM sales_teams WHERE id =')) {
        return { rows: [{ id: 10, tenant_id: 'tenant-1', department_id: 100, is_active: true }] };
      }
      if (sql.includes('FROM users WHERE id =')) {
        return { rows: [{ id: 50, name: 'Terminated Rep', is_working: false, department_id: 100 }] };
      }
      return { rows: [] };
    };

    await salesTeamController.addTeamMember({
      user: { id: 1, role: 'admin', tenant_id: 'tenant-1' },
      params: { id: '10' },
      body: { user_id: 50 }
    }, res1);
    assert.equal(statusCode, 400);
    assert.match(jsonResponse.message, /inactive\/terminated/);
  });

  // ── 2. Multi-Tenant Isolation on every operation ────────────────────────────
  await t.test('2. Tenant isolation: Rejects operations across tenant boundaries', async () => {
    let queriedParams = [];
    db.query = async (sql, params) => {
      queriedParams.push(params);
      // Team belongs to tenant-A
      if (sql.includes('FROM sales_teams WHERE id =')) {
        if (params[1] === 'tenant-A') {
          return { rows: [{ id: 20, tenant_id: 'tenant-A', department_id: 200, name: 'Team Alpha' }] };
        }
        return { rows: [] }; // Isolated if tenant-B queries it
      }
      return { rows: [] };
    };

    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonResponse = data; }
    };

    // Caller from tenant-B tries to view team from tenant-A -> 404 Not Found
    await salesTeamController.getSalesTeamById({
      user: { id: 2, role: 'admin', tenant_id: 'tenant-B' },
      params: { id: '20' }
    }, res);
    assert.equal(statusCode, 404);

    // Caller from tenant-B tries to add member to team from tenant-A -> 404 Not Found
    await salesTeamController.addTeamMember({
      user: { id: 2, role: 'admin', tenant_id: 'tenant-B' },
      params: { id: '20' },
      body: { user_id: 30 }
    }, res);
    assert.equal(statusCode, 404);

    // Verify tenant_id parameter was strictly passed in the SQL queries
    assert.ok(queriedParams.some(p => p.includes('tenant-B')));
  });

  // ── 3. Manager department/branch scope (using accessScopeService) ───────────
  await t.test('3. Department hierarchy scope: Manager restricted to accessible departments and child depts', async () => {
    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonResponse = data; }
    };

    // Mock accessScopeService to return departments [10, 11] (Dept 10 and child Dept 11)
    const originalGetAccessible = accessScopeService.getAccessibleDepartmentIds;
    accessScopeService.getAccessibleDepartmentIds = async (user) => {
      if (user.id === 5) return [10, 11];
      return [];
    };

    try {
      // 3A. Manager tries to create a team in Dept 99 (Unauthorized department) -> 403
      await salesTeamController.createSalesTeam({
        user: { id: 5, role: 'manager', tenant_id: 'tenant-1' },
        body: { name: 'Unauthorized Team', department_id: 99 }
      }, res);
      assert.equal(statusCode, 403);
      assert.match(jsonResponse.message, /not have administrative authority/);

      // 3B. Manager creates team in child Dept 11 (Authorized) -> Success
      db.query = async (sql, params) => {
        if (sql.includes('FROM departments WHERE id =')) {
          return { rows: [{ id: 11, name: 'East Branch Sub-Sales' }] };
        }
        if (sql.includes('SELECT id FROM sales_teams WHERE LOWER(name)')) {
          return { rows: [] }; // Name unique
        }
        if (sql.includes('INSERT INTO sales_teams')) {
          return { rows: [{ id: 101, name: 'Child Dept Team', department_id: 11, tenant_id: 'tenant-1' }] };
        }
        return { rows: [] };
      };

      await salesTeamController.createSalesTeam({
        user: { id: 5, role: 'manager', tenant_id: 'tenant-1' },
        body: { name: 'Child Dept Team', department_id: 11 }
      }, res);
      assert.equal(statusCode, 201);
      assert.equal(jsonResponse.status, 'success');
      assert.equal(jsonResponse.data.id, 101);
    } finally {
      accessScopeService.getAccessibleDepartmentIds = originalGetAccessible;
    }
  });

  // ── 4. Unauthorized create, update, delete, and membership operations ───────
  await t.test('4. Authorization: Sales reps and employees cannot create or mutate teams', async () => {
    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonResponse = data; }
    };

    const salesRepUser = { id: 9, role: 'sales', tenant_id: 'tenant-1' };

    // 4A. Sales rep tries to create team -> 403
    await salesTeamController.createSalesTeam({
      user: salesRepUser,
      body: { name: 'Rep Rogue Team', department_id: 10 }
    }, res);
    assert.equal(statusCode, 403);
    assert.equal(jsonResponse.status, 'error');

    // 4B. Sales rep tries to update team -> 403
    await salesTeamController.updateSalesTeam({
      user: salesRepUser,
      params: { id: '10' },
      body: { name: 'Renamed by Rep' }
    }, res);
    assert.equal(statusCode, 403);

    // 4C. Sales rep tries to delete/archive team -> 403
    await salesTeamController.deleteSalesTeam({
      user: salesRepUser,
      params: { id: '10' }
    }, res);
    assert.equal(statusCode, 403);

    // 4D. Sales rep tries to add a member -> 403
    await salesTeamController.addTeamMember({
      user: salesRepUser,
      params: { id: '10' },
      body: { user_id: 15 }
    }, res);
    assert.equal(statusCode, 403);
  });

  // ── 5. Duplicate membership prevention ─────────────────────────────────────
  await t.test('5. Duplicate prevention: Rejects adding the same employee twice to a team', async () => {
    db.query = async (sql, params) => {
      if (sql.includes('FROM sales_teams WHERE id =')) {
        return { rows: [{ id: 10, tenant_id: 'tenant-1', department_id: 100, is_active: true }] };
      }
      if (sql.includes('FROM users WHERE id =')) {
        return { rows: [{ id: 25, name: 'Active Rep', is_working: true, department_id: 100 }] };
      }
      if (sql.includes('FROM sales_team_members WHERE team_id =')) {
        // Already a member!
        return { rows: [{ id: 501, team_id: 10, user_id: 25 }] };
      }
      return { rows: [] };
    };

    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonResponse = data; }
    };

    await salesTeamController.addTeamMember({
      user: { id: 1, role: 'admin', tenant_id: 'tenant-1' },
      params: { id: '10' },
      body: { user_id: 25 }
    }, res);

    assert.equal(statusCode, 409);
    assert.equal(jsonResponse.code, 'DUPLICATE_MEMBERSHIP');
    assert.match(jsonResponse.message, /already a member/);
  });

  // ── 6. Removing member without deleting user or reassigning deals ──────────
  await t.test('6. Non-destructive member removal: Deletes membership row only, preserves user and deals', async () => {
    let deletedFromUsers = false;
    let updatedDeals = false;
    let deletedFromTeamMembers = false;

    db.query = async (sql, params) => {
      if (sql.includes('FROM sales_teams WHERE id =')) {
        return { rows: [{ id: 10, tenant_id: 'tenant-1', department_id: 100 }] };
      }
      if (sql.includes('DELETE FROM sales_team_members')) {
        deletedFromTeamMembers = true;
        return { rows: [{ id: 1, user_id: 30 }] };
      }
      if (sql.includes('DELETE FROM users')) {
        deletedFromUsers = true;
      }
      if (sql.includes('UPDATE deals SET assigned_to')) {
        updatedDeals = true;
      }
      return { rows: [] };
    };

    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonResponse = data; }
    };

    await salesTeamController.removeTeamMember({
      user: { id: 1, role: 'admin', tenant_id: 'tenant-1' },
      params: { id: '10', userId: '30' }
    }, res);

    assert.equal(statusCode, 200);
    assert.equal(deletedFromTeamMembers, true);
    assert.equal(deletedFromUsers, false); // Employee account is preserved
    assert.equal(updatedDeals, false);     // Existing deals remain intact
    assert.match(jsonResponse.message, /remain intact/);
  });

  // ── 7. Safe deactivation/archiving without deleting records ────────────────
  await t.test('7. Safe archiving: Teams are marked is_active = false without destructive data deletion', async () => {
    let executedSql = '';
    db.query = async (sql, params) => {
      if (sql.includes('FROM sales_teams WHERE id =')) {
        return { rows: [{ id: 10, tenant_id: 'tenant-1', department_id: 100, is_active: true }] };
      }
      if (sql.includes('UPDATE sales_teams SET')) {
        executedSql = sql;
        return { rows: [{ id: 10, is_active: false }] };
      }
      return { rows: [] };
    };

    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonResponse = data; }
    };

    await salesTeamController.deleteSalesTeam({
      user: { id: 1, role: 'admin', tenant_id: 'tenant-1' },
      params: { id: '10' }
    }, res);

    assert.equal(statusCode, 200);
    assert.ok(executedSql.includes('is_active = false'));
    assert.ok(!executedSql.includes('DELETE FROM sales_teams')); // Never hard-deletes
    assert.match(jsonResponse.message, /No deals or users were deleted/);
  });

  // ── 8. Compatibility: eligible employees queries existing users ────────────
  await t.test('8. Existing employees integration: getEligibleEmployees returns company users strictly', async () => {
    let executedQuery = '';
    let queryParams = [];

    db.query = async (sql, params) => {
      executedQuery = sql;
      queryParams = params;
      return {
        rows: [
          { id: 101, name: 'Ahmed Ali', role: 'sales', department_id: 10, is_working: true },
          { id: 102, name: 'Sara Hassan', role: 'employee', department_id: 10, is_working: true }
        ]
      };
    };

    let jsonResponse = null;
    const res = {
      json: (data) => { jsonResponse = data; }
    };

    await salesTeamController.getEligibleEmployees({
      user: { id: 1, role: 'admin', tenant_id: 'tenant-1' },
      query: {}
    }, res);

    assert.equal(jsonResponse.status, 'success');
    assert.equal(jsonResponse.data.length, 2);
    // Verifies query was made against `users` table and enforced tenant_id & is_working
    assert.ok(executedQuery.includes('FROM users u'));
    assert.ok(executedQuery.includes('u.tenant_id::text = $1::text'));
    assert.ok(executedQuery.includes('COALESCE(u.is_working, true) = true'));
  });
});
