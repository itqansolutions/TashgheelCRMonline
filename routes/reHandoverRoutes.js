const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reHandoversController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', ctrl.getHandovers);
router.post('/', ctrl.createHandover);
router.patch('/:id/status', ctrl.updateHandoverStatus);
router.delete('/:id', ctrl.deleteHandover);

module.exports = router;
