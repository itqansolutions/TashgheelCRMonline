const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reCancellationsController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');
const roleGuard = require('../middleware/roleGuard');
const { requirePermission } = require('../middleware/financialPermission');

router.use(authMiddleware);
router.use(branchScope);

router.get('/', ctrl.getCancellations);
router.post('/', roleGuard(['admin', 'manager']), ctrl.processCancellation);
router.patch('/:id/refund', requirePermission('payment.create'), ctrl.updateRefundStatus);

module.exports = router;
