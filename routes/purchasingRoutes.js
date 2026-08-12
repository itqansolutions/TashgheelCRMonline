const express = require('express');
const router = express.Router();
const controller = require('../controllers/purchasingController');
const { requirePermission } = require('../middleware/financialPermission');
const { sodGuard, loadDocument } = require('../middleware/sodGuard');

// Suppliers
router.get('/suppliers',                    requirePermission('reports.operational'), controller.getSuppliers);
router.post('/suppliers',                   requirePermission('po.create'),            controller.createSupplier);

// Purchase Orders
router.get('/orders',                       requirePermission('reports.operational'), controller.getPurchaseOrders);
router.post('/orders',                      requirePermission('po.create'),            controller.createPurchaseOrder);

// Goods Receipts (GRN)
router.post('/receipts',                    requirePermission('grn.create'),           controller.createGoodsReceipt);
router.put('/receipts/:id/approve',
  requirePermission('grn.approve'),
  loadDocument('goods_receipts', 'id'),
  sodGuard('goods_receipt'),
  controller.approveGoodsReceipt
);

// Supplier Invoices (AP)
router.post('/invoices',                    requirePermission('journal.create'),       controller.createSupplierInvoice);

module.exports = router;
