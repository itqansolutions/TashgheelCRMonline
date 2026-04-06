const express = require('express');
const router = express.Router();
const departmentsController = require('../controllers/departmentsController');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/roleMiddleware');

// Apply authMiddleware to all routes in this file
router.use(authMiddleware);

// @route   GET api/departments
// @desc    Get all departments
// @access  Private (Admin, Manager)
router.get('/', authorize(['admin', 'manager']), departmentsController.getDepartments);

// @route   POST api/departments
// @desc    Create department
// @access  Private (Admin)
router.post('/', authorize(['admin']), departmentsController.createDepartment);

// @route   PUT api/departments/:id
// @desc    Update department
// @access  Private (Admin)
router.put('/:id', authorize(['admin']), departmentsController.updateDepartment);

// @route   DELETE api/departments/:id
// @desc    Delete department
// @access  Private (Admin)
router.delete('/:id', authorize(['admin']), departmentsController.deleteDepartment);

module.exports = router;
