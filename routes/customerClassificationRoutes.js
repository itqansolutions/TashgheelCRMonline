const express = require('express');
const router = express.Router();
const controller = require('../controllers/customerClassificationController');
const authMiddleware = require('../middleware/auth');

// Protect all routes with auth
router.use(authMiddleware);

// @route   GET /api/customer-classifications
// @desc    Get all classifications
router.get('/', controller.getClassifications);

// @route   POST /api/customer-classifications
// @desc    Create classification
router.post('/', controller.createClassification);

// @route   PUT /api/customer-classifications/:id
// @desc    Update classification
router.put('/:id', controller.updateClassification);

// @route   DELETE /api/customer-classifications/:id
// @desc    Delete classification
router.delete('/:id', controller.deleteClassification);

module.exports = router;
