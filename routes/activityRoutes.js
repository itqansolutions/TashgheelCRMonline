const express = require('express');
const router  = express.Router();
const activityController = require('../controllers/activityController');
const protect = require('../middleware/auth');

// GET /api/activities/reports/deal-activity — manual call/WhatsApp counts per employee (must precede the generic route)
router.get('/reports/deal-activity', protect, activityController.getDealActivityReport);

// GET  /api/activities/:entity_type/:entity_id  — fetch timeline
router.get('/:entity_type/:entity_id', protect, activityController.getActivities);

// POST /api/activities/:entity_type/:entity_id  — manually add a log entry
router.post('/:entity_type/:entity_id', protect, activityController.createActivity);

// PATCH /api/activities/:id/reminder — dismiss or reschedule reminder
router.patch('/:id/reminder', protect, activityController.updateReminder);

module.exports = router;

