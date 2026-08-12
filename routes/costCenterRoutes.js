const express = require('express');
const router = express.Router();
const controller = require('../controllers/costCenterController');
const { requirePermission } = require('../middleware/financialPermission');

router.get('/',  requirePermission('gl.view'),    controller.getCostCenters);
router.post('/', requirePermission('coa.manage'), controller.createCostCenter);

module.exports = router;
