const express = require('express');
const router = express.Router();
const controller = require('../controllers/salesManagementController');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/roleMiddleware');

router.use(authMiddleware);

// @route   GET /api/sales-management/overview
// @desc    Get Sales Management Dashboard Overview & Bottlenecks
// @access  Private (Admin, Manager, Supervisor)
router.get('/overview', authorize(['admin', 'manager', 'supervisor']), controller.getOverview);

// @route   GET /api/sales-management/performance
// @desc    Get Salesmen Comparative Performance Matrix
// @access  Private (Admin, Manager, Supervisor)
router.get('/performance', authorize(['admin', 'manager', 'supervisor']), controller.getTeamPerformance);

// @route   GET /api/sales-management/salesman/:userId/360
// @desc    Get Salesman 360° Profile
// @access  Private (Admin, Manager, Supervisor, Sales/Agent)
router.get('/salesman/:userId/360', authorize(['admin', 'manager', 'supervisor', 'sales', 'agent', 'employee', 'user'], ['/sales/salesmen', '/sales-management']), controller.getSalesman360);

module.exports = router;
