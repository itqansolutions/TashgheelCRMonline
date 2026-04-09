const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.header('Authorization');

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
    req.user = decoded.user;
    
    // Ensure tenant context is always available
    if (!req.user.tenant_id) {
       console.warn(`User ${req.user.id} accessed system without tenant_id context.`);
    }
    
    next();
  } catch (err) {
    res.status(401).json({ status: 'error', message: 'Token is not valid' });
  }
};
