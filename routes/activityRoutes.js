const express = require('enhanced-express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/:entity_type/:entity_id', protect, activityController.getActivities);

module.exports = router;
