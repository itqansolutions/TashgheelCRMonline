const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');
const { authorize } = require('../middleware/roleMiddleware');

// New buyer onboarding remains OFF unless explicitly activated after migration.
// Legacy POST /coexistence/onboard is blocked when this path is selected.
const verifiedOnboardingEnabled = () => process.env.WHATSAPP_VERIFIED_ONBOARDING === 'true' && process.env.ENABLE_WHATSAPP_COEXISTENCE === 'true';
const { createOnboardingRouter } = require('../services/whatsappOnboardingRouter');
let verifiedWorkflow;
const workflow = new Proxy({}, { get: (_, method) => (...args) => {
  if (!verifiedWorkflow) verifiedWorkflow = require('../services/whatsappOnboardingRuntime').createRuntime({db:require('../config/db'),axios:require('axios'),env:process.env});
  return verifiedWorkflow[method](...args);
} });
router.use('/coexistence/verified', createOnboardingRouter({express,workflow,pool:require('../config/db').pool,enabled:verifiedOnboardingEnabled}));
router.use('/coexistence/verified/operations',require('../services/whatsappVerifiedInboundOperations').createInboundOperationsRouter({express,pool:require('../config/db').pool,enabled:verifiedOnboardingEnabled}));
router.post('/coexistence/onboard', (req,res,next) => {
  if (verifiedOnboardingEnabled()) return res.status(409).json({code:'USE_VERIFIED_ONBOARDING_ATTEMPT'});
  next();
});

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
router.get('/templates', whatsappController.fetchTemplatesFromMeta);

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

// ===========================================================================
// COEXISTENCE INTEGRATION (Isolated — feature flag guarded)
// ===========================================================================
router.post('/coexistence/onboard', authorize(['admin']), whatsappController.onboardCoexistenceAccount);
router.get('/coexistence/status/:id', authorize(['admin']), whatsappController.getCoexistenceStatus);

const chatbotController = require('../controllers/chatbotController');

// Human Takeover action (Any agent can take over an active bot chat)
router.post('/conversations/:id/takeover', chatbotController.takeOverChat);

// ===========================================================================
// CHATBOTS & SCENARIOS (Admin & Manager)
// ===========================================================================
router.get('/chatbots', chatbotController.getChatbots);
router.post('/chatbots', authorize(['admin', 'manager']), chatbotController.createChatbot);
router.put('/chatbots/:id', authorize(['admin', 'manager']), chatbotController.updateChatbot);
router.patch('/chatbots/:id/toggle', authorize(['admin', 'manager']), chatbotController.toggleChatbot);
router.delete('/chatbots/:id', authorize(['admin', 'manager']), chatbotController.deleteChatbot);
router.post('/chatbots/simulate', chatbotController.simulateBotStep);

module.exports = router;
