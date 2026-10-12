/**
 * tests/integration/sales_targets_phase33b.test.js
 *
 * Phase 3.3B: Sales Metrics & Targets Engine Integration Test Suite (Real PostgreSQL)
 * Tests run against isolated PostgreSQL database specified in .env.test.
 */

const fs = require('fs');
const dotenv = require('dotenv');

// Pre-load .env.test and override DATABASE_URL before any modules are imported
const envTestContent = fs.readFileSync('.env.test', 'utf8');
const envTest = dotenv.parse(envTestContent);
if (!envTest.DATABASE_URL_TEST || envTest.DATABASE_URL_TEST.includes('reseau.proxy.rlwy.net')) {
  throw new Error('SAFETY GATE: Invalid or production DATABASE_URL_TEST');
}
process.env.DATABASE_URL = envTest.DATABASE_URL_TEST;
process.env.DATABASE_URL_TEST = envTest.DATABASE_URL_TEST;

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_TEST,
  ssl: { rejectUnauthorized: false }
});

const salesTargetService = require('../../services/salesTargetService');
const crypto = require('crypto');

test('Phase 3.3B: Sales Metrics & Targets Engine Suite', async (t) => {
  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  let branchA, branchB;
  let userRepA, userRepB, userManager, userOtherDept;
  let deptSales, deptSupport;

  t.before(async () => {
    // Run migration 016 to guarantee schema is up-to-date
    const migSql = fs.readFileSync('migrations/016_sales_targets_hardening.sql', 'utf8');
    await pool.query(migSql);

    // 1. Seed Tenants
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status)
       VALUES ($1, 'Tenant 33B Alpha', $3, 'enterprise', 'active'),
              ($2, 'Tenant 33B Beta', $4, 'enterprise', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [tenantA, tenantB, `slug-${tenantA.slice(0, 8)}`, `slug-${tenantB.slice(0, 8)}`]
    );

    // 2. Seed Branches
    const brRes = await pool.query(
      `INSERT INTO branches (id, name, tenant_id, timezone)
       VALUES (gen_random_uuid(), 'Branch Cairo', $1, 'Africa/Cairo'),
              (gen_random_uuid(), 'Branch Alex', $1, 'Africa/Cairo'),
              (gen_random_uuid(), 'Branch Beta', $2, 'Africa/Cairo')
       RETURNING id, name, tenant_id`,
      [tenantA, tenantB]
    );
    branchA = brRes.rows.find(b => b.tenant_id === tenantA && b.name === 'Branch Cairo').id;
    branchB = brRes.rows.find(b => b.tenant_id === tenantB).id;

    // 3. Seed Departments
    const depRes = await pool.query(
      `INSERT INTO departments (name, tenant_id, branch_id)
       VALUES ('Commercial Sales', $1, $2),
              ('Customer Support', $1, $2)
       RETURNING id, name`,
      [tenantA, String(branchA)]
    );
    deptSales = depRes.rows.find(d => d.name === 'Commercial Sales').id;
    deptSupport = depRes.rows.find(d => d.name === 'Customer Support').id;

    // 4. Seed Users
    const uRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, tenant_id, branch_id, department_id)
       VALUES ('Rep Ahmed', 'rep.ahmed@test.com', 'hash', 'employee', $1, $2, $3),
              ('Rep Basel', 'rep.basel@test.com', 'hash', 'employee', $1, $2, $3),
              ('Manager Tarek', 'manager.tarek@test.com', 'hash', 'manager', $1, $2, $3),
              ('Support Sara', 'support.sara@test.com', 'hash', 'employee', $1, $2, $4)
       RETURNING id, name`,
      [tenantA, branchA, deptSales, deptSupport]
    );
    userRepA = uRes.rows.find(u => u.name === 'Rep Ahmed').id;
    userRepB = uRes.rows.find(u => u.name === 'Rep Basel').id;
    userManager = uRes.rows.find(u => u.name === 'Manager Tarek').id;
    userOtherDept = uRes.rows.find(u => u.name === 'Support Sara').id;

    // Update manager of Commercial Sales
    await pool.query('UPDATE departments SET manager_id = $1 WHERE id = $2', [userManager, deptSales]);

    // 5. Seed Treasury Accounts for Branch Cairo
    await pool.query(
      `INSERT INTO treasury_accounts (name, type, tenant_id, branch_id, is_active, is_default)
       VALUES ('Cairo Main Safe', 'cash', $1, $2, true, true)
       ON CONFLICT DO NOTHING`,
      [tenantA, String(branchA)]
    );
  });

  t.after(async () => {
    // Cleanup test data safely
    await pool.query(`DELETE FROM payments WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
    await pool.query(`DELETE FROM invoices WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
    await pool.query(`DELETE FROM sales_orders WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
    await pool.query(`DELETE FROM deals WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
    await pool.query(`DELETE FROM sales_targets WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
    await pool.query(`DELETE FROM activities WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
    await pool.query(`DELETE FROM users WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
    await pool.query(`DELETE FROM departments WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
    await pool.query(`DELETE FROM branches WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
    await pool.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [tenantA, tenantB]);
    await pool.end();
  });

  await t.test('1. Period parser resolves standard and legacy formats to exact Cairo local bounds', async () => {
    const monthly = salesTargetService.resolvePeriodBounds('2026-05');
    assert.equal(monthly.periodType, 'monthly');
    assert.equal(monthly.startLocal, '2026-05-01 00:00:00');
    assert.equal(monthly.endLocal, '2026-06-01 00:00:00');

    const quarterly = salesTargetService.resolvePeriodBounds('2026-Q3');
    assert.equal(quarterly.periodType, 'quarterly');
    assert.equal(quarterly.startLocal, '2026-07-01 00:00:00');
    assert.equal(quarterly.endLocal, '2026-10-01 00:00:00');

    const legacyQ = salesTargetService.resolvePeriodBounds('Q3 2026');
    assert.equal(legacyQ.normalizedPeriod, '2026-Q3');
    assert.equal(legacyQ.startLocal, '2026-07-01 00:00:00');

    const yearly = salesTargetService.resolvePeriodBounds('2026');
    assert.equal(yearly.periodType, 'yearly');
    assert.equal(yearly.startLocal, '2026-01-01 00:00:00');
    assert.equal(yearly.endLocal, '2027-01-01 00:00:00');

    const legacyFY = salesTargetService.resolvePeriodBounds('FY 2026');
    assert.equal(legacyFY.normalizedPeriod, '2026');

    assert.throws(() => {
      salesTargetService.resolvePeriodBounds('invalid-period');
    }, /Invalid period format/);
  });

  await t.test('2. Attribution Priority: Sales Order rep takes precedence over Deal rep', async () => {
    // Deal assigned to Rep B
    const dealRes = await pool.query(
      `INSERT INTO deals (title, value, assigned_to, tenant_id, branch_id)
       VALUES ('Enterprise Deal', 100000, $1, $2, $3) RETURNING id`,
      [userRepB, tenantA, branchA]
    );
    const dealId = dealRes.rows[0].id;

    // Sales Order converted from deal, assigned to Rep A (the actual closer)
    const soRes = await pool.query(
      `INSERT INTO sales_orders (deal_id, assigned_to, total_amount, tenant_id, branch_id, number)
       VALUES ($1, $2, 100000, $3, $4, 'SO-33B-01') RETURNING id`,
      [dealId, userRepA, tenantA, branchA]
    );
    const soId = soRes.rows[0].id;

    // Invoice linked to both
    const invRes = await pool.query(
      `INSERT INTO invoices (invoice_number, sales_order_id, deal_id, total_amount, tenant_id, branch_id, status)
       VALUES ('INV-33B-01', $1, $2, 100000, $3, $4, 'paid') RETURNING id`,
      [String(soId), String(dealId), tenantA, branchA]
    );
    const invId = invRes.rows[0].id;

    // Payment collected on 2026-05-15
    await pool.query(
      `INSERT INTO payments (invoice_id, amount, payment_date, tenant_id, branch_id, status)
       VALUES ($1, 75000, '2026-05-15 12:00:00+03', $2, $3, 'active')`,
      [invId, tenantA, branchA]
    );

    // Rep A (Sales Order assignee) must get the 75,000 credit
    const repAAchieved = await salesTargetService.calculateAchievement({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'individual',
      user_id: userRepA,
      period: '2026-05'
    });
    assert.equal(repAAchieved, 75000);

    // Rep B (Deal assignee) must get 0
    const repBAchieved = await salesTargetService.calculateAchievement({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'individual',
      user_id: userRepB,
      period: '2026-05'
    });
    assert.equal(repBAchieved, 0);
  });

  await t.test('3. Fallback to Deal: Direct deal without Sales Order attributes to Deal rep', async () => {
    const dealRes = await pool.query(
      `INSERT INTO deals (title, value, assigned_to, tenant_id, branch_id)
       VALUES ('Direct Deal', 50000, $1, $2, $3) RETURNING id`,
      [userRepB, tenantA, branchA]
    );
    const dealId = dealRes.rows[0].id;

    const invRes = await pool.query(
      `INSERT INTO invoices (invoice_number, deal_id, total_amount, tenant_id, branch_id, status)
       VALUES ('INV-33B-02', $1, 50000, $2, $3, 'paid') RETURNING id`,
      [String(dealId), tenantA, branchA]
    );
    const invId = invRes.rows[0].id;

    await pool.query(
      `INSERT INTO payments (invoice_id, amount, payment_date, tenant_id, branch_id, status)
       VALUES ($1, 50000, '2026-05-20 10:00:00+03', $2, $3, 'active')`,
      [invId, tenantA, branchA]
    );

    const repBAchieved = await salesTargetService.calculateAchievement({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'individual',
      user_id: userRepB,
      period: '2026-05'
    });
    assert.equal(repBAchieved, 50000);
  });

  await t.test('4. Standalone Direct/House Sale is credited to Branch only, NOT to individual reps', async () => {
    // Invoice with no SO and no Deal
    const invRes = await pool.query(
      `INSERT INTO invoices (invoice_number, total_amount, tenant_id, branch_id, status)
       VALUES ('INV-33B-HOUSE', 30000, $1, $2, 'paid') RETURNING id`,
      [tenantA, branchA]
    );
    const invId = invRes.rows[0].id;

    await pool.query(
      `INSERT INTO payments (invoice_id, amount, payment_date, tenant_id, branch_id, status)
       VALUES ($1, 30000, '2026-05-22 14:00:00+03', $2, $3, 'active')`,
      [invId, tenantA, branchA]
    );

    // Individual Rep A: still only 75,000 (not 105,000)
    const repAAchieved = await salesTargetService.calculateAchievement({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'individual',
      user_id: userRepA,
      period: '2026-05'
    });
    assert.equal(repAAchieved, 75000);

    // Branch Target: includes repA (75k) + repB (50k) + house sale (30k) = 155,000
    const branchAchieved = await salesTargetService.calculateAchievement({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'branch',
      period: '2026-05'
    });
    assert.equal(branchAchieved, 155000);
  });

  await t.test('5. Cancelled Payment Zero-Impact: Cancelled payment does not count towards achievement', async () => {
    // Add cancelled payment to rep A's invoice
    const invRes = await pool.query(
      `SELECT id FROM invoices WHERE invoice_number = 'INV-33B-01' AND tenant_id = $1`,
      [tenantA]
    );
    const invId = invRes.rows[0].id;

    await pool.query(
      `INSERT INTO payments (invoice_id, amount, payment_date, tenant_id, branch_id, status, cancelled_at)
       VALUES ($1, 25000, '2026-05-25 10:00:00+03', $2, $3, 'cancelled', NOW())`,
      [invId, tenantA, branchA]
    );

    const repAAchieved = await salesTargetService.calculateAchievement({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'individual',
      user_id: userRepA,
      period: '2026-05'
    });
    // Must remain 75000, 25000 cancelled payment is ignored
    assert.equal(repAAchieved, 75000);
  });

  await t.test('6. Cancelled Invoice Zero-Impact: Payments on cancelled invoices do not count', async () => {
    const soRes = await pool.query(
      `INSERT INTO sales_orders (assigned_to, total_amount, tenant_id, branch_id, number)
       VALUES ($1, 20000, $2, $3, 'SO-33B-CANCELLED') RETURNING id`,
      [userRepA, tenantA, branchA]
    );
    const soId = soRes.rows[0].id;

    const invRes = await pool.query(
      `INSERT INTO invoices (invoice_number, sales_order_id, total_amount, tenant_id, branch_id, status)
       VALUES ('INV-33B-CANCELLED', $1, 20000, $2, $3, 'cancelled') RETURNING id`,
      [String(soId), tenantA, branchA]
    );
    const invId = invRes.rows[0].id;

    await pool.query(
      `INSERT INTO payments (invoice_id, amount, payment_date, tenant_id, branch_id, status)
       VALUES ($1, 20000, '2026-05-26 10:00:00+03', $2, $3, 'active')`,
      [invId, tenantA, branchA]
    );

    const repAAchieved = await salesTargetService.calculateAchievement({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'individual',
      user_id: userRepA,
      period: '2026-05'
    });
    // Must remain 75000
    assert.equal(repAAchieved, 75000);
  });

  await t.test('7. Real Estate Isolation: Payments on invoices/deals with unit_id are excluded 100%', async () => {
    const dealRes = await pool.query(
      `INSERT INTO deals (title, value, assigned_to, unit_id, tenant_id, branch_id)
       VALUES ('Villa Deal', 5000000, $1, 'UNIT-999', $2, $3) RETURNING id`,
      [userRepA, tenantA, branchA]
    );
    const dealId = dealRes.rows[0].id;

    const invRes = await pool.query(
      `INSERT INTO invoices (invoice_number, deal_id, unit_id, total_amount, tenant_id, branch_id, status)
       VALUES ('INV-33B-RE', $1, 'UNIT-999', 5000000, $2, $3, 'paid') RETURNING id`,
      [String(dealId), tenantA, branchA]
    );
    const invId = invRes.rows[0].id;

    await pool.query(
      `INSERT INTO payments (invoice_id, amount, payment_date, tenant_id, branch_id, status)
       VALUES ($1, 1000000, '2026-05-27 10:00:00+03', $2, $3, 'active')`,
      [invId, tenantA, branchA]
    );

    const repAAchieved = await salesTargetService.calculateAchievement({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'individual',
      user_id: userRepA,
      period: '2026-05'
    });
    // Still exactly 75,000, RE payment of 1,000,000 is strictly excluded
    assert.equal(repAAchieved, 75000);
  });

  await t.test('8. Egypt Local Month-End Precision: Payment at 23:30 Cairo time on May 31 counts in May', async () => {
    const soRes = await pool.query(
      `INSERT INTO sales_orders (assigned_to, total_amount, tenant_id, branch_id, number)
       VALUES ($1, 10000, $2, $3, 'SO-33B-EDGE1') RETURNING id`,
      [userRepA, tenantA, branchA]
    );
    const soId = soRes.rows[0].id;

    const invRes = await pool.query(
      `INSERT INTO invoices (invoice_number, sales_order_id, total_amount, tenant_id, branch_id, status)
       VALUES ('INV-33B-EDGE1', $1, 10000, $2, $3, 'paid') RETURNING id`,
      [String(soId), tenantA, branchA]
    );
    const invId = invRes.rows[0].id;

    // 2026-05-31 23:30:00 Cairo Time (20:30 UTC)
    await pool.query(
      `INSERT INTO payments (invoice_id, amount, payment_date, tenant_id, branch_id, status)
       VALUES ($1, 10000, '2026-05-31 23:30:00 Africa/Cairo', $2, $3, 'active')`,
      [invId, tenantA, branchA]
    );

    const repAAchieved = await salesTargetService.calculateAchievement({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'individual',
      user_id: userRepA,
      period: '2026-05'
    });
    // 75,000 + 10,000 = 85,000
    assert.equal(repAAchieved, 85000);
  });

  await t.test('9. Egypt Local Next-Month Precision: Payment at 00:30 Cairo time on June 1 counts in June, NOT May', async () => {
    const soRes = await pool.query(
      `INSERT INTO sales_orders (assigned_to, total_amount, tenant_id, branch_id, number)
       VALUES ($1, 15000, $2, $3, 'SO-33B-EDGE2') RETURNING id`,
      [userRepA, tenantA, branchA]
    );
    const soId = soRes.rows[0].id;

    const invRes = await pool.query(
      `INSERT INTO invoices (invoice_number, sales_order_id, total_amount, tenant_id, branch_id, status)
       VALUES ('INV-33B-EDGE2', $1, 15000, $2, $3, 'paid') RETURNING id`,
      [String(soId), tenantA, branchA]
    );
    const invId = invRes.rows[0].id;

    // 2026-06-01 00:30:00 Cairo Time (May 31 21:30 UTC)
    await pool.query(
      `INSERT INTO payments (invoice_id, amount, payment_date, tenant_id, branch_id, status)
       VALUES ($1, 15000, '2026-06-01 00:30:00 Africa/Cairo', $2, $3, 'active')`,
      [invId, tenantA, branchA]
    );

    const repAMay = await salesTargetService.calculateAchievement({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'individual',
      user_id: userRepA,
      period: '2026-05'
    });
    // May remains 85,000
    assert.equal(repAMay, 85000);

    const repAJune = await salesTargetService.calculateAchievement({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'individual',
      user_id: userRepA,
      period: '2026-06'
    });
    // June gets the 15,000
    assert.equal(repAJune, 15000);
  });

  await t.test('10. Target Uniqueness & Duplicate Prevention: Rejects creating duplicate active target', async () => {
    const actor = { id: userManager, name: 'Manager Tarek', role: 'manager' };

    // Create target for Rep A in 2026-05
    const t1 = await salesTargetService.createTarget({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'individual',
      user_id: userRepA,
      period: '2026-05',
      target_amount: 100000,
      commission_rate: 5,
      bonus_threshold: 120000
    }, actor);

    assert.ok(t1.id);
    assert.equal(t1.period, '2026-05');

    // Attempt to create duplicate for Rep A in 2026-05
    await assert.rejects(async () => {
      await salesTargetService.createTarget({
        tenant_id: tenantA,
        branch_id: branchA,
        target_scope: 'individual',
        user_id: userRepA,
        period: '2026-05',
        target_amount: 200000
      }, actor);
    }, (err) => {
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /already exists/);
      return true;
    });
  });

  await t.test('11. Soft Deactivation & Re-creation: Deactivated target frees constraint and logs activity', async () => {
    const actor = { id: userManager, name: 'Manager Tarek', role: 'manager' };

    // Find the target created in test 10
    const list = await salesTargetService.getTargetsWithProgress({
      tenant_id: tenantA,
      user_id: userRepA,
      period: '2026-05'
    });
    const targetId = list[0].id;

    // Soft-deactivate
    const deactivated = await salesTargetService.softDeleteTarget({
      target_id: targetId,
      tenant_id: tenantA,
      actor
    });
    assert.equal(deactivated, true);

    // Target no longer appears in active list
    const activeList = await salesTargetService.getTargetsWithProgress({
      tenant_id: tenantA,
      user_id: userRepA,
      period: '2026-05'
    });
    assert.equal(activeList.length, 0);

    // Audit record exists in activities
    const actRes = await pool.query(
      `SELECT * FROM activities WHERE entity_type = 'sales_target' AND entity_id = $1 AND action = 'target_deactivated'`,
      [String(targetId)]
    );
    assert.equal(actRes.rows.length, 1);

    // Now creating a new replacement target for Rep A in 2026-05 SUCCEEDS without index collision!
    const tNew = await salesTargetService.createTarget({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'individual',
      user_id: userRepA,
      period: '2026-05',
      target_amount: 150000,
      commission_rate: 6
    }, actor);
    assert.ok(tNew.id);
    assert.notEqual(tNew.id, targetId);
  });

  await t.test('12. Department Targets: Aggregates collections of all members in the department', async () => {
    const actor = { id: userManager, name: 'Manager Tarek', role: 'manager' };

    // Create Department target for Commercial Sales in 2026-05
    const deptTarget = await salesTargetService.createTarget({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'department',
      department_id: deptSales,
      period: '2026-05',
      target_amount: 200000
    }, actor);

    assert.ok(deptTarget.id);

    // Commercial Sales has: Rep A (85k) + Rep B (50k) = 135,000
    // (Sara from Support Sara has 0 in deptSales, House sale is not assigned to a rep in deptSales)
    const deptAchieved = await salesTargetService.calculateAchievement({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'department',
      department_id: deptSales,
      period: '2026-05'
    });
    assert.equal(deptAchieved, 135000);
  });

  await t.test('13. Tenant Isolation: Collections in Tenant A never leak into Tenant B', async () => {
    // Tenant B target for period 2026-05
    const tenantBAchieved = await salesTargetService.calculateAchievement({
      tenant_id: tenantB,
      branch_id: branchB,
      target_scope: 'branch',
      period: '2026-05'
    });
    // Must be strictly 0, despite Tenant A having 155,000+
    assert.equal(tenantBAchieved, 0);
  });

  await t.test('14. Full Progress & Bonus calculation in getTargetsWithProgress', async () => {
    const targets = await salesTargetService.getTargetsWithProgress({
      tenant_id: tenantA,
      period: '2026-05'
    });

    assert.ok(targets.length >= 2);
    const repATarget = targets.find(t => t.user_id === userRepA);
    assert.ok(repATarget);
    assert.equal(repATarget.achieved_amount, 85000);
    assert.equal(repATarget.target_amount, 150000);
    // 85000 / 150000 = 56.67%
    assert.equal(repATarget.achievement_percentage, 56.67);
    // Commission earned: 85000 * 6% = 5100
    assert.equal(repATarget.commission_earned, 5100);
  });

  await t.test('15. Company Target: Aggregates collections across all branches of Tenant A including house sales', async () => {
    const actorAdmin = { id: 1, name: 'Admin', role: 'admin' };

    // Get Branch Alex ID
    const brRes = await pool.query(
      `SELECT id FROM branches WHERE tenant_id = $1 AND name = 'Branch Alex'`,
      [tenantA]
    );
    const branchAlex = brRes.rows[0].id;

    // Create a payment in Branch Alex (50,000)
    const invRes = await pool.query(
      `INSERT INTO invoices (invoice_number, total_amount, tenant_id, branch_id, status)
       VALUES ('INV-33B-ALEX-01', 50000, $1, $2, 'paid') RETURNING id`,
      [tenantA, branchAlex]
    );
    await pool.query(
      `INSERT INTO payments (invoice_id, amount, payment_date, tenant_id, branch_id, status)
       VALUES ($1, 50000, '2026-05-18 10:00:00+03', $2, $3, 'active')`,
      [invRes.rows[0].id, tenantA, branchAlex]
    );

    // Create Company Target for 2026-05
    const compTarget = await salesTargetService.createTarget({
      tenant_id: tenantA,
      target_scope: 'company',
      period: '2026-05',
      target_amount: 500000
    }, actorAdmin);

    assert.ok(compTarget.id);
    assert.equal(compTarget.target_scope, 'company');

    // Company calculation must aggregate:
    // Branch Cairo: repA (85k) + repB (50k) + house (30k) = 165,000
    // Branch Alex: Alex house (50k) = 50,000
    // Total Company = 215,000
    const companyAchieved = await salesTargetService.calculateAchievement({
      tenant_id: tenantA,
      target_scope: 'company',
      period: '2026-05'
    });
    assert.equal(companyAchieved, 215000);
  });

  await t.test('16. Branch Isolation: Branch Cairo target does NOT include Branch Alex collections', async () => {
    const branchCairoAchieved = await salesTargetService.calculateAchievement({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'branch',
      period: '2026-05'
    });
    // Must remain 165,000, strictly excluding the 50,000 in Branch Alex
    assert.equal(branchCairoAchieved, 165000);
  });

  await t.test('17. Concurrency: Parallel simultaneous target creation requests produce exactly 1 success and 1 conflict', async () => {
    const actorAdmin = { id: 1, name: 'Admin', role: 'admin' };

    // Parallel creation of individual target for Rep B in 2026-06
    const p1 = salesTargetService.createTarget({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'individual',
      user_id: userRepB,
      period: '2026-06',
      target_amount: 100000
    }, actorAdmin);

    const p2 = salesTargetService.createTarget({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'individual',
      user_id: userRepB,
      period: '2026-06',
      target_amount: 100000
    }, actorAdmin);

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one concurrent creation must succeed');
    assert.equal(rejected.length, 1, 'Exactly one concurrent creation must fail');
    assert.equal(rejected[0].reason.statusCode, 409, 'Rejection must be a 409 Conflict');
  });

  await t.test('18. Double-NULL Date Handling: Payment where payment_date and created_at are both NULL is safely excluded', async () => {
    const invRes = await pool.query(
      `INSERT INTO invoices (invoice_number, total_amount, tenant_id, branch_id, status)
       VALUES ('INV-33B-NULLDATE', 10000, $1, $2, 'paid') RETURNING id`,
      [tenantA, branchA]
    );

    // Force payment_date and created_at to NULL
    await pool.query(
      `INSERT INTO payments (invoice_id, amount, payment_date, created_at, tenant_id, branch_id, status)
       VALUES ($1, 10000, NULL, NULL, $2, $3, 'active')`,
      [invRes.rows[0].id, tenantA, branchA]
    );

    // Querying achievements for 2026-05 must execute cleanly without error
    const achieved = await salesTargetService.calculateAchievement({
      tenant_id: tenantA,
      branch_id: branchA,
      target_scope: 'branch',
      period: '2026-05'
    });
    // Undated payment of 10,000 is safely excluded, remaining 165,000
    assert.equal(achieved, 165000);
  });

  await t.test('19. Scope-Field Compatibility: Rejects target creation when required scope subject is missing', async () => {
    const actorAdmin = { id: 1, name: 'Admin', role: 'admin' };

    // Individual without user_id
    await assert.rejects(async () => {
      await salesTargetService.createTarget({
        tenant_id: tenantA,
        branch_id: branchA,
        target_scope: 'individual',
        period: '2026-07',
        target_amount: 50000
      }, actorAdmin);
    }, /Individual target requires a valid 'user_id'/);

    // Department without department_id
    await assert.rejects(async () => {
      await salesTargetService.createTarget({
        tenant_id: tenantA,
        branch_id: branchA,
        target_scope: 'department',
        period: '2026-07',
        target_amount: 50000
      }, actorAdmin);
    }, /Department target requires a valid 'department_id'/);

    // Branch without branch_id
    await assert.rejects(async () => {
      await salesTargetService.createTarget({
        tenant_id: tenantA,
        branch_id: null,
        target_scope: 'branch',
        period: '2026-07',
        target_amount: 50000
      }, actorAdmin);
    }, /Branch target requires a valid 'branch_id'/);
  });

  await t.test('20. Legacy Period Preservation: Pre-existing targets retain original string in legacy_period', async () => {
    const legacyTargets = await pool.query(
      `SELECT period, legacy_period FROM sales_targets WHERE legacy_period IS NOT NULL`
    );
    assert.ok(legacyTargets.rows.length >= 2, 'Migration 016 must have preserved legacy periods');
    const q3Row = legacyTargets.rows.find(r => r.legacy_period === 'Q3 2026');
    assert.ok(q3Row, 'Q3 2026 preserved in legacy_period');
    assert.equal(q3Row.period, '2026-Q3', 'Period normalized to 2026-Q3');

    const fyRow = legacyTargets.rows.find(r => r.legacy_period === 'FY 2026');
    assert.ok(fyRow, 'FY 2026 preserved in legacy_period');
    assert.equal(fyRow.period, '2026', 'Period normalized to 2026');
  });

  await t.test('21. Manager Role and Scope Rejections: Controller blocks unauthorized scope creations with 403', async () => {
    const salesController = require('../../controllers/salesController');

    function createMockReqRes(options) {
      let statusCode = 200;
      let responseData = null;
      const req = {
        user: options.user || {},
        branchId: options.branchId || null,
        query: options.query || {},
        params: options.params || {},
        body: options.body || {}
      };
      const res = {
        status(code) { statusCode = code; return this; },
        json(data) { responseData = data; return this; }
      };
      return { req, res, getStatus: () => statusCode, getData: () => responseData };
    }

    // Manager Tarek manages deptSales, NOT deptSupport
    const userMgr = { id: userManager, tenant_id: tenantA, role: 'manager', branch_id: branchA };

    // Case 1: Manager trying to create company target -> 403
    const mock1 = createMockReqRes({
      user: userMgr,
      body: { target_scope: 'company', period: '2026-08', target_amount: 1000000 }
    });
    await salesController.createTarget(mock1.req, mock1.res);
    assert.equal(mock1.getStatus(), 403, 'Manager cannot create company target');
    assert.match(mock1.getData().message, /Only tenant administrators can set company or branch targets/);

    // Case 2: Manager trying to create department target for deptSupport -> 403
    const mock2 = createMockReqRes({
      user: userMgr,
      body: { target_scope: 'department', department_id: deptSupport, period: '2026-08', target_amount: 100000 }
    });
    await salesController.createTarget(mock2.req, mock2.res);
    assert.equal(mock2.getStatus(), 403, 'Manager cannot set target for an unmanaged department');

    // Case 3: Manager trying to create individual target for Support Sara (outside deptSales) -> 403
    const mock3 = createMockReqRes({
      user: userMgr,
      body: { target_scope: 'individual', user_id: userOtherDept, period: '2026-08', target_amount: 50000 }
    });
    await salesController.createTarget(mock3.req, mock3.res);
    assert.equal(mock3.getStatus(), 403, 'Manager cannot set target for employee in unmanaged department');

    // Case 4: Manager successfully sets target for Rep Ahmed in deptSales -> 201
    const mock4 = createMockReqRes({
      user: userMgr,
      body: { target_scope: 'individual', user_id: userRepA, period: '2026-08', target_amount: 120000 }
    });
    await salesController.createTarget(mock4.req, mock4.res);
    assert.equal(mock4.getStatus(), 201, 'Manager successfully sets target for subordinate in managed department');
  });
});
