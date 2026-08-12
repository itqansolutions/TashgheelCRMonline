/**
 * BankingService — ERP Bank Account & Reconciliation Service
 *
 * Responsibilities:
 *  - Bank Accounts Master Data (linked to GL Account)
 *  - Bank Statement Transaction Import
 *  - Bank Reconciliation Engine (matches statement transaction to posted GL Journal Entry)
 */

const db = require('../../../config/db');
const AccountService = require('../accounting/AccountService');

async function getBankAccounts(tenantId) {
  const result = await db.query(`
    SELECT ba.*, a.code as gl_account_code, a.name as gl_account_name
    FROM bank_accounts ba
    LEFT JOIN accounts a ON ba.gl_account_id = a.id
    WHERE ba.tenant_id::text = $1::text AND ba.is_active = true
    ORDER BY ba.name ASC
  `, [String(tenantId)]);

  return result.rows;
}

async function createBankAccount(tenantId, branchId, data) {
  const { name, account_number, bank_name, currency, gl_account_id, opening_balance } = data;

  let glId = gl_account_id;
  if (!glId) {
    const bankAcc = await AccountService.getAccountBySubType(tenantId, 'bank');
    glId = bankAcc.id;
  }

  const result = await db.query(`
    INSERT INTO bank_accounts
      (tenant_id, branch_id, name, account_number, bank_name, currency, gl_account_id, opening_balance)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [String(tenantId), branchId || null, name, account_number || null, bank_name || null, currency || 'EGP', glId, opening_balance || 0]);

  return result.rows[0];
}

async function importBankTransactions(tenantId, bankAccountId, transactions) {
  const records = [];
  for (const tx of transactions) {
    const res = await db.query(`
      INSERT INTO bank_transactions
        (tenant_id, bank_account_id, transaction_date, description, debit, credit, reference)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      String(tenantId), bankAccountId, tx.transaction_date || new Date(),
      tx.description || null, tx.debit || 0, tx.credit || 0, tx.reference || null
    ]);
    records.push(res.rows[0]);
  }

  return records;
}

async function reconcileBankTransaction(tenantId, transactionId, journalEntryId) {
  const result = await db.query(`
    UPDATE bank_transactions
    SET is_reconciled = true, matched_journal_entry_id = $1
    WHERE id = $2 AND tenant_id::text = $3::text
    RETURNING *
  `, [journalEntryId, transactionId, String(tenantId)]);

  if (result.rows.length === 0) {
    throw new Error('Bank transaction not found or already reconciled.');
  }

  return result.rows[0];
}

module.exports = {
  getBankAccounts,
  createBankAccount,
  importBankTransactions,
  reconcileBankTransaction,
};
