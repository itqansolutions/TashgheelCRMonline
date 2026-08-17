const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getActivityTypes, createActivityType, updateActivityType, deleteActivityType
} = require('../controllers/hrActivityController');

router.use(authMiddleware);

// Activity Types
router.get('/', getActivityTypes);
router.post('/', createActivityType);
router.put('/:id', updateActivityType);
router.delete('/:id', deleteActivityType);

module.exports = router;
