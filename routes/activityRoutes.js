const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const protect = require('../middleware/auth');

router.get('/:entity_type/:entity_id', protect, activityController.getActivities);

module.exports = router;
