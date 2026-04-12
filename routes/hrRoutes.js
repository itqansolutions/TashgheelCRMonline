const express = require('express');
const router = express.Router();
const hrController = require('../controllers/hrController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');
const roleGuard = require('../middleware/roleGuard');

// Apply auth and strict branch isolation to ALL HR routes
router.use(authMiddleware);
router.use(branchScope);

// --- Employee Self-Service ---
// @route   POST api/hr/attendance/check-in
router.post('/attendance/check-in', hrController.checkIn);

// @route   POST api/hr/attendance/check-out
router.post('/attendance/check-out', hrController.checkOut);

// @route   GET api/hr/attendance/my
router.get('/attendance/my', hrController.getMyAttendance);

// --- Admin / Manager View ---
// @route   GET api/hr/attendance
router.get('/attendance', roleGuard(['admin', 'manager']), hrController.getStaffAttendance);

// ============================================
// PHASE 2: LEAVE MANAGEMENT & OPERATIONS
// ============================================

// --- Employee Self-Service Leaves ---
// @route   POST api/hr/leaves
router.post('/leaves', hrController.submitLeave);

// @route   GET api/hr/leaves/my
router.get('/leaves/my', hrController.getMyLeaves);

// --- Admin / Manager Leaves ---
// @route   GET api/hr/leaves
router.get('/leaves', roleGuard(['admin', 'manager']), hrController.getAllLeaves);

// @route   PUT api/hr/leaves/:id/status
router.put('/leaves/:id/status', roleGuard(['admin', 'manager']), hrController.updateLeaveStatus);

// ============================================
// PHASE 3: PAYROLL ENGINE
// ============================================

// @route   POST api/hr/payroll/generate
router.post('/payroll/generate', roleGuard(['admin', 'manager']), hrController.generatePayroll);

// @route   GET api/hr/payroll
router.get('/payroll', roleGuard(['admin', 'manager']), hrController.getPayrolls);

// @route   PUT api/hr/payroll/:id/finalize
router.put('/payroll/:id/finalize', roleGuard(['admin', 'manager']), hrController.finalizePayroll);

module.exports = router;
