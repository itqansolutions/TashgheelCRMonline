const express = require('express');
const router = express.Router();
const productsController = require('../controllers/productsController');
const authMiddleware = require('../middleware/auth');

// Apply authMiddleware to all routes in this file
router.use(authMiddleware);

// @route   GET api/products
// @desc    Get all products
// @access  Private
router.get('/', productsController.getProducts);

// @route   GET api/products/:id
// @desc    Get single product
// @access  Private
router.get('/:id', productsController.getProductById);

// @route   POST api/products
// @desc    Create product
// @access  Private
router.post('/', productsController.createProduct);

// @route   PUT api/products/:id
// @desc    Update product
// @access  Private
router.put('/:id', productsController.updateProduct);

// @route   DELETE api/products/:id
// @desc    Delete product
// @access  Private
router.delete('/:id', productsController.deleteProduct);

module.exports = router;
