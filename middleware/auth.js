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
    req.tenant_id = decoded.user.tenant_id; // 🔥 Standardized key
    
    // 🔥 EMERGENCY: Session Auto-Hydration
    // If user has an old token (lack tenant_id), fetch it from DB and attach it
    if (!req.tenant_id) {
       try {
           const userResult = await db.query('SELECT tenant_id FROM users WHERE id::text = $1::text', [req.user.id]);
           if (userResult.rows.length > 0 && userResult.rows[0].tenant_id) {
               console.log(`[AUTH] Hydrated missing tenant_id for user ${req.user.id}: ${userResult.rows[0].tenant_id}`);
               req.tenant_id = userResult.rows[0].tenant_id;
               req.user.tenant_id = req.tenant_id;
           }
       } catch (dbErr) {
           console.error('Auth Middleware: Failed to hydrate tenant context', dbErr.message);
       }
    }

    
    // 🔥 NEW: Branch Context Extraction
    const branchId = req.header('x-branch-id');
    if (branchId) {
        req.branchId = branchId;
    }
    
    next();
  } catch (err) {
    res.status(401).json({ status: 'error', message: 'Token is not valid' });
  }
};
