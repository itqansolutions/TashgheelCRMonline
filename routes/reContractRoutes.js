const express = require('express');
const router = express.Router();
const reContractsController = require('../controllers/reContractsController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', reContractsController.getContracts);
router.post('/', reContractsController.createContract);
router.get('/:id', reContractsController.getContractById);
router.put('/:id', reContractsController.updateContract);
router.patch('/:id/status', reContractsController.updateContractStatus);

module.exports = router;
