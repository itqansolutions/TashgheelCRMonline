const express = require('express');
const router = express.Router();
const controller = require('../controllers/fiscalYearController');
const { requirePermission } = require('../middleware/financialPermission');

// All routes already protected by global authMiddleware + branchScope in server.js

// Fiscal Years
router.get('/',         requirePermission('gl.view'),      controller.listFiscalYears);
router.post('/',        requirePermission('fiscal.manage'), controller.ensureFiscalYear);

// Fiscal Periods
router.put('/periods/:id/close',  requirePermission('period.close'),  controller.closePeriod);
router.put('/periods/:id/lock',   requirePermission('period.close'),  controller.lockPeriod);
router.put('/periods/:id/reopen', requirePermission('period.reopen'), controller.reopenPeriod);

module.exports = router;
