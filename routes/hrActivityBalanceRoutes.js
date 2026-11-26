const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const {
  getActivityBalances, getMyActivityBalances,
  createActivityBalance, updateActivityBalance, deleteActivityBalance
} = require('../controllers/hrActivityController');

router.use(authMiddleware);

// Self-service (My Profile → Activity Balance): read-only, identity from token only.
router.get('/my', getMyActivityBalances);

// HR management of employee balances (HR → Activity Balance)
router.get('/', roleGuard(['admin', 'manager', 'hr']), getActivityBalances);
router.post('/', roleGuard(['admin', 'manager', 'hr']), createActivityBalance);
router.put('/:id', roleGuard(['admin', 'manager', 'hr']), updateActivityBalance);
router.delete('/:id', roleGuard(['admin', 'manager', 'hr']), deleteActivityBalance);

module.exports = router;
