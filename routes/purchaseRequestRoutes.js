const express = require('express');
const router = express.Router();
const purchaseRequestsController = require('../controllers/purchaseRequestsController');

// All /api routes already pass through authMiddleware, branchScope, subscriptionGuard in server.js,
// but router-level safety ensures robustness if imported independently.
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');

router.use(authMiddleware);
router.use(branchScope);

// List & Detail
router.get('/', purchaseRequestsController.getPurchaseRequests);
router.get('/:id', purchaseRequestsController.getPurchaseRequestById);

// Create & Update (Drafts)
router.post('/', purchaseRequestsController.createPurchaseRequest);
router.put('/:id', purchaseRequestsController.updatePurchaseRequest);

// Lifecycle Transitions
router.post('/:id/submit', purchaseRequestsController.submitPurchaseRequest);
router.post('/:id/approve', purchaseRequestsController.approvePurchaseRequest);
router.post('/:id/reject', purchaseRequestsController.rejectPurchaseRequest);
router.post('/:id/cancel', purchaseRequestsController.cancelPurchaseRequest);

module.exports = router;
