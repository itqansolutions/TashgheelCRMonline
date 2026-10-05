const jwt = require('jsonwebtoken');
const db = require('../config/db');

// In-memory cache for tenant template_name to prevent repeated queries
const templateCache = new Map();
const TEMPLATE_CACHE_TTL = 5 * 60 * 1000;

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
    if (!req.tenant_id || !req.user.name) {
       try {
           const userResult = await db.query('SELECT tenant_id, name FROM users WHERE id::text = $1::text', [req.user.id]);
           if (userResult.rows.length > 0) {
               const dbUser = userResult.rows[0];
               if (!req.tenant_id && dbUser.tenant_id) {
                   console.log(`[AUTH] Hydrated missing tenant_id for user ${req.user.id}: ${dbUser.tenant_id}`);
                   req.tenant_id = dbUser.tenant_id;
                   req.user.tenant_id = req.tenant_id;
               }
               if (!req.user.name && dbUser.name) {
                   req.user.name = dbUser.name;
               }
           }
       } catch (dbErr) {
           console.error('Auth Middleware: Failed to hydrate tenant context', dbErr.message);
       }
    }

    // Hydrate template_name if not already present on user
    if (req.user && !req.user.template_name && req.tenant_id) {
      try {
        const cachedTemplate = templateCache.get(req.tenant_id);
        if (cachedTemplate && cachedTemplate.expiresAt > Date.now()) {
          req.user.template_name = cachedTemplate.template_name;
        } else {
          const tenantRes = await db.query('SELECT template_name FROM tenants WHERE id::text = $1::text', [req.tenant_id]);
          const templateName = tenantRes.rows[0]?.template_name || 'general';
          templateCache.set(req.tenant_id, {
            template_name: templateName,
            expiresAt: Date.now() + TEMPLATE_CACHE_TTL
          });
          req.user.template_name = templateName;
        }
      } catch (tmplErr) {
        req.user.template_name = 'general';
      }
    }

    // Branch context is validated and assigned strictly by branchScope middleware
    next();
  } catch (err) {
    res.status(401).json({ status: 'error', message: 'Token is not valid' });
  }
};
