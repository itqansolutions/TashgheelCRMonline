const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reUnitsController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');

// Protection
router.use(authMiddleware);
router.use(branchScope);

// Routes
router.get('/', ctrl.getUnits);
router.post('/', ctrl.createUnit);
router.put('/:id', ctrl.updateUnit);
router.delete('/:id', ctrl.deleteUnit);

module.exports = router;
