const db = require('../config/db');

/**
 * Role-Based Access Control (RBAC) & Screen-Based Access Control (PBAC) Middleware
 * @param {string[]} roles - Array of allowed roles
 */
exports.authorize = (roles = []) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    // Admin always has full access
    if (req.user.role === 'admin') {
      return next();
    }

    // If role matches, allow
    if (roles.includes(req.user.role)) {
      return next();
    }

    // PBAC Check: If user has explicit screen permissions in user_access, grant access
    try {
      const accessRes = await db.query(
        'SELECT page_path FROM user_access WHERE user_id = $1 AND can_access = true',
        [req.user.id]
      );
      if (accessRes.rows.length > 0) {
        return next();
      }
    } catch (err) {
      console.error('[roleMiddleware authorize check]:', err.message);
    }

    return res.status(403).json({
      status: 'error',
      message: `User role '${req.user.role}' is not authorized to access this route`
    });
  };
};

/**
 * Page-Based Access Control (PBAC) Middleware
 * Verifies if user has explicit permission to access a page/module.
 * Admins always bypass.
 * @param {string} pagePath - e.g. '/contacts/customers', '/deals', '/whatsapp-chat'
 */
exports.checkPageAccess = (pagePath) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    if (req.user.role === 'admin') {
      return next();
    }

    try {
      const db = require('../config/db');
      const accessRes = await db.query(`
        SELECT can_access FROM user_access 
        WHERE user_id = $1 AND page_path = $2
      `, [req.user.id, pagePath]);

      if (accessRes.rows.length > 0) {
        if (accessRes.rows[0].can_access === true) {
          return next();
        } else {
          return res.status(403).json({
            status: 'error',
            message: `Access denied to module '${pagePath}'`
          });
        }
      }

      next();
    } catch (err) {
      console.error('[checkPageAccess Error]:', err.message);
      next();
    }
  };
};
