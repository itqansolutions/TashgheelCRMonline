const express = require('express');
const router = express.Router();
const customersController = require('../controllers/customersController');
const authMiddleware = require('../middleware/auth');

// Apply authMiddleware to all routes in this file
router.use(authMiddleware);

// @route   GET api/customers
// @desc    Get all customers
// @access  Private
router.get('/', customersController.getCustomers);

// @route   GET api/customers/:id
// @desc    Get single customer
// @access  Private
router.get('/:id', customersController.getCustomerById);

// @route   POST api/customers
// @desc    Create customer
// @access  Private
router.post('/', customersController.createCustomer);

// @route   PUT api/customers/:id
// @desc    Update customer
// @access  Private
router.put('/:id', customersController.updateCustomer);

// @route   DELETE api/customers/:id
// @desc    Delete customer
// @access  Private
router.delete('/:id', customersController.deleteCustomer);

module.exports = router;
