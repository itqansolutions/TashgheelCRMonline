const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/roleMiddleware');

const branchScope = require('../middleware/branchScope');

// Apply authMiddleware to all routes
router.use(authMiddleware);

// Apply branchScope middleware so we have access to req.branchId
router.use(branchScope);

// @route   GET api/dashboard/branch-summary
// @desc    Get top-level KPIs (Role-Based & ViewMode enabled)
// @access  Private
router.get('/branch-summary', dashboardController.getBranchSummary);

// @route   GET api/dashboard/branch-comparison
// @desc    Get cross-branch performance data
// @access  Private (Admin/Manager only)
router.get('/branch-comparison', authorize(['admin', 'manager']), dashboardController.getComparison);

module.exports = router;
