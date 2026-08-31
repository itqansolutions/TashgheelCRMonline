const express = require('express');
const router = express.Router();
const controller = require('../controllers/salesController');
const { requirePermission } = require('../middleware/financialPermission');
const { sodGuard, loadDocument } = require('../middleware/sodGuard');

// ── Sales Orders ──
router.get('/orders', controller.getSalesOrders);
router.post('/orders', controller.createSalesOrder);
router.put('/orders/:id/confirm', controller.confirmSalesOrder);
router.post('/orders/from-quotation/:quotationId', controller.convertQuotation);
router.post('/orders/:id/to-invoice', controller.convertSalesOrderToInvoice);

// ── Delivery Notes ──
router.get('/deliveries', requirePermission('reports.operational'), controller.getDeliveryNotes);
router.post('/deliveries', requirePermission('grn.create'), controller.createDeliveryNote);
router.put('/deliveries/:id/confirm',
  requirePermission('grn.approve'),
  loadDocument('delivery_notes', 'id'),
  sodGuard('delivery_note'),
  controller.confirmDeliveryNote
);

// ── Sales Targets ──
router.get('/targets', controller.getTargets);
router.post('/targets', controller.createTarget);
router.put('/targets/:id', controller.updateTarget);
router.delete('/targets/:id', controller.deleteTarget);

// ── Price Tiers ──
router.get('/price-tiers', controller.getPriceTiers);
router.post('/price-tiers', controller.createPriceTier);
router.put('/price-tiers/:id', controller.updatePriceTier);
router.delete('/price-tiers/:id', controller.deletePriceTier);

// ── Salesmen & Agents ──
router.get('/salesmen', controller.getSalesmen);

// ── Documents Hub ──
router.get('/documents', controller.getSalesDocuments);

module.exports = router;
