/**
 * JournalEngine — Core ERP Double-Entry Journal Engine
 *
 * Responsibilities:
 *  - Post balanced double-entry journal entries (DR = CR)
 *  - Idempotency protection via UNIQUE (tenant_id, source_type, source_id, entry_purpose)
 *  - Multi-currency storage (base EGP + foreign amounts)
 *  - Period validation (blocks posting to closed/locked periods)
 *  - Account posting validation (blocks posting to group accounts)
 */

const db = require('../../../config/db');
const { nextSequence } = require('../../infrastructure/sequencing/DocumentSequencer');
const FiscalYearService = require('./FiscalYearService');
const AccountService = require('./AccountService');

/**
 * Validate in-memory balance and sanity of journal lines before hitting DB.
 * Layer 1 validation.
 */
function validateJournalLines(entries) {
  if (!entries || !Array.isArray(entries) || entries.length < 2) {
    throw new Error('Journal entry must contain at least 2 lines (debit and credit).');
  }

  let totalDR = 0;
  let totalCR = 0;

  for (const line of entries) {
    const dr = Number(line.debit || 0);
    const cr = Number(line.credit || 0);

    if (dr < 0 || cr < 0) {
      throw new Error(`Negative amounts not allowed in journal lines (Account: ${line.account_id}). Use DR or CR side instead.`);
    }

    if (dr > 0 && cr > 0) {
      throw new Error(`Journal line cannot have both debit and credit > 0 (Account: ${line.account_id}).`);
    }

    if (dr === 0 && cr === 0) {
      throw new Error(`Journal line cannot have both debit and credit = 0 (Account: ${line.account_id}).`);
    }

    totalDR += dr;
    totalCR += cr;
  }

  const diff = Math.abs(totalDR - totalCR);
  if (diff > 0.01) {
    throw new Error(`Journal Entry is IMBALANCED: Total DR = ${totalDR.toFixed(2)}, Total CR = ${totalCR.toFixed(2)} (Difference: ${diff.toFixed(2)} EGP).`);
  }

  return { totalDR, totalCR };
}

/**
 * Main Journal Engine Posting function.
 * Thread-safe, idempotent, multi-currency enabled.
 *
 * @param {Object} dbOrClient - pg Pool or PoolClient (inside active transaction)
 * @param {Object} options
 * @param {string} options.tenantId
 * @param {string} [options.branchId]
 * @param {string|Date} [options.date] - defaults to today
 * @param {string} options.sourceType - 'invoice','grn','supplier_invoice','payment','reversal', etc.
 * @param {string} options.sourceId   - document UUID/ID
 * @param {string} options.entryPurpose - 'ar_revenue','cogs_inventory','inventory_grni','reversal', etc.
 * @param {string} [options.description]
 * @param {string} [options.postedBy]
 * @param {Array<Object>} options.entries - array of line objects:
 *    [ { account_id, debit, credit, transaction_currency, exchange_rate, foreign_debit, foreign_credit, cost_center_id, description } ]
 *
 * @returns {Promise<Object>} created journal entry record
 */
