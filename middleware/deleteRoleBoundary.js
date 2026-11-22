const roleGuard = require('./roleGuard');
const allowDelete = roleGuard(['admin', 'manager']);

// A ceiling on deletion rights, not a grant. Route-specific permissions and business guards still run.
module.exports = (req, res, next) => {
    if (req.method === 'DELETE') return allowDelete(req, res, next);
    return next();
};
