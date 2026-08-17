const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
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
router.post('/', createShift);
router.put('/:id', updateShift);
router.delete('/:id', deleteShift);

// User Shift Assignments
router.post('/assign', assignUserShift);
router.delete('/assign/:id', removeUserShift);

module.exports = router;
