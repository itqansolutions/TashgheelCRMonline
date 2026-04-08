const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authMiddleware = require('../middleware/auth');

// Apply authMiddleware to all routes
router.use(authMiddleware);

// @route   GET api/settings
// @desc    Get all global settings
// @access  Private
router.get('/', settingsController.getSettings);

// @route   POST api/settings
// @desc    Update multiple global settings
// @access  Private (Admin Role enforced in controller)
router.post('/', settingsController.updateSettings);

module.exports = router;
