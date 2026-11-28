const test = require('node:test');
const assert = require('node:assert');
const { replay, costFromState, unitCostForSale } = require('../services/costingService.js');
const IN = (q, c) => ({ type: 'in', quantity: q, unit_cost: c, to_warehouse_id: 1, from_warehouse_id: null });
const OUT = (q) => ({ type: 'out', quantity: q, unit_cost: null, from_warehouse_id: 1, to_warehouse_id: null });

test('weighted average: 100@40 then 60@46 = 42.25', () => {
  const s = replay([IN(100, 40), IN(60, 46)], 0);
  assert.strictEqual(s.onHand, 160);
  assert.strictEqual(costFromState(s, 10, 'average', 0), 42.25);
});
test('weighted average keeps cost after a sale, then re-averages on the next purchase', () => {
  const s = replay([IN(100, 40), IN(60, 46), OUT(60), IN(100, 50)], 0);
  assert.strictEqual(s.onHand, 200);
  assert.strictEqual(Math.round(costFromState(s, 1, 'average', 0) * 100) / 100, 46.13);
});
test('fifo consumes the oldest layers first, spanning layers', () => {
  const s = replay([IN(100, 40), IN(60, 46), OUT(80)], 0);
  assert.strictEqual(costFromState(s, 20, 'fifo', 0), 40);
  assert.strictEqual(costFromState(s, 40, 'fifo', 0), (20 * 40 + 20 * 46) / 40);
});
test('cost-less receipts use running cost; empty ledger uses fallback', () => {
  const s = replay([IN(10, 20), { type: 'in', quantity: 5, unit_cost: null, to_warehouse_id: 1 }], 99);
  assert.strictEqual(costFromState(s, 1, 'average', 99), 20);
  assert.strictEqual(costFromState(replay([], 7), 1, 'fifo', 7), 7);
});
test('adjustments and transfers: surplus adds, deficit removes, transfer ignored', () => {
  const s = replay([IN(10, 5), { type: 'transfer', quantity: 4, from_warehouse_id: 1, to_warehouse_id: 2 }, { type: 'adjustment', quantity: 2, from_warehouse_id: 1, to_warehouse_id: null }], 0);
  assert.strictEqual(s.onHand, 8);
});
test('unitCostForSale reads the approved ledger and honours the method', async () => {
  const q = { async query() { return { rows: [IN(100, 40), IN(60, 46), OUT(100)] }; } };
  assert.strictEqual(await unitCostForSale(q, { tenantId: 'T', productId: 1, qty: 10, method: 'average' }), 42.25);
  assert.strictEqual(await unitCostForSale(q, { tenantId: 'T', productId: 1, qty: 10, method: 'fifo' }), 46);
});
