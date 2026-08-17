const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getActivityBalances, createActivityBalance, updateActivityBalance, deleteActivityBalance
} = require('../controllers/hrActivityController');

router.use(authMiddleware);

router.get('/', getActivityBalances);
router.post('/', createActivityBalance);
router.put('/:id', updateActivityBalance);
router.delete('/:id', deleteActivityBalance);

module.exports = router;
