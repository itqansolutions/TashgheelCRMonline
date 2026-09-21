const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');

// Apply auth and strict branch isolation to ALL finance routes
router.use(authMiddleware);
router.use(branchScope);

// @route   GET api/finance/invoices
// @desc    Get all isolated invoices
router.get('/invoices', financeController.getInvoices);

// @route   POST api/finance/invoices
// @desc    Create new isolated invoice and items
router.post('/invoices', financeController.createInvoice);

// @route   POST api/finance/invoices/from-deal/:dealId
// @desc    Convert Deal to Invoice directly
router.post('/invoices/from-deal/:dealId', financeController.createInvoiceFromDeal);

// @route   GET api/finance/invoices/:id
// @desc    Deep fetch for particular Invoice (Items + Payments)
router.get('/invoices/:id', financeController.getInvoiceDetails);

// @route   POST api/finance/payments
// @desc    Register a payment and run Smart Status calculation
router.post('/payments', financeController.createPayment);

// @route   POST api/finance/invoices/:id/payments
// @desc    Register a payment directly to an invoice (nested route compatibility)
router.post('/invoices/:id/payments', financeController.createInvoicePaymentDirect);

// @route   GET api/finance/vouchers
// @desc    Get all vouchers (Receipt & Payment) with optional type filter
router.get('/vouchers', financeController.getVouchers);

// @route   POST api/finance/vouchers
// @desc    Create a new voucher (Receipt or Payment)
router.post('/vouchers', financeController.createVoucher);

// @route   GET api/finance/vouchers/:id
// @desc    Get detailed voucher for preview & printing
router.get('/vouchers/:id', financeController.getVoucherDetails);

// @route   DELETE api/finance/vouchers/:id
// @desc    Delete/Cancel a voucher
router.delete('/vouchers/:id', financeController.deleteVoucher);

// @route   GET api/finance/expenses
// @desc    Get expenses under finance
router.get('/expenses', financeController.getExpenses);

// @route   POST api/finance/expenses
// @desc    Create an expense under finance
router.post('/expenses', financeController.createExpense);

// @route   GET api/finance/income
// @desc    Get income records under finance
router.get('/income', financeController.getIncome);

// @route   GET api/finance/summary
// @desc    Get financial KPI summary
router.get('/summary', financeController.getSummary);

module.exports = router;

