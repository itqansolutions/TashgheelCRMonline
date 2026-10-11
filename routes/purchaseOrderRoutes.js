const express = require('express');
const router = express.Router();
const purchaseOrdersController = require('../controllers/purchaseOrdersController');
const purchasesController = require('../controllers/purchasesController');

const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');

router.use(authMiddleware);
router.use(branchScope);

// Purchase Orders List & Details
router.get('/', purchaseOrdersController.getPurchaseOrders);
router.get('/:id', purchaseOrdersController.getPurchaseOrderById);

// Create (Route A: From Awarded Quotation, Route B: Direct PO, Route C: Direct PR)
router.post('/', purchaseOrdersController.createPurchaseOrder);

// Update (Drafts only; zero status or received_quantity tampering)
router.put('/:id', purchaseOrdersController.updatePurchaseOrder);

// Workflow Lifecycle Transitions
router.post('/:id/approve', purchaseOrdersController.approvePurchaseOrder);
router.post('/:id/send', purchaseOrdersController.sendPurchaseOrder);
router.post('/:id/cancel', purchaseOrdersController.cancelPurchaseOrder);

// Phase 5B.4: Receive Items against PO
router.post('/:id/receive', purchaseOrdersController.receivePurchaseOrderItems);

// Subphase 2.1: Create Supplier Invoice from Received PO
router.post('/:id/invoice', purchasesController.createInvoiceFromPurchaseOrder);

module.exports = router;
