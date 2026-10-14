const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reInstallmentsController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');
const { requirePermission } = require('../middleware/financialPermission');

router.use(authMiddleware);
router.use(branchScope);

router.get('/', ctrl.getInstallments);
router.get('/:id/payments', ctrl.getInstallmentPayments);
router.post('/generate-schedule', ctrl.generateSchedule);
router.post('/:id/pay', requirePermission('payment.create'), ctrl.recordPayment);
router.delete('/:id', ctrl.deleteInstallment);

module.exports = router;
