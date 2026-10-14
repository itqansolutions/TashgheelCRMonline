/**
 * tests/integration/treasury_ledger_real_postgres.test.js
 *
 * REAL POSTGRESQL INTEGRATION TEST SUITE FOR TREASURY BALANCES & TRANSACTIONS
 *
 * Safety Policy:
 *   - Strictly connects only to DATABASE_URL_TEST from .env.test.
 *   - Strictly refuses to run against production host ("reseau.proxy.rlwy.net").
 *   - Refuses to run if DATABASE_URL_TEST === DATABASE_URL.
 *   - Uses an isolated unique test tenant UUID and cleans up afterwards.
 *   - Tests the exact scenario:
 *       1) Treasury Account: opening_balance = 1000.00
 *       2) Customer Payment (IN): +500.00 (today)
 *       3) Expense (OUT): -150.00 (today)
 *       4) Employee Payment Voucher (OUT): -200.00 (today)
 *       5) Vendor Payment Voucher (OUT): -100.00 (today)
 *       6) Cancelled Payment Voucher: -300.00 (today, status = 'cancelled') -> must NOT affect balance or txns
 *       7) Future Payment Voucher: -500.00 (CURRENT_DATE + 90 days) -> excluded from current balance, visible in future filter
 *
 *   Expected Current Balance = 1000 + 500 - 150 - 200 - 100 = 1050.00
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.test' });

const PROD_HOST = 'reseau.proxy.rlwy.net';
const testDbUrl = process.env.DATABASE_URL_TEST;
const prodDbUrl = process.env.DATABASE_URL;

function verifySafetyGate() {
  if (!testDbUrl) {
    return { ok: false, reason: 'DATABASE_URL_TEST is not set in .env.test. Skipping live DB test.' };
  }
  if (testDbUrl === prodDbUrl) {
    return { ok: false, reason: 'FATAL: DATABASE_URL_TEST matches production DATABASE_URL. Refusing execution.' };
  }
  if (testDbUrl.includes(PROD_HOST)) {
    return { ok: false, reason: `FATAL: DATABASE_URL_TEST points to production host (${PROD_HOST}). Refusing execution.` };
  }
  return { ok: true };
}

const safety = verifySafetyGate();

if (!safety.ok) {
  test('Treasury Real PostgreSQL Suite (Skipped by Safety Guard)', (t) => {
    t.skip(safety.reason);
  });
} else {
  const pool = new Pool({
    connectionString: testDbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  test('Treasury Accounting & Balance Real PostgreSQL Integration Suite', async (t) => {
    const testTenantId = `88888888-8888-4888-a888-${Date.now().toString(16).padStart(12, '0')}`;
    let accountId = null;

    // Safety cleanup in teardown
    t.after(async () => {
      try {
        await pool.query('DELETE FROM payments WHERE tenant_id::text = $1', [testTenantId]);
        await pool.query('DELETE FROM expenses WHERE tenant_id::text = $1', [testTenantId]);
        await pool.query('DELETE FROM finance_vouchers WHERE tenant_id::text = $1', [testTenantId]);
        await pool.query('DELETE FROM invoices WHERE tenant_id::text = $1', [testTenantId]);
        await pool.query('DELETE FROM customers WHERE tenant_id::text = $1', [testTenantId]);
        await pool.query('DELETE FROM treasury_accounts WHERE tenant_id::text = $1', [testTenantId]);
        await pool.query('DELETE FROM branches WHERE tenant_id::text = $1', [testTenantId]);
        await pool.query('DELETE FROM tenants WHERE id::text = $1', [testTenantId]);
      } catch (err) {
        console.error('Teardown cleanup error:', err.message);
      } finally {
        await pool.end();
      }
    });

    const testBranchId = `77777777-7777-4777-a777-${Date.now().toString(16).padStart(12, '0')}`;

    await t.test('1. Setup base schema and test data', async () => {
      // 0. Create Tenant
      await pool.query(`
        INSERT INTO tenants (id, name, slug, plan, status)
        VALUES ($1, 'Test Finance Tenant', $2, 'enterprise', 'active')
        ON CONFLICT DO NOTHING
      `, [testTenantId, `slug-${Date.now()}`]);

      // 0b. Create Branch
      await pool.query(`
        INSERT INTO branches (id, name, tenant_id)
        VALUES ($1, 'Main Branch', $2)
        ON CONFLICT DO NOTHING
      `, [testBranchId, testTenantId]);

      // 1. Create Treasury Account (opening_balance = 1000)
      const accRes = await pool.query(`
        INSERT INTO treasury_accounts (name, type, opening_balance, is_default, is_active, tenant_id, branch_id)
        VALUES ('Test Safe Main', 'cash', 1000.00, true, true, $1, $2)
        RETURNING id
      `, [testTenantId, testBranchId]);
      accountId = accRes.rows[0].id;
      assert.ok(accountId, 'Treasury account created');

      // 2. Customer & Invoice & Payment (+500.00 today)
      const custRes = await pool.query(`
        INSERT INTO customers (name, tenant_id, branch_id)
        VALUES ('Test Customer Corp', $1, $2)
        RETURNING id
      `, [testTenantId, testBranchId]);
      const customerId = custRes.rows[0].id;

      const invRes = await pool.query(`
        INSERT INTO invoices (invoice_number, customer_id, total_amount, tenant_id, branch_id, status)
        VALUES ('INV-TEST-001', $1, 500.00, $2, $3, 'paid')
        RETURNING id
      `, [String(customerId), testTenantId, testBranchId]);
      const invoiceId = invRes.rows[0].id;

      await pool.query(`
        INSERT INTO payments (invoice_id, amount, payment_method, payment_date, treasury_account_id, tenant_id, branch_id, status)
        VALUES ($1, 500.00, 'cash', CURRENT_DATE, $2, $3, $4, 'active')
      `, [invoiceId, accountId, testTenantId, testBranchId]);

      // 3. Expense (-150.00 today)
      await pool.query(`
        INSERT INTO expenses (title, amount, category, expense_date, payment_method, treasury_account_id, tenant_id, branch_id)
        VALUES ('Office Supplies', 150.00, 'Supplies', CURRENT_DATE, 'cash', $1, $2, $3)
      `, [accountId, testTenantId, testBranchId]);

      // 4. Employee Payment Voucher (-200.00 today)
      await pool.query(`
        INSERT INTO finance_vouchers (
          voucher_number, voucher_type, party_type, party_name,
          amount, payment_method, treasury_account_id, voucher_date, tenant_id, branch_id, status
        ) VALUES (
          'PV-EMP-001', 'payment', 'employee', 'Employee Ahmed',
          200.00, 'cash', $1, CURRENT_DATE, $2, $3, 'active'
        )
      `, [accountId, testTenantId, testBranchId]);

      // 5. Vendor Payment Voucher (-100.00 today)
      await pool.query(`
        INSERT INTO finance_vouchers (
          voucher_number, voucher_type, party_type, party_name,
          amount, payment_method, treasury_account_id, voucher_date, tenant_id, branch_id, status
        ) VALUES (
          'PV-VND-001', 'payment', 'vendor', 'Vendor Al-Noor',
          100.00, 'cash', $1, CURRENT_DATE, $2, $3, 'active'
        )
      `, [accountId, testTenantId, testBranchId]);

      // 6. Cancelled Payment Voucher (-300.00 today, cancelled) -> must NOT affect balance
      await pool.query(`
        INSERT INTO finance_vouchers (
          voucher_number, voucher_type, party_type, party_name,
          amount, payment_method, treasury_account_id, voucher_date, tenant_id, branch_id, status
        ) VALUES (
          'PV-CNC-001', 'payment', 'vendor', 'Vendor Cancelled Corp',
          300.00, 'cash', $1, CURRENT_DATE, $2, $3, 'cancelled'
        )
      `, [accountId, testTenantId, testBranchId]);

      // 7. Future Payment Voucher (-500.00, in +90 days) -> must NOT affect current balance
      await pool.query(`
        INSERT INTO finance_vouchers (
          voucher_number, voucher_type, party_type, party_name,
          amount, payment_method, treasury_account_id, voucher_date, tenant_id, branch_id, status
        ) VALUES (
          'PV-FUT-001', 'payment', 'vendor', 'Future Contractor',
          500.00, 'cash', $1, CURRENT_DATE + INTERVAL '90 days', $2, $3, 'active'
        )
      `, [accountId, testTenantId, testBranchId]);
    });

    await t.test('2. Execute real getTreasuryAccounts list query & verify 1,050.00 balance', async () => {
      // Execute the exact query from controllers/financeController.js getTreasuryAccounts
      const accountsRes = await pool.query(`
        SELECT
            ta.*,
            COALESCE((
                SELECT SUM(p.amount)
                FROM payments p
                WHERE p.treasury_account_id = ta.id
                  AND p.tenant_id::text = ta.tenant_id::text
                  AND ($2::text IS NULL OR p.branch_id::text = $2::text OR p.branch_id IS NULL)
                  AND (COALESCE(p.status, 'active') != 'cancelled')
                  AND p.payment_date::date <= CURRENT_DATE
            ), 0) +
            COALESCE((
                SELECT SUM(fv.amount)
                FROM finance_vouchers fv
                WHERE fv.treasury_account_id = ta.id
                  AND fv.voucher_type = 'receipt'
                  AND fv.invoice_id IS NULL
                  AND fv.tenant_id::text = ta.tenant_id::text
                  AND ($2::text IS NULL OR fv.branch_id::text = $2::text OR fv.branch_id IS NULL)
                  AND (COALESCE(fv.status, 'active') != 'cancelled')
                  AND fv.voucher_date::date <= CURRENT_DATE
            ), 0) AS total_incoming,

            COALESCE((
                SELECT SUM(e.amount)
                FROM expenses e
                WHERE e.treasury_account_id = ta.id
                  AND e.tenant_id::text = ta.tenant_id::text
                  AND ($2::text IS NULL OR e.branch_id::text = $2::text OR e.branch_id IS NULL)
                  AND e.expense_date::date <= CURRENT_DATE
            ), 0) +
            COALESCE((
                SELECT SUM(fv.amount)
                FROM finance_vouchers fv
                WHERE fv.treasury_account_id = ta.id
                  AND fv.voucher_type = 'payment'
                  AND fv.tenant_id::text = ta.tenant_id::text
                  AND ($2::text IS NULL OR fv.branch_id::text = $2::text OR fv.branch_id IS NULL)
                  AND (COALESCE(fv.status, 'active') != 'cancelled')
                  AND fv.voucher_date::date <= CURRENT_DATE
            ), 0) AS total_outgoing

        FROM treasury_accounts ta
        WHERE ta.tenant_id::text = $1::text
          AND ($2::text IS NULL OR ta.branch_id::text = $2::text OR ta.branch_id IS NULL)
          AND ta.id = $3
      `, [testTenantId, null, accountId]);

      assert.equal(accountsRes.rows.length, 1);
      const acc = accountsRes.rows[0];

      const opening = parseFloat(acc.opening_balance);
      const incoming = parseFloat(acc.total_incoming);
      const outgoing = parseFloat(acc.total_outgoing);
      const currentBalance = opening + incoming - outgoing;

      assert.equal(opening, 1000.00, 'Opening balance must be 1000.00');
      assert.equal(incoming, 500.00, 'Total incoming must be 500.00 (Customer Payment)');
      assert.equal(outgoing, 450.00, 'Total outgoing must be 450.00 (150 expense + 200 employee + 100 vendor)');
      assert.equal(currentBalance, 1050.00, 'Current balance must match exact expected 1,050.00');

      // 3a. Verify balRes calculates identical 1,050.00 balance
      const balRes = await pool.query(`
        SELECT
            COALESCE((SELECT SUM(p.amount) FROM payments p
                      WHERE p.treasury_account_id = $1
                        AND p.tenant_id::text = $2::text
                        AND ($3::text IS NULL OR p.branch_id::text = $3::text OR p.branch_id IS NULL)
                        AND (COALESCE(p.status, 'active') != 'cancelled')
                        AND p.payment_date::date <= CURRENT_DATE), 0) +
            COALESCE((SELECT SUM(fv.amount) FROM finance_vouchers fv
                      WHERE fv.treasury_account_id = $1
                        AND fv.voucher_type = 'receipt'
                        AND fv.invoice_id IS NULL
                        AND fv.tenant_id::text = $2::text
                        AND ($3::text IS NULL OR fv.branch_id::text = $3::text OR fv.branch_id IS NULL)
                        AND (COALESCE(fv.status, 'active') != 'cancelled')
                        AND fv.voucher_date::date <= CURRENT_DATE), 0) AS total_incoming,
            COALESCE((SELECT SUM(e.amount) FROM expenses e
                      WHERE e.treasury_account_id = $1
                        AND e.tenant_id::text = $2::text
                        AND ($3::text IS NULL OR e.branch_id::text = $3::text OR e.branch_id IS NULL)
                        AND e.expense_date::date <= CURRENT_DATE), 0) +
            COALESCE((SELECT SUM(fv.amount) FROM finance_vouchers fv
                      WHERE fv.treasury_account_id = $1
                        AND fv.voucher_type = 'payment'
                        AND fv.tenant_id::text = $2::text
                        AND ($3::text IS NULL OR fv.branch_id::text = $3::text OR fv.branch_id IS NULL)
                        AND (COALESCE(fv.status, 'active') != 'cancelled')
                        AND fv.voucher_date::date <= CURRENT_DATE), 0) AS total_outgoing
      `, [accountId, testTenantId, null]);

      const detailBalance = 1000.00 + parseFloat(balRes.rows[0].total_incoming) - parseFloat(balRes.rows[0].total_outgoing);
      assert.equal(detailBalance, 1050.00, 'balRes in transactions endpoint must equal 1050.00');

      // 3b. Verify transaction list WITHOUT filter (displays today + future active rows; excludes cancelled)
      const txnsQuery = `
        SELECT * FROM (
            SELECT
                p.id::text AS source_id, 'Payment' AS txn_type, 'in' AS direction,
                p.payment_date::date AS txn_date,
                COALESCE(fv.voucher_number, 'PMT-' || p.id::text) AS reference,
                CONCAT('Receipt — ', COALESCE(c.name, i.invoice_number, 'N/A')) AS description,
                p.amount, p.payment_method, p.notes
            FROM payments p
            LEFT JOIN invoices i ON i.id::text = p.invoice_id::text
            LEFT JOIN customers c ON c.id::text = COALESCE(i.customer_id::text, i.client_id::text)
            LEFT JOIN LATERAL (
                SELECT fv2.voucher_number
                FROM finance_vouchers fv2
                WHERE fv2.invoice_id = i.id
                  AND fv2.voucher_type = 'receipt'
                  AND fv2.tenant_id::text = $2::text
                  AND ABS(fv2.amount - p.amount) < 0.01
                  AND fv2.voucher_date = p.payment_date::date
                ORDER BY fv2.id
                LIMIT 1
            ) fv ON true
            WHERE p.treasury_account_id = $1
              AND p.tenant_id::text = $2::text
              AND ($3::text IS NULL OR p.branch_id::text = $3::text OR p.branch_id IS NULL)
              AND (COALESCE(p.status, 'active') != 'cancelled')

            UNION ALL

            SELECT
                fv.id::text AS source_id, 'On-Account Receipt' AS txn_type, 'in' AS direction,
                fv.voucher_date::date AS txn_date, fv.voucher_number AS reference,
                CONCAT('On-Account Receipt — ', COALESCE(c.name, fv.party_name, 'N/A')) AS description,
                fv.amount, fv.payment_method, fv.notes
            FROM finance_vouchers fv
            LEFT JOIN customers c ON c.id::text = fv.customer_id::text
            WHERE fv.treasury_account_id = $1
              AND fv.voucher_type = 'receipt'
              AND fv.invoice_id IS NULL
              AND fv.tenant_id::text = $2::text
              AND ($3::text IS NULL OR fv.branch_id::text = $3::text OR fv.branch_id IS NULL)
              AND (COALESCE(fv.status, 'active') != 'cancelled')

            UNION ALL

            SELECT
                e.id::text AS source_id, 'Expense' AS txn_type, 'out' AS direction,
                e.expense_date::date AS txn_date, 'EXP-' || e.id::text AS reference,
                CONCAT(COALESCE(e.title, 'Expense'), ' — ', COALESCE(e.category, '')) AS description,
                e.amount, COALESCE(e.payment_method, 'cash') AS payment_method, NULL::text AS notes
            FROM expenses e
            WHERE e.treasury_account_id = $1
              AND e.tenant_id::text = $2::text
              AND ($3::text IS NULL OR e.branch_id::text = $3::text OR e.branch_id IS NULL)

            UNION ALL

            SELECT
                fv.id::text AS source_id, 'Payment Voucher' AS txn_type, 'out' AS direction,
                fv.voucher_date::date AS txn_date, fv.voucher_number AS reference,
                CONCAT('Payment Voucher — ', COALESCE(fv.party_name, 'N/A')) AS description,
                fv.amount, COALESCE(fv.payment_method, 'cash') AS payment_method, fv.notes
            FROM finance_vouchers fv
            WHERE fv.treasury_account_id = $1
              AND fv.voucher_type = 'payment'
              AND fv.tenant_id::text = $2::text
              AND ($3::text IS NULL OR fv.branch_id::text = $3::text OR fv.branch_id IS NULL)
              AND (COALESCE(fv.status, 'active') != 'cancelled')
        ) txns
      `;

      const allTxnsRes = await pool.query(`${txnsQuery} ORDER BY txn_date DESC`, [accountId, testTenantId, null]);
      // Expected active rows: 1 Payment (500) + 1 Expense (150) + 1 Employee (200) + 1 Vendor (100) + 1 Future Vendor (500) = 5 rows
      assert.equal(allTxnsRes.rows.length, 5, 'Must contain 5 non-cancelled transactions');

      // Cancelled voucher must NOT exist
      const hasCancelled = allTxnsRes.rows.some(r => r.reference === 'PV-CNC-001');
      assert.equal(hasCancelled, false, 'Cancelled voucher must be excluded');

      // Employee voucher must be included
      const employeeVoucher = allTxnsRes.rows.find(r => r.reference === 'PV-EMP-001');
      assert.ok(employeeVoucher, 'Employee payment voucher must be included in transactions list');
      assert.equal(employeeVoucher.txn_type, 'Payment Voucher');

      // Future voucher must be present in the full transaction history
      const futureVoucher = allTxnsRes.rows.find(r => r.reference === 'PV-FUT-001');
      assert.ok(futureVoucher, 'Future voucher must be visible in ledger query');

      // 3c. Verify filtering on FUTURE date window only returns future transaction
      const futureFrom = new Date(Date.now() + 80 * 24 * 3600 * 1000).toISOString().split('T')[0];
      const futureTo = new Date(Date.now() + 100 * 24 * 3600 * 1000).toISOString().split('T')[0];
      const filteredRes = await pool.query(`
        ${txnsQuery}
        WHERE txn_date >= $4::date AND txn_date <= $5::date
        ORDER BY txn_date DESC
      `, [accountId, testTenantId, null, futureFrom, futureTo]);

      assert.equal(filteredRes.rows.length, 1, 'Only future transaction appears in future date range');
      assert.equal(filteredRes.rows[0].reference, 'PV-FUT-001');
    });
  });
}
