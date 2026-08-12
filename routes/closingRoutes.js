const express = require('express');
const router = express.Router();
const controller = require('../controllers/closingController');
const { requirePermission } = require('../middleware/financialPermission');
const { sodGuard, loadDocument } = require('../middleware/sodGuard');

// Period Closing
router.post('/month-end', requirePermission('period.close'), controller.monthEndClosing);
router.post('/year-end',  requirePermission('period.close'), controller.yearEndClosing);

// Fixed Assets
router.get('/assets',          requirePermission('gl.view'),    controller.getFixedAssets);
router.post('/assets',         requirePermission('coa.manage'), controller.createFixedAsset);
router.post('/assets/depreciate', requirePermission('journal.post'), controller.runDepreciation);

module.exports = router;
