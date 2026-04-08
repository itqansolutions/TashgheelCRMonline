const express = require('express');
const router = express.Router();
const invoicesController = require('../controllers/invoicesController');
const authMiddleware = require('../middleware/auth');

// Apply authMiddleware to all routes in this file
router.use(authMiddleware);

// @route   GET api/invoices
// @desc    Get all invoices
// @access  Private
router.get('/', invoicesController.getInvoices);

// @route   GET api/invoices/:id
// @desc    Get single invoice
// @access  Private
router.get('/:id', invoicesController.getInvoiceById);

// @route   POST api/invoices/from-quotation/:quotationId
// @desc    Create invoice from quotation
// @access  Private
router.post('/from-quotation/:quotationId', invoicesController.createInvoiceFromQuotation);

// @route   POST api/invoices/from-deal/:dealId
// @desc    Create invoice from deal
// @access  Private
router.post('/from-deal/:dealId', invoicesController.createInvoiceFromDeal);

// @route   POST api/invoices/:id/payments
// @desc    Add Payment to Invoice
// @access  Private
router.post('/:id/payments', invoicesController.addPayment);

// @route   DELETE api/invoices/:id
// @desc    Delete invoice
// @access  Private
router.delete('/:id', invoicesController.deleteInvoice);

module.exports = router;
