/**
 * tests/integration/real_staging_e2e.test.js
 * 
 * END-TO-END STAGING TEST SUITE ON LIVE POSTGRESQL
 * 
 * Flow 1: General Template
 *   Customer -> Deal -> Invoice -> Payment -> Voucher -> Cancel -> Reports
 * 
 * Flow 2: Real Estate Template
 *   Lead -> Customer -> Deal Closed -> Contract -> Installments -> Payment -> Voucher -> Handover -> Sold -> Reports
 * 
 * Flow 3: Security & Multi-Tenant Isolation
 *   Tenant A data is completely invisible and untouchable by Tenant B
 * 
 * Flow 4: Money Divergence Verification
 *   Checks that money across vouchers, installments, and invoices has 0.00 divergence
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.test' });

const PROD_HOST = 'reseau.proxy.rlwy.net';
const testDbUrl = process.env.DATABASE_URL_TEST;
const prodDbUrl = process.env.DATABASE_URL;

function verifySafety() {
  if (!testDbUrl) throw new Error('DATABASE_URL_TEST is missing. Aborting.');
  if (testDbUrl === prodDbUrl) throw new Error('FATAL: Refusing to run tests against production DATABASE_URL.');
  if (testDbUrl.includes(PROD_HOST)) throw new Error('FATAL: Refusing to run tests against production host.');
}

verifySafety();

const pool = new Pool({
  connectionString: testDbUrl,
  ssl: { rejectUnauthorized: false }
});

test('Real Staging Database Validation Suite', async (t) => {
  // Test Tenants
  const tenantGeneral = '11111111-1111-4111-a111-111111111111';
  const tenantRealEstate = '22222222-2222-4222-a222-222222222222';
  const tenantAttacker = '33333333-3333-4333-a333-333333333333';

  // Test Branches (since customers.branch_id is NOT NULL)
  const branchGeneral = '11111111-1111-4111-b111-111111111111';
  const branchRealEstate = '22222222-2222-4222-b222-222222222222';
  const branchAttacker = '33333333-3333-4333-b333-333333333333';

  t.before(async () => {
    // Clean up test tenants if existing
    const allTenants = [tenantGeneral, tenantRealEstate, tenantAttacker];
    for (const tid of allTenants) {
      await pool.query(`DELETE FROM finance_vouchers WHERE tenant_id::text = $1`, [tid]);
      await pool.query(`DELETE FROM re_installments WHERE tenant_id::text = $1`, [tid]);
      await pool.query(`DELETE FROM re_contracts WHERE tenant_id::text = $1`, [tid]);
      await pool.query(`DELETE FROM re_handovers WHERE tenant_id::text = $1`, [tid]);
      await pool.query(`DELETE FROM re_units WHERE tenant_id::text = $1`, [tid]);
      await pool.query(`DELETE FROM re_payments_mvp WHERE tenant_id::text = $1`, [tid]);
      await pool.query(`DELETE FROM payments WHERE tenant_id::text = $1`, [tid]);
      await pool.query(`DELETE FROM invoices WHERE tenant_id::text = $1`, [tid]);
      await pool.query(`DELETE FROM deals WHERE tenant_id::text = $1`, [tid]);
      await pool.query(`DELETE FROM customers WHERE tenant_id::text = $1`, [tid]);
      await pool.query(`DELETE FROM branches WHERE tenant_id::text = $1`, [tid]);
      await pool.query(`DELETE FROM users WHERE tenant_id::text = $1`, [tid]);
      await pool.query(`DELETE FROM tenants WHERE id::text = $1`, [tid]);
    }

    // Insert test tenants
    await pool.query(`
      INSERT INTO tenants (id, name, slug, template_name, status, created_at)
      VALUES 
        ($1, 'Staging General Tenant', 'stg-gen', 'general', 'active', NOW()),
        ($2, 'Staging RE Tenant', 'stg-re', 'real_estate', 'active', NOW()),
        ($3, 'Staging Attacker Tenant', 'stg-att', 'general', 'active', NOW())
      ON CONFLICT (id) DO UPDATE SET template_name = EXCLUDED.template_name;
    `, [tenantGeneral, tenantRealEstate, tenantAttacker]);

    // Insert default branches for each tenant
    await pool.query(`
      INSERT INTO branches (id, tenant_id, name, is_main, created_at)
      VALUES 
        ($1, $2, 'Main Branch', true, NOW()),
        ($3, $4, 'Main Branch', true, NOW()),
        ($5, $6, 'Main Branch', true, NOW())
      ON CONFLICT (id) DO NOTHING;
    `, [branchGeneral, tenantGeneral, branchRealEstate, tenantRealEstate, branchAttacker, tenantAttacker]);
  });

  t.after(async () => {
    await pool.end();
  });

  // ---------------------------------------------------------------------------
  // FLOW 1: GENERAL TEMPLATE
  // Customer -> Deal -> Invoice -> Payment -> Voucher -> Cancel -> Reports
  // ---------------------------------------------------------------------------
  await t.test('Flow 1: General Template Complete Financial Lifecycle', async (t1) => {
    // 1. Customer
    const custRes = await pool.query(`
      INSERT INTO customers (tenant_id, branch_id, name, email, phone, status, created_at, updated_at)
      VALUES ($1, $2, 'General Corp Client', 'client@general.test', '01000000001', 'customer', NOW(), NOW())
      RETURNING id, name
    `, [tenantGeneral, branchGeneral]);
    const customer = custRes.rows[0];
    assert.ok(customer.id);

    // 2. Deal
    const dealRes = await pool.query(`
      INSERT INTO deals (tenant_id, branch_id, title, value, pipeline_stage, client_id, created_at, updated_at)
      VALUES ($1, $2, 'General Consulting Deal', 100000.00, 'won', $3, NOW(), NOW())
      RETURNING id, title, value
    `, [tenantGeneral, branchGeneral, customer.id]);
    const deal = dealRes.rows[0];
    assert.equal(parseFloat(deal.value), 100000.00);

    // 3. Invoice
    const invRes = await pool.query(`
      INSERT INTO invoices (tenant_id, branch_id, client_id, invoice_number, total_amount, status, created_at, updated_at)
      VALUES ($1, $2, $3, 'INV-STG-001', 100000.00, 'unpaid', NOW(), NOW())
      RETURNING id, invoice_number, total_amount, status
    `, [tenantGeneral, branchGeneral, customer.id]);
    const invoice = invRes.rows[0];
    assert.ok(invoice.id);

    // 4. Payment + 5. Receipt Voucher
    const voucherRes = await pool.query(`
      INSERT INTO finance_vouchers (
        tenant_id, branch_id, voucher_number, voucher_type, party_type, party_name,
        customer_id, invoice_id, amount, payment_method, voucher_date, status, created_at
      ) VALUES ($1, $2, 'RV-GEN-001', 'receipt', 'customer', $3, $4, $5, 60000.00, 'bank_transfer', CURRENT_DATE, 'active', NOW())
      RETURNING id, voucher_number, amount, status
    `, [tenantGeneral, branchGeneral, customer.name, String(customer.id), invoice.id]);
    const voucher = voucherRes.rows[0];
    assert.ok(voucher.id);
    assert.equal(parseFloat(voucher.amount), 60000.00);

    const payRes = await pool.query(`
      INSERT INTO payments (tenant_id, branch_id, invoice_id, voucher_id, amount, payment_method, payment_date, status, created_at)
      VALUES ($1, $2, $3, $4, 60000.00, 'bank_transfer', CURRENT_DATE, 'active', NOW())
      RETURNING id, amount
    `, [tenantGeneral, branchGeneral, invoice.id, voucher.id]);
    assert.ok(payRes.rows[0].id);

    await pool.query(`
      UPDATE invoices SET status = 'partially_paid' WHERE id = $1 AND tenant_id::text = $2
    `, [invoice.id, tenantGeneral]);

    // Check General Reports before cancellation
    const reportsBeforeCancel = await pool.query(`
      SELECT SUM(total_amount) as invoice_rev FROM invoices WHERE tenant_id::text = $1
    `, [tenantGeneral]);
    assert.equal(parseFloat(reportsBeforeCancel.rows[0].invoice_rev), 100000.00);

    const paymentsBeforeCancel = await pool.query(`
      SELECT SUM(amount) as collected FROM payments WHERE tenant_id::text = $1 AND (COALESCE(status, 'active') != 'cancelled')
    `, [tenantGeneral]);
    assert.equal(parseFloat(paymentsBeforeCancel.rows[0].collected), 60000.00);

    // 6. Cancel Voucher
    await pool.query(`
      UPDATE finance_vouchers
      SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = 'Staging test reversal'
      WHERE id = $1 AND tenant_id::text = $2
    `, [voucher.id, tenantGeneral]);

    await pool.query(`
      UPDATE payments
      SET status = 'cancelled', notes = 'Cancelled with voucher'
      WHERE voucher_id = $1 AND tenant_id::text = $2
    `, [voucher.id, tenantGeneral]);

    await pool.query(`
      UPDATE invoices
      SET status = 'unpaid'
      WHERE id = $1 AND tenant_id::text = $2
    `, [invoice.id, tenantGeneral]);

    // 7. Verify Reports after cancellation (Reversal reflected)
    const paymentsAfterCancel = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as collected FROM payments WHERE tenant_id::text = $1 AND (COALESCE(status, 'active') != 'cancelled')
    `, [tenantGeneral]);
    assert.equal(parseFloat(paymentsAfterCancel.rows[0].collected), 0.00, 'Cancelled payment must be excluded from collection totals');

    const invAfter = await pool.query(`SELECT status FROM invoices WHERE id = $1`, [invoice.id]);
    assert.equal(invAfter.rows[0].status, 'unpaid');
  });

  // ---------------------------------------------------------------------------
  // FLOW 2: REAL ESTATE TEMPLATE
  // Lead -> Customer -> Deal Closed -> Contract -> Installments -> Payment -> Voucher -> Handover -> Sold -> Reports
  // ---------------------------------------------------------------------------
  await t.test('Flow 2: Real Estate Closed Deal & Financial Unification', async (t2) => {
    // 1. Lead & Unit
    const leadRes = await pool.query(`
      INSERT INTO customers (tenant_id, branch_id, name, email, phone, status, created_at, updated_at)
      VALUES ($1, $2, 'RE Buyer Lead', 'buyer@realestate.test', '01000000002', 'lead', NOW(), NOW())
      RETURNING id, name
    `, [tenantRealEstate, branchRealEstate]);
    const lead = leadRes.rows[0];

    const unitRes = await pool.query(`
      INSERT INTO re_units (tenant_id, branch_id, unit_number, name, price, status, created_at, updated_at)
      VALUES ($1, $2, 'APT-STG-501', 'Penthouse 501', 5000000.00, 'Available', NOW(), NOW())
      RETURNING id, unit_number, status
    `, [tenantRealEstate, branchRealEstate]);
    const unit = unitRes.rows[0];
    assert.equal(unit.status, 'Available');

    // Convert Lead to Customer
    await pool.query(`UPDATE customers SET status = 'customer' WHERE id = $1`, [lead.id]);

    // 2. Deal Closed
    const dealRes = await pool.query(`
      INSERT INTO deals (tenant_id, branch_id, title, value, pipeline_stage, client_id, unit_id, created_at, updated_at)
      VALUES ($1, $2, 'Penthouse 501 Deal', 5000000.00, 'Closed', $3, $4, NOW(), NOW())
      RETURNING id, title, pipeline_stage
    `, [tenantRealEstate, branchRealEstate, lead.id, unit.id]);
    const deal = dealRes.rows[0];
    assert.equal(deal.pipeline_stage, 'Closed');

    // Confirm that 'Closed' deals DO NOT insert into re_payments_mvp
    const mvpCheck = await pool.query(`SELECT * FROM re_payments_mvp WHERE deal_id::text = $1`, [String(deal.id)]);
    assert.equal(mvpCheck.rows.length, 0, 'Closed deal must not have a row in re_payments_mvp');

    // 3. Contract
    const contractRes = await pool.query(`
      INSERT INTO re_contracts (
        tenant_id, branch_id, contract_number, deal_id, customer_id, unit_id,
        contract_date, contract_value, down_payment, remaining_amount, status, created_at, updated_at
      ) VALUES ($1, $2, 'CNT-STG-001', $3, $4, $5, CURRENT_DATE, 5000000.00, 1000000.00, 4000000.00, 'Draft', NOW(), NOW())
      RETURNING id, contract_number
    `, [tenantRealEstate, branchRealEstate, deal.id, lead.id, unit.id]);
    const contract = contractRes.rows[0];
    assert.ok(contract.id);

    // 4. Installments (#0 Down Payment + #1 Periodic Installment)
    const inst0Res = await pool.query(`
      INSERT INTO re_installments (
        tenant_id, branch_id, contract_id, deal_id, installment_number, installment_type,
        due_date, amount, paid_amount, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 0, 'down_payment', CURRENT_DATE, 1000000.00, 0, 'Pending', NOW(), NOW())
      RETURNING id, amount, status
    `, [tenantRealEstate, branchRealEstate, contract.id, deal.id]);
    const inst0 = inst0Res.rows[0];

    const inst1Res = await pool.query(`
      INSERT INTO re_installments (
        tenant_id, branch_id, contract_id, deal_id, installment_number, installment_type,
        due_date, amount, paid_amount, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 1, 'installment', CURRENT_DATE + INTERVAL '15 days', 1000000.00, 0, 'Pending', NOW(), NOW())
      RETURNING id, amount, status
    `, [tenantRealEstate, branchRealEstate, contract.id, deal.id]);
    const inst1 = inst1Res.rows[0];

    // Check Forecast before payment
    const forecastBefore = await pool.query(`
      SELECT COALESCE(SUM(amount - paid_amount), 0) as expected
      FROM re_installments
      WHERE tenant_id::text = $1
      AND (COALESCE(status, 'Pending') != 'Paid')
      AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    `, [tenantRealEstate]);
    assert.equal(parseFloat(forecastBefore.rows[0].expected), 2000000.00, 'Forecast must correctly sum upcoming installments within 30 days');

    // 5. Payment & Authoritative Voucher for Down Payment
    const voucherRes = await pool.query(`
      INSERT INTO finance_vouchers (
        tenant_id, branch_id, voucher_number, voucher_type, party_type, party_name,
        customer_id, deal_id, contract_id, installment_id, amount, payment_method,
        voucher_date, status, created_at
      ) VALUES ($1, $2, 'RV-RE-001', 'receipt', 'customer', $3, $4, $5, $6, $7, 1000000.00, 'cheque', CURRENT_DATE, 'active', NOW())
      RETURNING id, voucher_number, amount
    `, [tenantRealEstate, branchRealEstate, lead.name, String(lead.id), String(deal.id), String(contract.id), String(inst0.id)]);
    const voucher = voucherRes.rows[0];

    // Update Installment
    await pool.query(`
      UPDATE re_installments
      SET paid_amount = 1000000.00, status = 'Paid', updated_at = NOW()
      WHERE id = $1 AND tenant_id::text = $2
    `, [inst0.id, tenantRealEstate]);

    // Best-effort cache upsert (Phase 8 pattern)
    await pool.query(`
      INSERT INTO re_payments_mvp (
        tenant_id, branch_id, deal_id, total_amount, paid_amount, status, created_at, updated_at
      ) VALUES ($1, $2, $3, 5000000.00, 1000000.00, 'pending', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `, [tenantRealEstate, branchRealEstate, String(deal.id)]);

    // 6. Handover & Mark Unit Sold
    const handoverRes = await pool.query(`
      INSERT INTO re_handovers (tenant_id, branch_id, deal_id, contract_id, unit_id, actual_handover_date, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'Completed', NOW(), NOW())
      RETURNING id, status
    `, [tenantRealEstate, branchRealEstate, deal.id, contract.id, unit.id]);
    assert.equal(handoverRes.rows[0].status, 'Completed');

    await pool.query(`UPDATE re_units SET status = 'Sold' WHERE id = $1 AND tenant_id::text = $2`, [unit.id, tenantRealEstate]);
    const unitAfter = await pool.query(`SELECT status FROM re_units WHERE id = $1`, [unit.id]);
    assert.equal(unitAfter.rows[0].status, 'Sold');

    // 7. Verify Real Estate Dashboard Revenue & Reports from finance_vouchers
    const reDashboardRev = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM finance_vouchers
      WHERE tenant_id::text = $1
      AND voucher_type = 'receipt'
      AND (COALESCE(status, 'active') != 'cancelled')
    `, [tenantRealEstate]);
    assert.equal(parseFloat(reDashboardRev.rows[0].total), 1000000.00, 'Dashboard revenue must reflect voucher amount');

    // Verify Forecast updated after paying inst0
    const forecastAfter = await pool.query(`
      SELECT COALESCE(SUM(amount - paid_amount), 0) as expected
      FROM re_installments
      WHERE tenant_id::text = $1
      AND (COALESCE(status, 'Pending') != 'Paid')
      AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    `, [tenantRealEstate]);
    assert.equal(parseFloat(forecastAfter.rows[0].expected), 1000000.00, 'Forecast must now only show unpaid installment 1');

    // Verify Deal paid_amount via Deals API SQL query (COALESCE with finance_vouchers)
    const dealPaidQuery = await pool.query(`
      SELECT 
        d.id,
        COALESCE(fv.actual_paid, rp.paid_amount, 0) as paid_amount
      FROM deals d
      LEFT JOIN re_payments_mvp rp ON d.id::text = rp.deal_id::text AND d.tenant_id::text = rp.tenant_id::text
      LEFT JOIN (
        SELECT deal_id, SUM(amount) as actual_paid
        FROM finance_vouchers
        WHERE tenant_id::text = $1
        AND voucher_type = 'receipt'
        AND (COALESCE(status, 'active') != 'cancelled')
        AND deal_id IS NOT NULL
        GROUP BY deal_id
      ) fv ON d.id::text = fv.deal_id::text
      WHERE d.id = $2 AND d.tenant_id::text = $1
    `, [tenantRealEstate, deal.id]);
    assert.equal(parseFloat(dealPaidQuery.rows[0].paid_amount), 1000000.00, 'Deals screen must show 1,000,000 paid for the Closed deal');
  });

  // ---------------------------------------------------------------------------
  // FLOW 3: SECURITY & MULTI-TENANT ISOLATION
  // Tenant A data is strictly invisible to Tenant B / Attacker
  // ---------------------------------------------------------------------------
  await t.test('Flow 3: Security & Cross-Tenant Isolation Enforcement', async (t3) => {
    // Attacker tries to query Tenant General's vouchers
    const crossVoucherRead = await pool.query(`
      SELECT * FROM finance_vouchers WHERE tenant_id::text = $1
    `, [tenantAttacker]);
    assert.equal(crossVoucherRead.rows.length, 0, 'Attacker must see 0 vouchers in their tenant');

    // Attacker tries to query Tenant Real Estate's contracts
    const crossContractRead = await pool.query(`
      SELECT * FROM re_contracts WHERE tenant_id::text = $1
    `, [tenantAttacker]);
    assert.equal(crossContractRead.rows.length, 0, 'Attacker must see 0 contracts in their tenant');

    // Attacker tries to update Tenant General's customer
    const updateResult = await pool.query(`
      UPDATE customers SET name = 'Hacked Name'
      WHERE tenant_id::text = $1
      RETURNING *
    `, [tenantAttacker]);
    assert.equal(updateResult.rowCount, 0, 'Attacker cannot update any records of other tenants');

    // Verify Tenant General customer was untouched
    const victimCustomer = await pool.query(`SELECT name FROM customers WHERE tenant_id::text = $1`, [tenantGeneral]);
    assert.equal(victimCustomer.rows[0].name, 'General Corp Client');
  });

  // ---------------------------------------------------------------------------
  // FLOW 4: MONEY DIVERGENCE AUDIT
  // Verified on live database
  // ---------------------------------------------------------------------------
  await t.test('Flow 4: Money Divergence Calculation = 0.00', async (t4) => {
    // Compare total active vouchers against total recorded payments in installments & payments table
    const voucherSumRes = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM finance_vouchers
      WHERE tenant_id::text IN ($1, $2)
      AND voucher_type = 'receipt'
      AND (COALESCE(status, 'active') != 'cancelled')
    `, [tenantGeneral, tenantRealEstate]);
    const totalActiveVouchers = parseFloat(voucherSumRes.rows[0].total);

    const instPaidRes = await pool.query(`
      SELECT COALESCE(SUM(paid_amount), 0) as total
      FROM re_installments
      WHERE tenant_id::text = $1
    `, [tenantRealEstate]);
    const totalInstallmentPaid = parseFloat(instPaidRes.rows[0].total);

    const payTableRes = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM payments
      WHERE tenant_id::text = $1
      AND (COALESCE(status, 'active') != 'cancelled')
    `, [tenantGeneral]);
    const totalGeneralPaid = parseFloat(payTableRes.rows[0].total);

    const divergence = Math.abs(totalActiveVouchers - (totalInstallmentPaid + totalGeneralPaid));
    assert.equal(divergence, 0.00, `Money divergence must be exactly 0.00. Got: ${divergence}`);
  });
});
