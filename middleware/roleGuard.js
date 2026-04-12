/**
 * Role-Based Access Control (RBAC) Middleware
 * @param {string[]} allowedRoles - Array of roles permitted to access the route
 */
const roleGuard = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Authentication required' 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: `Access denied. Role '${req.user.role}' is not authorized.`
      });
    }

    next();
  };
};

module.exports = roleGuard;
