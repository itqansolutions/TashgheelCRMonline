const express = require('express');
const router = express.Router();
const expensesController = require('../controllers/expensesController');
const authMiddleware = require('../middleware/auth');

// Apply authMiddleware to all routes in this file
router.use(authMiddleware);

// @route   GET api/expenses
// @desc    Get all expenses
// @access  Private
router.get('/', expensesController.getExpenses);

// @route   GET api/expenses/:id
// @desc    Get single expense
// @access  Private
router.get('/:id', expensesController.getExpenseById);

// @route   POST api/expenses
// @desc    Create expense
// @access  Private
router.post('/', expensesController.createExpense);

// @route   PUT api/expenses/:id
// @desc    Update expense
// @access  Private
router.put('/:id', expensesController.updateExpense);

// @route   DELETE api/expenses/:id
// @desc    Delete expense
// @access  Private
router.delete('/:id', expensesController.deleteExpense);

module.exports = router;
