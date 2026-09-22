const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');
const { authorize } = require('../middleware/roleMiddleware');

// ===========================================================================
// WHATSAPP CHAT & MESSAGING (Accessible by all agents & managers)
// ===========================================================================
router.get('/conversations', whatsappController.getConversations);
router.get('/conversations/:id/messages', whatsappController.getMessages);
router.post('/conversations/:id/messages', whatsappController.sendMessage);
router.post('/conversations/start', whatsappController.startNewChat);
router.patch('/conversations/:id/assign', whatsappController.assignConversation);

// Connected numbers (Listing is allowed for agent sender selection)
router.get('/accounts', whatsappController.getWhatsAppAccounts);

// Templates discovery (Agents can pick templates to send)
router.get('/templates', whatsappController.fetchApprovedTemplates);

// ===========================================================================
// CAMPAIGNS (Admin & Manager)
// ===========================================================================
router.get('/campaigns', authorize(['admin', 'manager']), whatsappController.getCampaigns);
router.get('/campaigns/:id', authorize(['admin', 'manager']), whatsappController.getCampaignDetails);
router.post('/campaigns/send', authorize(['admin', 'manager']), whatsappController.sendCampaign);

// ===========================================================================
// ACCOUNT MANAGEMENT & SETTINGS (Admin only)
// ===========================================================================
router.post('/accounts/sync', authorize(['admin']), whatsappController.syncWhatsAppAccounts);
router.post('/accounts/:id/default', authorize(['admin']), whatsappController.setDefaultWhatsAppAccount);
router.patch('/accounts/:id/toggle', authorize(['admin']), whatsappController.toggleWhatsAppAccount);

router.get('/settings', authorize(['admin']), whatsappController.getWhatsAppSettings);
router.post('/settings', authorize(['admin']), whatsappController.updateWhatsAppSettings);
router.post('/test', authorize(['admin']), whatsappController.sendTestWhatsApp);
router.get('/phone-numbers', authorize(['admin']), whatsappController.fetchPhoneNumbersFromMeta);
router.get('/diagnose', authorize(['admin']), whatsappController.diagnoseWhatsApp);

module.exports = router;
