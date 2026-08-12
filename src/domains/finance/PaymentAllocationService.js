/**
 * PaymentAllocationService — Multi-Invoice Payment Settlement & WHT Engine
 *
 * Responsibilities:
 *  - Settles single payment across multiple invoices (customer or supplier)
 *  - Calculates net receivable after Withholding Tax (WHT) deduction
 *  - Posts AR settlement + WHT Receivable GL Journal Entries
 *  - Records payment allocations in payment_allocations table
 */

const db = require('../../../config/db');
const JournalEngine = require('../accounting/JournalEngine');
const AccountService = require('../accounting/AccountService');

/**
 * Allocate a customer payment against one or more invoices.
 *
 * @param {Object} client - pg PoolClient (inside active transaction)
 * @param {Object} options
 * @param {string} options.tenantId
 * @param {string} [options.branchId]
 * @param {string} options.paymentId
 * @param {string} [options.bankAccountId]
 * @param {number} options.totalPaymentAmount - EGP cash/bank received
 * @param {Array<Object>} options.allocations - array of { invoice_id, amount }
 * @param {string} [options.userId]
 * @returns {Promise<Object>}
 */
async function allocatePayment(client, { tenantId, branchId = null, paymentId, bankAccountId, totalPaymentAmount, allocations, userId = 'SYSTEM' }) {
  if (!allocations || allocations.length === 0) {
    throw new Error('Payment allocation requires at least one target invoice.');
  }

  let totalAllocated = 0;
  const allocationRecords = [];

  const bankAcc = bankAccountId
    ? { id: bankAccountId }
    : await AccountService.getAccountBySubType(tenantId, 'bank');

  const arAcc  = await AccountService.getAccountBySubType(tenantId, 'receivable');
  const whtAcc = await AccountService.getAccountBySubType(tenantId, 'wht_receivable');

  let totalWHTDeducted = 0;

  for (const alloc of allocations) {
    const allocAmount = Number(alloc.amount || 0);
    if (allocAmount <= 0) continue;

    // Record allocation
    const res = await client.query(`
      INSERT INTO payment_allocations (tenant_id, payment_id, invoice_id, amount_allocated)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [String(tenantId), String(paymentId), String(alloc.invoice_id), allocAmount]);

    allocationRecords.push(res.rows[0]);
    totalAllocated += allocAmount;

    // Check if invoice had WHT specified
    const invRes = await client.query('SELECT wht_amount FROM invoices WHERE id::text = $1::text', [String(alloc.invoice_id)]);
    if (invRes.rows.length > 0 && invRes.rows[0].wht_amount) {
      totalWHTDeducted += Number(invRes.rows[0].wht_amount);
    }
  }

  if (Math.abs(totalAllocated - Number(totalPaymentAmount)) > 0.01) {
    throw new Error(`ALLOCATION MISMATCH: Total allocated (${totalAllocated.toFixed(2)}) must equal payment amount (${Number(totalPaymentAmount).toFixed(2)}).`);
  }

  // Build AR Settlement Journal Entry lines
  // DR Bank (net cash received)
  // DR WHT Receivable (if customer deducted WHT)
  // CR Accounts Receivable (gross balance settled)
  const grossAR = totalPaymentAmount + totalWHTDeducted;

  const entries = [
    { account_id: bankAcc.id, debit: totalPaymentAmount, credit: 0, description: `Customer Payment Received (${paymentId})` }
  ];

  if (totalWHTDeducted > 0 && whtAcc) {
    entries.push({ account_id: whtAcc.id, debit: totalWHTDeducted, credit: 0, description: `WHT Deducted by Customer (${paymentId})` });
  }

  entries.push({ account_id: arAcc.id, debit: 0, credit: grossAR, description: `AR Invoice Settlement (${paymentId})` });

  const journal = await JournalEngine.postJournal(client, {
    tenantId,
    branchId,
    date: new Date(),
    sourceType: 'payment',
    sourceId: paymentId,
    entryPurpose: 'ar_settlement',
    description: `Payment Allocation (${allocations.length} invoices settled)`,
    postedBy: userId,
    entries
  });

  return {
    status: 'allocated_and_posted',
    payment_id: paymentId,
    total_allocated: totalAllocated,
    wht_deducted: totalWHTDeducted,
    allocations: allocationRecords,
    journal_entry_id: journal.id
  };
}

module.exports = { allocatePayment };
