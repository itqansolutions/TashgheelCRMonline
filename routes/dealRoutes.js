const express = require('express');
const router = express.Router();
const dealsController = require('../controllers/dealsController');
const authMiddleware = require('../middleware/auth');

// Apply authMiddleware to all routes in this file
router.use(authMiddleware);

// @route   GET api/deals
// @desc    Get all deals
// @access  Private
router.get('/', dealsController.getDeals);

// @route   GET api/deals/:id
// @desc    Get single deal
// @access  Private
router.get('/:id', dealsController.getDealById);

// @route   POST api/deals
// @desc    Create deal
// @access  Private
router.post('/', dealsController.createDeal);

// @route   PUT api/deals/:id
// @desc    Update deal
// @access  Private
router.put('/:id', dealsController.updateDeal);

// @route   PATCH api/deals/:id/status
// @desc    Update deal status
// @access  Private
router.patch('/:id/status', dealsController.updateDealStatus);

// @route   DELETE api/deals/:id
// @desc    Delete deal
// @access  Private
router.delete('/:id', dealsController.deleteDeal);

module.exports = router;
