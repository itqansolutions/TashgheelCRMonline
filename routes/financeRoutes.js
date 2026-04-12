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

module.exports = router;
