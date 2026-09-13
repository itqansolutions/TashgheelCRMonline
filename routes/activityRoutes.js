const express = require('express');
const router  = express.Router();
const activityController = require('../controllers/activityController');
const protect = require('../middleware/auth');

// GET  /api/activities/:entity_type/:entity_id  — fetch timeline
router.get('/:entity_type/:entity_id', protect, activityController.getActivities);

// POST /api/activities/:entity_type/:entity_id  — manually add a log entry
router.post('/:entity_type/:entity_id', protect, activityController.createActivity);

module.exports = router;
