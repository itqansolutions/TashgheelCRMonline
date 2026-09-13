const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');
const { authorize } = require('../middleware/roleMiddleware');

// All WhatsApp settings routes require admin role
router.use(authorize(['admin']));

// Get current tenant's WhatsApp configuration
router.get('/settings', whatsappController.getWhatsAppSettings);

// Save / update WhatsApp configuration
router.post('/settings', whatsappController.updateWhatsAppSettings);

// Send a test WhatsApp message to verify the integration
router.post('/test', whatsappController.sendTestWhatsApp);

// Fetch registered Phone Number IDs from Meta for a given WABA account
router.get('/phone-numbers', whatsappController.fetchPhoneNumbersFromMeta);

// Diagnostic test endpoint
router.get('/diagnose', whatsappController.diagnoseWhatsApp);

module.exports = router;
