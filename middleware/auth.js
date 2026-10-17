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
    
    // Verify user active status (is_working) and resolve tenant template + status
    if (req.user && req.user.id) {
      try {
        const userCheckRes = await db.query(
          'SELECT is_working, tenant_id, name FROM users WHERE id::text = $1::text LIMIT 1',
          [req.user.id]
        );
        if (userCheckRes.rows.length > 0) {
          const dbUser = userCheckRes.rows[0];
          if (dbUser.is_working === false) {
            return res.status(403).json({
              status: 'error',
              message: 'Your employee account has been deactivated. Please contact your administrator.',
              code: 'USER_DEACTIVATED'
            });
          }
          if (!req.tenant_id && dbUser.tenant_id) {
            req.tenant_id = dbUser.tenant_id;
            req.user.tenant_id = req.tenant_id;
          }
          if (!req.user.name && dbUser.name) {
            req.user.name = dbUser.name;
          }
        }
      } catch (usrErr) {
        console.error('Auth Middleware: Failed to verify user active state', usrErr.message);
      }
    }

    // Hydrate template_name and verify tenant status
    if (req.user && req.tenant_id) {
      try {
        const cachedTemplate = templateCache.get(req.tenant_id);
        if (cachedTemplate && cachedTemplate.expiresAt > Date.now()) {
          if (cachedTemplate.status && ['suspended', 'inactive', 'disabled'].includes(String(cachedTemplate.status).toLowerCase()) && req.tenant_id !== '00000000-0000-0000-0000-000000000000') {
            return res.status(403).json({
              status: 'tenant_suspended',
              message: 'Your organization account is currently suspended.',
              code: 'TENANT_SUSPENDED'
            });
          }
          if (!req.user.template_name) {
            req.user.template_name = cachedTemplate.template_name;
          }
        } else {
          const tenantRes = await db.query('SELECT template_name, status FROM tenants WHERE id::text = $1::text', [req.tenant_id]);
          if (tenantRes.rows.length === 0) {
            console.error(`[AUTH] Tenant not found for template resolution: ${req.tenant_id}`);
            return res.status(403).json({
              status: 'error',
              message: 'Tenant not found or inactive.',
              code: 'TENANT_NOT_FOUND'
            });
          }

          const tenantStatus = tenantRes.rows[0].status || 'active';
          if (['suspended', 'inactive', 'disabled'].includes(String(tenantStatus).toLowerCase()) && req.tenant_id !== '00000000-0000-0000-0000-000000000000') {
            return res.status(403).json({
              status: 'tenant_suspended',
              message: 'Your organization account is currently suspended.',
              code: 'TENANT_SUSPENDED'
            });
          }

          let templateName = tenantRes.rows[0].template_name;
          if (!templateName) {
            console.warn(`[AUTH] Tenant ${req.tenant_id} has NULL template_name. Falling back to 'general' explicitly.`);
            templateName = 'general';
          }

          // Cache successful lookup (short TTL so status changes propagate quickly)
          templateCache.set(req.tenant_id, {
            template_name: templateName,
            status: tenantStatus,
            expiresAt: Date.now() + 30 * 1000
          });
          if (!req.user.template_name) {
            req.user.template_name = templateName;
          }
        }
      } catch (tmplErr) {
        console.error(`[AUTH] Database error resolving template for tenant ${req.tenant_id}:`, tmplErr.message);
        return res.status(503).json({
          status: 'error',
          message: 'Failed to resolve organization template due to a database error.',
          code: 'TEMPLATE_RESOLUTION_FAILED'
        });
      }
    }

    // Branch context is validated and assigned strictly by branchScope middleware
    next();
  } catch (err) {
    res.status(401).json({ status: 'error', message: 'Token is not valid' });
  }
};
