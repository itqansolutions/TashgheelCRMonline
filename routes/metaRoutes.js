const express = require('express');
const router = express.Router();
const metaController = require('../controllers/metaController');
const { authorize } = require('../middleware/roleMiddleware');

// Webhook endpoints (Public - handshake verified by Meta token & payload)
router.get('/webhook', metaController.handleWebhookVerification);
router.post('/webhook', metaController.handleWebhookEvent);

// Integration configuration has access to tenant credentials and must be
// managed only by the tenant administrator. The public webhook routes above
// are mounted directly by server.js before this protected router.
router.use(authorize(['admin']));

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
