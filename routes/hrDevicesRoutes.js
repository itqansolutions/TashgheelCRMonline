const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const manageHR = roleGuard(['admin', 'manager']);
const {
  getDevices, createDevice, updateDevice, deleteDevice,
  getBadgeNumbers, updateBadgeNumber, claimDevice, getDeviceRecentAttendance
} = require('../controllers/hrDevicesController');

router.use(authMiddleware);

router.get('/', getDevices);
router.post('/', manageHR, createDevice);
router.put('/:id', manageHR, updateDevice);
router.delete('/:id', deleteDevice);

// Badge Numbers
router.get('/badge-numbers', getBadgeNumbers);
router.put('/badge-numbers/:user_id', manageHR, updateBadgeNumber);

// Device-specific actions
router.post('/:id/claim', manageHR, claimDevice);
router.get('/:id/recent', getDeviceRecentAttendance);

module.exports = router;
