const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reRentalOccupanciesController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');

router.use(authMiddleware);
router.use(branchScope);

router.get('/', ctrl.list);
router.patch('/:id', ctrl.revise);
router.post('/:id/confirm-vacancy', ctrl.confirmVacancy);
router.post('/:id/cancel', ctrl.cancel);

module.exports = router;
