const express = require('express');
const router = express.Router();
const vendorsController = require('../controllers/vendorsController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', vendorsController.getVendors);
router.get('/:id', vendorsController.getVendorById);
router.post('/', vendorsController.createVendor);
router.put('/:id', vendorsController.updateVendor);
router.delete('/:id', vendorsController.deleteVendor);

module.exports = router;
