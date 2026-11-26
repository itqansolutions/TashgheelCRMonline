const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const manageHR = roleGuard(['admin', 'manager', 'hr']);
const {
  getActivityTypes, createActivityType, updateActivityType, deleteActivityType
} = require('../controllers/hrActivityController');

router.use(authMiddleware);

// Activity Types
router.get('/', getActivityTypes);
router.post('/', manageHR, createActivityType);
router.put('/:id', manageHR, updateActivityType);
router.delete('/:id', deleteActivityType);

module.exports = router;
