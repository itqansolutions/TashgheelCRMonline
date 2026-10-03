const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reInstallmentsController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', ctrl.getInstallments);
router.post('/generate-schedule', ctrl.generateSchedule);
router.post('/:id/pay', ctrl.recordPayment);
router.delete('/:id', ctrl.deleteInstallment);

module.exports = router;
