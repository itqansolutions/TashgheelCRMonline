const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');

router.use(authMiddleware);
router.use(branchScope);

// Warehouses
router.get('/warehouses', inventoryController.getWarehouses);

// Stock & Movements
router.get('/stock', inventoryController.getStockList);
router.get('/movements', inventoryController.getMovements);
router.post('/movements', inventoryController.createMovement);
router.put('/movements/:id/approve', inventoryController.approveMovement);

module.exports = router;
