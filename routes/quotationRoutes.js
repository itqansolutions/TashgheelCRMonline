const express = require('express');
const router = express.Router();
const quotationsController = require('../controllers/quotationsController');
const authMiddleware = require('../middleware/auth');

// Apply authMiddleware to all routes in this file
router.use(authMiddleware);

// @route   GET api/quotations
// @desc    Get all quotations
// @access  Private
router.get('/', quotationsController.getQuotations);

// @route   GET api/quotations/:id
// @desc    Get single quotation
// @access  Private
router.get('/:id', quotationsController.getQuotationById);

// @route   POST api/quotations
// @desc    Create quotation
// @access  Private
router.post('/', quotationsController.createQuotation);

// @route   PATCH api/quotations/:id/approve
// @desc    Approve a quotation
// @access  Private
router.patch('/:id/approve', quotationsController.approveQuotation);

// @route   DELETE api/quotations/:id
// @desc    Delete quotation
// @access  Private
router.delete('/:id', quotationsController.deleteQuotation);

module.exports = router;
