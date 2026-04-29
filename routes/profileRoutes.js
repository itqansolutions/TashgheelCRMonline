const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const authMiddleware = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(authMiddleware);

// @route   GET api/profile/tasks
router.get('/tasks', profileController.getTasks);

// @route   GET api/profile/deals
router.get('/deals', profileController.getDeals);

// @route   GET api/profile/customers
router.get('/customers', profileController.getCustomers);

// @route   GET api/profile/units
router.get('/units', profileController.getUnits);

module.exports = router;
