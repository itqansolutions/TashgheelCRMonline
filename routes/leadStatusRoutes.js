const express = require('express');
const router = express.Router();
const leadStatusController = require('../controllers/leadStatusController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
    .get(leadStatusController.getStatuses)
    .post(leadStatusController.createStatus);

router.route('/:id')
    .put(leadStatusController.updateStatus)
    .delete(leadStatusController.deleteStatus);

module.exports = router;
