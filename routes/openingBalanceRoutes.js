const express = require('express');
const router = express.Router();
const controller = require('../controllers/openingBalanceController');
const { requirePermission } = require('../middleware/financialPermission');

router.get('/',                  requirePermission('gl.view'),      controller.getOpeningBalances);
router.post('/gl',               requirePermission('opening.post'), controller.setGLOpeningBalance);
router.post('/customer-invoices', requirePermission('opening.post'), controller.addCustomerInvoice);
router.post('/supplier-invoices', requirePermission('opening.post'), controller.addSupplierInvoice);
router.post('/inventory',        requirePermission('opening.post'), controller.addInventoryLine);
router.post('/post',             requirePermission('opening.post'), controller.postOpeningBalances);

module.exports = router;
