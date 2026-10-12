/**
 * tests/integration/real_estate_targets_phase3.test.js
 *
 * Real Estate Targets & 3D Performance Engine Integration Test Suite (Real PostgreSQL)
 * Tests run against isolated test database specified in .env.test.
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
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_TEST,
  ssl: { rejectUnauthorized: false }
});

const reTargetService = require('../../services/reTargetService');

test('Phase 3: Real Estate Targets & 3D Performance Engine Suite', async (t) => {
  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  let branchCairo, branchAlex;
  let userRepA, userRepB, userManager;
  let testUnit1, testUnit2;

  t.before(async () => {
    // 1. Ensure Migration 018 is applied
    const mig018 = fs.readFileSync('migrations/018_real_estate_targets.sql', 'utf8');
    await pool.query(mig018);

    // 2. Seed Tenants with template_name = 'real_estate'
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, template_name)
       VALUES ($1, 'RE Tenant Alpha', $3, 'enterprise', 'active', 'real_estate'),
              ($2, 'RE Tenant Beta', $4, 'enterprise', 'active', 'real_estate')
       ON CONFLICT (id) DO UPDATE SET template_name = 'real_estate'`,
      [tenantA, tenantB, `re-alpha-${tenantA.slice(0, 8)}`, `re-beta-${tenantB.slice(0, 8)}`]
    );

    // 3. Seed Branches
    const brRes = await pool.query(
      `INSERT INTO branches (id, name, tenant_id, timezone)
       VALUES (gen_random_uuid(), 'RE Branch Cairo', $1, 'Africa/Cairo'),
              (gen_random_uuid(), 'RE Branch Alex', $1, 'Africa/Cairo')
       RETURNING id, name`,
      [tenantA]
    );
    branchCairo = brRes.rows.find(b => b.name === 'RE Branch Cairo').id;
    branchAlex = brRes.rows.find(b => b.name === 'RE Branch Alex').id;

    // 4. Seed Users
    const uRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, tenant_id, is_working)
       VALUES ('RE Rep Alpha', 're-repA@test.com', 'hashed', 'sales', $1, true),
              ('RE Rep Beta', 're-repB@test.com', 'hashed', 'sales', $1, true),
              ('RE Sales Manager', 're-mgr@test.com', 'hashed', 'manager', $1, true)
       RETURNING id, name`,
      [tenantA]
    );
    userRepA = uRes.rows.find(u => u.name === 'RE Rep Alpha').id;
    userRepB = uRes.rows.find(u => u.name === 'RE Rep Beta').id;
    userManager = uRes.rows.find(u => u.name === 'RE Sales Manager').id;

    // 5. Seed Units
    const unitRes = await pool.query(
      `INSERT INTO re_units (name, project_name, unit_number, type, price, status, tenant_id, branch_id, assigned_to)
       VALUES ('Chalet 101', 'Palm Hills', 'PH-101', 'Chalet', 5000000, 'Available', $1, $2, $3),
              ('Villa 202', 'Palm Hills', 'PH-202', 'Villa', 15000000, 'Reserved', $1, $2, $3)
       RETURNING id, unit_number`,
      [tenantA, branchCairo, userRepA]
    );
    testUnit1 = unitRes.rows.find(u => u.unit_number === 'PH-101').id;
    testUnit2 = unitRes.rows.find(u => u.unit_number === 'PH-202').id;
  });

  t.after(async () => {
    await pool.query('DELETE FROM re_cancellations WHERE tenant_id::text = $1::text', [tenantA]);
    await pool.query('DELETE FROM re_installments WHERE tenant_id::text = $1::text', [tenantA]);
    await pool.query('DELETE FROM re_contracts WHERE tenant_id::text = $1::text', [tenantA]);
    await pool.query('DELETE FROM deals WHERE tenant_id::text = $1::text', [tenantA]);
    await pool.query('DELETE FROM re_units WHERE tenant_id::text = $1::text', [tenantA]);
    await pool.query('DELETE FROM re_targets WHERE tenant_id::text = $1::text', [tenantA]);
    await pool.query('DELETE FROM users WHERE tenant_id::text IN ($1::text, $2::text)', [tenantA, tenantB]);
    await pool.query('DELETE FROM branches WHERE tenant_id::text IN ($1::text, $2::text)', [tenantA, tenantB]);
    await pool.query('DELETE FROM tenants WHERE id IN ($1, $2)', [tenantA, tenantB]);
    await pool.end();
  });

  // ── 1. Target creation and duplicate prevention ──
  await t.test('1. Target creation and duplicate prevention', async () => {
    const target = await reTargetService.createTarget({
      tenant_id: tenantA,
      branch_id: branchCairo,
      user_id: userRepA,
      target_scope: 'individual',
      period: '2026-Q3',
      target_amount: 20000000,
      target_units: 5,
      commission_rate: 2.5
    }, { id: userManager });

    assert.ok(target.id);
    assert.equal(parseFloat(target.target_amount), 20000000);
    assert.equal(target.target_units, 5);
    assert.equal(target.period, '2026-Q3');

    // Duplicate creation must reject with 409 Conflict
    await assert.rejects(
      async () => {
        await reTargetService.createTarget({
          tenant_id: tenantA,
          branch_id: branchCairo,
          user_id: userRepA,
          target_scope: 'individual',
          period: '2026-Q3',
          target_amount: 15000000
        }, { id: userManager });
      },
      (err) => err.statusCode === 409
    );
  });

  // ── 2. Time periods support (monthly, quarterly, yearly) with Cairo bounds ──
  await t.test('2. Time periods support (monthly, quarterly, yearly) with Cairo bounds', async () => {
    const mBounds = reTargetService.resolvePeriodBounds('2026-10');
    assert.equal(mBounds.periodType, 'monthly');
    assert.equal(mBounds.startLocal, '2026-10-01 00:00:00');
    assert.equal(mBounds.endLocal, '2026-11-01 00:00:00');

    const qBounds = reTargetService.resolvePeriodBounds('Q3 2026');
    assert.equal(qBounds.normalizedPeriod, '2026-Q3');
    assert.equal(qBounds.periodType, 'quarterly');
    assert.equal(qBounds.startLocal, '2026-07-01 00:00:00');
    assert.equal(qBounds.endLocal, '2026-10-01 00:00:00');

    const yBounds = reTargetService.resolvePeriodBounds('FY 2026');
    assert.equal(yBounds.normalizedPeriod, '2026');
    assert.equal(yBounds.periodType, 'yearly');
    assert.equal(yBounds.startLocal, '2026-01-01 00:00:00');
    assert.equal(yBounds.endLocal, '2027-01-01 00:00:00');
  });

  // ── 3. 3D Metrics: Contracted Value, Units Count, and Cash Collections ──
  await t.test('3. 3D Metrics: Contracted Value, Units Count, and Cash Collections are independent', async () => {
    // A. Create Deal assigned to Rep A
    const dealRes = await pool.query(`
      INSERT INTO deals (title, value, pipeline_stage, assigned_to, unit_id, tenant_id, branch_id)
      VALUES ('Chalet Deal 101', 5000000, 'won', $1, $2, $3, $4)
      RETURNING id
    `, [String(userRepA), testUnit1, tenantA, branchCairo]);
    const dealId = dealRes.rows[0].id;

    // B. Create signed Contract in 2026-Q3 (dated 2026-08-15)
    // Contract Value = 5,000,000 EGP, contractual down payment = 500,000 EGP
    const cRes = await pool.query(`
      INSERT INTO re_contracts (contract_number, deal_id, unit_id, contract_date, contract_value, down_payment, status, tenant_id, branch_id)
      VALUES ('CON-PH-101', $1, $2, '2026-08-15', 5000000, 500000, 'Signed', $3, $4)
      RETURNING id
    `, [dealId, testUnit1, tenantA, branchCairo]);
    const contractId = cRes.rows[0].id;

    // C. Verify Zero Ghost Collections: Before any cash is paid, achieved_collected_amount MUST be 0!
    // Contractual down payment on re_contracts is NOT considered collected until actually paid!
    const prePayTargets = await reTargetService.getTargetsWithProgress({
      tenant_id: tenantA,
      user_id: userRepA,
      period: '2026-Q3'
    });
    assert.equal(parseFloat(prePayTargets[0].achieved_collected_amount), 0, 'Zero ghost collections before payment');

    // D. Record Actual Down Payment via installment #0 (installment_type = down_payment)
    await pool.query(`
      INSERT INTO re_installments (
        contract_id, installment_number, installment_type, amount, paid_amount, status, due_date, paid_at, tenant_id, branch_id
      ) VALUES ($1, 0, 'down_payment', 500000, 500000, 'Paid', '2026-08-15', '2026-08-15 11:30:00+03', $2, $3)
    `, [contractId, tenantA, branchCairo]);

    // E. Record Partially Paid installment (amount 200,000, paid 150,000, status = 'Partially Paid')
    await pool.query(`
      INSERT INTO re_installments (
        contract_id, installment_number, installment_type, amount, paid_amount, status, due_date, paid_at, tenant_id, branch_id
      ) VALUES ($1, 1, 'installment', 200000, 150000, 'Partially Paid', '2026-09-01', '2026-09-05 14:00:00+03', $2, $3)
    `, [contractId, tenantA, branchCairo]);

    // F. Query Targets with Progress
    const targets = await reTargetService.getTargetsWithProgress({
      tenant_id: tenantA,
      user_id: userRepA,
      period: '2026-Q3'
    });

    assert.equal(targets.length, 1);
    const t = targets[0];

    // Metric 1: Contracted Value = 5,000,000 EGP
    assert.equal(parseFloat(t.achieved_contracts_value), 5000000);
    // 5M / 20M target = 25%
    assert.equal(parseFloat(t.contracts_achievement_pct), 25.0);

    // Metric 2: Units Count = 1 unit (Chalet 101)
    assert.equal(t.achieved_units_count, 1);
    // 1 / 5 units target = 20%
    assert.equal(parseFloat(t.units_achievement_pct), 20.0);

    // Metric 3: Cash Collected = 650,000 EGP (500k down payment + 150k partially paid installment)
    // Proves that contract value (5M) is NOT conflated with cash collected (650k)!
    // Proves down payment is not double counted, and Partially Paid installments are accurately included!
    assert.equal(parseFloat(t.achieved_collected_amount), 650000);
    assert.equal(parseFloat(t.down_payment_total), 500000);
    assert.equal(parseFloat(t.installments_paid_total), 150000);
  });

  // ── 4. Same-period cancellation excludes contract from active achievements ──
  await t.test('4. Same-period cancellation excludes contract from active achievements', async () => {
    // Create another deal and contract in 2026-Q3, then cancel it in 2026-Q3
    const dealRes = await pool.query(`
      INSERT INTO deals (title, value, pipeline_stage, assigned_to, tenant_id, branch_id)
      VALUES ('Cancelled Deal', 3000000, 'Lost', $1, $2, $3)
      RETURNING id
    `, [String(userRepA), tenantA, branchCairo]);
    const dealId = dealRes.rows[0].id;

    const cRes = await pool.query(`
      INSERT INTO re_contracts (contract_number, deal_id, contract_date, contract_value, down_payment, status, tenant_id, branch_id)
      VALUES ('CON-CANCELLED-1', $1, '2026-08-20', 3000000, 300000, 'Cancelled', $2, $3)
      RETURNING id
    `, [dealId, tenantA, branchCairo]);
    const cancelContractId = cRes.rows[0].id;

    // Record cancellation happening in same period (2026-08-25)
    await pool.query(`
      INSERT INTO re_cancellations (
        deal_id, contract_id, cancellation_reason, total_paid_amount, deduction_amount, refundable_amount,
        tenant_id, branch_id, created_at
      ) VALUES ($1, $2, 'Customer withdrawal', 0, 0, 0, $3, $4, '2026-08-25 10:00:00+03')
    `, [dealId, cancelContractId, tenantA, branchCairo]);

    // Query targets: achieved contracts value must still be 5,000,000 (not 8,000,000!)
    const targets = await reTargetService.getTargetsWithProgress({
      tenant_id: tenantA,
      user_id: userRepA,
      period: '2026-Q3'
    });

    assert.equal(parseFloat(targets[0].achieved_contracts_value), 5000000);
  });

  // ── 5. Salesman Performance Detail Drill-down Endpoint with Collections & Reservations ──
  await t.test('5. Salesman Performance Detail drill-down returns contracts, collections, and reservations', async () => {
    const detail = await reTargetService.getSalesmanPerformanceDetail({
      tenant_id: tenantA,
      user_id: userRepA,
      period: '2026-Q3'
    });

    assert.ok(detail.salesman);
    assert.equal(detail.salesman.id, userRepA);
    assert.equal(detail.summary.total_contract_value, 5000000);
    assert.equal(detail.summary.units_contracted_count, 1);
    assert.equal(detail.summary.total_collected_amount, 650000);
    assert.equal(detail.summary.total_down_payment, 500000);
    assert.equal(detail.summary.total_installments_collected, 150000);

    // Active reservations list includes Villa 202
    assert.equal(detail.summary.active_reservations_count, 1);
    assert.equal(detail.contracts.length, 1);
    assert.equal(detail.contracts[0].contract_number, 'CON-PH-101');
    assert.equal(detail.reservations[0].unit_number, 'PH-202');

    // Collections tab array: contains both down payment and partially paid installment
    assert.equal(detail.collections.length, 2);
    const dpCol = detail.collections.find(c => c.collection_type === 'down_payment');
    const instCol = detail.collections.find(c => c.collection_type === 'installment');

    assert.ok(dpCol, 'Down payment collection record exists');
    assert.equal(dpCol.amount, 500000);
    assert.equal(dpCol.collection_type_label, 'دفعة مقدمة');

    assert.ok(instCol, 'Installment collection record exists');
    assert.equal(instCol.amount, 150000);
    assert.equal(instCol.status, 'Partially Paid');
  });

  // ── 6. Subsequent-Period Cancellation & Closed Period Historical Integrity ──
  await t.test('6. Subsequent-Period Cancellation: Preserves closed historical period and applies settlement deduction', async () => {
    // A. Create target for Rep A in 2026-10 (October 2026)
    await reTargetService.createTarget({
      tenant_id: tenantA,
      branch_id: branchCairo,
      user_id: userRepA,
      target_scope: 'individual',
      period: '2026-10',
      target_amount: 5000000,
      target_units: 1
    }, { id: userManager });

    // B. Create contract signed in 2026-10 (October 2026)
    const octDeal = await pool.query(`
      INSERT INTO deals (title, value, pipeline_stage, assigned_to, tenant_id, branch_id)
      VALUES ('October Deal', 4000000, 'won', $1, $2, $3)
      RETURNING id
    `, [String(userRepA), tenantA, branchCairo]);
    const octDealId = octDeal.rows[0].id;

    const octContract = await pool.query(`
      INSERT INTO re_contracts (contract_number, deal_id, contract_date, contract_value, down_payment, status, tenant_id, branch_id)
      VALUES ('CON-OCT-101', $1, '2026-10-10', 4000000, 400000, 'Signed', $2, $3)
      RETURNING id
    `, [octDealId, tenantA, branchCairo]);
    const octContractId = octContract.rows[0].id;

    // Verify October progress before cancellation: 4M achieved
    const octProgress1 = await reTargetService.getTargetsWithProgress({
      tenant_id: tenantA,
      user_id: userRepA,
      period: '2026-10'
    });
    assert.equal(parseFloat(octProgress1[0].achieved_contracts_value), 4000000);

    // C. Create target for Rep A in 2026-11 (November 2026)
    await reTargetService.createTarget({
      tenant_id: tenantA,
      branch_id: branchCairo,
      user_id: userRepA,
      target_scope: 'individual',
      period: '2026-11',
      target_amount: 10000000,
      target_units: 2
    }, { id: userManager });

    // D. In November 2026, Rep A signs a new contract for 6,000,000 EGP
    const novDeal = await pool.query(`
      INSERT INTO deals (title, value, pipeline_stage, assigned_to, tenant_id, branch_id)
      VALUES ('November Deal', 6000000, 'won', $1, $2, $3)
      RETURNING id
    `, [String(userRepA), tenantA, branchCairo]);

    await pool.query(`
      INSERT INTO re_contracts (contract_number, deal_id, contract_date, contract_value, down_payment, status, tenant_id, branch_id)
      VALUES ('CON-NOV-201', $1, '2026-11-05', 6000000, 600000, 'Signed', $2, $3)
    `, [novDeal.rows[0].id, tenantA, branchCairo]);

    // E. On November 15, customer CANCELS the October contract (CON-OCT-101)
    // Update contract status to Cancelled and insert into re_cancellations in November!
    await pool.query(`UPDATE re_contracts SET status = 'Cancelled' WHERE id = $1`, [octContractId]);
    await pool.query(`
      INSERT INTO re_cancellations (
        deal_id, contract_id, cancellation_reason, total_paid_amount, deduction_amount, refundable_amount,
        tenant_id, branch_id, created_at
      ) VALUES ($1, $2, 'November cancellation of October contract', 400000, 50000, 350000, $3, $4, '2026-11-15 12:00:00+03')
    `, [octDealId, octContractId, tenantA, branchCairo]);

    // F. CRITICAL CHECK: Query closed October period:
    // Historical achievement of October 2026 must be PRESERVED (4M)! It must NOT silently drop to 0!
    const octProgress2 = await reTargetService.getTargetsWithProgress({
      tenant_id: tenantA,
      user_id: userRepA,
      period: '2026-10'
    });
    assert.equal(parseFloat(octProgress2[0].achieved_contracts_value), 4000000, 'Historical closed period is preserved');

    // G. CRITICAL CHECK: Query November period:
    // Gross = 6M, Prior Period Deduction = 4M, Net Achieved Value = 2M!
    const novProgress = await reTargetService.getTargetsWithProgress({
      tenant_id: tenantA,
      user_id: userRepA,
      period: '2026-11'
    });
    assert.equal(parseFloat(novProgress[0].gross_contracts_value), 6000000);
    assert.equal(parseFloat(novProgress[0].prior_cancellations_deduction_value), 4000000);
    assert.equal(parseFloat(novProgress[0].achieved_contracts_value), 2000000, 'Net contract value reflects prior period cancellation settlement');
    assert.equal(novProgress[0].prior_cancellations_count, 1);
  });

  // ── 7. Branch and Tenant Isolation ──
  await t.test('7. Branch and Tenant Isolation: Branch Alex target excludes Branch Cairo contracts', async () => {
    // Create target for Branch Alex
    const alexTarget = await reTargetService.createTarget({
      tenant_id: tenantA,
      branch_id: branchAlex,
      user_id: userRepB,
      target_scope: 'individual',
      period: '2026-Q3',
      target_amount: 10000000,
      target_units: 2
    }, { id: userManager });

    const alexProgress = await reTargetService.getTargetsWithProgress({
      tenant_id: tenantA,
      user_id: userRepB,
      period: '2026-Q3'
    });

    // Rep B has no deals in Cairo: achieved value must be 0!
    assert.equal(parseFloat(alexProgress[0].achieved_contracts_value), 0);
    assert.equal(alexProgress[0].achieved_units_count, 0);

    // Tenant B cannot see Tenant A targets
    const tBTargets = await reTargetService.getTargetsWithProgress({
      tenant_id: tenantB,
      period: '2026-Q3'
    });
    assert.equal(tBTargets.length, 0);
  });

  // ── 8. Complete Isolation: Zero touch on General Business sales_targets ──
  await t.test('8. Complete Isolation: Real estate targets do not touch general sales_targets', async () => {
    const genTargets = await pool.query('SELECT COUNT(*) FROM sales_targets WHERE tenant_id::text = $1::text', [tenantA]);
    assert.equal(parseInt(genTargets.rows[0].count), 0, 'Zero sales_targets created by Real Estate engine');
  });

  // ── 9. Direct Receipt Vouchers Scope, Isolation, and Cancellation Integrity ──
  await t.test('9. Direct Receipt Vouchers: Strict deal/contract link, period bounds, branch, rep, and cancellation isolation', async () => {
    // Target for Rep A in Cairo for 2026-12 (December 2026)
    await reTargetService.createTarget({
      tenant_id: tenantA,
      branch_id: branchCairo,
      user_id: userRepA,
      target_scope: 'individual',
      period: '2026-12',
      target_amount: 10000000,
      target_units: 2
    }, { id: userManager });

    // Create a Deal and Contract for Rep A in December
    const decDeal = await pool.query(`
      INSERT INTO deals (title, value, pipeline_stage, assigned_to, tenant_id, branch_id)
      VALUES ('December Deal Rep A', 8000000, 'won', $1, $2, $3)
      RETURNING id
    `, [String(userRepA), tenantA, branchCairo]);
    const decDealId = decDeal.rows[0].id;

    const decContract = await pool.query(`
      INSERT INTO re_contracts (contract_number, deal_id, contract_date, contract_value, down_payment, status, tenant_id, branch_id)
      VALUES ('CON-DEC-001', $1, '2026-12-05', 8000000, 800000, 'Signed', $2, $3)
      RETURNING id
    `, [decDealId, tenantA, branchCairo]);
    const decContractId = decContract.rows[0].id;

    // 1. Valid Direct Receipt Voucher for Rep A's contract in December (300,000 EGP)
    await pool.query(`
      INSERT INTO finance_vouchers (
        voucher_number, voucher_type, party_type, party_name, amount, contract_id, deal_id, status,
        voucher_date, tenant_id, branch_id
      ) VALUES ('VOUCH-DEC-VALID', 'receipt', 'customer', 'Customer Test', 300000, $1, $2, 'active', '2026-12-06', $3, $4)
    `, [decContractId, decDealId, tenantA, branchCairo]);

    // 2. Cancelled Direct Receipt Voucher (200,000 EGP) -> MUST NOT count!
    await pool.query(`
      INSERT INTO finance_vouchers (
        voucher_number, voucher_type, party_type, party_name, amount, contract_id, deal_id, status,
        voucher_date, tenant_id, branch_id
      ) VALUES ('VOUCH-DEC-CANCELLED', 'receipt', 'customer', 'Customer Test', 200000, $1, $2, 'cancelled', '2026-12-07', $3, $4)
    `, [decContractId, decDealId, tenantA, branchCairo]);

    // 3. Voucher from a DIFFERENT period (e.g. November 2026) -> MUST NOT count in December!
    await pool.query(`
      INSERT INTO finance_vouchers (
        voucher_number, voucher_type, party_type, party_name, amount, contract_id, deal_id, status,
        voucher_date, tenant_id, branch_id
      ) VALUES ('VOUCH-NOV-OLD', 'receipt', 'customer', 'Customer Test', 150000, $1, $2, 'active', '2026-11-20', $3, $4)
    `, [decContractId, decDealId, tenantA, branchCairo]);

    // 4. Voucher for a DIFFERENT salesman (Rep B in Alex) -> MUST NOT count for Rep A in Cairo!
    const repBDeal = await pool.query(`
      INSERT INTO deals (title, value, pipeline_stage, assigned_to, tenant_id, branch_id)
      VALUES ('Alex Deal Rep B', 5000000, 'won', $1, $2, $3)
      RETURNING id
    `, [String(userRepB), tenantA, branchAlex]);
    await pool.query(`
      INSERT INTO finance_vouchers (
        voucher_number, voucher_type, party_type, party_name, amount, deal_id, status,
        voucher_date, tenant_id, branch_id
      ) VALUES ('VOUCH-REPB-ALEX', 'receipt', 'customer', 'Customer Alex', 400000, $1, 'active', '2026-12-08', $2, $3)
    `, [repBDeal.rows[0].id, tenantA, branchAlex]);

    // 5. General business voucher linked to an invoice (not a deal/contract) -> MUST NOT count!
    await pool.query(`
      INSERT INTO finance_vouchers (
        voucher_number, voucher_type, party_type, party_name, amount, invoice_id, status,
        voucher_date, tenant_id, branch_id
      ) VALUES ('VOUCH-GEN-INVOICE', 'receipt', 'customer', 'General Client', 900000, 9999, 'active', '2026-12-09', $1, $2)
    `, [tenantA, branchCairo]);

    // Query Rep A's December progress:
    // Cash collected MUST be EXACTLY 300,000 EGP (the one valid active receipt voucher)!
    const decProgress = await reTargetService.getTargetsWithProgress({
      tenant_id: tenantA,
      user_id: userRepA,
      period: '2026-12'
    });

    assert.equal(parseFloat(decProgress[0].achieved_collected_amount), 300000, 'Only the valid, active, scoped direct voucher is collected');
    assert.equal(parseFloat(decProgress[0].down_payment_total), 300000);
    assert.equal(parseFloat(decProgress[0].installments_paid_total), 0);

    // Verify Performance drill-down returns this exact direct receipt
    const decDetail = await reTargetService.getSalesmanPerformanceDetail({
      tenant_id: tenantA,
      user_id: userRepA,
      period: '2026-12'
    });
    assert.equal(decDetail.collections.length, 1);
    assert.equal(decDetail.collections[0].reference_number, 'VOUCH-DEC-VALID');
    assert.equal(decDetail.collections[0].amount, 300000);
    assert.equal(decDetail.collections[0].collection_type, 'direct_receipt');
  });

  // ── 10. True Net Deficit Transparency (Unclamped) ──
  await t.test('10. True Net Deficit: When prior cancellations exceed new contracts, system exposes exact deficit without masking', async () => {
    // Create target for Rep B for 2026-10 (October 2026)
    await reTargetService.createTarget({
      tenant_id: tenantA,
      branch_id: branchAlex,
      user_id: userRepB,
      target_scope: 'individual',
      period: '2026-10',
      target_amount: 5000000,
      target_units: 1
    }, { id: userManager });

    // Rep B signed a contract of 5,000,000 in October
    const repBOctDeal = await pool.query(`
      INSERT INTO deals (title, value, pipeline_stage, assigned_to, tenant_id, branch_id)
      VALUES ('Alex Oct Deal', 5000000, 'won', $1, $2, $3)
      RETURNING id
    `, [String(userRepB), tenantA, branchAlex]);
    const repBOctContract = await pool.query(`
      INSERT INTO re_contracts (contract_number, deal_id, contract_date, contract_value, status, tenant_id, branch_id)
      VALUES ('CON-ALEX-OCT', $1, '2026-10-15', 5000000, 'Signed', $2, $3)
      RETURNING id
    `, [repBOctDeal.rows[0].id, tenantA, branchAlex]);

    // Rep B creates target for November 2026
    await reTargetService.createTarget({
      tenant_id: tenantA,
      branch_id: branchAlex,
      user_id: userRepB,
      target_scope: 'individual',
      period: '2026-11',
      target_amount: 10000000,
      target_units: 2
    }, { id: userManager });

    // In November, Rep B signs a SMALL contract of only 2,000,000 EGP
    const repBNovDeal = await pool.query(`
      INSERT INTO deals (title, value, pipeline_stage, assigned_to, tenant_id, branch_id)
      VALUES ('Alex Nov Deal', 2000000, 'won', $1, $2, $3)
      RETURNING id
    `, [String(userRepB), tenantA, branchAlex]);
    await pool.query(`
      INSERT INTO re_contracts (contract_number, deal_id, contract_date, contract_value, status, tenant_id, branch_id)
      VALUES ('CON-ALEX-NOV', $1, '2026-11-02', 2000000, 'Signed', $2, $3)
    `, [repBNovDeal.rows[0].id, tenantA, branchAlex]);

    // On November 20, the October contract of 5,000,000 is CANCELLED!
    await pool.query(`UPDATE re_contracts SET status = 'Cancelled' WHERE id = $1`, [repBOctContract.rows[0].id]);
    await pool.query(`
      INSERT INTO re_cancellations (
        deal_id, contract_id, cancellation_reason, total_paid_amount, deduction_amount, refundable_amount,
        tenant_id, branch_id, created_at
      ) VALUES ($1, $2, 'Cancellation exceeding new sales', 0, 0, 0, $3, $4, '2026-11-20 15:00:00+03')
    `, [repBOctDeal.rows[0].id, repBOctContract.rows[0].id, tenantA, branchAlex]);

    // Query November progress:
    // Gross = 2M, Prior Deduction = 5M -> Net = -3,000,000 EGP!
    // The system MUST NOT clamp to 0; it must expose the true business deficit!
    const repBNovProgress = await reTargetService.getTargetsWithProgress({
      tenant_id: tenantA,
      user_id: userRepB,
      period: '2026-11'
    });

    assert.equal(parseFloat(repBNovProgress[0].gross_contracts_value), 2000000);
    assert.equal(parseFloat(repBNovProgress[0].prior_cancellations_deduction_value), 5000000);
    assert.equal(parseFloat(repBNovProgress[0].achieved_contracts_value), -3000000, 'Net deficit is transparently exposed');
    assert.equal(parseFloat(repBNovProgress[0].contracts_achievement_pct), -30.0, 'Achievement percentage reflects exact negative deficit');

    // Performance detail drill-down also reflects exact negative net value
    const repBNovDetail = await reTargetService.getSalesmanPerformanceDetail({
      tenant_id: tenantA,
      user_id: userRepB,
      period: '2026-11'
    });
    assert.equal(repBNovDetail.summary.total_contract_value, -3000000);
    assert.equal(repBNovDetail.summary.prior_cancellations_deduction_value, 5000000);
  });
});
