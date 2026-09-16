const express = require('express');
const router = express.Router();
const metaController = require('../controllers/metaController');
const { authorize } = require('../middleware/roleMiddleware');

// Webhook endpoints (Public - handshake verified by Meta token & payload)
router.get('/webhook', metaController.handleWebhookVerification);
router.post('/webhook', metaController.handleWebhookEvent);

// Integration configuration access is guarded at the page-permission level.
// Admins always have full access; managers and employees can be granted access
// via the Page Permissions system (allowedPages: '/integrations/meta-forms').
router.use(authorize(['admin', 'manager', 'employee']));

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
