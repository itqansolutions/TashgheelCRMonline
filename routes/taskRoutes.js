const express = require('express');
const router = express.Router();
const tasksController = require('../controllers/tasksController');
const authMiddleware = require('../middleware/auth');

// Apply authMiddleware to all routes in this file
router.use(authMiddleware);

// @route   GET api/tasks
// @desc    Get all tasks
// @access  Private
router.get('/', tasksController.getTasks);

// @route   GET api/tasks/:id
// @desc    Get single task
// @access  Private
router.get('/:id', tasksController.getTaskById);

// @route   POST api/tasks
// @desc    Create task
// @access  Private
router.post('/', tasksController.createTask);

// @route   PUT api/tasks/:id
// @desc    Update task
// @access  Private
router.put('/:id', tasksController.updateTask);

// @route   DELETE api/tasks/:id
// @desc    Delete task
// @access  Private
router.delete('/:id', tasksController.deleteTask);

module.exports = router;
