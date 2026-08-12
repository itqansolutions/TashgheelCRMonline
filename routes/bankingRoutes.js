const express = require('express');
const router = express.Router();
const controller = require('../controllers/bankingController');
const { requirePermission } = require('../middleware/financialPermission');

router.get('/accounts',                     requirePermission('gl.view'),       controller.getBankAccounts);
router.post('/accounts',                    requirePermission('coa.manage'),    controller.createBankAccount);
router.post('/import-transactions',          requirePermission('journal.create'), controller.importTransactions);
router.put('/transactions/:id/reconcile',   requirePermission('journal.post'),   controller.reconcileTransaction);

module.exports = router;
