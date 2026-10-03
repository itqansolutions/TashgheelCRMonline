const express = require('express');
const router = express.Router();
const rfqController = require('../controllers/rfqController');

const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');

router.use(authMiddleware);
router.use(branchScope);

// RFQ List & Details
router.get('/', rfqController.getRfqs);
router.get('/:id', rfqController.getRfqById);

// Create & Update (Drafts)
router.post('/', rfqController.createRfq);
router.put('/:id', rfqController.updateRfq);

// Workflow Lifecycle
router.post('/:id/send', rfqController.sendRfq);
router.post('/:id/cancel', rfqController.cancelRfq);

// Invited Vendors Management
router.post('/:id/vendors', rfqController.addVendorToRfq);
router.delete('/:id/vendors/:vendorId', rfqController.removeVendorFromRfq);

// Vendor Quotations & Comparison
router.post('/:id/quotations', rfqController.createVendorQuotation);
router.get('/:id/compare', rfqController.compareQuotations);

// Award Quotation (Managers / Admins only)
router.post('/:id/award', rfqController.awardQuotation);

module.exports = router;
