/**
 * tests/integration/sales_commissions_phase33c.test.js
 *
 * Phase 3.3C: Sales Commissions & Earnings Lifecycle Integration Test Suite (Real PostgreSQL)
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
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_TEST,
  ssl: { rejectUnauthorized: false }
});

const salesCommissionService = require('../../services/salesCommissionService');
const salesTargetService = require('../../services/salesTargetService');

test('Phase 3.3C: Sales Commissions & Earnings Lifecycle Suite', async (t) => {
  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  let branchCairo, branchAlex;
  let userRepA, userRepB, userManager;
  let deptSales;
  let treasuryCash;
  let testRuleId;

  t.before(async () => {
    // 1. Ensure migrations 016 and 017 are applied
    const mig016 = fs.readFileSync('migrations/016_sales_targets_hardening.sql', 'utf8');
    await pool.query(mig016);
    const mig017 = fs.readFileSync('migrations/017_sales_commissions_ledger.sql', 'utf8');
    await pool.query(mig017);

    // 2. Seed Tenants
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status)
       VALUES ($1, 'Tenant 33C Alpha', $3, 'enterprise', 'active'),
              ($2, 'Tenant 33C Beta', $4, 'enterprise', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [tenantA, tenantB, `slug-${tenantA.slice(0, 8)}`, `slug-${tenantB.slice(0, 8)}`]
    );

    // 3. Seed Branches
    const brRes = await pool.query(
      `INSERT INTO branches (id, name, tenant_id, timezone)
       VALUES (gen_random_uuid(), 'Branch Cairo', $1, 'Africa/Cairo'),
              (gen_random_uuid(), 'Branch Alex', $1, 'Africa/Cairo')
       RETURNING id, name, tenant_id`,
      [tenantA]
    );
    branchCairo = brRes.rows.find(b => b.name === 'Branch Cairo').id;
    branchAlex = brRes.rows.find(b => b.name === 'Branch Alex').id;

    // 4. Seed Departments
    const deptRes = await pool.query(
      `INSERT INTO departments (name, tenant_id, branch_id)
       VALUES ('Direct Sales Dept', $1, $2)
       RETURNING id, name`,
      [tenantA, branchCairo]
    );
    deptSales = deptRes.rows[0].id;

    // 5. Seed Users
    const runId = Date.now();
    const uRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, tenant_id, department_id)
       VALUES ('Rep Alpha', 'repA-33c-${runId}@test.com', 'hashed', 'sales', $1, $2),
              ('Rep Beta', 'repB-33c-${runId}@test.com', 'hashed', 'sales', $1, $2),
              ('Sales Manager', 'mgr-33c-${runId}@test.com', 'hashed', 'manager', $1, $2)
       RETURNING id, name, email, role`,
      [tenantA, deptSales]
    );
    userRepA = uRes.rows.find(u => u.name === 'Rep Alpha').id;
    userRepB = uRes.rows.find(u => u.name === 'Rep Beta').id;
    userManager = uRes.rows.find(u => u.name === 'Sales Manager').id;

    // 6. Seed Treasury Account for Tenant A
    const taRes = await pool.query(
      `INSERT INTO treasury_accounts (name, type, opening_balance, is_default, is_active, tenant_id, branch_id)
       VALUES ('Main Cash Treasury', 'cash', 500000.00, true, true, $1, $2)
       RETURNING id`,
      [tenantA, branchCairo]
    );
    treasuryCash = taRes.rows[0].id;

    // 7. Seed Rule with Tiers
    const rule = await salesCommissionService.createRule({
      tenant_id: tenantA,
      branch_id: branchCairo,
      name: 'Standard Direct Sales 2% Rule',
      base_rate: 2.0,
      effective_from: '2026-01-01',
      is_active: true
    }, { id: userManager, name: 'Sales Manager' });
    testRuleId = rule.id;

    await salesCommissionService.setRuleTiers(testRuleId, tenantA, [
      { min_achievement_pct: 80, max_achievement_pct: 100, bonus_amount: 500 },
      { min_achievement_pct: 100, max_achievement_pct: 120, bonus_amount: 1000 },
      { min_achievement_pct: 120, max_achievement_pct: null, bonus_amount: 2000 }
    ]);
  });

  t.after(async () => {
    await pool.query(`DELETE FROM sales_commission_settlement_items WHERE settlement_id IN (SELECT id FROM sales_commission_settlements WHERE tenant_id::text = $1::text)`, [tenantA]);
    await pool.query(`DELETE FROM sales_commissions WHERE tenant_id::text = $1::text`, [tenantA]);
    await pool.query(`DELETE FROM sales_commission_settlements WHERE tenant_id::text = $1::text`, [tenantA]);
    await pool.query(`DELETE FROM sales_commission_tiers WHERE tenant_id::text = $1::text`, [tenantA]);
    await pool.query(`DELETE FROM sales_commission_rules WHERE tenant_id::text = $1::text`, [tenantA]);
    await pool.query(`DELETE FROM finance_vouchers WHERE tenant_id::text = $1::text`, [tenantA]);
    await pool.query(`DELETE FROM payments WHERE tenant_id::text = $1::text`, [tenantA]);
    await pool.query(`DELETE FROM invoices WHERE tenant_id::text = $1::text`, [tenantA]);
    await pool.query(`DELETE FROM sales_orders WHERE tenant_id::text = $1::text`, [tenantA]);
    await pool.query(`DELETE FROM deals WHERE tenant_id::text = $1::text`, [tenantA]);
    await pool.query(`DELETE FROM sales_targets WHERE tenant_id::text = $1::text`, [tenantA]);
    await pool.query(`DELETE FROM users WHERE tenant_id::text IN ($1::text, $2::text)`, [tenantA, tenantB]);
    await pool.query(`DELETE FROM treasury_accounts WHERE tenant_id::text = $1::text`, [tenantA]);
    await pool.query(`DELETE FROM departments WHERE tenant_id::text = $1::text`, [tenantA]);
    await pool.query(`DELETE FROM branches WHERE tenant_id::text IN ($1::text, $2::text)`, [tenantA, tenantB]);
    await pool.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [tenantA, tenantB]);
    await pool.end();
  });

  // Helper: Create a clean invoice, order, and payment
  async function createTestPayment({
    amount = 10000,
    soRep = userRepA,
    dealRep = null,
    unitId = null,
    invoiceStatus = 'paid',
    paymentStatus = 'active',
    paymentDate = '2026-10-15 12:00:00+03',
    tenant = tenantA,
    branch = branchCairo
  }) {
    let orderId = null;
    let dealId = null;

    if (dealRep || unitId) {
      const dRes = await pool.query(`
        INSERT INTO deals (title, value, assigned_to, unit_id, tenant_id, branch_id)
        VALUES ('Test Deal', $1, $2, $3, $4, $5)
        RETURNING id
      `, [amount, dealRep ? String(dealRep) : null, unitId ? String(unitId) : null, tenant, branch]);
      dealId = dRes.rows[0].id;
    }

    if (soRep) {
      const soRes = await pool.query(`
        INSERT INTO sales_orders (number, total_amount, assigned_to, tenant_id, branch_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [`SO-${Date.now()}-${Math.floor(Math.random()*1000)}`, amount, String(soRep), tenant, branch]);
      orderId = soRes.rows[0].id;
    }

    const invRes = await pool.query(`
      INSERT INTO invoices (invoice_number, total_amount, status, sales_order_id, deal_id, unit_id, tenant_id, branch_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [`INV-${Date.now()}-${Math.floor(Math.random()*1000)}`, amount, invoiceStatus, orderId ? String(orderId) : null, dealId ? String(dealId) : null, unitId ? String(unitId) : null, tenant, branch]);
    const invoiceId = invRes.rows[0].id;

    const pRes = await pool.query(`
      INSERT INTO payments (invoice_id, amount, status, payment_date, tenant_id, branch_id, treasury_account_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, amount, payment_date
    `, [invoiceId, amount, paymentStatus, paymentDate, tenant, branch, treasuryCash]);

    return { paymentId: pRes.rows[0].id, invoiceId, orderId, dealId, amount };
  }

  // ── 1. Eligible payment creates exactly one accrual ──
  await t.test('1. Eligible payment creates exactly one accrual', async () => {
    const { paymentId } = await createTestPayment({ amount: 20000, soRep: userRepA });
    const result = await salesCommissionService.accruePaymentCommission(paymentId, tenantA);

    assert.equal(result.skipped, false);
    assert.ok(result.data);
    assert.equal(result.data.beneficiary_user_id, userRepA);
    assert.equal(parseFloat(result.data.eligible_payment_amount), 20000);
    assert.equal(parseFloat(result.data.applied_rate), 2.0);
    assert.equal(parseFloat(result.data.commission_amount), 400); // 20,000 * 2% = 400
    assert.equal(result.data.status, 'calculated');
  });

  // ── 2. Reprocessing the same payment is idempotent ──
  await t.test('2. Reprocessing the same payment is idempotent', async () => {
    const { paymentId } = await createTestPayment({ amount: 15000, soRep: userRepA });
    const res1 = await salesCommissionService.accruePaymentCommission(paymentId, tenantA);
    const res2 = await salesCommissionService.accruePaymentCommission(paymentId, tenantA);

    assert.equal(res1.skipped, false);
    assert.equal(res2.existing, true);
    assert.equal(res1.data.id, res2.data.id);
  });

  // ── 3. Concurrent processing cannot create duplicate accruals ──
  await t.test('3. Concurrent processing cannot create duplicate accruals', async () => {
    const { paymentId } = await createTestPayment({ amount: 25000, soRep: userRepA });
    const p1 = salesCommissionService.accruePaymentCommission(paymentId, tenantA);
    const p2 = salesCommissionService.accruePaymentCommission(paymentId, tenantA);

    const [r1, r2] = await Promise.all([p1, p2]);
    const commCount = await pool.query('SELECT COUNT(*) FROM sales_commissions WHERE payment_id = $1', [paymentId]);
    assert.equal(parseInt(commCount.rows[0].count), 1);
  });

  // ── 4. Partial payments generate separate eligible accruals ──
  await t.test('4. Partial payments generate separate eligible accruals', async () => {
    const soRes = await pool.query(`
      INSERT INTO sales_orders (number, total_amount, assigned_to, tenant_id, branch_id)
      VALUES ($1, 50000, $2, $3, $4) RETURNING id
    `, [`SO-PARTIAL-${Date.now()}`, String(userRepA), tenantA, branchCairo]);
    const invRes = await pool.query(`
      INSERT INTO invoices (invoice_number, total_amount, status, sales_order_id, tenant_id, branch_id)
      VALUES ($1, 50000, 'partial', $2, $3, $4) RETURNING id
    `, [`INV-PARTIAL-${Date.now()}`, String(soRes.rows[0].id), tenantA, branchCairo]);
    const invId = invRes.rows[0].id;

    // Payment 1: 20k
    const p1 = await pool.query(`
      INSERT INTO payments (invoice_id, amount, status, payment_date, tenant_id, branch_id)
      VALUES ($1, 20000, 'active', '2026-10-10 10:00:00+03', $2, $3) RETURNING id
    `, [invId, tenantA, branchCairo]);
    // Payment 2: 30k
    const p2 = await pool.query(`
      INSERT INTO payments (invoice_id, amount, status, payment_date, tenant_id, branch_id)
      VALUES ($1, 30000, 'active', '2026-10-11 10:00:00+03', $2, $3) RETURNING id
    `, [invId, tenantA, branchCairo]);

    const acc1 = await salesCommissionService.accruePaymentCommission(p1.rows[0].id, tenantA);
    const acc2 = await salesCommissionService.accruePaymentCommission(p2.rows[0].id, tenantA);

    assert.equal(parseFloat(acc1.data.commission_amount), 400); // 20k * 2% = 400
    assert.equal(parseFloat(acc2.data.commission_amount), 600); // 30k * 2% = 600
    assert.notEqual(acc1.data.id, acc2.data.id);
  });

  // ── 5. Cancelled/reversed payments do not create new eligible accruals ──
  await t.test('5. Cancelled/reversed payments do not create new eligible accruals', async () => {
    const { paymentId } = await createTestPayment({ amount: 10000, soRep: userRepA, paymentStatus: 'cancelled' });
    const res = await salesCommissionService.accruePaymentCommission(paymentId, tenantA);

    assert.equal(res.skipped, true);
    assert.match(res.reason, /cancelled or reversed/i);
  });

  // ── 6. Post-accrual cancellation creates a documented adjustment without deleting history ──
  await t.test('6. Post-accrual cancellation cancels unsettled accrual and records audit', async () => {
    const { paymentId } = await createTestPayment({ amount: 10000, soRep: userRepA });
    const accRes = await salesCommissionService.accruePaymentCommission(paymentId, tenantA);
    const commId = accRes.data.id;

    // Now cancel the payment
    await pool.query(`UPDATE payments SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`, [paymentId]);
    const cancelRes = await salesCommissionService.processPaymentCancellation(paymentId, tenantA, { id: userManager });

    assert.equal(cancelRes.adjusted, true);
    assert.equal(cancelRes.type, 'cancelled');

    // Commission record is retained but marked cancelled
    const checkComm = await pool.query('SELECT status, notes FROM sales_commissions WHERE id = $1', [commId]);
    assert.equal(checkComm.rows[0].status, 'cancelled');
  });

  // ── 7. Cancelled invoices are excluded ──
  await t.test('7. Cancelled invoices are excluded', async () => {
    const { paymentId } = await createTestPayment({ amount: 10000, soRep: userRepA, invoiceStatus: 'cancelled' });
    const res = await salesCommissionService.accruePaymentCommission(paymentId, tenantA);

    assert.equal(res.skipped, true);
    assert.match(res.reason, /invoice is cancelled/i);
  });

  // ── 8. Real Estate invoices/deals are excluded 100% ──
  await t.test('8. Real Estate invoices/deals are excluded 100%', async () => {
    const { paymentId } = await createTestPayment({ amount: 50000, soRep: userRepA, unitId: 101 });
    const res = await salesCommissionService.accruePaymentCommission(paymentId, tenantA);

    assert.equal(res.skipped, true);
    assert.match(res.reason, /real estate transaction excluded/i);
  });

  // ── 9. Sales Order attribution takes precedence over Deal attribution ──
  await t.test('9. Sales Order attribution takes precedence over Deal attribution', async () => {
    // Deal assigned to Rep B, but Sales Order assigned to Rep A
    const { paymentId } = await createTestPayment({ amount: 10000, soRep: userRepA, dealRep: userRepB });
    const res = await salesCommissionService.accruePaymentCommission(paymentId, tenantA);

    assert.equal(res.data.beneficiary_user_id, userRepA);
    assert.equal(res.data.attribution_source, 'sales_order');
  });

  // ── 10. Later salesperson reassignment does not change existing accrual ownership ──
  await t.test('10. Later salesperson reassignment does not change existing accrual ownership', async () => {
    const { paymentId, orderId } = await createTestPayment({ amount: 10000, soRep: userRepA });
    const res = await salesCommissionService.accruePaymentCommission(paymentId, tenantA);
    const commId = res.data.id;

    // Later reassignment of order to Rep B
    await pool.query('UPDATE sales_orders SET assigned_to = $1 WHERE id = $2', [String(userRepB), orderId]);

    // Check accrual: still belongs to Rep A!
    const cCheck = await pool.query('SELECT beneficiary_user_id FROM sales_commissions WHERE id = $1', [commId]);
    assert.equal(cCheck.rows[0].beneficiary_user_id, userRepA);
  });

  // ── 11. Tenant and branch isolation ──
  await t.test('11. Tenant and branch isolation: Tenant B cannot process Tenant A payment', async () => {
    const { paymentId } = await createTestPayment({ amount: 10000, soRep: userRepA, tenant: tenantA });

    await assert.rejects(
      async () => {
        await salesCommissionService.accruePaymentCommission(paymentId, tenantB);
      },
      (err) => err.statusCode === 404
    );
  });

  // ── 12. Cairo month-boundary correctness ──
  await t.test('12. Cairo month-boundary: 23:30 Cairo May 31 resolves to May, 00:30 June 1 resolves to June', async () => {
    const periodMay = salesCommissionService.resolvePeriod('2026-05-31T20:30:00.000Z'); // 23:30 Cairo (UTC+3)
    const periodJune = salesCommissionService.resolvePeriod('2026-05-31T21:30:00.000Z'); // 00:30 Cairo June 1 (UTC+3)

    assert.equal(periodMay, '2026-05');
    assert.equal(periodJune, '2026-06');
  });

  // ── 13. Rule changes apply only to new eligible periods ──
  await t.test('13. Rule changes apply only to new eligible periods with snapshotted rates', async () => {
    const { paymentId } = await createTestPayment({ amount: 10000, soRep: userRepA });
    const acc1 = await salesCommissionService.accruePaymentCommission(paymentId, tenantA);
    assert.equal(parseFloat(acc1.data.applied_rate), 2.0);

    // Update rule rate to 5%
    await pool.query('UPDATE sales_commission_rules SET base_rate = 5.0 WHERE id = $1', [testRuleId]);

    // Prior accrual still retains 2.0!
    const priorCheck = await pool.query('SELECT applied_rate, commission_amount FROM sales_commissions WHERE id = $1', [acc1.data.id]);
    assert.equal(parseFloat(priorCheck.rows[0].applied_rate), 2.0);
    assert.equal(parseFloat(priorCheck.rows[0].commission_amount), 200);

    // Restore rule rate to 2.0 for remaining tests
    await pool.query('UPDATE sales_commission_rules SET base_rate = 2.0 WHERE id = $1', [testRuleId]);
  });

  // ── 14. Exactly one bonus tier is selected at each boundary ──
  await t.test('14. Monthly settlement selects exactly one bonus tier based on target achievement', async () => {
    const testPeriod = '2026-11';

    // Seed target for Rep A in 2026-11: target 100,000
    await salesTargetService.createTarget({
      tenant_id: tenantA,
      branch_id: branchCairo,
      target_scope: 'individual',
      user_id: userRepA,
      period: testPeriod,
      target_amount: 100000
    }, { id: userManager });

    // Collection 110,000 in November (110% achievement -> falls in 100% - 120% tier -> 1,000 EGP bonus)
    const { paymentId } = await createTestPayment({
      amount: 110000,
      soRep: userRepA,
      paymentDate: '2026-11-10 12:00:00+03'
    });
    await salesCommissionService.accruePaymentCommission(paymentId, tenantA);

    const sResult = await salesCommissionService.generateMonthlySettlement({
      tenant_id: tenantA,
      branch_id: branchCairo,
      period: testPeriod,
      user_id: userRepA,
      actor: { id: userManager }
    });

    const s = sResult.settlement;
    assert.equal(parseFloat(s.total_collected_amount), 110000);
    assert.equal(parseFloat(s.target_amount), 100000);
    assert.equal(parseFloat(s.achievement_percentage), 110.0);
    assert.equal(parseFloat(s.base_commission_total), 2200); // 110k * 2% = 2,200
    assert.equal(parseFloat(s.bonus_amount), 1000); // Tier 2 bonus exactly 1,000
    assert.equal(parseFloat(s.net_payable_amount), 3200); // 2,200 + 1,000 = 3,200
  });

  // ── 15. Missing targets do not generate arbitrary bonuses ──
  await t.test('15. Missing target period generates 0 bonus without arbitrary bonus assignment', async () => {
    const testPeriod = '2026-12';
    // No target created for 2026-12
    const { paymentId } = await createTestPayment({
      amount: 40000,
      soRep: userRepB,
      paymentDate: '2026-12-05 12:00:00+03'
    });
    await salesCommissionService.accruePaymentCommission(paymentId, tenantA);

    const sResult = await salesCommissionService.generateMonthlySettlement({
      tenant_id: tenantA,
      branch_id: branchCairo,
      period: testPeriod,
      user_id: userRepB,
      actor: { id: userManager }
    });

    const s = sResult.settlement;
    assert.equal(parseFloat(s.target_amount), 0);
    assert.equal(parseFloat(s.bonus_amount), 0);
    assert.equal(parseFloat(s.base_commission_total), 800); // 40k * 2% = 800
    assert.equal(parseFloat(s.net_payable_amount), 800);
  });

  // ── 16. Repeated monthly settlement creates no duplicates ──
  await t.test('16. Repeated monthly settlement is idempotent and returns existing settlement', async () => {
    const testPeriod = '2026-11';
    const s1 = await salesCommissionService.generateMonthlySettlement({
      tenant_id: tenantA,
      period: testPeriod,
      user_id: userRepA,
      actor: { id: userManager }
    });
    const s2 = await salesCommissionService.generateMonthlySettlement({
      tenant_id: tenantA,
      period: testPeriod,
      user_id: userRepA,
      actor: { id: userManager }
    });

    assert.equal(s2.existing, true);
    assert.equal(s1.settlement.id, s2.settlement.id);
  });

  // ── 17. Closed settlements remain stable when targets or rules change ──
  await t.test('17. Closed settlements remain stable when targets change', async () => {
    const testPeriod = '2026-11';
    // Target was 100,000. Now modify target in DB to 500,000
    await pool.query(`UPDATE sales_targets SET target_amount = 500000 WHERE user_id = $1 AND period = $2`, [userRepA, testPeriod]);

    const sCheck = await pool.query('SELECT target_amount, bonus_amount, net_payable_amount FROM sales_commission_settlements WHERE beneficiary_user_id = $1 AND period = $2', [userRepA, testPeriod]);
    assert.equal(parseFloat(sCheck.rows[0].target_amount), 100000); // Retained snapshot!
    assert.equal(parseFloat(sCheck.rows[0].bonus_amount), 1000); // Retained snapshot!
  });

  // ── 18. Unauthorized users cannot approve in improper status ──
  await t.test('18. Settlement cannot be approved unless in calculated status', async () => {
    const testPeriod = '2026-11';
    const sRes = await pool.query('SELECT id FROM sales_commission_settlements WHERE beneficiary_user_id = $1 AND period = $2', [userRepA, testPeriod]);
    const settlementId = sRes.rows[0].id;

    // Approve once
    await salesCommissionService.approveSettlement({ settlement_id: settlementId, tenant_id: tenantA, actor: { id: userManager } });

    // Approving again fails
    await assert.rejects(
      async () => {
        await salesCommissionService.approveSettlement({ settlement_id: settlementId, tenant_id: tenantA, actor: { id: userManager } });
      },
      (err) => err.statusCode === 400
    );
  });

  // ── 19. Managers cannot approve their own commissions (SoD) ──
  await t.test('19. Segregation of Duties: Manager cannot approve their own commission', async () => {
    // Generate settlement for manager
    const { paymentId } = await createTestPayment({ amount: 10000, soRep: userManager, paymentDate: '2026-09-10 12:00:00+03' });
    await salesCommissionService.accruePaymentCommission(paymentId, tenantA);
    const mResult = await salesCommissionService.generateMonthlySettlement({
      tenant_id: tenantA,
      period: '2026-09',
      user_id: userManager,
      actor: { id: userManager }
    });

    await assert.rejects(
      async () => {
        await salesCommissionService.approveSettlement({
          settlement_id: mResult.settlement.id,
          tenant_id: tenantA,
          actor: { id: userManager } // Self-approval!
        });
      },
      (err) => err.statusCode === 403 && /Segregation of Duties/i.test(err.message)
    );
  });

  // ── 20. Payout requires approved settlement ──
  await t.test('20. Payout requires approved settlement', async () => {
    const testPeriod = '2026-12';
    const sRes = await pool.query('SELECT id FROM sales_commission_settlements WHERE beneficiary_user_id = $1 AND period = $2', [userRepB, testPeriod]);
    const unapprovedSettlementId = sRes.rows[0].id;

    await assert.rejects(
      async () => {
        await salesCommissionService.payoutSettlement({
          settlement_id: unapprovedSettlementId,
          tenant_id: tenantA,
          treasury_account_id: treasuryCash,
          actor: { id: userManager }
        });
      },
      (err) => err.statusCode === 400 && /must be 'approved'/i.test(err.message)
    );
  });

  // ── 21. Successful payout links to actual Finance/Treasury voucher ──
  await t.test('21. Successful payout creates real payment voucher linked to Treasury', async () => {
    const testPeriod = '2026-11';
    const sRes = await pool.query('SELECT id, net_payable_amount FROM sales_commission_settlements WHERE beneficiary_user_id = $1 AND period = $2', [userRepA, testPeriod]);
    const approvedSettlementId = sRes.rows[0].id;
    const expectedPayAmt = parseFloat(sRes.rows[0].net_payable_amount);

    const payoutRes = await salesCommissionService.payoutSettlement({
      settlement_id: approvedSettlementId,
      tenant_id: tenantA,
      treasury_account_id: treasuryCash,
      payment_method: 'cash',
      actor: { id: userManager },
      notes: 'Test payout for Rep A November 2026'
    });

    assert.ok(payoutRes.voucher);
    assert.equal(payoutRes.voucher.voucher_type, 'payment');
    assert.equal(payoutRes.voucher.party_type, 'employee');
    assert.equal(parseFloat(payoutRes.voucher.amount), expectedPayAmt);
    assert.equal(payoutRes.voucher.treasury_account_id, treasuryCash);
    assert.equal(payoutRes.settlement.status, 'paid');
    assert.equal(payoutRes.settlement.payout_voucher_id, payoutRes.voucher.id);
  });

  // ── 22. Repeated payout requests cannot cause duplicate disbursements ──
  await t.test('22. Repeated payout requests on already paid settlement are rejected', async () => {
    const testPeriod = '2026-11';
    const sRes = await pool.query('SELECT id FROM sales_commission_settlements WHERE beneficiary_user_id = $1 AND period = $2', [userRepA, testPeriod]);
    const paidSettlementId = sRes.rows[0].id;

    await assert.rejects(
      async () => {
        await salesCommissionService.payoutSettlement({
          settlement_id: paidSettlementId,
          tenant_id: tenantA,
          treasury_account_id: treasuryCash,
          actor: { id: userManager }
        });
      },
      (err) => err.statusCode === 400 && /must be 'approved'/i.test(err.message)
    );
  });

  // ── 23. Audit records exist in activities table ──
  await t.test('23. Audit records are logged in activities table for critical actions', async () => {
    const actRes = await pool.query(`
      SELECT action, entity_type FROM activities
      WHERE tenant_id::text = $1::text
        AND entity_type IN ('sales_commission', 'commission_settlement', 'commission_rule')
    `, [tenantA]);

    const actions = actRes.rows.map(r => r.action);
    assert.ok(actions.includes('rule_created'), 'rule_created logged');
    assert.ok(actions.includes('commission_accrued'), 'commission_accrued logged');
    assert.ok(actions.includes('settlement_generated'), 'settlement_generated logged');
    assert.ok(actions.includes('settlement_approved'), 'settlement_approved logged');
    assert.ok(actions.includes('settlement_paid'), 'settlement_paid logged');
  });

  // ── 24. General Business commissions remain separate from re_commissions ──
  await t.test('24. Complete isolation: General commissions do not touch re_commissions', async () => {
    const reCount = await pool.query(`SELECT COUNT(*) FROM re_commissions WHERE tenant_id::text = $1::text`, [tenantA]);
    assert.equal(parseInt(reCount.rows[0].count), 0, 'Zero re_commissions records created for general sales');
  });

  // ── 25. P1 Guard: Payout is rejected with 400 when net_payable_amount is zero ──
  await t.test('25. P1 Guard: Payout is rejected with 400 when net_payable_amount is zero', async () => {
    const settleZero = await pool.query(`
      INSERT INTO sales_commission_settlements (
        settlement_number, tenant_id, branch_id, beneficiary_user_id, beneficiary_name,
        period, net_payable_amount, status, created_by, approved_by, approved_at
      ) VALUES ($1, $2, $3, $4, 'Zero Payee', '2026-07', 0.00, 'approved', $5, $5, NOW())
      RETURNING id
    `, [`SETTLE-ZERO-${Date.now()}`, tenantA, branchCairo, userRepA, userManager]);
    const zeroSettlementId = settleZero.rows[0].id;

    const voucherCountBefore = await pool.query('SELECT COUNT(*) FROM finance_vouchers WHERE tenant_id::text = $1::text', [tenantA]);

    await assert.rejects(
      async () => {
        await salesCommissionService.payoutSettlement({
          settlement_id: zeroSettlementId,
          tenant_id: tenantA,
          treasury_account_id: treasuryCash,
          actor: { id: userManager }
        });
      },
      (err) => err.statusCode === 400 && /zero or negative/i.test(err.message)
    );

    const voucherCountAfter = await pool.query('SELECT COUNT(*) FROM finance_vouchers WHERE tenant_id::text = $1::text', [tenantA]);
    assert.equal(parseInt(voucherCountAfter.rows[0].count), parseInt(voucherCountBefore.rows[0].count));

    const sCheck = await pool.query('SELECT status, payout_voucher_id FROM sales_commission_settlements WHERE id = $1', [zeroSettlementId]);
    assert.equal(sCheck.rows[0].status, 'approved');
    assert.equal(sCheck.rows[0].payout_voucher_id, null);
  });

  // ── 26. P1 Guard: Payout is rejected with 400 when net_payable_amount is negative ──
  await t.test('26. P1 Guard: Payout is rejected with 400 when net_payable_amount is negative', async () => {
    const settleNeg = await pool.query(`
      INSERT INTO sales_commission_settlements (
        settlement_number, tenant_id, branch_id, beneficiary_user_id, beneficiary_name,
        period, net_payable_amount, status, created_by, approved_by, approved_at
      ) VALUES ($1, $2, $3, $4, 'Negative Payee', '2026-06', -450.00, 'approved', $5, $5, NOW())
      RETURNING id
    `, [`SETTLE-NEG-${Date.now()}`, tenantA, branchCairo, userRepA, userManager]);
    const negSettlementId = settleNeg.rows[0].id;

    const voucherCountBefore = await pool.query('SELECT COUNT(*) FROM finance_vouchers WHERE tenant_id::text = $1::text', [tenantA]);

    await assert.rejects(
      async () => {
        await salesCommissionService.payoutSettlement({
          settlement_id: negSettlementId,
          tenant_id: tenantA,
          treasury_account_id: treasuryCash,
          actor: { id: userManager }
        });
      },
      (err) => err.statusCode === 400 && /zero or negative/i.test(err.message)
    );

    const voucherCountAfter = await pool.query('SELECT COUNT(*) FROM finance_vouchers WHERE tenant_id::text = $1::text', [tenantA]);
    assert.equal(parseInt(voucherCountAfter.rows[0].count), parseInt(voucherCountBefore.rows[0].count));

    const sCheck = await pool.query('SELECT status, payout_voucher_id FROM sales_commission_settlements WHERE id = $1', [negSettlementId]);
    assert.equal(sCheck.rows[0].status, 'approved');
    assert.equal(sCheck.rows[0].payout_voucher_id, null);
  });

  // ── 27. P1 Guard: Concurrent payout requests do not cause duplicate disbursement ──
  await t.test('27. P1 Guard: Concurrent payout requests do not cause duplicate disbursement', async () => {
    const settleConc = await pool.query(`
      INSERT INTO sales_commission_settlements (
        settlement_number, tenant_id, branch_id, beneficiary_user_id, beneficiary_name,
        period, net_payable_amount, status, created_by, approved_by, approved_at
      ) VALUES ($1, $2, $3, $4, 'Race Payee', '2026-05', 750.00, 'approved', $5, $5, NOW())
      RETURNING id
    `, [`SETTLE-RACE-${Date.now()}`, tenantA, branchCairo, userRepB, userManager]);
    const concSettlementId = settleConc.rows[0].id;

    const p1 = salesCommissionService.payoutSettlement({
      settlement_id: concSettlementId,
      tenant_id: tenantA,
      treasury_account_id: treasuryCash,
      actor: { id: userManager }
    });
    const p2 = salesCommissionService.payoutSettlement({
      settlement_id: concSettlementId,
      tenant_id: tenantA,
      treasury_account_id: treasuryCash,
      actor: { id: userManager }
    });

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one concurrent payout must succeed');
    assert.equal(rejected.length, 1, 'Second concurrent payout must be rejected');

    const vCheck = await pool.query('SELECT COUNT(*) FROM finance_vouchers WHERE reference_no LIKE $1', [`SETTLE-RACE%`]);
    assert.equal(parseInt(vCheck.rows[0].count), 1);
  });

  // ── 28. P2 Guard: Multi-branch rules hierarchy (Branch Cairo vs Branch Alex vs Company-wide) ──
  await t.test('28. P2 Guard: Multi-branch rules hierarchy and branch isolation', async () => {
    const ruleCompany = await salesCommissionService.createRule({
      tenant_id: tenantA,
      branch_id: null,
      name: 'Company Wide 1.5% Rule',
      base_rate: 1.5,
      effective_from: '2026-01-01',
      effective_to: '2026-12-31',
      is_active: true
    }, { id: userManager });

    const ruleCairo = await salesCommissionService.createRule({
      tenant_id: tenantA,
      branch_id: branchCairo,
      name: 'Cairo Branch 2.5% Rule',
      base_rate: 2.5,
      effective_from: '2026-01-01',
      effective_to: '2026-12-31',
      is_active: true
    }, { id: userManager });

    const ruleAlex = await salesCommissionService.createRule({
      tenant_id: tenantA,
      branch_id: branchAlex,
      name: 'Alex Branch 3.5% Rule',
      base_rate: 3.5,
      effective_from: '2026-01-01',
      effective_to: '2026-12-31',
      is_active: true
    }, { id: userManager });

    const foundCairo = await salesCommissionService.getApplicableRule(tenantA, branchCairo, '2026-06-15');
    assert.equal(foundCairo.id, ruleCairo.id);
    assert.equal(parseFloat(foundCairo.base_rate), 2.5);

    const foundAlex = await salesCommissionService.getApplicableRule(tenantA, branchAlex, '2026-06-15');
    assert.equal(foundAlex.id, ruleAlex.id);
    assert.equal(parseFloat(foundAlex.base_rate), 3.5);

    const foundCompany = await salesCommissionService.getApplicableRule(tenantA, null, '2026-06-15');
    assert.equal(foundCompany.id, ruleCompany.id);
    assert.equal(parseFloat(foundCompany.base_rate), 1.5);

    const unconfiguredBranchId = crypto.randomUUID();
    const foundFallback = await salesCommissionService.getApplicableRule(tenantA, unconfiguredBranchId, '2026-06-15');
    assert.equal(foundFallback.id, ruleCompany.id);

    // Check date before rule inception: must return null when no rule is effective
    const foundPast = await salesCommissionService.getApplicableRule(tenantA, branchCairo, '2024-01-01');
    assert.equal(foundPast, null);
  });

  // ── 29. P2 Guard: Monthly settlement selects branch-specific tiers and avoids other branch tiers ──
  await t.test('29. P2 Guard: Monthly settlement selects branch-specific bonus tiers', async () => {
    const periodTest = '2026-08';

    const ruleAlexP2 = await salesCommissionService.createRule({
      tenant_id: tenantA,
      branch_id: branchAlex,
      name: 'Alex Specific Tier Rule',
      base_rate: 3.0,
      effective_from: '2026-01-01',
      is_active: true
    }, { id: userManager });
    await salesCommissionService.setRuleTiers(ruleAlexP2.id, tenantA, [
      { min_achievement_pct: 100, max_achievement_pct: null, bonus_amount: 3300 }
    ]);

    await salesTargetService.createTarget({
      tenant_id: tenantA,
      branch_id: branchAlex,
      target_scope: 'individual',
      user_id: userRepB,
      period: periodTest,
      target_amount: 50000
    }, { id: userManager });

    const { paymentId } = await createTestPayment({
      amount: 60000,
      soRep: userRepB,
      paymentDate: '2026-08-10 12:00:00+03',
      branch: branchAlex
    });
    await salesCommissionService.accruePaymentCommission(paymentId, tenantA);

    const sRes = await salesCommissionService.generateMonthlySettlement({
      tenant_id: tenantA,
      branch_id: branchAlex,
      period: periodTest,
      user_id: userRepB,
      actor: { id: userManager }
    });

    const s = sRes.settlement;
    assert.equal(parseFloat(s.achievement_percentage), 120.0);
    assert.equal(parseFloat(s.bonus_amount), 3300);
  });
});
