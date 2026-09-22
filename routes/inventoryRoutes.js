const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');

router.use(authMiddleware);
router.use(branchScope);

// Warehouses & Keepers
router.get('/warehouses', inventoryController.getWarehouses);
router.post('/warehouses', inventoryController.createWarehouse);
router.put('/warehouses/:id', inventoryController.updateWarehouse);
router.delete('/warehouses/:id', inventoryController.deleteWarehouse);
router.get('/warehouses/:id/stock', inventoryController.getWarehouseStock);

// Direct Transfers & Stock Taking
router.post('/transfers', inventoryController.createTransfer);
router.post('/stock-take', inventoryController.recordStockTake);

// Stock & Movements
router.get('/stock', inventoryController.getStockList);
router.get('/movements', inventoryController.getMovements);
router.post('/movements', inventoryController.createMovement);
router.put('/movements/:id/approve', inventoryController.approveMovement);

module.exports = router;
