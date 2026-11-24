const express = require('express');
const router = express.Router();
const roleGuard = require('../middleware/roleGuard');
// Owner-approved: only admin and manager may delete these records (phases are intentionally not included).
const DELETE_ROLES = ['admin', 'manager'];
const ctrl = require('../controllers/reUnitsController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');

// Protection
router.use(authMiddleware);
router.use(branchScope);

// Routes
router.get('/', ctrl.getUnits);
router.get('/match-customer/:customerId', ctrl.matchUnitsForCustomer);
router.get('/match-unit/:unitId', ctrl.matchCustomersForUnit);
router.get('/price-changes', ctrl.getPriceChanges);
router.get('/:id/events', ctrl.getUnitEvents);
router.get('/:id/stored-photos/:photoId', ctrl.getStoredUnitPhoto);
router.get('/:id/overview', ctrl.getUnitOverview);
router.get('/:id', ctrl.getUnitById);
router.post('/', ctrl.createUnit);
router.put('/:id', ctrl.updateUnit);
router.delete('/:id', roleGuard(DELETE_ROLES), ctrl.deleteUnit);
router.post('/:id/extend-reservation', ctrl.extendUnitReservation);
router.post('/:id/send-whatsapp-gallery', ctrl.sendUnitGalleryWhatsApp);

module.exports = router;
