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
router.get('/', roleGuard(['admin', 'manager']), getActivityBalances);
router.post('/', roleGuard(['admin', 'manager']), createActivityBalance);
router.put('/:id', roleGuard(['admin', 'manager']), updateActivityBalance);
router.delete('/:id', roleGuard(['admin', 'manager']), deleteActivityBalance);

module.exports = router;
