const express = require('express');
const router = express.Router();
const controller = require('../controllers/taxController');
const { requirePermission } = require('../middleware/financialPermission');

router.get('/',          requirePermission('gl.view'), controller.getTaxComponents);
router.post('/calculate', requirePermission('gl.view'), controller.calculateTaxes);

module.exports = router;
