const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const { loginRateLimiter } = require('../middleware/rateLimit');

// @route   POST api/auth/register
// @desc    Register a new user & Create Tenant
// @access  Public
router.post('/register', authController.register);

// @route   POST api/auth/login
// @desc    Login and get token
// @access  Public
router.post('/login', loginRateLimiter, authController.login);

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
