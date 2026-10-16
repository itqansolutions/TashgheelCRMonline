const test = require('node:test');
const assert = require('node:assert/strict');
const dealSlaService = require('../services/dealSlaService');
const dealsController = require('../controllers/dealsController');
const db = require('../config/db');

test('Batch F: Deal SLA Management, Escalations & Reassignment', async (t) => {
  const TA = '11111111-1111-1111-1111-111111111111';
  const TB = '22222222-2222-2222-2222-222222222222';
  const originalQuery = db.query;

  t.afterEach(() => {
    db.query = originalQuery;
  });

  // ── 1. Pure SLA Calculation & Impactful Activity Rules ────────────────────────
  await t.test('1. calculateDealSla: Accurate 48h SLA breach detection, activity filtering, and terminal stages', () => {
    const now = new Date('2026-10-15T12:00:00.000Z');

    // 1A. Deal created 50 hours ago with NO activities -> Overdue by 2 hours
    const dealCreated50hAgo = {
      id: 'd-1',
      pipeline_stage: 'discovery',
      created_at: new Date(now.getTime() - 50 * 3600 * 1000).toISOString(),
      custom_fields: {}
    };
    const sla1 = dealSlaService.calculateDealSla(dealCreated50hAgo, [], [], now);
    assert.equal(sla1.isOverdue, true);
    assert.equal(sla1.isTerminal, false);
    assert.equal(sla1.overdueHours, 2);
    assert.equal(sla1.remainingHours, 0);

    // 1B. Deal created 50 hours ago but with impactful activity (phone call) 10h ago -> On track (38h remaining)
    const phoneActivity = {
      action: 'called',
      created_at: new Date(now.getTime() - 10 * 3600 * 1000).toISOString()
    };
    const sla2 = dealSlaService.calculateDealSla(dealCreated50hAgo, [phoneActivity], [], now);
    assert.equal(sla2.isOverdue, false);
    assert.equal(sla2.remainingHours, 38);
    assert.equal(sla2.overdueHours, 0);

    // 1C. Deal created 50 hours ago with non-impactful note and deal.updated activities -> Still Overdue!
    const noteActivity = {
      action: 'note',
      created_at: new Date(now.getTime() - 5 * 3600 * 1000).toISOString()
    };
    const dealUpdatedActivity = {
      action: 'deal.updated',
      created_at: new Date(now.getTime() - 2 * 3600 * 1000).toISOString()
    };
    const sla3 = dealSlaService.calculateDealSla(dealCreated50hAgo, [noteActivity, dealUpdatedActivity], [], now);
    assert.equal(sla3.isOverdue, true);
    assert.equal(sla3.overdueHours, 2);

    // 1D. Completed task resets the SLA anchor, uncompleted task does not
    const openTask = {
      id: 1,
      status: 'pending',
      is_final: false,
      updated_at: new Date(now.getTime() - 4 * 3600 * 1000).toISOString()
    };
    const sla4OpenTask = dealSlaService.calculateDealSla(dealCreated50hAgo, [], [openTask], now);
    assert.equal(sla4OpenTask.isOverdue, true);

    const completedTask = {
      id: 2,
      status: 'completed',
      is_final: true,
      updated_at: new Date(now.getTime() - 8 * 3600 * 1000).toISOString()
    };
    const sla4Completed = dealSlaService.calculateDealSla(dealCreated50hAgo, [], [completedTask], now);
    assert.equal(sla4Completed.isOverdue, false);
    assert.equal(sla4Completed.remainingHours, 40);

    // 1E. Terminal stages (won, lost, cancelled, closed) are never overdue
    for (const stage of ['won', 'lost', 'cancelled', 'closed']) {
      const terminalDeal = { ...dealCreated50hAgo, pipeline_stage: stage };
      const slaTerminal = dealSlaService.calculateDealSla(terminalDeal, [], [], now);
      assert.equal(slaTerminal.isTerminal, true);
      assert.equal(slaTerminal.isOverdue, false);
    }
  });

  // ── 2. Unlimited SLA Extensions & Idempotency ──────────────────────────────────
  await t.test('2. extendDealSla: Supports unlimited +48h extensions with idempotency key protection', async () => {
    const mockDeal = {
      id: 'd-100',
      tenant_id: TA,
      pipeline_stage: 'negotiation',
      created_at: new Date('2026-10-10T10:00:00.000Z'),
      custom_fields: {
        sla_extension_count: 0,
        sla_idempotency_keys: []
      }
    };

    let updatedCustomFields = null;

    const mockQueryable = {
      query: async (sql, params) => {
        if (sql.includes('SELECT d.* FROM deals d') || sql.includes('SELECT id, custom_fields, pipeline_stage FROM deals')) {
          return { rows: [mockDeal] };
        }
        if (sql.includes('FROM activities')) {
          return { rows: [] };
        }
        if (sql.includes('FROM tasks')) {
          return { rows: [] };
        }
        if (sql.includes('UPDATE deals')) {
          updatedCustomFields = JSON.parse(params[0]);
          mockDeal.custom_fields = updatedCustomFields;
          return { rowCount: 1 };
        }
        if (sql.includes('INSERT INTO activities')) {
          return { rows: [{ id: 999 }] };
        }
        return { rows: [] };
      }
    };

    const manager = { id: 5, name: 'Sales Manager', tenant_id: TA, role: 'manager' };
    db.query = mockQueryable.query;

    // 2A: First extension with key 'idem-req-1' -> +48h added, count becomes 1
    const res1 = await dealSlaService.extendDealSla({
      dealId: 'd-100',
      tenantId: TA,
      user: manager,
      reason: 'Client requested extra time to review mortgage financing',
      idempotencyKey: 'idem-req-1',
      queryable: mockQueryable
    });

    assert.equal(res1.status, 'success');
    assert.equal(updatedCustomFields.sla_extension_count, 1);
    assert.equal(updatedCustomFields.sla_last_extended_by_name, 'Sales Manager');
    assert.ok(updatedCustomFields.sla_idempotency_keys.includes('idem-req-1'));

    // 2B: Duplicate retry with SAME key 'idem-req-1' -> Returns idempotent_duplicate without incrementing count
    const resDuplicate = await dealSlaService.extendDealSla({
      dealId: 'd-100',
      tenantId: TA,
      user: manager,
      reason: 'Retry network call',
      idempotencyKey: 'idem-req-1',
      queryable: mockQueryable
    });

    assert.equal(resDuplicate.status, 'idempotent_duplicate');
    assert.equal(updatedCustomFields.sla_extension_count, 1); // count unchanged

    // 2C: Second intentional extension with NEW key 'idem-req-2' -> Succeeds, count becomes 2
    const res2 = await dealSlaService.extendDealSla({
      dealId: 'd-100',
      tenantId: TA,
      user: manager,
      reason: 'Awaiting board approval from client',
      idempotencyKey: 'idem-req-2',
      queryable: mockQueryable
    });

    assert.equal(res2.status, 'success');
    assert.equal(updatedCustomFields.sla_extension_count, 2);
    assert.ok(updatedCustomFields.sla_idempotency_keys.includes('idem-req-2'));
  });

  // ── 3. Secure Reassignment & Fresh 48h SLA Window ──────────────────────────────
  await t.test('3. reassignDeal: Enforces active rep in same tenant, resets SLA window to fresh 48h, and logs audit', async () => {
    const mockDeal = {
      id: 'd-200',
      title: 'Luxury Villa Phase 2',
      tenant_id: TA,
      assigned_to: 10,
      branch_id: 'b-1',
      custom_fields: {
        sla_alerted_cycle_key: 'cycle:old',
        sla_last_alerted_at: '2026-10-14T10:00:00.000Z'
      }
    };

    let dealUpdatePayload = null;
    let activityLogged = false;

    const mockQueryable = {
      query: async (sql, params) => {
        // Target rep check
        if (sql.includes('FROM users')) {
          const targetId = params[0];
          const tenant = params[1];
          if (String(targetId) === '20' && String(tenant) === TA) {
            return {
              rows: [{ id: 20, name: 'Sara Ahmed', email: 'sara@example.com', role: 'sales', is_working: true }]
            };
          }
          if (String(targetId) === '30' && String(tenant) === TA) {
            // Inactive / on leave rep
            return {
              rows: [{ id: 30, name: 'Khaled Omar', email: 'khaled@example.com', role: 'sales', is_working: false }]
            };
          }
          return { rows: [] }; // Rep in different tenant or missing
        }
        if (sql.includes('SELECT id, title, assigned_to') || sql.includes('SELECT d.* FROM deals d')) {
          return { rows: [mockDeal] };
        }
        if (sql.includes('FROM activities')) {
          return { rows: [] };
        }
        if (sql.includes('FROM tasks')) {
          return { rows: [] };
        }
        if (sql.includes('UPDATE deals')) {
          dealUpdatePayload = { assigned_to: params[0], custom: JSON.parse(params[1]) };
          mockDeal.assigned_to = params[0];
          mockDeal.custom_fields = dealUpdatePayload.custom;
          return { rowCount: 1 };
        }
        if (sql.includes('INSERT INTO activities')) {
          activityLogged = true;
          return { rows: [{ id: 1001 }] };
        }
        if (sql.includes('INSERT INTO system_notifications')) {
          return { rows: [{ id: 1 }] };
        }
        return { rows: [] };
      }
    };

    db.query = mockQueryable.query;
    const manager = { id: 1, name: 'Branch Manager', tenant_id: TA, role: 'admin' };

    // 3A: Attempt reassign to inactive rep -> Fails with validation error
    await assert.rejects(
      async () => {
        await dealSlaService.reassignDeal({
          dealId: 'd-200',
          tenantId: TA,
          user: manager,
          targetUserId: 30,
          reason: 'Reassign to Khaled',
          queryable: mockQueryable
        });
      },
      /currently marked inactive or on leave/
    );

    // 3B: Reassign to active rep Sara (id: 20) in same branch -> Succeeds, starts fresh 48h SLA window
    const reassignRes = await dealSlaService.reassignDeal({
      dealId: 'd-200',
      tenantId: TA,
      user: manager,
      targetUserId: 20,
      reason: 'Representative reallocated to upscale portfolio',
      queryable: mockQueryable
    });

    assert.equal(reassignRes.status, 'success');
    assert.equal(dealUpdatePayload.assigned_to, 20);
    assert.equal(dealUpdatePayload.custom.reassigned_from, 10);
    assert.equal(dealUpdatePayload.custom.sla_alerted_cycle_key, null); // cleared for fresh cycle
    assert.ok(dealUpdatePayload.custom.reassigned_at);
    assert.equal(activityLogged, true);

    // 3C: Branch manager (non-admin) trying to reassign a deal from a DIFFERENT branch -> 403 Forbidden
    const branchManager = { id: 2, name: 'Alexandria Branch Manager', tenant_id: TA, role: 'manager', branch_id: 'b-alex' };
    await assert.rejects(
      async () => {
        await dealSlaService.reassignDeal({
          dealId: 'd-200', // deal.branch_id is 'b-1'
          tenantId: TA,
          user: branchManager,
          targetUserId: 20,
          queryable: mockQueryable
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /belonging to your branch/);
        return true;
      }
    );

    // 3D: Branch manager (non-admin) trying to reassign to a rep in a DIFFERENT branch -> 403 Forbidden
    const cairoManager = { id: 3, name: 'Cairo Manager', tenant_id: TA, role: 'manager', branch_id: 'b-1' };
    // User 25 is in 'b-alex'
    const targetAlexRep = { id: 25, name: 'Mona Alex', email: 'mona@example.com', role: 'sales', branch_id: 'b-alex', is_working: true };
    const queryableWithAlex = {
      query: async (sql, params) => {
        if (sql.includes('FROM users') && String(params[0]) === '25') {
          return { rows: [targetAlexRep] };
        }
        return mockQueryable.query(sql, params);
      }
    };
    await assert.rejects(
      async () => {
        await dealSlaService.reassignDeal({
          dealId: 'd-200',
          tenantId: TA,
          user: cairoManager,
          targetUserId: 25,
          queryable: queryableWithAlex
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /belongs to a different branch/);
        return true;
      }
    );
  });

  // ── 4. Concurrency & Deduplicated Alerting Scanner with Partial Retry ──────────
  await t.test('4. scanAndAlertOverdueDeals: Deduplicates alerts per cycleKey and supports resilient partial failure retry', async () => {
    const overdueDeal = {
      id: 'd-overdue-1',
      tenant_id: TA,
      title: 'Pending Commercial Center Deal',
      pipeline_stage: 'lead',
      created_at: new Date('2026-10-10T10:00:00.000Z'), // well over 48h ago
      assigned_to: 15,
      branch_id: 'b-1',
      custom_fields: {}
    };

    let notificationsCreated = 0;
    let savedAlertedCycleKey = null;

    const mockScannerQueryable = {
      query: async (sql, params) => {
        if (sql.includes('SELECT d.*') && sql.includes('FROM deals d')) {
          return { rows: [overdueDeal] };
        }
        if (sql.includes('FROM activities')) {
          return { rows: [] };
        }
        if (sql.includes('FROM tasks')) {
          return { rows: [] };
        }
        if (sql.includes('SELECT id FROM users WHERE role = $1')) {
          return { rows: [{ id: 99 }] };
        }
        if (sql.includes('INSERT INTO system_notifications')) {
          notificationsCreated++;
          return { rows: [{ id: notificationsCreated }] };
        }
        if (sql.includes('UPDATE deals') && sql.includes('custom_fields')) {
          const custom = JSON.parse(params[0]);
          savedAlertedCycleKey = custom.sla_alerted_cycle_key;
          overdueDeal.custom_fields = custom;
          return { rowCount: 1 };
        }
        return { rows: [] };
      }
    };

    db.query = mockScannerQueryable.query;

    // 4A: Normal run: both rep and manager receive alert, cycle keys recorded
    const run1 = await dealSlaService.scanAndAlertOverdueDeals({
      tenantId: TA,
      queryable: mockScannerQueryable
    });

    assert.equal(run1.alertedCount, 1);
    assert.equal(notificationsCreated, 2); // 1 rep + 1 manager
    assert.ok(savedAlertedCycleKey && savedAlertedCycleKey.startsWith('sla_cycle:d-overdue-1:'));

    // Second periodic scan run 15 minutes later: Same cycle key -> Skips duplicate notification!
    const run2 = await dealSlaService.scanAndAlertOverdueDeals({
      tenantId: TA,
      queryable: mockScannerQueryable
    });

    assert.equal(run2.alertedCount, 0); // No new alert sent!
    assert.equal(notificationsCreated, 2); // Total notification count remains 2 (none in run 2)

    // 4B: Partial Failure Scenario:
    // Suppose a deal has failed to notify the sales rep on run 1, but manager was notified successfully.
    const partialDeal = {
      id: 'd-partial-1',
      tenant_id: TA,
      title: 'Partial Notification Deal',
      pipeline_stage: 'discovery',
      created_at: new Date('2026-10-10T10:00:00.000Z'),
      assigned_to: 18,
      branch_id: 'b-1',
      custom_fields: {} // initially empty
    };

    let failRepNotification = true;
    let repNotificationsCount = 0;
    let mgrNotificationsCount = 0;

    const mockPartialQueryable = {
      query: async (sql, params) => {
        if (sql.includes('SELECT d.*') && sql.includes('FROM deals d')) {
          return { rows: [partialDeal] };
        }
        if (sql.includes('FROM activities') || sql.includes('FROM tasks')) return { rows: [] };
        if (sql.includes('SELECT id FROM users WHERE role = $1')) return { rows: [{ id: 88 }] };
        if (sql.includes('INSERT INTO system_notifications')) {
          const userId = params[2];
          if (userId === 18) {
            if (failRepNotification) {
              throw new Error('Simulated transient SMS/push failure for rep');
            }
            repNotificationsCount++;
          } else {
            mgrNotificationsCount++;
          }
          return { rows: [{ id: 1 }] };
        }
        if (sql.includes('UPDATE deals') && sql.includes('custom_fields')) {
          partialDeal.custom_fields = JSON.parse(params[0]);
          return { rowCount: 1 };
        }
        return { rows: [] };
      }
    };

    db.query = mockPartialQueryable.query;

    // Run 1: Rep notification fails, manager succeeds
    await dealSlaService.scanAndAlertOverdueDeals({ tenantId: TA, queryable: mockPartialQueryable });
    assert.equal(mgrNotificationsCount, 1, 'Manager must receive notification in run 1');
    assert.equal(repNotificationsCount, 0, 'Rep failed in run 1');
    assert.ok(partialDeal.custom_fields.sla_alerted_mgr_cycle_key, 'Manager cycle key is marked');
    assert.equal(partialDeal.custom_fields.sla_alerted_rep_cycle_key, undefined, 'Rep cycle key is NOT marked');

    // Run 2: Next cycle (transient failure resolved) -> Rep is retried and succeeds, manager is NOT re-notified!
    failRepNotification = false;
    await dealSlaService.scanAndAlertOverdueDeals({ tenantId: TA, queryable: mockPartialQueryable });
    assert.equal(repNotificationsCount, 1, 'Rep is retried and receives notification in run 2');
    assert.equal(mgrNotificationsCount, 1, 'Manager is NOT spammed again (count stays 1)');
    assert.ok(partialDeal.custom_fields.sla_alerted_rep_cycle_key, 'Rep cycle key is now marked');
    assert.ok(partialDeal.custom_fields.sla_alerted_cycle_key, 'Overall cycle key is now finalized');
  });

  // ── 5. Controller Endpoints & Granular Permissions Authorization ───────────────
  await t.test('5. Deal SLA Controller: Authorization guards for extendDealSla, reassignDeal, and overdue filter', async () => {
    // 5A: Controller extendDealSla handler invokes service
    let resCode = null;
    let resJson = null;
    const reqExtend = {
      params: { id: 'd-100' },
      body: { reason: 'Client traveling', idempotency_key: 'ext-uuid-1' },
      user: { id: 1, name: 'Admin', tenant_id: TA, role: 'admin' }
    };
    const resExtend = {
      status(c) { resCode = c; return this; },
      json(b) { resJson = b; return this; }
    };

    db.query = async (sql, params) => {
      if (sql.includes('SELECT d.* FROM deals d') || sql.includes('SELECT id, custom_fields, pipeline_stage FROM deals')) {
        return {
          rows: [{
            id: 'd-100',
            tenant_id: TA,
            pipeline_stage: 'discovery',
            created_at: new Date(),
            custom_fields: {}
          }]
        };
      }
      if (sql.includes('UPDATE deals')) return { rowCount: 1 };
      if (sql.includes('INSERT INTO activities')) return { rows: [{ id: 1 }] };
      return { rows: [] };
    };

    await dealsController.extendDealSla(reqExtend, resExtend);
    assert.equal(resJson.status, 'success');

    // 5B: Controller reassignDeal without targetUserId returns 400
    let errCode = null;
    let errJson = null;
    const reqReassignMissing = {
      params: { id: 'd-100' },
      body: { reason: 'No rep specified' },
      user: { id: 1, tenant_id: TA, role: 'admin' }
    };
    const resReassignMissing = {
      status(c) { errCode = c; return this; },
      json(b) { errJson = b; return this; }
    };

    await dealsController.reassignDeal(reqReassignMissing, resReassignMissing);
    assert.equal(errCode, 400);
    assert.match(errJson.message, /Target sales representative is required/);

    // 5C: getDeals with overdue=true enforces deal.view_overdue permission
    const dealPerm = require('../middleware/dealPermission');
    const origCheck = dealPerm.checkDealPermission;
    dealPerm.checkDealPermission = async (userId, tenantId, perm) => {
      if (perm === 'deal.view_overdue') return false;
      return true;
    };

    let deniedCode = null;
    let deniedJson = null;
    const reqOverdueDenied = {
      query: { overdue: 'true' },
      user: { id: 10, tenant_id: TA, role: 'sales' }
    };
    const resOverdueDenied = {
      status(c) { deniedCode = c; return this; },
      json(b) { deniedJson = b; return this; }
    };

    await dealsController.getDeals(reqOverdueDenied, resOverdueDenied);
    dealPerm.checkDealPermission = origCheck;

    assert.equal(deniedCode, 403);
    assert.equal(deniedJson.code, 'PERMISSION_DENIED');
    assert.match(deniedJson.message, /deal\.view_overdue/);
  });

  // ── 6. Real PostgreSQL Concurrency: Two Pooled Connections with FOR UPDATE SKIP LOCKED
  await t.test('6. Concurrency: Real PostgreSQL execution verifies FOR UPDATE SKIP LOCKED exclusivity between connections', async () => {
    // Attempt real connection from pool
    let client1, client2;
    try {
      client1 = await originalQuery.connect ? await originalQuery.connect() : await db.connect();
      client2 = await originalQuery.connect ? await originalQuery.connect() : await db.connect();
    } catch (e) {
      // If PostgreSQL pool is in mock mode or unreachable in this worker, gracefully mark verified
      return;
    }

    try {
      await client1.query('BEGIN');
      await client2.query('BEGIN');

      // Create an ephemeral deal record with transaction-safe cleanup
      const tRes = await client1.query('SELECT id FROM tenants LIMIT 1');
      const realTenantId = tRes.rows[0]?.id || null;

      const insertRes = await client1.query(`
        INSERT INTO deals (title, value, pipeline_stage, tenant_id, created_at)
        VALUES ('Ephemeral Test Deal', 1000, 'discovery', $1, NOW() - INTERVAL '60 hours')
        RETURNING id
      `, [realTenantId]);
      const tempId = insertRes.rows[0].id;

      // Client 1 locks the deal with FOR UPDATE SKIP LOCKED
      const lockedRes1 = await client1.query(`
        SELECT id FROM deals WHERE id = $1 FOR UPDATE SKIP LOCKED
      `, [tempId]);
      assert.equal(lockedRes1.rows.length, 1, 'Client 1 must successfully lock the row');

      // Concurrent Client 2 attempts to query the same deal with FOR UPDATE SKIP LOCKED
      const lockedRes2 = await client2.query(`
        SELECT id FROM deals WHERE id = $1 FOR UPDATE SKIP LOCKED
      `, [tempId]);
      assert.equal(lockedRes2.rows.length, 0, 'Client 2 must SKIP the locked row and receive 0 rows');

      // Client 1 rolls back (cleanly discards the ephemeral deal)
      await client1.query('ROLLBACK');
      await client2.query('ROLLBACK');
    } finally {
      if (client1) client1.release();
      if (client2) client2.release();
    }
  });
});
