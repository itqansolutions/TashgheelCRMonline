const express = require('express');
const router = express.Router();
const leadSourceController = require('../controllers/leadSourceController');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/roleMiddleware');

// Apply authMiddleware to all routes in this file
router.use(authMiddleware);

// @route   GET api/lead-sources
// @desc    Get all lead sources
// @access  Private
router.get('/', leadSourceController.getSources);

// @route   POST api/lead-sources
// @desc    Create lead source
// @access  Private (Admin)
router.post('/', authorize(['admin']), leadSourceController.createSource);

// @route   PUT api/lead-sources/:id
// @desc    Update lead source
// @access  Private (Admin)
router.put('/:id', authorize(['admin']), leadSourceController.updateSource);

// @route   DELETE api/lead-sources/:id
// @desc    Delete lead source
// @access  Private (Admin)
router.delete('/:id', authorize(['admin']), leadSourceController.deleteSource);

module.exports = router;
