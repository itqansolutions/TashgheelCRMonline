/**
 * Template Guard Middleware
 * Enforces organizational template separation at the API layer.
 * Prevents Real Estate organizations from accessing General inventory/purchasing APIs,
 * and prevents General organizations from accessing Real Estate APIs.
 */
const templateGuard = (requiredTemplate) => {
  return (req, res, next) => {
    const userTemplate = req.user?.template_name || 'general';
    if (userTemplate !== requiredTemplate) {
      return res.status(403).json({
        status: 'error',
        message: `This route is only available for ${requiredTemplate} organizations.`,
        code: 'TEMPLATE_MISMATCH'
      });
    }
    next();
  };
};

module.exports = templateGuard;
