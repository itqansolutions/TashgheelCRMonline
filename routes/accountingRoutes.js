const express = require('express');
const router = express.Router();
const accountingController = require('../controllers/accountingController');
const authMiddleware = require('../middleware/auth');

// Apply authMiddleware to all routes in this file
router.use(authMiddleware);

// @route   GET api/accounting/profit-loss
// @desc    Get Profit/Loss Summary (Cash Basis)
// @access  Private
router.get('/profit-loss', accountingController.getProfitLoss);

// @route   GET api/accounting/summary-categories
// @desc    Get Financial Summary by Category
// @access  Private
router.get('/summary-categories', accountingController.getSummaryByCategories);

module.exports = router;
