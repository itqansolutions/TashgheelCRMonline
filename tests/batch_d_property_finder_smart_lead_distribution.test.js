const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../services/propertyFinderSyncService');

test('Batch D: Property Finder Smart Lead Distribution', async (t) => {
  const TA = '11111111-1111-1111-1111-111111111111';
  const TB = '22222222-2222-2222-2222-222222222222';

  // ── 1. Target Team Resolution (Branch matching & Tenant-wide active team) ──
  await t.test('1. Team Resolution: Chooses branch-specific team or falls back to tenant active team', async () => {
    let capturedBranchParam = null;
    let capturedTenantParam = null;

    const mockQ = async (sql, params) => {
      if (sql.includes('FROM sales_teams')) {
        capturedTenantParam = params[0];
        capturedBranchParam = params[1];
        return {
          rows: [{
            id: 10,
            name: 'New Cairo Branch Sales Team',
            manager_id: 100,
            leader_id: 101,
            max_active_leads_per_rep: 20,
            branch_id: 'branch-cairo'
          }]
        };
      }
      if (sql.includes('FROM sales_team_members')) {
        return {
          rows: [{
            membership_id: 1,
            user_id: 201,
            user_name: 'Karim Rep',
            daily_lead_quota: 5,
            leads_today: 1,
            active_deals: 3
          }]
        };
      }
      return { rows: [] };
    };

    const res = await svc.resolveSmartLeadAssignment(mockQ, TA, 'branch-cairo', null, {});
    assert.equal(res.teamId, 10);
    assert.equal(res.assignedTo, 201);
    assert.equal(res.method, 'team_least_loaded');
    assert.equal(capturedTenantParam, TA);
    assert.equal(capturedBranchParam, 'branch-cairo');
  });

  // ── 2. Least-Loaded Rep Selection ───────────────────────────────────────────
  await t.test('2. Load Balance: Selects rep with fewest open active deals', async () => {
    let queriedSql = '';

    const mockQ = async (sql, params) => {
      if (sql.includes('FROM sales_teams')) {
        return {
          rows: [{ id: 5, name: 'Direct Sales Team', max_active_leads_per_rep: 15 }]
        };
      }
      if (sql.includes('FROM sales_team_members')) {
        queriedSql = sql;
        // In PostgreSQL query, ORDER BY active_deals ASC, leads_today ASC returns the rep with least load
        return {
          rows: [{
            membership_id: 2,
            user_id: 205,
            user_name: 'Sara Lowest Load',
            daily_lead_quota: 5,
            leads_today: 0,
            active_deals: 1 // Lowest load compared to peers with 5 or 8 deals
          }]
        };
      }
      return { rows: [] };
    };

    const res = await svc.resolveSmartLeadAssignment(mockQ, TA, 'branch-1', null, {});
    assert.equal(res.assignedTo, 205);
    assert.equal(res.assigneeName, 'Sara Lowest Load');
    assert.equal(res.method, 'team_least_loaded');
    assert.ok(queriedSql.includes('ORDER BY active_deals ASC'));
    assert.ok(queriedSql.includes('FOR UPDATE OF stm')); // Concurrency safety
  });

  // ── 3. Daily Lead Quota Enforcement ────────────────────────────────────────
  await t.test('3. Daily Quota: Rejects rep whose daily quota is reached', async () => {
    let havingClauseChecked = false;

    const mockQ = async (sql, params) => {
      if (sql.includes('FROM sales_teams')) {
        return { rows: [{ id: 5, name: 'Direct Sales Team', leader_id: 300, max_active_leads_per_rep: 20 }] };
      }
      if (sql.includes('FROM sales_team_members')) {
        // Query has: HAVING COUNT(d_today.id) < stm.daily_lead_quota
        // If rep has 5 leads today and quota is 5, rows is empty!
        havingClauseChecked = sql.includes('HAVING COUNT(d_today.id) < stm.daily_lead_quota');
        return { rows: [] }; // No members under their daily quota
      }
      if (sql.includes('SELECT id, name FROM users WHERE id = $1')) {
        return { rows: [{ id: 300, name: 'Team Leader Tarek' }] };
      }
      return { rows: [] };
    };

    const res = await svc.resolveSmartLeadAssignment(mockQ, TA, 'b1', null, {});
    assert.equal(havingClauseChecked, true);
    // Because members reached quota, falls back to team leader
    assert.equal(res.assignedTo, 300);
    assert.equal(res.method, 'team_leader_fallback');
  });

  // ── 4. Leave / Paused (`is_active = false`) & Inactive Employee Exclusion ───
  await t.test('4. Availability: Ignores paused members and terminated employees', async () => {
    let whereFilterChecked = false;

    const mockQ = async (sql, params) => {
      if (sql.includes('FROM sales_teams')) {
        return { rows: [{ id: 8, name: 'VIP Team', leader_id: 400 }] };
      }
      if (sql.includes('FROM sales_team_members')) {
        // Must filter stm.is_active = true AND COALESCE(u.is_working, true) = true
        whereFilterChecked = sql.includes('stm.is_active = true') && sql.includes('COALESCE(u.is_working, true) = true');
        return { rows: [] }; // All on leave
      }
      if (sql.includes('SELECT id, name FROM users WHERE id = $1')) {
        return { rows: [{ id: 400, name: 'Leader Mostafa' }] };
      }
      return { rows: [] };
    };

    const res = await svc.resolveSmartLeadAssignment(mockQ, TA, 'b1', null, {});
    assert.equal(whereFilterChecked, true);
    assert.equal(res.assignedTo, 400);
    assert.equal(res.method, 'team_leader_fallback');
  });

  // ── 5. Concurrency Safety: Team lock & Parallel Quota Protection ─────────
  await t.test('5. Concurrency: Serializes parallel requests and protects daily quota under concurrency', async () => {
    let usedForUpdate = false;
    let teamLockAcquired = false;

    // 5A: Query syntax and lock verification
    const mockQ = async (sql, params) => {
      if (sql.includes('pg_advisory_xact_lock')) {
        teamLockAcquired = true;
        return { rows: [] };
      }
      if (sql.includes('FROM sales_teams')) {
        return { rows: [{ id: 1, name: 'Alpha Team' }] };
      }
      if (sql.includes('FROM sales_team_members')) {
        if (sql.includes('FOR UPDATE OF stm')) {
          usedForUpdate = true;
        }
        return { rows: [{ membership_id: 1, user_id: 77, user_name: 'Ahmed', daily_lead_quota: 10, leads_today: 0, active_deals: 2 }] };
      }
      return { rows: [] };
    };

    const res = await svc.resolveSmartLeadAssignment(mockQ, TA, 'b1', null, {});
    assert.equal(usedForUpdate, true, 'Must use FOR UPDATE OF stm for row lock');
    assert.equal(teamLockAcquired, true, 'Must acquire pg_advisory_xact_lock on team to serialize candidate selection');
    assert.equal(res.assignedTo, 77);

    // 5B: Actual Parallel Execution Simulation
    // Rep 1 (user 101) has quota 5, and currently has 4 leads today (1 slot left).
    // Rep 2 (user 102) has quota 5, and currently has 2 leads today.
    // Two concurrent lead requests arrive in parallel via Promise.all.
    let teamLockHolder = null;
    let rep1LeadsToday = 4; // 1 slot remaining!
    let rep2LeadsToday = 2;

    const makeConcurrentClient = (requestId) => {
      return async (sql, params) => {
        if (sql.includes('pg_advisory_xact_lock')) {
          // Simulate advisory lock queue: if another request holds the lock, wait for it
          while (teamLockHolder !== null && teamLockHolder !== requestId) {
            await new Promise((r) => setTimeout(r, 10));
          }
          teamLockHolder = requestId;
          return { rows: [] };
        }
        if (sql.includes('FROM sales_teams')) {
          return { rows: [{ id: 88, name: 'Quota Team', max_active_leads_per_rep: 20 }] };
        }
        if (sql.includes('FROM sales_team_members')) {
          // If Rep 1 has reached quota (5), Rep 1 is excluded by HAVING COUNT < quota
          const candidates = [];
          if (rep1LeadsToday < 5) {
            candidates.push({
              membership_id: 1,
              user_id: 101,
              user_name: 'Rep One',
              daily_lead_quota: 5,
              leads_today: rep1LeadsToday,
              active_deals: 1
            });
          }
          if (rep2LeadsToday < 5) {
            candidates.push({
              membership_id: 2,
              user_id: 102,
              user_name: 'Rep Two',
              daily_lead_quota: 5,
              leads_today: rep2LeadsToday,
              active_deals: 2
            });
          }
          return { rows: candidates.slice(0, 1) };
        }
        return { rows: [] };
      };
    };

    // Run Request A and Request B concurrently in parallel
    const [resA, resB] = await Promise.all([
      (async () => {
        const qA = makeConcurrentClient('reqA');
        const rA = await svc.resolveSmartLeadAssignment(qA, TA, 'b1', null, {});
        // Once assigned to Rep 1, Rep 1's lead count increments to 5
        if (rA.assignedTo === 101) rep1LeadsToday++;
        // Simulate transaction commit and lock release
        teamLockHolder = null;
        return rA;
      })(),
      (async () => {
        // Small delay to ensure parallel arrival
        await new Promise((r) => setTimeout(r, 2));
        const qB = makeConcurrentClient('reqB');
        const rB = await svc.resolveSmartLeadAssignment(qB, TA, 'b1', null, {});
        if (rB.assignedTo === 101) rep1LeadsToday++;
        else if (rB.assignedTo === 102) rep2LeadsToday++;
        teamLockHolder = null;
        return rB;
      })()
    ]);

    // Request A gets the last remaining slot for Rep 1
    assert.equal(resA.assignedTo, 101, 'Request A should get Rep 1');
    // Request B was serialized, saw Rep 1 at 5/5 quota, and correctly picked Rep 2!
    assert.equal(resB.assignedTo, 102, 'Request B should get Rep 2 because Rep 1 quota was reached');
    // Rep 1's quota was strictly respected (never exceeded 5)
    assert.equal(rep1LeadsToday, 5, 'Rep 1 daily quota cannot exceed 5 under concurrency');
  });

  // ── 6. Multi-Tenant Isolation ──────────────────────────────────────────────
  await t.test('6. Isolation: Tenant A teams and members are isolated from Tenant B', async () => {
    let passedTenantId = null;

    const mockQ = async (sql, params) => {
      if (sql.includes('FROM sales_teams')) {
        passedTenantId = params[0];
        if (params[0] === TB) {
          return { rows: [{ id: 99, name: 'Tenant B Team', leader_id: 990 }] };
        }
        return { rows: [] };
      }
      if (sql.includes('SELECT id, name FROM users WHERE id = $1')) {
        // Enforces tenant_id match
        if (params[1] === TB && params[0] === 990) {
          return { rows: [{ id: 990, name: 'Tenant B Leader' }] };
        }
        return { rows: [] };
      }
      return { rows: [] };
    };

    const resB = await svc.resolveSmartLeadAssignment(mockQ, TB, 'b-2', null, {});
    assert.equal(resB.teamId, 99);
    assert.equal(resB.assignedTo, 990);
    assert.equal(passedTenantId, TB);
  });

  // ── 7. Fallback Hierarchy: Rep -> Leader -> Manager -> Default -> Unassigned ──
  await t.test('7. Fallback Chain: Gracefully degrades to leader, manager, default user, or safe unassigned', async () => {
    // 7A. Fallback to Supervising Manager if Leader is invalid
    const mockQ7A = async (sql, params) => {
      if (sql.includes('FROM sales_teams')) {
        return { rows: [{ id: 3, name: 'Team Beta', leader_id: 501, manager_id: 502 }] };
      }
      if (sql.includes('FROM sales_team_members')) {
        return { rows: [] }; // No reps
      }
      if (sql.includes('SELECT id, name FROM users WHERE id = $1')) {
        if (params[0] === 501) return { rows: [] }; // Leader terminated/not found
        if (params[0] === 502) return { rows: [{ id: 502, name: 'Manager Hany' }] }; // Manager active
      }
      return { rows: [] };
    };
    const res7A = await svc.resolveSmartLeadAssignment(mockQ7A, TA, 'b1', null, {});
    assert.equal(res7A.assignedTo, 502);
    assert.equal(res7A.method, 'team_manager_fallback');

    // 7B. Fallback to Settings default_assigned_to if no team exists
    const mockQ7B = async (sql, params) => {
      if (sql.includes('FROM sales_teams')) return { rows: [] }; // No sales team configured
      if (sql.includes('SELECT id, name FROM users WHERE id = $1')) {
        if (params[0] === 888) return { rows: [{ id: 888, name: 'Default Setup User' }] };
      }
      return { rows: [] };
    };
    const res7B = await svc.resolveSmartLeadAssignment(mockQ7B, TA, 'b1', null, { default_assigned_to: 888 });
    assert.equal(res7B.assignedTo, 888);
    assert.equal(res7B.method, 'default_setting_fallback');

    // 7C. Safe Unassigned (Lead is never lost, flagged for manual intervention)
    const mockQ7C = async (sql) => {
      return { rows: [] }; // Nothing found
    };
    const res7C = await svc.resolveSmartLeadAssignment(mockQ7C, TA, 'b1', null, {});
    assert.equal(res7C.assignedTo, null);
    assert.equal(res7C.needsManualAssignment, true);
    assert.equal(res7C.method, 'unassigned_needs_manual_assignment');
    assert.match(res7C.reason, /manual assignment/);
  });

  // ── 8. Schema Tolerance (Pending or Partial Migration 024) ──────────────────
  await t.test('8. Schema Tolerance: Safely handles unmigrated or partially migrated database', async () => {
    // 8A. Neither sales_teams nor sales_team_members exist
    let salesTeamsQueried8A = false;
    const mockQ8A = async (sql, params) => {
      if (sql.includes('to_regclass')) {
        return { rows: [{ teams_tbl: null, members_tbl: null }] };
      }
      if (sql.includes('FROM sales_teams') || sql.includes('FROM sales_team_members')) {
        salesTeamsQueried8A = true;
        throw new Error('Table does not exist');
      }
      if (sql.includes('SELECT id, name FROM users WHERE id = $1')) {
        if (params[0] === 555) return { rows: [{ id: 555, name: 'Fallback User' }] };
      }
      return { rows: [] };
    };

    const res8A = await svc.resolveSmartLeadAssignment(mockQ8A, TA, 'b1', null, { default_assigned_to: 555 });
    assert.equal(salesTeamsQueried8A, false, 'Should never query sales_teams when both tables are missing');
    assert.equal(res8A.assignedTo, 555);
    assert.equal(res8A.method, 'default_setting_fallback');

    // 8B. sales_teams exists, but sales_team_members is missing (partial migration)
    let salesTeamMembersQueried8B = false;
    const mockQ8B = async (sql, params) => {
      if (sql.includes('to_regclass')) {
        return { rows: [{ teams_tbl: 'sales_teams', members_tbl: null }] };
      }
      if (sql.includes('FROM sales_team_members')) {
        salesTeamMembersQueried8B = true;
        throw new Error('Table sales_team_members does not exist');
      }
      if (sql.includes('SELECT id, name FROM users WHERE id = $1')) {
        if (params[0] === 666) return { rows: [{ id: 666, name: 'Fallback User 2' }] };
      }
      return { rows: [] };
    };

    const res8B = await svc.resolveSmartLeadAssignment(mockQ8B, TA, 'b1', null, { default_assigned_to: 666 });
    assert.equal(salesTeamMembersQueried8B, false, 'Should NEVER query sales_team_members if it is missing, protecting the transaction');
    assert.equal(res8B.assignedTo, 666);
    assert.equal(res8B.method, 'default_setting_fallback');
  });
});
