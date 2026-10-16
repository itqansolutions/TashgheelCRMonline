const express = require('express');
const router = express.Router();
const dealsController = require('../controllers/dealsController');
const authMiddleware = require('../middleware/auth');
const { requireDealPermission } = require('../middleware/dealPermission');

// Apply authMiddleware to all routes in this file
router.use(authMiddleware);

// @route   GET api/deals
// @desc    Get all deals
// @access  Private (deal.view; deal.view_overdue if filtered by overdue/stalled)
router.get('/', requireDealPermission('deal.view'), dealsController.getDeals);

// @route   GET api/deals/:id
// @desc    Get single deal
// @access  Private (deal.view + row-level scope)
router.get('/:id', requireDealPermission('deal.view'), dealsController.getDealById);

// @route   POST api/deals
// @desc    Create deal
// @access  Private (deal.edit_details; deal.reassign if assigning to another user)
router.post('/', requireDealPermission('deal.edit_details'), dealsController.createDeal);

// @route   PUT api/deals/:id
// @desc    Update deal (dynamic granular permission check based on modified fields: deal.edit_details, deal.reassign, deal.update_stage)
// @access  Private
router.put('/:id', dealsController.updateDeal);

// @route   PATCH api/deals/:id/status
// @desc    Update deal status
// @access  Private (deal.update_stage)
router.patch('/:id/status', requireDealPermission('deal.update_stage'), dealsController.updateDealStatus);

// @route   DELETE api/deals/:id
// @desc    Delete deal
// @access  Private (deal.delete)
router.delete('/:id', requireDealPermission('deal.delete'), dealsController.deleteDeal);

// @route   POST api/deals/:id/extend-reservation
// @desc    Extend reservation for deal's linked unit
// @access  Private (deal.extend_sla)
router.post('/:id/extend-reservation', requireDealPermission('deal.extend_sla'), dealsController.extendDealReservation);

// @route   GET api/deals/:id/sla
// @desc    Get deal SLA status
// @access  Private (deal.view)
router.get('/:id/sla', requireDealPermission('deal.view'), dealsController.getDealSla);

// @route   POST api/deals/:id/extend-sla
// @desc    Extend deal SLA by +48h (unlimited extensions permitted)
// @access  Private (deal.extend_sla)
router.post('/:id/extend-sla', requireDealPermission('deal.extend_sla'), dealsController.extendDealSla);

// @route   POST api/deals/:id/reassign
// @desc    Reassign deal to an eligible representative
// @access  Private (deal.reassign)
router.post('/:id/reassign', requireDealPermission('deal.reassign'), dealsController.reassignDeal);

module.exports = router;

