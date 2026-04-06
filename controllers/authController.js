const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const logger = require('../utils/logger');

// Register User
exports.register = async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    // Check if user exists
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user
    const newUserResult = await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, passwordHash, role || 'employee']
    );

    const user = newUserResult.rows[0];

    // Log the registration
    await logger.logAction(req, user.id, 'REGISTER', 'User', user.id, { email: user.email });

    // Generate JWT
    const payload = { user: { id: user.id, role: user.role } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({ status: 'success', token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// Login User
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Get user
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid Credentials' });
    }

    const user = userResult.rows[0];

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ status: 'error', message: 'Invalid Credentials' });
    }

    // Generate JWT
    const payload = { user: { id: user.id, role: user.role } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

    // Log the login
    await logger.logAction(req, user.id, 'LOGIN', 'User', user.id, { email: user.email });

    // Fetch allowed pages
    const permissions = await db.query('SELECT page_path FROM user_access WHERE user_id = $1 AND can_access = true', [user.id]);
    const allowedPages = permissions.rows.map(p => p.page_path);

    res.json({ 
      status: 'success', 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        allowedPages
      } 
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// Get User Detail
exports.getMe = async (req, res) => {
  try {
    const userResult = await db.query('SELECT id, name, email, role, created_at FROM users WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0];
    
    // Fetch allowed pages
    const permissions = await db.query('SELECT page_path FROM user_access WHERE user_id = $1 AND can_access = true', [user.id]);
    const allowedPages = permissions.rows.map(p => p.page_path);

    res.json({ 
      status: 'success', 
      user: {
        ...user,
        allowedPages
      } 
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
