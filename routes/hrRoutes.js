const express = require('express');
const router = express.Router();
const hrController = require('../controllers/hrController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');
const roleGuard = require('../middleware/roleGuard');
const HR_VIEW = ['admin', 'manager', 'hr']; // HR role: HR-area screens. Payroll generate/finalize stay admin/manager.

// Apply auth and strict branch isolation to ALL HR routes
router.use(authMiddleware);
router.use(branchScope);

const policy=require('../controllers/hrAttendancePolicyController');
router.get('/attendance-policy',policy.get);
router.put('/attendance-policy',roleGuard(['admin']),policy.save);
router.get('/attendance-policy/rejects',roleGuard(HR_VIEW),policy.rejects);

// --- Employee Self-Service ---
// @route   POST api/hr/attendance/check-in
router.post('/attendance/check-in', hrController.checkIn);

// @route   POST api/hr/attendance/check-out
router.post('/attendance/check-out', hrController.checkOut);

// @route   GET api/hr/attendance/my
router.get('/attendance/my', hrController.getMyAttendance);

// --- Admin / Manager View ---
// @route   GET api/hr/attendance
router.get('/attendance', roleGuard(HR_VIEW), hrController.getStaffAttendance);

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
router.get('/leaves', roleGuard(HR_VIEW), hrController.getAllLeaves);

// @route   PUT api/hr/leaves/:id/status
router.put('/leaves/:id/status', roleGuard(HR_VIEW), hrController.updateLeaveStatus);

// ============================================
// PHASE 3: PAYROLL ENGINE
// ============================================

// @route   GET api/hr/payroll/my (Employee Self-Service)
router.get('/payroll/my', hrController.getMyPayrolls);

// @route   POST api/hr/payroll/generate
router.post('/payroll/generate', roleGuard(['admin', 'manager']), hrController.generatePayroll);

// @route   GET api/hr/payroll
router.get('/payroll', roleGuard(HR_VIEW), hrController.getPayrolls);

// @route   PUT api/hr/payroll/:id/finalize
router.put('/payroll/:id/finalize', roleGuard(['admin', 'manager']), hrController.finalizePayroll);

// @route   POST api/hr/payroll/payout  (whole month sheet; posts voucher + treasury movement)
router.post('/payroll/payout', roleGuard(['admin', 'manager']), hrController.payoutPayroll);

// @route   POST api/hr/payroll/payouts/:id/reverse
router.post('/payroll/payouts/:id/reverse', roleGuard(['admin', 'manager']), hrController.reversePayrollPayout);

module.exports = router;
