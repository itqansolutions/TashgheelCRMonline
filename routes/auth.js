const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

// @route   POST api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', authController.register);

// @route   POST api/auth/login
// @desc    Login and get token
// @access  Public
router.post('/login', authController.login);

// @route   GET api/auth/me
// @desc    Get user info from token
// @access  Private
router.get('/me', authMiddleware, authController.getMe);

module.exports = router;
