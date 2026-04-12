const express = require('express');
const router = express.Router();
const branchesController = require('../controllers/branchesController');
const auth = require('../middleware/auth');
const usageLimits = require('../middleware/usageLimits');

// All branch routes are protected
router.use(auth);

router.get('/', branchesController.getBranches);
router.post('/log-switch', branchesController.logBranchSwitch);
router.post('/', usageLimits('branches'), branchesController.createBranch);
router.put('/:id', branchesController.updateBranch);
router.delete('/:id', branchesController.deleteBranch);

module.exports = router;
