const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const manageHR = roleGuard(['admin', 'manager', 'hr']);
const {
  getShifts, getShiftById, createShift, updateShift, deleteShift,
  getUserShifts, getUserShiftSummary, assignUserShift, removeUserShift
} = require('../controllers/hrShiftsController');

router.use(authMiddleware);

// Shifts
router.get('/', getShifts);
router.get('/user-assignments', getUserShifts);
router.get('/user-summary', getUserShiftSummary);
router.get('/:id', getShiftById);
router.post('/', manageHR, createShift);
router.put('/:id', manageHR, updateShift);
router.delete('/:id', deleteShift);

// User Shift Assignments
router.post('/assign', manageHR, assignUserShift);
router.delete('/assign/:id', removeUserShift);

module.exports = router;
