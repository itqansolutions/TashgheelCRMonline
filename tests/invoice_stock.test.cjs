const test = require('node:test');
const assert = require('node:assert');
const { deductForInvoice, restoreForInvoice } = require('../services/invoiceStockService.js');

function mk({ prods, allowNeg = false, whs = [{ id: 1, name: 'W1' }], stock = {}, outs = [], reversed = false }) {
  const inserts = [];
  const q = {
    inserts,
    async query(sql, p = []) {
      const n = sql.replace(/\s+/g, ' ');
      if (/FROM products/.test(n)) return { rows: prods };
      if (/allow_negative_stock/.test(n)) return { rows: [{ allow_negative_stock: allowNeg }] };
      if (/FROM warehouses/.test(n)) return { rows: whs };
      if (/SUM\(CASE/.test(n)) return { rows: [{ s: stock[p[0] + ':' + p[1]] || 0 }] };
      if (/type='out' AND status='approved'/.test(n)) return { rows: outs };
      if (/reference_type=\$1 AND reference_id=\$2 AND tenant_id::text=\$3::text LIMIT 1/.test(n)) return { rows: reversed ? [{}] : [] };
      if (/INSERT INTO stock_movements/.test(n)) { inserts.push(p); return { rows: [{ id: inserts.length, product_id: p[0], quantity: p[2], from_warehouse_id: p[1] }] }; }
      return { rows: [] };
    },
  };
  return q;
}
const base = { invoiceId: 9, tenantId: 'T', branchId: null, userId: 1 };

test('deducts an approved OUT movement for inventory items', async () => {
  const q = mk({ prods: [{ id: 5, name: 'A', is_inventory_item: true }], stock: { '1:5': 10 } });
  const r = await deductForInvoice(q, { ...base, items: [{ product_id: 5, quantity: 3 }] });
  assert.strictEqual(r.movements.length, 1);
  assert.strictEqual(q.inserts[0][2], 3);
  assert.strictEqual(q.inserts[0][5], 'invoice');
});
test('skips services and items without product', async () => {
  const q = mk({ prods: [{ id: 6, name: 'Svc', is_inventory_item: false }] });
  const r = await deductForInvoice(q, { ...base, items: [{ product_id: 6, quantity: 1 }, { product_id: null, quantity: 2 }] });
  assert.strictEqual(r.movements.length, 0); assert.strictEqual(q.inserts.length, 0);
});
test('insufficient stock throws 409 and writes nothing', async () => {
  const q = mk({ prods: [{ id: 5, name: 'A', is_inventory_item: true }], stock: { '1:5': 1 } });
  await assert.rejects(deductForInvoice(q, { ...base, items: [{ product_id: 5, quantity: 3 }] }), e => e.status === 409 && e.code === 'INSUFFICIENT_STOCK');
  assert.strictEqual(q.inserts.length, 0);
});
test('allow_negative_stock lets it through', async () => {
  const q = mk({ prods: [{ id: 5, name: 'A', is_inventory_item: true }], allowNeg: true });
  const r = await deductForInvoice(q, { ...base, items: [{ product_id: 5, quantity: 3 }] });
  assert.strictEqual(r.movements.length, 1);
});
test('no warehouse throws NO_WAREHOUSE', async () => {
  const q = mk({ prods: [{ id: 5, name: 'A', is_inventory_item: true }], whs: [] });
  await assert.rejects(deductForInvoice(q, { ...base, items: [{ product_id: 5, quantity: 1 }] }), e => e.code === 'NO_WAREHOUSE');
});
test('picks the first warehouse that has enough stock', async () => {
  const q = mk({ prods: [{ id: 5, name: 'A', is_inventory_item: true }], whs: [{ id: 1 }, { id: 2 }], stock: { '1:5': 1, '2:5': 9 } });
  await deductForInvoice(q, { ...base, items: [{ product_id: 5, quantity: 4 }] });
  assert.strictEqual(q.inserts[0][1], 2);
});
test('restore puts stock back once and is idempotent', async () => {
  const outs = [{ product_id: 5, from_warehouse_id: 1, quantity: 3 }];
  const q = mk({ outs });
  assert.strictEqual((await restoreForInvoice(q, base)).restored, 1);
  assert.strictEqual(q.inserts[0][5], 'invoice_reversal');
  const q2 = mk({ outs, reversed: true });
  assert.strictEqual((await restoreForInvoice(q2, base)).restored, 0);
  assert.strictEqual(q2.inserts.length, 0);
});

test('stores the product cost on the OUT movement and copies it to the reversal', async () => {
  const q = mk({ prods: [{ id: 5, name: 'A', is_inventory_item: true, cost_price: '12.5' }], stock: { '1:5': 10 }, outs: [{ product_id: 5, from_warehouse_id: 1, quantity: 3, unit_cost: '12.5' }] });
  await deductForInvoice(q, { ...base, items: [{ product_id: 5, quantity: 3 }] });
  assert.strictEqual(q.inserts[0][8], 12.5);
  const q2 = mk({ prods: [], outs: [{ product_id: 5, from_warehouse_id: 1, quantity: 3, unit_cost: '12.5' }] });
  await restoreForInvoice(q2, { ...base });
  assert.strictEqual(q2.inserts[0][8], '12.5');
});
