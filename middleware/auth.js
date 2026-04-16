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
               console.log(`[AUTH] Hydrated missing tenant_id for user ${req.user.id}: ${userResult.rows[0].tenant_id}`);
               req.user.tenant_id = userResult.rows[0].tenant_id;
           }
       } catch (dbErr) {
           console.error('Auth Middleware: Failed to hydrate tenant context', dbErr.message);
       }
    }

    // Safety Sync
    if (!req.tenantId) req.tenantId = req.user.tenant_id;
    
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
