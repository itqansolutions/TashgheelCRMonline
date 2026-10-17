const express = require('express');
const router = express.Router();
const logsController = require('../controllers/logsController');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/roleMiddleware');

// PROTECTED: Admins and Managers/Supervisors (scoped) can view system logs
router.use(authMiddleware);
router.use(authorize(['admin', 'manager', 'supervisor']));

// @route   GET api/logs
// @desc    Get all system logs
router.get('/', logsController.getLogs);

module.exports = router;
