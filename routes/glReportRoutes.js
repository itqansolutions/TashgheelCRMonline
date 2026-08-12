const express = require('express');
const router = express.Router();
const controller = require('../controllers/glReportController');
const { requirePermission } = require('../middleware/financialPermission');

router.get('/trial-balance',    requirePermission('reports.financial'), controller.getTrialBalance);
router.get('/balance-sheet',    requirePermission('reports.financial'), controller.getBalanceSheet);
router.get('/income-statement', requirePermission('reports.financial'), controller.getIncomeStatement);
router.get('/ar-aging',         requirePermission('reports.financial'), controller.getARAging);

module.exports = router;
