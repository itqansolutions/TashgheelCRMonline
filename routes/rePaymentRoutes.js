const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/rePaymentsController');
const authMiddleware = require('../middleware/auth');
const { requirePermission } = require('../middleware/financialPermission');

// Protection
router.use(authMiddleware);

// Routes
router.get('/deal/:dealId', ctrl.getPaymentByDeal);
router.put('/:id', requirePermission('payment.create'), ctrl.updatePayment);
router.delete('/:id', requirePermission('payment.create'), ctrl.deletePayment);

module.exports = router;
