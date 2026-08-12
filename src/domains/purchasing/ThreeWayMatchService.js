/**
 * ThreeWayMatchService — Purchasing 3-Way Match & Purchase Price Variance (PPV) Engine
 *
 * Responsibilities:
 *  - Matches Purchase Order (PO) + Goods Receipt (GRN) + Supplier Invoice.
 *  - Calculates Purchase Price Variance (PPV) when supplier invoice price differs from PO price.
 *  - Tolerance Engine: Auto-approves if PPV <= tenant.ppv_tolerance_pct (default 2%).
 *    Escalates to workflow approval via ruleEngine if PPV exceeds tolerance.
 */

const db = require('../../../config/db');

/**
 * Validate 3-Way Match between PO, GRN, and Supplier Invoice.
 *
 * @param {Object} client - pg PoolClient
 * @param {Object} options
 * @param {string} options.tenantId
 * @param {Object} options.poItem         - { unit_cost, quantity }
 * @param {Object} options.grnItem        - { quantity_received }
 * @param {Object} options.invoiceItem    - { unit_cost, quantity }
 * @param {string} options.supplierInvoiceId
 * @returns {Promise<Object>} match result object
 */
async function performThreeWayMatch(client, { tenantId, poItem, grnItem, invoiceItem, supplierInvoiceId }) {
  const poUnitCost   = Number(poItem.unit_cost || 0);
  const invUnitCost  = Number(invoiceItem.unit_cost || 0);
  const qtyInvoiced  = Number(invoiceItem.quantity || 0);
  const qtyReceived  = Number(grnItem.quantity_received || 0);

  // 1. Quantity Match Check
  const qtyMismatch = Math.abs(qtyInvoiced - qtyReceived) > 0.001;

  // 2. Price Variance Calculation
  const variancePerUnit = invUnitCost - poUnitCost;
  const totalPPVAmount  = variancePerUnit * qtyInvoiced;
  const variancePct     = poUnitCost > 0 ? Math.abs(variancePerUnit / poUnitCost) * 100 : 0;

  // 3. Get Tenant PPV Tolerance Setting
  const tenantRes = await client.query(
    'SELECT ppv_tolerance_pct, ppv_auto_approve FROM tenants WHERE id::text = $1::text',
    [String(tenantId)]
  );

  const tolerancePct = Number(tenantRes.rows[0]?.ppv_tolerance_pct || 2.00);
  const autoApprove  = tenantRes.rows[0]?.ppv_auto_approve ?? true;

  const withinTolerance = variancePct <= tolerancePct;
  const requiresApproval = !withinTolerance || qtyMismatch;

  const matchResult = {
    po_unit_cost: poUnitCost,
    invoice_unit_cost: invUnitCost,
    quantity_received: qtyReceived,
    quantity_invoiced: qtyInvoiced,
    quantity_mismatch: qtyMismatch,
    ppv_per_unit: Number(variancePerUnit.toFixed(2)),
    ppv_total_amount: Number(totalPPVAmount.toFixed(2)),
    ppv_variance_pct: Number(variancePct.toFixed(2)),
    tolerance_threshold_pct: tolerancePct,
    within_tolerance: withinTolerance,
    requires_approval: requiresApproval,
    matched: !requiresApproval
  };

  // If variance exceeds tolerance, trigger ruleEngine escalation
  if (requiresApproval) {
    try {
      const { runRules } = require('../../../services/ruleEngine');
      await runRules('SUPPLIER_INVOICE_PPV_EXCEEDED', {
        tenant_id: tenantId,
        supplier_invoice_id: supplierInvoiceId,
        ppv_variance_pct: matchResult.ppv_variance_pct,
        ppv_total_amount: matchResult.ppv_total_amount,
        _summary: `3-Way Match PPV Variance (${matchResult.ppv_variance_pct}%) exceeded tolerance limit (${tolerancePct}%). Approval required.`
      });
    } catch (e) {
      console.warn('[ThreeWayMatch] RuleEngine escalation notice:', e.message);
    }
  }

  return matchResult;
}

module.exports = { performThreeWayMatch };
