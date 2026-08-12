/**
 * sodGuard.js — Segregation of Duties (SOD) Middleware
 *
 * Enforces the rule: the user who CREATED a document cannot APPROVE/POST it.
 * This is a financial control requirement — not just a policy.
 *
 * Usage:
 *   router.put('/:id/approve',
 *     authMiddleware,
 *     loadDocument('purchase_order', 'id'),  // sets req.erpDocument
 *     requirePermission('po.approve'),
 *     sodGuard('purchase_order'),
 *     controller.approve
 *   );
 *
 * The middleware requires req.erpDocument to be populated first.
 * Use loadDocument() middleware before sodGuard().
 */

/**
 * SOD enforcement middleware factory.
 *
 * @param {string} documentType - human-readable label for error messages
 * @returns {Function} Express middleware
 */
const sodGuard = (documentType) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Authentication required.' });
  }

  if (!req.erpDocument) {
    // If document wasn't loaded by loadDocument middleware, skip SOD (non-blocking)
    console.warn(`[SOD] Warning: sodGuard called for "${documentType}" but req.erpDocument is not set. Skipping check.`);
    return next();
  }

  const createdBy = String(req.erpDocument.created_by || req.erpDocument.requested_by || '');
  const currentUser = String(req.user.id);

  if (createdBy && createdBy === currentUser) {
    return res.status(403).json({
      status: 'error',
      code: 'SOD_VIOLATION',
      message: `Segregation of Duties violation: You cannot approve or post a ${documentType} that you created. This action requires a different user.`,
      document_type: documentType,
      document_id: req.erpDocument.id,
    });
  }

  next();
};

/**
 * loadDocument middleware factory.
 * Loads a document from the database and attaches it to req.erpDocument.
 * Must be used before sodGuard().
 *
 * @param {string} tableName   - DB table name (e.g. 'purchase_orders')
 * @param {string} [paramName] - route param name for the document ID (default: 'id')
 * @returns {Function} Express middleware
 */
const loadDocument = (tableName, paramName = 'id') => {
  const db = require('../config/db');
  return async (req, res, next) => {
    const docId = req.params[paramName];
    if (!docId) return next();

    try {
      const result = await db.query(
        `SELECT * FROM ${tableName} WHERE id = $1 AND tenant_id::text = $2::text LIMIT 1`,
        [docId, req.user.tenant_id]
      );
      if (!result.rows[0]) {
        return res.status(404).json({ status: 'error', message: `${tableName} not found.` });
      }
      req.erpDocument = result.rows[0];
      next();
    } catch (err) {
      console.error(`[loadDocument] Error loading ${tableName}:`, err.message);
      res.status(500).json({ status: 'error', message: 'Failed to load document for authorization check.' });
    }
  };
};

module.exports = { sodGuard, loadDocument };
