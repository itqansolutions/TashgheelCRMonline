/**
 * bankingController.js — Bank Accounts & Reconciliation REST API Controller
 */

const BankingService = require('../src/domains/finance/BankingService');

exports.getBankAccounts = async (req, res) => {
  try {
    const data = await BankingService.getBankAccounts(req.user.tenant_id);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[bankingController] getBankAccounts error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createBankAccount = async (req, res) => {
  try {
    const data = await BankingService.createBankAccount(req.user.tenant_id, req.branchId, req.body);
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    console.error('[bankingController] createBankAccount error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.importTransactions = async (req, res) => {
  const { bank_account_id, transactions } = req.body;
  if (!bank_account_id || !transactions) {
    return res.status(400).json({ status: 'error', message: 'bank_account_id and transactions array are required.' });
  }
  try {
    const data = await BankingService.importBankTransactions(req.user.tenant_id, bank_account_id, transactions);
    res.status(201).json({ status: 'success', message: `${data.length} transactions imported.`, data });
  } catch (err) {
    console.error('[bankingController] importTransactions error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.reconcileTransaction = async (req, res) => {
  const { matched_journal_entry_id } = req.body;
  if (!matched_journal_entry_id) {
    return res.status(400).json({ status: 'error', message: 'matched_journal_entry_id is required.' });
  }
  try {
    const data = await BankingService.reconcileBankTransaction(req.user.tenant_id, req.params.id, matched_journal_entry_id);
    res.json({ status: 'success', message: 'Bank transaction reconciled successfully.', data });
  } catch (err) {
    console.error('[bankingController] reconcileTransaction error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};
