const express = require('express');
const router = express.Router();
const purchaseOrdersController = require('../controllers/purchaseOrdersController');

const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');

router.use(authMiddleware);
router.use(branchScope);

// Purchase Orders List & Details
router.get('/', purchaseOrdersController.getPurchaseOrders);
router.get('/:id', purchaseOrdersController.getPurchaseOrderById);

// Create (Route A: From Awarded Quotation, Route B: Direct PO)
router.post('/', purchaseOrdersController.createPurchaseOrder);

// Update (Drafts only; zero status or received_quantity tampering)
router.put('/:id', purchaseOrdersController.updatePurchaseOrder);

// Workflow Lifecycle Transitions
router.post('/:id/approve', purchaseOrdersController.approvePurchaseOrder);
router.post('/:id/send', purchaseOrdersController.sendPurchaseOrder);
router.post('/:id/cancel', purchaseOrdersController.cancelPurchaseOrder);

module.exports = router;
