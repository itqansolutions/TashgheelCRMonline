const crypto = require('crypto');

/**
 * 👁️ Observability Tracer Middleware
 * Injects `x-correlation-id` and `x-trace-id` into incoming HTTP requests and attaches to req context.
 */
function tracingMiddleware(req, res, next) {
    const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
    const traceId = req.headers['x-trace-id'] || crypto.randomUUID();

    req.correlationId = correlationId;
    req.traceId = traceId;

    res.setHeader('x-correlation-id', correlationId);
    res.setHeader('x-trace-id', traceId);

    next();
}

module.exports = {
    tracingMiddleware
};
