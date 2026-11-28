const express = require('express');
const router = express.Router();
const controller = require('../controllers/whatsappQrController');
const { authorize } = require('../middleware/roleMiddleware');

// WhatsApp QR linking (unofficial pairing, no Meta APIs).
// Isolated from the Cloud API / Coexistence module: admin-only, and only rows
// with connection_type = 'qr_link' are ever read or written here.
router.get('/health', authorize(['admin']), controller.health);
router.get('/accounts', authorize(['admin', 'manager']), controller.listAccounts);
router.post('/accounts', authorize(['admin']), controller.createAccount);
router.get('/accounts/:id/status', authorize(['admin', 'manager']), controller.getStatus);
router.post('/accounts/:id/refresh', authorize(['admin']), controller.refreshSession);
router.post('/accounts/:id/unlink', authorize(['admin']), controller.unlink);
router.delete('/accounts/:id', authorize(['admin']), controller.deleteAccount);

module.exports = router;
