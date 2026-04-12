const express = require('express');
const router = express.Router();
const billing = require('../controllers/billingController');
const authMiddleware = require('../middleware/auth');
const subscriptionGuard = require('../middleware/subscriptionGuard');

router.use(authMiddleware);
router.use(subscriptionGuard);

// Tenant billing routes
router.get('/', billing.getMyBilling);
router.post('/request-upgrade', billing.requestUpgrade);
router.delete('/request-upgrade', billing.cancelUpgradeRequest);

module.exports = router;