async function postJournal(dbOrClient, {
  tenantId,
  branchId = null,
  date = new Date(),
  sourceType,
  sourceId,
  entryPurpose,
  description = null,
  postedBy = 'SYSTEM',
  entries
}) {
  // 1. Layer 1 In-memory balance check
  validateJournalLines(entries);

  const entryDate = new Date(date).toISOString().split('T')[0];

  // 2. Idempotency Check: if this exact (source_type, source_id, entry_purpose) already posted, return it safely
  const existing = await dbOrClient.query(`
    SELECT * FROM journal_entries
    WHERE tenant_id::text = $1::text
      AND source_type = $2
      AND source_id = $3
      AND entry_purpose = $4
    LIMIT 1
  `, [String(tenantId), sourceType, String(sourceId), entryPurpose]);

  if (existing.rows.length > 0) {
    console.log(`[JournalEngine] Idempotency hit: JE already posted for ${sourceType}:${sourceId}:${entryPurpose}`);
    return { status: 'already_posted', data: existing.rows[0] };
  }

  // 3. Validate Fiscal Period is OPEN for this date
  const period = await FiscalYearService.validatePeriodOpen(dbOrClient, tenantId, entryDate);

  // 4. Validate all accounts are active posting accounts (not group accounts)
  for (const line of entries) {
    await AccountService.validatePostingAccount(dbOrClient, line.account_id, tenantId);
  }

  // 5. Generate unique JE document number (e.g. JE-2026-00042)
  const jeNumber = await nextSequence(dbOrClient, {
    tenantId,
    branchId,
    docType: 'JE',
    fiscalYear: new Date(entryDate).getFullYear()
  });

  // 6. Insert Journal Entry Header
  const jeRes = await dbOrClient.query(`
    INSERT INTO journal_entries
      (tenant_id, branch_id, number, date, fiscal_period_id, description, source_type, source_id, entry_purpose, status, posted_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'posted', $10)
    RETURNING *
  `, [
    String(tenantId), branchId || null, jeNumber, entryDate, period.id,
    description || `${sourceType} ${entryPurpose}`, String(sourceType), String(sourceId),
    entryPurpose, String(postedBy)
  ]);

  const jeHeader = jeRes.rows[0];

  // 7. Insert Journal Entry Lines (Base EGP + Foreign Currency)
  for (const line of entries) {
    const currency = line.transaction_currency || 'EGP';
    const rate     = Number(line.exchange_rate || 1.0);
    const drBase   = Number(line.debit || 0);
    const crBase   = Number(line.credit || 0);
    const fDr      = line.foreign_debit !== undefined ? Number(line.foreign_debit) : (currency !== 'EGP' ? drBase / rate : 0);
    const fCr      = line.foreign_credit !== undefined ? Number(line.foreign_credit) : (currency !== 'EGP' ? crBase / rate : 0);

    await dbOrClient.query(`
      INSERT INTO journal_entry_lines
        (journal_entry_id, account_id, debit, credit, transaction_currency, exchange_rate, foreign_debit, foreign_credit, cost_center_id, description, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      jeHeader.id, line.account_id, drBase, crBase,
      currency, rate, fDr, fCr,
      line.cost_center_id || null, line.description || null, String(tenantId)
    ]);
  }

  return jeHeader;
}

/**
 * Fetch Journal Entries with pagination & filters.
 */
async function getJournalEntries(tenantId, { startDate, endDate, sourceType, page = 1, limit = 50 } = {}) {
  let where = 'WHERE je.tenant_id::text = $1::text';
  const params = [String(tenantId)];
  let paramIdx = 2;

  if (startDate) {
    where += ` AND je.date >= $${paramIdx++}`;
    params.push(startDate);
  }
  if (endDate) {
    where += ` AND je.date <= $${paramIdx++}`;
    params.push(endDate);
  }
  if (sourceType) {
    where += ` AND je.source_type = $${paramIdx++}`;
    params.push(sourceType);
  }

  const offset = (page - 1) * limit;

  const result = await db.query(`
    SELECT je.*,
      COALESCE(json_agg(json_build_object(
        'id', jel.id,
        'account_id', jel.account_id,
        'account_code', a.code,
        'account_name', a.name,
        'debit', jel.debit,
        'credit', jel.credit,
        'currency', jel.transaction_currency,
        'exchange_rate', jel.exchange_rate,
        'cost_center_id', jel.cost_center_id,
        'cost_center_name', cc.name,
        'description', jel.description
      )) FILTER (WHERE jel.id IS NOT NULL), '[]'::json) as lines
    FROM journal_entries je
    LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    LEFT JOIN accounts a ON jel.account_id = a.id
    LEFT JOIN cost_centers cc ON jel.cost_center_id = cc.id
    ${where}
    GROUP BY je.id
    ORDER BY je.date DESC, je.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `, params);

  return result.rows;
}

/**
 * Fetch single Journal Entry by ID with full line items.
 */
async function getJournalEntryById(tenantId, id) {
  const result = await db.query(`
    SELECT je.*,
      COALESCE(json_agg(json_build_object(
        'id', jel.id,
        'account_id', jel.account_id,
        'account_code', a.code,
        'account_name', a.name,
        'debit', jel.debit,
        'credit', jel.credit,
        'currency', jel.transaction_currency,
        'exchange_rate', jel.exchange_rate,
        'cost_center_id', jel.cost_center_id,
        'cost_center_name', cc.name,
        'description', jel.description
      )) FILTER (WHERE jel.id IS NOT NULL), '[]'::json) as lines
    FROM journal_entries je
    LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    LEFT JOIN accounts a ON jel.account_id = a.id
    LEFT JOIN cost_centers cc ON jel.cost_center_id = cc.id
    WHERE je.id = $1 AND je.tenant_id::text = $2::text
    GROUP BY je.id
  `, [id, String(tenantId)]);

  return result.rows[0] || null;
}

module.exports = {
  postJournal,
  validateJournalLines,
  getJournalEntries,
  getJournalEntryById,
};
