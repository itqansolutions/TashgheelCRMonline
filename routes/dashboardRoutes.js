const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/roleMiddleware');

// Apply authMiddleware to all routes
router.use(authMiddleware);

// @route   GET api/dashboard/stats
// @desc    Get top-level KPIs (Role-based scope)
// @access  Private
router.get('/stats', dashboardController.getStats);

// @route   GET api/dashboard/team-performance
// @desc    Get deal stats per user
// @access  Private (Admin)
router.get('/team-performance', authorize(['admin']), dashboardController.getTeamPerformance);

module.exports = router;
