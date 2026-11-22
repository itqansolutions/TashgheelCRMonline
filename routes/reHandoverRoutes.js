const express = require('express');
const router = express.Router();
const roleGuard = require('../middleware/roleGuard');
// Owner-approved: only admin and manager may delete these records (phases are intentionally not included).
const DELETE_ROLES = ['admin', 'manager'];
const ctrl = require('../controllers/reHandoversController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');

router.use(authMiddleware);
router.use(branchScope);

router.get('/', ctrl.getHandovers);
router.post('/', ctrl.createHandover);
router.patch('/:id/status', ctrl.updateHandoverStatus);
router.delete('/:id', roleGuard(DELETE_ROLES), ctrl.deleteHandover);

module.exports = router;
