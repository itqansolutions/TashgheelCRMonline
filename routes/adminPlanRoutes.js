const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminPlansController');
const billing = require('../controllers/billingController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Super-admin guard
const superAdminOnly = (req, res, next) => {
    const SYSTEM_TENANT = '00000000-0000-0000-0000-000000000000';
    if (req.user.role !== 'admin' || req.user.tenant_id !== SYSTEM_TENANT) {
        return res.status(403).json({ status: 'error', message: 'Super Admin access required.' });
    }
    next();
};

router.use(superAdminOnly);

// Plans CRUD
router.get('/plans',             ctrl.getAdminPlans);
router.post('/plans',            ctrl.createPlan);
router.put('/plans/:id',         ctrl.updatePlan);
router.post('/plans/:id/clone',  ctrl.clonePlan);
router.delete('/plans/:id',      ctrl.deletePlan);

// Tenant Management
router.get('/tenants',                          ctrl.getAdminTenants);
router.put('/tenants/:tenant_id/plan',          ctrl.assignPlanToTenant);
router.get('/tenants/:tenant_id/override',      ctrl.getTenantOverride);
router.put('/tenants/:tenant_id/override',      ctrl.setTenantOverride);
router.delete('/tenants/:tenant_id/override',   ctrl.removeTenantOverride);

// Billing — Upgrade Request Management
router.get('/upgrade-requests',                             billing.getUpgradeRequests);
router.post('/upgrade-requests/:id/approve',               billing.approveUpgradeRequest);
router.post('/upgrade-requests/:id/reject',                billing.rejectUpgradeRequest);
router.post('/tenants/:tenant_id/instant-upgrade',         billing.adminInstantUpgrade);

module.exports = router;
