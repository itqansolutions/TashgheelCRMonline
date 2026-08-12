/**
 * documentVersioning.js — ERP Document Snapshot & Freeze Middleware
 *
 * Responsibilities:
 *  - Snapshots document state into document_versions before updates (version history)
 *  - Financial Freeze Rule: Blocks direct edits to POSTED documents.
 *    Posted documents MUST be modified via Reversal + Credit Note / new document.
 *
 * Usage:
 *   router.put('/:id',
 *     authMiddleware,
 *     loadDocument('invoices', 'id'),
 *     enforceDocumentFreeze('invoice'),
 *     snapshotMiddleware('invoice'),
 *     controller.update
 *   );
 */

const db = require('../config/db');

/**
 * Enforces the Financial Freeze Rule:
 * Rejects direct HTTP updates if document's accounting_status or status is 'posted'.
 */
const enforceDocumentFreeze = (documentType) => (req, res, next) => {
  if (!req.erpDocument) return next();

  const isPosted = req.erpDocument.accounting_status === 'posted' || req.erpDocument.status === 'posted';

  if (isPosted) {
    return res.status(422).json({
      status: 'error',
      code: 'DOCUMENT_FROZEN',
      message: `Financial Freeze Rule: This ${documentType} is posted and cannot be edited directly. To make changes, cancel the document (which creates a Reversal Journal Entry) and issue a new document or Credit Note.`,
      document_id: req.erpDocument.id
    });
  }

  next();
};

/**
 * Helper to take a snapshot of a document before an update.
 */
async function createDocumentSnapshot(dbOrClient, { tenantId, documentType, documentId, snapshot, userId, reason = 'Document Updated' }) {
  const lastVer = await dbOrClient.query(
    'SELECT COALESCE(MAX(version_number), 0) as max_ver FROM document_versions WHERE tenant_id::text = $1::text AND document_id = $2',
    [String(tenantId), String(documentId)]
  );

  const nextVer = Number(lastVer.rows[0].max_ver) + 1;

  await dbOrClient.query(`
    INSERT INTO document_versions
      (tenant_id, document_type, document_id, version_number, snapshot, changed_by, change_reason)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [String(tenantId), documentType, String(documentId), nextVer, JSON.stringify(snapshot), String(userId || 'SYSTEM'), reason]);

  return nextVer;
}

/**
 * Snapshot Express middleware factory.
 */
const snapshotMiddleware = (documentType) => async (req, res, next) => {
  if (!req.erpDocument) return next();

  try {
    await createDocumentSnapshot(db, {
      tenantId: req.user.tenant_id,
      documentType,
      documentId: req.erpDocument.id,
      snapshot: req.erpDocument,
      userId: req.user.id,
      reason: req.body.change_reason || 'HTTP API Update'
    });
    next();
  } catch (err) {
    console.error(`[documentVersioning] Snapshot error for ${documentType}:`, err.message);
    next(); // Non-blocking failure for snapshots
  }
};

module.exports = { enforceDocumentFreeze, createDocumentSnapshot, snapshotMiddleware };
