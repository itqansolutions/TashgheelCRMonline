/**
 * scripts/backfill_re_payments_to_vouchers.js
 * 
 * Idempotent migration & backfill:
 * Unifies Real Estate payments under Finance Receipts (finance_vouchers).
 * Preserves historical records, never deletes existing data, and does not create GL journals.
 */

const db = require('../config/db');

async function runBackfill() {
  console.log('--- Starting Idempotent RE Payments -> Finance Vouchers Backfill ---');

  try {
    // 1. Ensure finance_vouchers columns exist
    await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS deal_id VARCHAR(255)`);
    await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS contract_id VARCHAR(255)`);
    await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS installment_id VARCHAR(255)`);
    await db.query(`ALTER TABLE re_installments ADD COLUMN IF NOT EXISTS last_voucher_id INTEGER`);

    // 2. Backfill from re_installments
    const paidInstallments = await db.query(`
      SELECT ri.*, d.client_id, c.name as customer_name
      FROM re_installments ri
      LEFT JOIN deals d ON ri.deal_id = d.id
      LEFT JOIN customers c ON d.client_id::text = c.id::text
      WHERE ri.paid_amount > 0
    `);

    console.log(`[Backfill] Found ${paidInstallments.rows.length} paid installment(s) to verify.`);

    let backfilledCount = 0;
    let skippedCount = 0;

    for (const inst of paidInstallments.rows) {
      // Check if voucher already exists for this installment
      const existing = await db.query(`
        SELECT id FROM finance_vouchers 
        WHERE installment_id = $1::text AND tenant_id::text = $2::text
        LIMIT 1
      `, [String(inst.id), String(inst.tenant_id)]);

      if (existing.rows.length > 0) {
        skippedCount++;
        continue;
      }

      const voucherNumber = `RCV-BACKFILL-INST-${inst.id}`;
      const vDate = inst.paid_at || inst.updated_at || new Date();

      const voucherRes = await db.query(`
        INSERT INTO finance_vouchers (
          voucher_number, voucher_type, party_type, party_name,
          customer_id, deal_id, contract_id, installment_id,
          amount, payment_method, notes, voucher_date,
          tenant_id, branch_id
        ) VALUES ($1, 'receipt', 'customer', $2, $3, $4, $5, $6, $7, 'cash', $8, $9, $10, $11)
        RETURNING id
      `, [
        voucherNumber,
        inst.customer_name || 'Historical Real Estate Customer',
        inst.client_id ? String(inst.client_id) : null,
        inst.deal_id ? String(inst.deal_id) : null,
        inst.contract_id ? String(inst.contract_id) : null,
        String(inst.id),
        inst.paid_amount,
        `Historical backfill from Installment #${inst.installment_number}`,
        vDate,
        inst.tenant_id,
        inst.branch_id || null
      ]);

      await db.query(`
        UPDATE re_installments SET last_voucher_id = $1 WHERE id = $2
      `, [voucherRes.rows[0].id, inst.id]);

      backfilledCount++;
    }

    console.log(`[Backfill] Installments: Backfilled ${backfilledCount} voucher(s), skipped ${skippedCount} already-migrated voucher(s).`);
    console.log('--- Backfill Complete Successfully ---');
    return { backfilledCount, skippedCount };
  } catch (err) {
    console.error('[Backfill Error]:', err.message);
    throw err;
  }
}

if (require.main === module) {
  runBackfill()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runBackfill };
