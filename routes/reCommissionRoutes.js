const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reCommissionsController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');
const roleGuard = require('../middleware/roleGuard');
const { requirePermission } = require('../middleware/financialPermission');

router.use(authMiddleware);
router.use(branchScope);

router.get('/', ctrl.getCommissions);
router.post('/', roleGuard(['admin', 'manager']), ctrl.createCommission);
router.patch('/:id/status', roleGuard(['admin', 'manager']), ctrl.updateCommissionStatus);
router.post('/:id/pay', requirePermission('payment.create'), ctrl.payCommission);
router.delete('/:id', roleGuard(['admin', 'manager']), ctrl.deleteCommission);

module.exports = router;
