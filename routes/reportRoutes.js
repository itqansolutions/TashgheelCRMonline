const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/roleMiddleware');

// Apply authMiddleware to all routes
router.use(authMiddleware);

// @route   GET api/reports/top-products
// @desc    Get top 10 products by revenue
// @access  Private (Admin, Manager)
router.get('/top-products', authorize(['admin', 'manager']), reportsController.getTopProducts);

// @route   GET api/reports/financial-trends
// @desc    Monthly revenue vs expenses
// @access  Private (Admin)
router.get('/financial-trends', authorize(['admin']), reportsController.getFinancialTrends);

// @route   GET api/reports/customer-rankings
// @desc    Top 10 customers by revenue
// @access  Private (Admin, Manager)
router.get('/customer-rankings', authorize(['admin', 'manager']), reportsController.getCustomerRankings);

module.exports = router;
