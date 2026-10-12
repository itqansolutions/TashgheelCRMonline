const express = require('express');
const router = express.Router();
const controller = require('../controllers/reTargetController');
const { authorize } = require('../middleware/roleMiddleware');

router.get('/my-progress', controller.getMyTargetProgress);
router.get('/salesmen', authorize(['admin', 'manager', 'supervisor', 'sales', 'agent', 'employee']), controller.getSalesmen);
router.get('/salesmen/:userId/performance', authorize(['admin', 'manager', 'supervisor', 'sales', 'agent', 'employee']), controller.getSalesmanPerformance);
router.get('/performance/:userId', authorize(['admin', 'manager', 'supervisor', 'sales', 'agent', 'employee']), controller.getSalesmanPerformance);
router.get('/', authorize(['admin', 'manager', 'supervisor', 'sales', 'agent', 'employee']), controller.getTargets);

router.post('/', authorize(['admin', 'manager', 'supervisor']), controller.createTarget);
router.put('/:id', authorize(['admin', 'manager', 'supervisor']), controller.updateTarget);
router.delete('/:id', authorize(['admin', 'manager', 'supervisor']), controller.deleteTarget);

module.exports = router;
