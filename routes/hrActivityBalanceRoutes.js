const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getActivityBalances, createActivityBalance, updateActivityBalance, deleteActivityBalance
} = require('../controllers/hrActivityController');

router.get('/', protect, getActivityBalances);
router.post('/', protect, createActivityBalance);
router.put('/:id', protect, updateActivityBalance);
router.delete('/:id', protect, deleteActivityBalance);

module.exports = router;
