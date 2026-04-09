const express = require('express');
const router = express.Router();
const tenantsController = require('../controllers/tenantsController');
const auth = require('../middleware/auth');

// All tenant routes are protected and require admin role
router.get('/:id', auth, tenantsController.getTenantById);
router.put('/:id', auth, tenantsController.updateTenant);

module.exports = router;
