const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authMiddleware = require('../middleware/auth');

// @route   GET api/settings
// @desc    Get all global settings (Public for branding/app title)
// @access  Public
router.get('/', settingsController.getSettings);

// @route   POST api/settings
// @desc    Update multiple global settings
// @access  Private (Admin Role enforced in controller)
router.post('/', authMiddleware, settingsController.updateSettings);

module.exports = router;
