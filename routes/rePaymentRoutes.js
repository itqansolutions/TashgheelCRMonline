const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/rePaymentsController');
const authMiddleware = require('../middleware/auth');

// Protection
router.use(authMiddleware);

// Routes
router.get('/deal/:dealId', ctrl.getPaymentByDeal);
router.put('/:id', ctrl.updatePayment);
router.delete('/:id', ctrl.deletePayment);

module.exports = router;
