/**
 * reconciliationController.js — Subledger & GL Reconciliation API Controller
 */

const db = require('../config/db');

// GET /api/erp/reconciliation/ar
exports.getARReconciliation = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const recon = await db.query(
      'SELECT * FROM v_ar_gl_reconciliation WHERE tenant_id::text = $1::text',
      [String(tenant_id)]
    );

    const subledger = await db.query(
      'SELECT * FROM v_ar_subledger WHERE tenant_id::text = $1::text ORDER BY date DESC',
      [String(tenant_id)]
    );

    res.json({
      status: 'success',
      data: {
        summary: recon.rows[0] || { tenant_id, gl_ar_balance: 0, subledger_outstanding: 0, difference: 0, status: 'RECONCILED' },
        subledger_details: subledger.rows
      }
    });
  } catch (err) {
    console.error('[reconciliationController] getARReconciliation error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};
