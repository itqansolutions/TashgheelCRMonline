const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reCommissionsController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', ctrl.getCommissions);
router.post('/', ctrl.createCommission);
router.patch('/:id/status', ctrl.updateCommissionStatus);
router.post('/:id/pay', ctrl.payCommission);
router.delete('/:id', ctrl.deleteCommission);

module.exports = router;
