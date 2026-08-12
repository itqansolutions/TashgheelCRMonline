const express = require('express');
const router = express.Router();
const controller = require('../controllers/salesController');
const { requirePermission } = require('../middleware/financialPermission');
const { sodGuard, loadDocument } = require('../middleware/sodGuard');

// Sales Orders
router.get('/orders',                       requirePermission('reports.operational'), controller.getSalesOrders);
router.post('/orders',                      requirePermission('po.create'),            controller.createSalesOrder);
router.put('/orders/:id/confirm',
  requirePermission('po.approve'),
  loadDocument('sales_orders', 'id'),
  sodGuard('sales_order'),
  controller.confirmSalesOrder
);
router.post('/orders/from-quotation/:quotationId', requirePermission('po.create'),     controller.convertQuotation);

// Delivery Notes
router.get('/deliveries',                   requirePermission('reports.operational'), controller.getDeliveryNotes);
router.post('/deliveries',                  requirePermission('grn.create'),           controller.createDeliveryNote);
router.put('/deliveries/:id/confirm',
  requirePermission('grn.approve'),
  loadDocument('delivery_notes', 'id'),
  sodGuard('delivery_note'),
  controller.confirmDeliveryNote
);

module.exports = router;
