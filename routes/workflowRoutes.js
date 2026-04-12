const express = require('express');
const router = express.Router();
const workflowController = require('../controllers/workflowController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');
const roleGuard = require('../middleware/roleGuard');

router.use(authMiddleware);
router.use(branchScope);

// Logs: Manager + Admin can read
router.get('/logs', roleGuard(['admin', 'manager']), workflowController.getLogs);

// Config: Admin only (security — only admin can toggle automation rules)
router.get('/config', roleGuard(['admin', 'manager']), workflowController.getConfig);
router.patch('/config/:rule_key/toggle', roleGuard(['admin']), workflowController.toggleRule);
router.patch('/config/:rule_key/cooldown', roleGuard(['admin']), workflowController.updateCooldown);

module.exports = router;
