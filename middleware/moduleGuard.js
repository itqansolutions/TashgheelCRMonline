/**
 * 🔒 Module Guard Middleware Factory
 * Per-route module access check based on tenant's active plan.
 * 
 * Usage in server.js:
 *   app.use('/api/hr', authMiddleware, moduleGuard('hr'), hrRoutes);
 * 
 * Returns 403 with upgrade prompt if module is not in tenant's plan.
 */
module.exports = (...moduleNames) => (req, res, next) => {
    const modules = req.modules; // Attached by subscriptionGuard

    // If no module map (e.g. legacy tenant without subscription), allow access
    if (!modules) return next();

    const primaryModule = moduleNames[0] || 'module';
    // If the primary module was explicitly disabled in overrides (set to false), immediately block
    if (modules[primaryModule] === false) {
        return res.status(403).json({
            status: 'module_locked',
            module: primaryModule,
            message: `The "${primaryModule}" module is not included in your current plan. Upgrade to unlock.`,
            upgrade_url: '/pricing'
        });
    }

    const hasAccess = moduleNames.some(m => modules[m] === true);

    if (!hasAccess) {
        return res.status(403).json({
            status: 'module_locked',
            module: primaryModule,
            message: `The "${primaryModule}" module is not included in your current plan. Upgrade to unlock.`,
            upgrade_url: '/pricing'
        });
    }

    next();
};
