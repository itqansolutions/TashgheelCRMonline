const express = require('express');
const router = express.Router();
const controller = require('../controllers/accountsController');
const { requirePermission } = require('../middleware/financialPermission');

router.get('/',      requirePermission('gl.view'),    controller.getAccounts);
router.post('/',     requirePermission('coa.manage'), controller.createAccount);
router.post('/seed', requirePermission('coa.manage'), controller.seedCOA);

module.exports = router;
