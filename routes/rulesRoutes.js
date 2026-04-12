const express = require('express');
const router = express.Router();
const rulesController = require('../controllers/rulesController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');
const roleGuard = require('../middleware/roleGuard');

router.use(authMiddleware);
router.use(branchScope);
router.use(roleGuard(['admin', 'manager']));

router.get('/', rulesController.getRules);
router.post('/', rulesController.createRule);
router.put('/:id', rulesController.updateRule);
router.delete('/:id', rulesController.deleteRule);
router.post('/:id/simulate', rulesController.simulateRule);

module.exports = router;
