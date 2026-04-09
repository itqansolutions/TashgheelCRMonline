const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notificationsController');
const auth = require('../middleware/auth');

// All notification routes are protected
router.use(auth);

router.get('/', notificationsController.getNotifications);
router.patch('/read-all', notificationsController.markAllAsRead);
router.patch('/:id/read', notificationsController.markAsRead);
router.delete('/:id', notificationsController.deleteNotification);

module.exports = router;
