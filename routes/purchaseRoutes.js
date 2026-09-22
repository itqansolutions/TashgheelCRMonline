const express = require('express');
const router = express.Router();
const purchasesController = require('../controllers/purchasesController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');

router.use(authMiddleware);
router.use(branchScope);

// Purchase Invoices
router.get('/', purchasesController.getPurchaseInvoices);
router.post('/', purchasesController.createPurchaseInvoice);

// Vendor Statement & Balance (Simplified CRM)
router.get('/vendors/:id/statement', purchasesController.getVendorStatement);
router.post('/vendors/:id/payments', purchasesController.recordVendorPayment);

module.exports = router;
