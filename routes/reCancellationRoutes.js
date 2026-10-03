const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reCancellationsController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', ctrl.getCancellations);
router.post('/', ctrl.processCancellation);
router.patch('/:id/refund', ctrl.updateRefundStatus);

module.exports = router;
