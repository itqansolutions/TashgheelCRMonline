const db = require('../config/db');

/**
 * Role-Based Access Control (RBAC) & Screen-Based Access Control (PBAC) Middleware
 * @param {string[]} roles - Array of allowed roles
 */
/**
 * Maps incoming request to related screen page_paths in user_access
 */
function resolveCandidatePagePaths(req, customPages = []) {
  if (Array.isArray(customPages) && customPages.length > 0) {
    return customPages;
  }

  const baseUrl = (req.baseUrl || '').replace(/\/+$/, '');
  const path = (req.path || '').replace(/\/+$/, '');
  const fullPath = `${baseUrl}${path}` || '/';

  const candidates = new Set();

  if (baseUrl === '/api/departments') {
    if (req.method === 'GET') {
      candidates.add('/contacts/employees');
      candidates.add('/employees');
      candidates.add('/sales/salesmen');
      candidates.add('/marketing/whatsapp-chatbots');
      candidates.add('/hr/dashboard');
      candidates.add('/settings');
    } else {
      candidates.add('/contacts/employees');
      candidates.add('/employees');
      candidates.add('/hr/dashboard');
      candidates.add('/settings');
    }
  } else if (baseUrl === '/api/users') {
    candidates.add('/contacts/employees');
    candidates.add('/employees');
    candidates.add('/settings');
  } else if (baseUrl === '/api/reports') {
    candidates.add('/reports');
    candidates.add('/erp/reports');
  } else if (baseUrl === '/api/dashboard') {
    candidates.add('/dashboard');
    candidates.add('/reports');
  } else if (baseUrl === '/api/whatsapp') {
    if (fullPath.includes('/campaigns')) {
      candidates.add('/marketing/whatsapp-campaigns');
      candidates.add('/integrations/whatsapp');
    } else if (fullPath.includes('/chatbots')) {
      candidates.add('/marketing/whatsapp-chatbots');
      candidates.add('/integrations/whatsapp');
    } else {
      candidates.add('/integrations/whatsapp');
      candidates.add('/settings');
    }
  } else if (baseUrl === '/api/sales-teams') {
    candidates.add('/sales/salesmen');
    candidates.add('/sales/target');
  } else if (baseUrl === '/api/sales' || baseUrl === '/api/erp/sales') {
    if (fullPath.includes('/targets')) {
      candidates.add('/sales/target');
    } else if (fullPath.includes('/commissions')) {
      candidates.add('/commissions');
      candidates.add('/sales/salesmen');
      candidates.add('/finance');
    }
  } else if (baseUrl === '/api/re-targets') {
    candidates.add('/sales/target');
  } else if (baseUrl === '/api/lead-sources') {
    candidates.add('/settings');
    candidates.add('/contacts/customers');
    candidates.add('/deals');
  } else if (baseUrl === '/api/invoices') {
    candidates.add('/finance');
  } else if (baseUrl === '/api/logs') {
    candidates.add('/logs');
    candidates.add('/settings');
  }

  // Also check direct match on baseUrl or fullPath
  if (baseUrl) candidates.add(baseUrl.replace('/api', ''));
  if (fullPath) candidates.add(fullPath.replace('/api', ''));

  return Array.from(candidates).filter(Boolean);
}

/**
 * Role-Based Access Control (RBAC) & Screen-Based Access Control (PBAC) Middleware
 * @param {string[]} roles - Array of allowed roles
 * @param {string[]} requiredPages - Optional explicit page paths to check in user_access
 */
exports.authorize = (roles = [], requiredPages = []) => {
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

    // PBAC Check: If user has explicit screen permission in user_access for this route, allow
    try {
      const candidatePaths = resolveCandidatePagePaths(req, requiredPages);
      if (candidatePaths.length > 0) {
        const accessRes = await db.query(
          `SELECT 1 FROM user_access 
           WHERE user_id = $1 
             AND can_access = true 
             AND page_path = ANY($2::text[]) 
           LIMIT 1`,
          [req.user.id, candidatePaths]
        );
        if (accessRes.rows.length > 0) {
          return next();
        }
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
