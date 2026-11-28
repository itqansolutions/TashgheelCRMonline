// Invoice stock deduction. A direct invoice (or one converted from a quotation) that sells
// inventory products posts an approved OUT movement per product, from a branch warehouse.
// Sales-order invoices are NOT handled here: their stock leaves through Delivery Notes.
const REF = 'invoice';
const REF_REVERSAL = 'invoice_reversal';
const costing = require('./costingService');
const num = (v) => Number(v) || 0;

function stockError(message, code, extra) {
  const e = new Error(message);
  e.status = 409; e.code = code; Object.assign(e, extra || {});
  return e;
}

async function warehouseStock(q, tenantId, warehouseId, productId) {
  const r = await q.query(
    `SELECT COALESCE(SUM(CASE
        WHEN type IN ('in','adjustment') AND to_warehouse_id::text=$1::text THEN quantity
        WHEN type='transfer' AND to_warehouse_id::text=$1::text THEN quantity
        WHEN type IN ('out','adjustment') AND from_warehouse_id::text=$1::text THEN -quantity
        WHEN type='transfer' AND from_warehouse_id::text=$1::text THEN -quantity
        ELSE 0 END),0) AS s
     FROM stock_movements WHERE product_id::text=$2::text AND tenant_id::text=$3::text AND status='approved'`,
    [String(warehouseId), String(productId), String(tenantId)]
  );
  return num(r.rows[0] && r.rows[0].s);
}

/**
 * items: [{ product_id, quantity }]. Returns { movements: [...] } (empty when nothing is stock-tracked).
 * Throws a 409 error (INSUFFICIENT_STOCK / NO_WAREHOUSE) with no writes made by this function when it cannot deduct.
 */
async function deductForInvoice(q, { invoiceId, tenantId, branchId, userId, items, warehouseId = null }) {
  const byProduct = new Map();
  for (const it of items || []) {
    if (it.product_id === null || it.product_id === undefined || it.product_id === '') continue;
    const k = String(it.product_id);
    byProduct.set(k, (byProduct.get(k) || 0) + num(it.quantity));
  }
  if (byProduct.size === 0) return { movements: [] };

  const prods = await q.query(
    `SELECT id, name, is_inventory_item, COALESCE(cost_price,0) AS cost_price FROM products WHERE id::text = ANY($1::text[]) AND tenant_id::text=$2::text`,
    [[...byProduct.keys()], String(tenantId)]
  );
  const tracked = prods.rows.filter(p => p.is_inventory_item === true);
  if (tracked.length === 0) return { movements: [] };

  const tn = await q.query('SELECT allow_negative_stock, costing_method FROM tenants WHERE id::text=$1::text', [String(tenantId)]);
  const allowNegative = !!(tn.rows[0] && tn.rows[0].allow_negative_stock);
  const costMethod = costing.normalizeMethod(tn.rows[0] && tn.rows[0].costing_method);

  const wh = await q.query(
    `SELECT id, name FROM warehouses WHERE tenant_id::text=$1::text AND COALESCE(is_active,TRUE)=TRUE
       AND ($2::text IS NULL OR branch_id IS NULL OR branch_id::text=$2::text)
       AND ($3::text IS NULL OR id::text=$3::text) ORDER BY id ASC`,
    [String(tenantId), branchId ? String(branchId) : null, warehouseId ? String(warehouseId) : null]
  );
  if (wh.rows.length === 0) {
    throw stockError('No active warehouse is available for this branch, so stock cannot be deducted. Create a warehouse first.', 'NO_WAREHOUSE');
  }

  const plan = [];
  for (const p of tracked) {
    const qty = byProduct.get(String(p.id));
    if (!(qty > 0)) continue;
    let chosen = null, best = null;
    for (const w of wh.rows) {
      const s = await warehouseStock(q, tenantId, w.id, p.id);
      if (!best || s > best.s) best = { w, s };
      if (s >= qty) { chosen = w; break; }
    }
    if (!chosen) {
      if (!allowNegative) {
        throw stockError(`Insufficient stock for "${p.name}": ${best.s} available, ${qty} requested.`, 'INSUFFICIENT_STOCK', { product_id: p.id, product_name: p.name, available: best.s, requested: qty });
      }
      chosen = best.w;
    }
    const unitCost = await costing.unitCostForSale(q, { tenantId, productId: p.id, qty, method: costMethod, fallbackCost: num(p.cost_price) });
    plan.push({ product_id: p.id, warehouse_id: chosen.id, quantity: qty, unit_cost: unitCost });
  }

  const movements = [];
  for (const m of plan) {
    const r = await q.query(
      `INSERT INTO stock_movements (type, product_id, from_warehouse_id, quantity, status, tenant_id, branch_id, reference_type, reference_id, created_by, approved_by, unit_cost)
       VALUES ('out',$1,$2,$3,'approved',$4,$5,$6,$7,$8,$8,$9) RETURNING id, product_id, quantity, from_warehouse_id`,
      [m.product_id, m.warehouse_id, m.quantity, String(tenantId), branchId ? String(branchId) : null, REF, String(invoiceId), userId || null, m.unit_cost]
    );
    movements.push(r.rows[0]);
  }
  return { movements };
}

/** Puts stock back (approved IN movements) for every invoice OUT movement not yet reversed. Used when an invoice is deleted. */
async function restoreForInvoice(q, { invoiceId, tenantId, branchId, userId }) {
  const outs = await q.query(
    `SELECT product_id, from_warehouse_id, quantity, unit_cost FROM stock_movements
     WHERE reference_type=$1 AND reference_id=$2 AND tenant_id::text=$3::text AND type='out' AND status='approved'`,
    [REF, String(invoiceId), String(tenantId)]
  );
  const done = await q.query(
    `SELECT 1 FROM stock_movements WHERE reference_type=$1 AND reference_id=$2 AND tenant_id::text=$3::text LIMIT 1`,
    [REF_REVERSAL, String(invoiceId), String(tenantId)]
  );
  if (done.rows.length > 0) return { restored: 0 };
  for (const o of outs.rows) {
    await q.query(
      `INSERT INTO stock_movements (type, product_id, to_warehouse_id, quantity, status, tenant_id, branch_id, reference_type, reference_id, created_by, approved_by, unit_cost)
       VALUES ('in',$1,$2,$3,'approved',$4,$5,$6,$7,$8,$8,$9)`,
      [o.product_id, o.from_warehouse_id, o.quantity, String(tenantId), branchId ? String(branchId) : null, REF_REVERSAL, String(invoiceId), userId || null, o.unit_cost == null ? null : o.unit_cost]
    );
  }
  return { restored: outs.rows.length };
}

module.exports = { deductForInvoice, restoreForInvoice, warehouseStock };
