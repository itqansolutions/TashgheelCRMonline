const express = require('express');
const router = express.Router();
const taskStatusController = require('../controllers/taskStatusController');
const authMiddleware = require('../middleware/auth');
const roleMiddleware = require('../middleware/roleGuard');

// Apply auth middleware to all routes
router.use(authMiddleware);

// @route   GET api/task-statuses
router.get('/', taskStatusController.getStatuses);

// @route   POST api/task-statuses
router.post('/', roleMiddleware(['admin', 'manager']), taskStatusController.createStatus);

// @route   PUT api/task-statuses/:id
router.put('/:id', roleMiddleware(['admin', 'manager']), taskStatusController.updateStatus);

// @route   DELETE api/task-statuses/:id
router.delete('/:id', roleMiddleware(['admin', 'manager']), taskStatusController.deleteStatus);

module.exports = router;
