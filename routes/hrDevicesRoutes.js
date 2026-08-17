const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getDevices, createDevice, updateDevice, deleteDevice,
  getBadgeNumbers, updateBadgeNumber, claimDevice, getDeviceRecentAttendance
} = require('../controllers/hrDevicesController');

router.use(authMiddleware);

router.get('/', getDevices);
router.post('/', createDevice);
router.put('/:id', updateDevice);
router.delete('/:id', deleteDevice);

// Badge Numbers
router.get('/badge-numbers', getBadgeNumbers);
router.put('/badge-numbers/:user_id', updateBadgeNumber);

// Device-specific actions
router.post('/:id/claim', claimDevice);
router.get('/:id/recent', getDeviceRecentAttendance);

module.exports = router;
