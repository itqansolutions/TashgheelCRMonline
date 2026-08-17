const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getShifts, getShiftById, createShift, updateShift, deleteShift,
  getUserShifts, getUserShiftSummary, assignUserShift, removeUserShift
} = require('../controllers/hrShiftsController');

// Shifts
router.get('/', protect, getShifts);
router.get('/user-assignments', protect, getUserShifts);
router.get('/user-summary', protect, getUserShiftSummary);
router.get('/:id', protect, getShiftById);
router.post('/', protect, createShift);
router.put('/:id', protect, updateShift);
router.delete('/:id', protect, deleteShift);

// User Shift Assignments
router.post('/assign', protect, assignUserShift);
router.delete('/assign/:id', protect, removeUserShift);

module.exports = router;
