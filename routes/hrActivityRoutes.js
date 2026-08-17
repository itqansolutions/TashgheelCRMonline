const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getActivityTypes, createActivityType, updateActivityType, deleteActivityType,
  getActivityBalances, createActivityBalance, updateActivityBalance, deleteActivityBalance
} = require('../controllers/hrActivityController');

// Activity Types
router.get('/', protect, getActivityTypes);
router.post('/', protect, createActivityType);
router.put('/:id', protect, updateActivityType);
router.delete('/:id', protect, deleteActivityType);

module.exports = router;
