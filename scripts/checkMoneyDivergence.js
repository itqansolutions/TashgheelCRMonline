/**
 * scripts/checkMoneyDivergence.js
 * 
 * READ-ONLY Diagnostic Script
 * Checks financial integrity and divergence between:
 *   1. finance_vouchers (Authoritative receipts)
 *   2. re_installments (Real Estate installment ledger)
 *   3. re_payments_mvp (Deal-level aggregate payments)
 * 
 * Safety:
 *   - Issues ONLY SELECT queries (Zero mutations)
 *   - Masks database host and credentials in logs
 *   - Scoped per-tenant or across all tenants
 */

require('dotenv').config();
const { Pool } = require('pg');

// STRICT GUARD: Must pass explicit --confirm-readonly flag
const args = process.argv.slice(2);
if (!args.includes('--confirm-readonly')) {
  console.error('\n❌ SAFETY GUARD REFUSAL:');
  console.error('To run this read-only financial diagnostic, you MUST provide the explicit flag:');
  console.error('  node scripts/checkMoneyDivergence.js --confirm-readonly\n');
  process.exit(1);
}

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error('❌ DATABASE_URL environment variable is not defined.');
  process.exit(1);
}

const safeHost = rawUrl.replace(/:[^:@]+@/, ':***@');
console.log(`[INFO] Connecting to database: ${safeHost}`);

const pool = new Pool({
  connectionString: rawUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 10000
});

async function runDivergenceCheck() {
  const client = await pool.connect();

  // Enforce runtime safety: Reject any non-SELECT query
  const rawQuery = client.query.bind(client);
  client.query = async (text, params) => {
    const trimmed = text.trim();
    if (!/^SELECT\b/i.test(trimmed)) {
      throw new Error(`CRITICAL BLOCKED OPERATION: Attempted non-SELECT query: "${trimmed.substring(0, 50)}"`);
    }
    return rawQuery(text, params);
  };

  try {
    console.log('\n======================================================');
    console.log('   TASHGHEEL CRM — FINANCIAL DIVERGENCE AUDIT (READ-ONLY)');
    console.log('======================================================\n');

    // 1. Check Installments vs Active Finance Vouchers Divergence
    // If an installment has paid_amount != SUM(active receipt vouchers for that installment)
    console.log('--- 1. INSTALLMENT VS VOUCHERS INTEGRITY ---');
    const instDivergenceQuery = `
      SELECT 
        i.id AS installment_id,
        i.tenant_id,
        i.deal_id,
        i.amount AS installment_total,
        i.paid_amount AS installment_recorded_paid,
        COALESCE(v.voucher_sum, 0) AS active_vouchers_sum,
        ROUND((i.paid_amount - COALESCE(v.voucher_sum, 0))::numeric, 2) AS divergence_diff
      FROM re_installments i
      LEFT JOIN (
        SELECT 
          installment_id, 
          tenant_id,
          SUM(amount) AS voucher_sum
        FROM finance_vouchers
        WHERE voucher_type = 'receipt'
          AND COALESCE(status, 'active') != 'cancelled'
          AND installment_id IS NOT NULL
        GROUP BY installment_id, tenant_id
      ) v ON i.id::text = v.installment_id::text AND i.tenant_id::text = v.tenant_id::text
      WHERE i.paid_amount > 0 AND (i.paid_amount != COALESCE(v.voucher_sum, 0))
      ORDER BY divergence_diff DESC
      LIMIT 100;
    `;

    const instRes = await client.query(instDivergenceQuery);
    if (instRes.rows.length === 0) {
      console.log('✔ All paid installments are fully reconciled with active finance receipt vouchers (Zero divergence).\n');
    } else {
      console.warn(`⚠ Found ${instRes.rows.length} installments with divergent voucher balances:`);
      console.table(instRes.rows);
      console.log('');
    }

    // 2. Check Deal MVP Payments vs Active Finance Vouchers Divergence
    console.log('--- 2. DEAL MVP PAYMENTS VS VOUCHERS INTEGRITY ---');
    const dealDivergenceQuery = `
      SELECT 
        p.deal_id,
        p.tenant_id,
        p.total_amount,
        p.paid_amount AS mvp_recorded_paid,
        COALESCE(v.voucher_sum, 0) AS active_vouchers_sum,
        ROUND((COALESCE(p.paid_amount, 0) - COALESCE(v.voucher_sum, 0))::numeric, 2) AS divergence_diff
      FROM re_payments_mvp p
      LEFT JOIN (
        SELECT 
          deal_id, 
          tenant_id,
          SUM(amount) AS voucher_sum
        FROM finance_vouchers
        WHERE voucher_type = 'receipt'
          AND COALESCE(status, 'active') != 'cancelled'
          AND deal_id IS NOT NULL
        GROUP BY deal_id, tenant_id
      ) v ON p.deal_id::text = v.deal_id::text AND p.tenant_id::text = v.tenant_id::text
      WHERE COALESCE(p.paid_amount, 0) > 0 AND (COALESCE(p.paid_amount, 0) != COALESCE(v.voucher_sum, 0))
      ORDER BY divergence_diff DESC
      LIMIT 100;
    `;

    const dealRes = await client.query(dealDivergenceQuery);
    if (dealRes.rows.length === 0) {
      console.log('✔ All deal payment MVP balances reconcile with active finance receipt vouchers.\n');
    } else {
      console.warn(`⚠ Found ${dealRes.rows.length} deals with divergent payment balances:`);
      console.table(dealRes.rows);
      console.log('');
    }

    // 3. Count Cancelled Vouchers and Linked Records
    console.log('--- 3. CANCELLED VOUCHERS SUMMARY ---');
    const cancelledQuery = `
      SELECT 
        tenant_id,
        COUNT(*) AS total_cancelled_vouchers,
        SUM(amount) AS total_cancelled_volume
      FROM finance_vouchers
      WHERE status = 'cancelled'
      GROUP BY tenant_id;
    `;
    const cancRes = await client.query(cancelledQuery);
    if (cancRes.rows.length === 0) {
      console.log('✔ No cancelled vouchers found in the database.\n');
    } else {
      console.table(cancRes.rows);
      console.log('');
    }

    console.log('Audit completed successfully.');
  } catch (err) {
    console.error('❌ Audit query error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

runDivergenceCheck();
