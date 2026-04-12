const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');

// The notification UI is branch-scoped. It lives in Header, which inherits branch scope if valid, 
// though generally notifications are pulled based on current active branch_id for strict isolation.
router.use(authMiddleware);
router.use(branchScope);

router.get('/', notificationController.getNotifications);
router.patch('/read-all', notificationController.markAllRead);
router.patch('/:id/read', notificationController.markAsRead);

module.exports = router;
