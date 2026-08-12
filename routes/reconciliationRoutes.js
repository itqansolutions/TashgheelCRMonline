const express = require('express');
const router = express.Router();
const controller = require('../controllers/reconciliationController');
const { requirePermission } = require('../middleware/financialPermission');

router.get('/ar', requirePermission('reports.financial'), controller.getARReconciliation);

module.exports = router;
