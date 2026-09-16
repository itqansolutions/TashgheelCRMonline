const express = require('express');
const router = express.Router();
const metaController = require('../controllers/metaController');

// Webhook endpoints (Public - handshake verified by Meta token & payload)
router.get('/webhook', metaController.handleWebhookVerification);
router.post('/webhook', metaController.handleWebhookEvent);

// All routes below require authentication (enforced by the global authMiddleware
// in server.js). Tenant isolation is guaranteed per-query via req.tenant_id.
// Page-level access is controlled by the frontend ProtectedRoute + allowedPages.

// Form Management & Sync
router.get('/forms', metaController.getMetaForms);
router.post('/forms', metaController.createMetaForm);
router.put('/forms/:id', metaController.updateMetaForm);
router.delete('/forms/:id', metaController.deleteMetaForm);
router.post('/forms/:id/sync', metaController.syncFormLeads);
router.get('/forms/:id/customers', metaController.getFormCustomers);

// Settings
router.get('/settings', metaController.getMetaSettings);
router.post('/settings', metaController.updateMetaSettings);

module.exports = router;
