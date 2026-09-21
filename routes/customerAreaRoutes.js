const express = require('express');
const router = express.Router();
const controller = require('../controllers/customerAreaController');
const authMiddleware = require('../middleware/auth');

// Protect all routes with auth
router.use(authMiddleware);

// @route   GET /api/customer-areas
// @desc    Get all areas for tenant
router.get('/', controller.getAreas);

// @route   POST /api/customer-areas
// @desc    Create area
router.post('/', controller.createArea);

// @route   PUT /api/customer-areas/:id
// @desc    Update area
router.put('/:id', controller.updateArea);

// @route   DELETE /api/customer-areas/:id
// @desc    Delete area
router.delete('/:id', controller.deleteArea);

module.exports = router;
