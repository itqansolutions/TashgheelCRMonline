/**
 * ReversalService — ERP Journal Entry Reversal Engine
 *
 * Responsibilities:
 *  - Posts mirror Journal Entry (swapped DR/CR) on document cancellation
 *  - Links reversal JE to original JE via reversal_of FK
 *  - Idempotent — prevents duplicate reversals
 *  - Ensures financial audit trail integrity (original JE is never deleted!)
 */

const JournalEngine = require('./JournalEngine');

/**
 * Creates a reversal Journal Entry for an existing posted Journal Entry.
 *
 * @param {Object} dbOrClient - pg Pool or PoolClient (inside active transaction)
 * @param {Object} options
 * @param {string} options.tenantId
 * @param {string} [options.branchId]
 * @param {string} options.originalJournalEntryId
 * @param {string} [options.reason]
 * @param {string} [options.postedBy]
 * @returns {Promise<Object>} created reversal Journal Entry
 */
async function reverseJournalEntry(dbOrClient, {
  tenantId,
  branchId = null,
  originalJournalEntryId,
  reason = 'Document Cancelled',
  postedBy = 'SYSTEM'
}) {
  // 1. Fetch original JE header + lines
  const originalJE = await JournalEngine.getJournalEntryById(tenantId, originalJournalEntryId);

  if (!originalJE) {
    throw new Error(`Original Journal Entry ${originalJournalEntryId} not found.`);
  }

  if (originalJE.status === 'reversed') {
    throw new Error(`Journal Entry ${originalJE.number} has already been reversed.`);
  }

  // 2. Build mirror entries: swap debit and credit
  const mirrorEntries = originalJE.lines.map(line => ({
    account_id: line.account_id,
    debit: line.credit,   // SWAP!
    credit: line.debit,   // SWAP!
    transaction_currency: line.currency || 'EGP',
    exchange_rate: line.exchange_rate || 1.0,
    cost_center_id: line.cost_center_id,
    description: `Reversal: ${line.description || reason}`
  }));

  // 3. Post reversal JE using JournalEngine (idempotency key: reversal of original ID)
  const reversalJE = await JournalEngine.postJournal(dbOrClient, {
    tenantId,
    branchId: branchId || originalJE.branch_id,
    date: new Date(),
    sourceType: 'reversal',
    sourceId: originalJournalEntryId,
    entryPurpose: 'reversal',
    description: `Reversal of ${originalJE.number}: ${reason}`,
    postedBy,
    entries: mirrorEntries
  });

  // 4. Update original JE status to 'reversed' and set reversal_of link on reversal JE
  if (reversalJE.status !== 'already_posted') {
    await dbOrClient.query(`
      UPDATE journal_entries
      SET status = 'reversed'
      WHERE id = $1 AND tenant_id::text = $2::text
    `, [originalJournalEntryId, String(tenantId)]);

    await dbOrClient.query(`
      UPDATE journal_entries
      SET reversal_of = $1
      WHERE id = $2 AND tenant_id::text = $3::text
    `, [originalJournalEntryId, reversalJE.id, String(tenantId)]);
  }

  return reversalJE;
}

module.exports = { reverseJournalEntry };
