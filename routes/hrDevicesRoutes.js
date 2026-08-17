const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getDevices, createDevice, updateDevice, deleteDevice,
  getBadgeNumbers, updateBadgeNumber, claimDevice, getDeviceRecentAttendance
} = require('../controllers/hrDevicesController');

router.get('/', protect, getDevices);
router.post('/', protect, createDevice);
router.put('/:id', protect, updateDevice);
router.delete('/:id', protect, deleteDevice);

// Badge Numbers
router.get('/badge-numbers', protect, getBadgeNumbers);
router.put('/badge-numbers/:user_id', protect, updateBadgeNumber);

// Device-specific actions
router.post('/:id/claim', protect, claimDevice);
router.get('/:id/recent', protect, getDeviceRecentAttendance);

module.exports = router;
