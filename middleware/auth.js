const jwt = require('jsonwebtoken');
const db = require('../config/db');

module.exports = async (req, res, next) => {
  const token = req.header('Authorization');

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
    req.user = decoded.user;
    req.tenantId = decoded.user.tenant_id; // 🔥 NEW: Direct Tenant Awareness
    
    // 🔥 EMERGENCY: Session Auto-Hydration
    // If user has an old token (lack tenant_id), fetch it from DB and attach it
    if (!req.user.tenant_id) {
       try {
           const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [req.user.id]);
           if (userResult.rows.length > 0 && userResult.rows[0].tenant_id) {
               req.user.tenant_id = userResult.rows[0].tenant_id;
           } else {
               // If user truly has no tenant (e.g. system user or error), we might need to handle it.
               // For now, let it proceed to controllers which will handle missing tenant_id with 403.
           }
       } catch (dbErr) {
           console.error('Auth Middleware: Failed to hydrate tenant context', dbErr.message);
       }
    }
    
    next();
  } catch (err) {
    res.status(401).json({ status: 'error', message: 'Token is not valid' });
  }
};
