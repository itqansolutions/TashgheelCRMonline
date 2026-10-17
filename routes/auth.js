const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const { loginRateLimiter } = require('../middleware/rateLimit');

// @route   POST api/auth/register
// @desc    Register a new user & Create Tenant (internal/platform owner only — public signups must use /register-request)
// @access  Private (Platform Super Admin)
router.post('/register', authMiddleware, (req, res, next) => {
  if (req.user?.tenant_id !== '00000000-0000-0000-0000-000000000000' || req.user?.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Direct tenant provisioning is restricted to the platform administrator. Please submit a registration request.'
    });
  }
  next();
}, authController.register);

// @route   POST api/auth/register-request
// @desc    Submit a registration request (no tenant/user created — pending Super Admin review)
// @access  Public
router.post('/register-request', loginRateLimiter, authController.registerRequest);


// @route   POST api/auth/login
// @desc    Login and get token
// @access  Public
router.post('/login', loginRateLimiter, authController.login);

// @route   POST api/auth/demo-login
// @desc    Login as demo user
// @access  Public
router.post('/demo-login', authController.demoLogin);

// @route   POST api/auth/forgot-password
// @desc    Request password reset link
// @access  Public
router.post('/forgot-password', authController.forgotPassword);

// @route   POST api/auth/reset-password
// @desc    Reset password using token
// @access  Public
router.post('/reset-password', authController.resetPassword);

// @route   GET api/auth/me
// @desc    Get user info from token
// @access  Private
router.get('/me', authMiddleware, authController.getMe);

module.exports = router;
