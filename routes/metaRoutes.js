const express = require('express');
const router = express.Router();
const metaController = require('../controllers/metaController');

// Webhook endpoints (Public - handshake verified by Meta token & payload)
router.get('/webhook', metaController.handleWebhookVerification);
router.post('/webhook', metaController.handleWebhookEvent);

// Form Management & Sync (Protected by auth in server.js or per-route)
router.get('/forms', metaController.getMetaForms);
router.post('/forms', metaController.createMetaForm);
router.put('/forms/:id', metaController.updateMetaForm);
router.delete('/forms/:id', metaController.deleteMetaForm);
router.post('/forms/:id/sync', metaController.syncFormLeads);

// Settings
router.get('/settings', metaController.getMetaSettings);
router.post('/settings', metaController.updateMetaSettings);

module.exports = router;
