/**
 * Template Guard Middleware
 * Enforces organizational template separation at the API layer.
 * Prevents Real Estate organizations from accessing General inventory/purchasing APIs,
 * and prevents General organizations from accessing Real Estate APIs.
 */
const templateGuard = (requiredTemplate) => {
  return (req, res, next) => {
    // If real_estate module is explicitly disabled for this tenant, block access
    if (requiredTemplate === 'real_estate' && req.modules && req.modules.real_estate === false) {
      return res.status(403).json({
        status: 'module_locked',
        module: 'real_estate',
        message: 'The real_estate module is not included in your current plan. Upgrade to unlock.',
        upgrade_url: '/pricing'
      });
    }

    const userTemplate = req.user?.template_name || 'general';
    // If tenant has real_estate module enabled, allow them access even if template_name is general
    if (requiredTemplate === 'real_estate' && req.modules?.real_estate === true) {
      return next();
    }

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
