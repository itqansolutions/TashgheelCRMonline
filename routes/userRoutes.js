const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/roleMiddleware');

// Apply authMiddleware to all routes in this file
router.use(authMiddleware);

// @route   GET api/users
// @desc    Get all users (Employees)
// @access  Private (Admin, Manager)
router.get('/', authorize(['admin', 'manager']), usersController.getUsers);

// @route   PUT api/users/:id/role
// @desc    Update user role or department
// @access  Private (Admin)
router.put('/:id/role', authorize(['admin']), usersController.updateUserRole);

// @route   GET api/users/department/:deptId
// @desc    Get users by department
// @access  Private (Admin, Manager)
router.get('/department/:deptId', authorize(['admin', 'manager']), usersController.getUsersByDepartment);

// @route   GET api/users/:id/permissions
// @desc    Get user permissions
// @access  Private (Admin)
router.get('/:id/permissions', authorize(['admin']), usersController.getUserPermissions);

// @route   POST api/users/:id/permissions
// @desc    Update user permissions
// @access  Private (Admin)
router.post('/:id/permissions', authorize(['admin']), usersController.updateUserPermissions);

module.exports = router;
