/**
 * DocumentSequencer — Centralized ERP Document Number Generator
 *
 * Replaces all per-controller generateInvoiceNumber() implementations.
 * Generates sequential, unique, formatted document numbers per:
 *   tenant + branch + doc_type + fiscal_year
 *
 * Thread-safe: uses SELECT ... FOR UPDATE to prevent race conditions.
 * Idempotent: all sequences stored in document_sequences table.
 *
 * Usage:
 *   const { nextSequence } = require('../../infrastructure/sequencing/DocumentSequencer');
 *   const number = await nextSequence(client, { tenantId, branchId, docType: 'SO' });
 *   // → "SO-2026-00001"
 */

const DOC_TYPE_CONFIG = {
  SO:  { prefix: 'SO',  label: 'Sales Order' },
  DN:  { prefix: 'DN',  label: 'Delivery Note' },
  SR:  { prefix: 'SR',  label: 'Sales Return' },
  CN:  { prefix: 'CN',  label: 'Credit Note' },
  INV: { prefix: 'INV', label: 'Invoice' },
  PO:  { prefix: 'PO',  label: 'Purchase Order' },
  PR:  { prefix: 'PR',  label: 'Purchase Request' },
  GRN: { prefix: 'GRN', label: 'Goods Receipt Note' },
  PRN: { prefix: 'PRN', label: 'Purchase Return' },
  DBN: { prefix: 'DBN', label: 'Debit Note' },
  PAY: { prefix: 'PAY', label: 'Payment' },
  JE:  { prefix: 'JE',  label: 'Journal Entry' },
  QUO: { prefix: 'QUO', label: 'Quotation' },
  EXP: { prefix: 'EXP', label: 'Expense' },
};

/**
 * Generate the next document number for a given type and tenant/branch.
 *
 * @param {Object} client  - pg PoolClient (must be inside an active transaction)
 * @param {Object} options
 * @param {string} options.tenantId
 * @param {string} [options.branchId]
 * @param {string} options.docType   - one of the DOC_TYPE_CONFIG keys
 * @param {number} [options.fiscalYear] - defaults to current calendar year
 * @returns {Promise<string>} formatted document number, e.g. "SO-2026-00042"
 */
async function nextSequence(client, { tenantId, branchId = null, docType, fiscalYear }) {
  if (!DOC_TYPE_CONFIG[docType]) {
    throw new Error(`DocumentSequencer: unknown docType "${docType}". Valid types: ${Object.keys(DOC_TYPE_CONFIG).join(', ')}`);
  }

  const year = fiscalYear || new Date().getFullYear();
  const config = DOC_TYPE_CONFIG[docType];

  // Lock the sequence row for this tenant+branch+docType+year
  // (FOR UPDATE prevents concurrent requests from getting the same number)
  const lockResult = await client.query(`
    INSERT INTO document_sequences (tenant_id, branch_id, doc_type, fiscal_year, prefix, last_sequence)
    VALUES ($1, $2, $3, $4, $5, 0)
    ON CONFLICT (tenant_id, branch_id, doc_type, fiscal_year)
    DO UPDATE SET last_sequence = document_sequences.last_sequence  -- no-op, just to lock
    RETURNING *
  `, [tenantId, branchId, docType, year, config.prefix]);

  // Now lock the row exclusively and increment
  const updateResult = await client.query(`
    UPDATE document_sequences
    SET last_sequence = last_sequence + 1
    WHERE tenant_id = $1
      AND (branch_id = $2 OR (branch_id IS NULL AND $2 IS NULL))
      AND doc_type = $3
      AND fiscal_year = $4
    RETURNING last_sequence, prefix
  `, [tenantId, branchId, docType, year]);

  if (!updateResult.rows[0]) {
    throw new Error(`DocumentSequencer: failed to increment sequence for ${docType}`);
  }

  const { last_sequence, prefix } = updateResult.rows[0];
  const paddedSeq = String(last_sequence).padStart(5, '0');

  return `${prefix}-${year}-${paddedSeq}`;
}

/**
 * Preview the NEXT number without consuming it (for display only).
 * Not transactionally safe — for UI display purposes only.
 *
 * @param {Object} db     - pg Pool (not a client — no transaction needed)
 * @param {Object} options
 */
async function peekNextSequence(db, { tenantId, branchId = null, docType, fiscalYear }) {
  const year = fiscalYear || new Date().getFullYear();

  const result = await db.query(`
    SELECT last_sequence, prefix
    FROM document_sequences
    WHERE tenant_id = $1
      AND (branch_id = $2 OR (branch_id IS NULL AND $2 IS NULL))
      AND doc_type = $3
      AND fiscal_year = $4
  `, [tenantId, branchId, docType, year]);

  const config = DOC_TYPE_CONFIG[docType];
  const next = result.rows.length > 0 ? result.rows[0].last_sequence + 1 : 1;
  const prefix = result.rows.length > 0 ? result.rows[0].prefix : config.prefix;
  return `${prefix}-${year}-${String(next).padStart(5, '0')}`;
}

module.exports = { nextSequence, peekNextSequence, DOC_TYPE_CONFIG };
