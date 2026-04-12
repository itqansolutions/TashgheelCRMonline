const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const auth = require('../middleware/auth');

// All Super Admin insights are strictly monitored
router.get('/insights', auth, superAdminController.getInsights);

module.exports = router;
