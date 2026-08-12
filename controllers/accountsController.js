/**
 * accountsController.js — Chart of Accounts API Controller
 */

const AccountService = require('../src/domains/accounting/AccountService');

// GET /api/erp/accounts
exports.getAccounts = async (req, res) => {
  const { as_tree } = req.query;
  try {
    const data = await AccountService.getAccounts(req.user.tenant_id, { asTree: as_tree === 'true' });
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[accountsController] getAccounts error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /api/erp/accounts
exports.createAccount = async (req, res) => {
  try {
    const account = await AccountService.createAccount(req.user.tenant_id, req.body);
    res.status(201).json({ status: 'success', data: account });
  } catch (err) {
    console.error('[accountsController] createAccount error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// POST /api/erp/accounts/seed — seed default COA explicitly if needed
exports.seedCOA = async (req, res) => {
  const db = require('../config/db');
  try {
    await AccountService.seedDefaultCOA(db, req.user.tenant_id);
    res.json({ status: 'success', message: 'Chart of Accounts seeded successfully.' });
  } catch (err) {
    console.error('[accountsController] seedCOA error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};
