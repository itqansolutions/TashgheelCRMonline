const express = require('express');
const router = express.Router();
const propertyFinderController = require('../controllers/propertyFinderController');
const authMiddleware = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

/**
 * 🛣️ Property Finder Integration Routes
 * All endpoints below are protected by authMiddleware & roleGuard.
 * Note: The public webhook receiver is mounted separately in server.js.
 */

// Integration Settings & Status
router.get(
  '/settings',
  authMiddleware,
  roleGuard(['admin', 'manager']),
  propertyFinderController.getSettings
);

router.put(
  '/settings',
  authMiddleware,
  roleGuard(['admin']),
  propertyFinderController.saveSettings
);

// Connection Testing & Disconnect
router.post(
  '/test-connection',
  authMiddleware,
  roleGuard(['admin']),
  propertyFinderController.testConnection
);

router.post(
  '/disconnect',
  authMiddleware,
  roleGuard(['admin']),
  propertyFinderController.disconnect
);

// Listing Import Synchronization
router.post(
  '/sync/import',
  authMiddleware,
  roleGuard(['admin', 'manager']),
  propertyFinderController.triggerImport
);

// Real Estate Unit Publishing Lifecycle
router.get(
  '/units/:unitId/status',
  authMiddleware,
  roleGuard(['admin', 'manager', 'user']),
  propertyFinderController.getUnitPublicationStatus
);

router.post(
  '/units/:unitId/publish',
  authMiddleware,
  roleGuard(['admin', 'manager']),
  propertyFinderController.publishUnit
);

router.post(
  '/units/:unitId/unpublish',
  authMiddleware,
  roleGuard(['admin', 'manager']),
  propertyFinderController.unpublishUnit
);

// Audit & Activity Logs
router.get(
  '/logs',
  authMiddleware,
  roleGuard(['admin', 'manager']),
  propertyFinderController.getLogs
);

module.exports = router;
