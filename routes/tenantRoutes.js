const express = require('express');
const router = express.Router();
const tenantsController = require('../controllers/tenantsController');
const auth = require('../middleware/auth');

// All tenant routes are protected
router.get('/', auth, tenantsController.getTenants); // Super Admin only check inside controller
router.get('/:id', auth, tenantsController.getTenantById);
router.put('/:id', auth, tenantsController.updateTenant);
router.post('/:id/reset-admin', auth, tenantsController.resetAdminPassword); // Super Admin only check inside controller

module.exports = router;
