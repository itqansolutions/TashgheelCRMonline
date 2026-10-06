const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reCommissionsController');
const authMiddleware = require('../middleware/auth');
const { requirePermission } = require('../middleware/financialPermission');

router.use(authMiddleware);

router.get('/', ctrl.getCommissions);
router.post('/', ctrl.createCommission);
router.patch('/:id/status', ctrl.updateCommissionStatus);
router.post('/:id/pay', requirePermission('payment.create'), ctrl.payCommission);
router.delete('/:id', ctrl.deleteCommission);

module.exports = router;
