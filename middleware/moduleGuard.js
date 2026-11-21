/**
 * 🔒 Module Guard Middleware Factory
 * Per-route module access check based on tenant's explicit manual entitlements.
 * 
 * Usage in server.js:
 *   app.use('/api/hr', authMiddleware, moduleGuard('hr'), hrRoutes);
 *   app.use('/api/purchases', moduleGuard('purchasing', 'inventory'), purchaseRoutes);
 * 
 * Fail-Closed Policy:
 * - If req.modules is missing or malformed, denies access immediately (HTTP 403 MODULE_ACCESS_DENIED).
 * - If module is disabled (false) or not configured, returns HTTP 403 MODULE_LOCKED.
 */
module.exports = (...moduleNames) => (req, res, next) => {
    const modules = req.modules; // Attached by tenantAccessGuard / subscriptionGuard

    // FAIL-CLOSED: Missing entitlement map strictly denies access
    if (!modules || typeof modules !== 'object') {
        return res.status(403).json({
            status: 'error',
            code: 'MODULE_ACCESS_DENIED',
            message: 'Access denied: Organization entitlements are not configured.',
            module: moduleNames[0] || 'module'
        });
    }

    const primaryModule = moduleNames[0] || 'module';

    // If the primary module was explicitly disabled in entitlements (set to false), immediately block
    if (modules[primaryModule] === false) {
        return res.status(403).json({
            status: 'module_locked',
            code: 'MODULE_LOCKED',
            module: primaryModule,
            message: `The "${primaryModule}" module is not enabled for your organization.`
        });
    }

    // Check if any of the allowed module aliases are enabled
    const hasAccess = moduleNames.some(m => modules[m] === true);

    if (!hasAccess) {
        return res.status(403).json({
            status: 'module_locked',
            code: 'MODULE_LOCKED',
            module: primaryModule,
            message: `The "${primaryModule}" module is not enabled for your organization.`
        });
    }

    next();
};
