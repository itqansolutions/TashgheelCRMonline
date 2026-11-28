// Inventory costing for COGS. The method is a per-company setting: 'average' (weighted moving average, default) or 'fifo'.
// Cost is derived from the approved stock ledger (stock_movements) at the moment of sale and snapshotted on the sale's OUT movement,
// so changing the method only affects sales made afterwards. Past snapshots are never rewritten.
//
// Ledger replay per product (company level, all warehouses):
//   IN  (+qty): costed with its own unit_cost; cost-less INs (returns/adjustments/older receipts) take the running cost.
//   OUT (-qty): consumes stock (average: cost unchanged; fifo: consumes oldest layers first).
//   transfers net to zero at company level and are ignored.
const num = (v) => Number(v) || 0;
const METHODS = ['average', 'fifo'];

function normalizeMethod(m) { return METHODS.includes(String(m || '').toLowerCase()) ? String(m).toLowerCase() : 'average'; }

async function getMethod(q, tenantId) {
  const r = await q.query('SELECT costing_method FROM tenants WHERE id::text=$1::text', [String(tenantId)]);
  return normalizeMethod(r.rows[0] && r.rows[0].costing_method);
}

function signedQty(m) {
  const qty = num(m.quantity);
  if (m.type === 'in') return qty;
  if (m.type === 'out') return -qty;
  if (m.type === 'adjustment') {
    if (m.to_warehouse_id != null && m.from_warehouse_id == null) return qty;
    if (m.from_warehouse_id != null && m.to_warehouse_id == null) return -qty;
  }
  return 0;
}

/** Pure replay. rows: ordered approved movements. Returns { onHand, avg, layers }. */
function replay(rows, fallbackCost) {
  let onHand = 0, avg = null;
  const layers = [];
  const runCost = () => (avg !== null && avg > 0 ? avg : fallbackCost);
  for (const m of rows) {
    const d = signedQty(m);
    if (d === 0) continue;
    if (d > 0) {
      const c = (m.unit_cost !== null && m.unit_cost !== undefined && m.unit_cost !== '') ? num(m.unit_cost) : runCost();
      avg = onHand > 0 && avg !== null ? ((onHand * avg) + (d * c)) / (onHand + d) : c;
      onHand += d;
      layers.push({ qty: d, cost: c });
    } else {
      let need = -d;
      onHand -= need;
      while (need > 1e-9 && layers.length) {
        const take = Math.min(need, layers[0].qty);
        layers[0].qty -= take; need -= take;
        if (layers[0].qty <= 1e-9) layers.shift();
      }
    }
  }
  return { onHand, avg: avg === null ? null : avg, layers };
}

/** Pure: unit cost for selling qty from a replayed state. */
function costFromState(state, qty, method, fallbackCost) {
  const base = state.avg !== null && state.avg > 0 ? state.avg : fallbackCost;
  if (method !== 'fifo') return base;
  let need = num(qty), total = 0;
  for (const l of state.layers) {
    if (need <= 1e-9) break;
    const take = Math.min(need, l.qty);
    total += take * l.cost; need -= take;
  }
  if (need > 1e-9) total += need * (state.layers.length ? state.layers[state.layers.length - 1].cost : base);
  return num(qty) > 0 ? total / num(qty) : base;
}

/** Unit cost to snapshot for selling `qty` of a product now, under the company's method. */
async function unitCostForSale(q, { tenantId, productId, qty, method, fallbackCost = 0 }) {
  const m = method || await getMethod(q, tenantId);
  const r = await q.query(
    `SELECT type, quantity, unit_cost, from_warehouse_id, to_warehouse_id FROM stock_movements
     WHERE tenant_id::text=$1::text AND product_id::text=$2::text AND status='approved' ORDER BY created_at ASC, id ASC`,
    [String(tenantId), String(productId)]
  );
  const state = replay(r.rows || [], num(fallbackCost));
  return Math.round(costFromState(state, qty, m, num(fallbackCost)) * 10000) / 10000;
}

module.exports = { getMethod, unitCostForSale, replay, costFromState, normalizeMethod, METHODS };
