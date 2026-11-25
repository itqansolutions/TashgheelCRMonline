const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

const inserts = [];
const q = async (sql, params = []) => {
  const n = sql.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)/.test(n)) return { rows: [] };
  if (/FROM vendors/.test(n)) return { rows: [{ id: 1 }] };
  if (/FROM warehouses/.test(n)) return { rows: [{ id: 3 }] };
  if (/COALESCE\(is_inventory_item, true\) = true/.test(n)) return { rows: [{ id: 10 }] };
  if (/FROM products WHERE id = ANY/.test(n)) return { rows: [{ id: 10 }, { id: 11 }] };
  if (/INSERT INTO purchase_invoices/.test(n)) return { rows: [{ id: 77 }] };
  if (/INSERT INTO stock_movements/.test(n)) inserts.push(params);
  return { rows: [] };
};
const client = { query: q, release() {} };
const db = { query: q, pool: { connect: async () => client }, connect: async () => client };
const orig = Module._load;
Module._load = function (request, parent, ...rest) {
  if (/config\/db$/.test(request)) return db;
  return orig.call(this, request, parent, ...rest);
};
const pc = require(path.join(__dirname, '../controllers/purchasesController.js'));
const att = require(path.join(__dirname, '../services/attendanceService.js'));
const quoteRoutes = require(path.join(__dirname, '../routes/quotationRoutes.js'));
Module._load = orig;
const mkRes = () => { const r = { code: 200, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };

test('direct purchase invoice posts approved IN movements only for inventory items', async () => {
  inserts.length = 0; const res = mkRes();
  await pc.createPurchaseInvoice({ user: { id: 1, tenant_id: 'T' }, branchId: null, body: { vendor_id: 1, warehouse_id: 3, items: [{ product_id: 10, quantity: 5, unit_price: 2 }, { product_id: 11, quantity: 1, unit_price: 9 }] } }, res);
  assert.strictEqual(res.code, 201);
  assert.strictEqual(inserts.length, 1);
  assert.strictEqual(inserts[0][2], 10); assert.strictEqual(inserts[0][3], 3); assert.strictEqual(inserts[0][4], 5);
  assert.strictEqual(inserts[0][5], '77');
});
test('no shift assigned: lateness is not flagged', async () => {
  const c = { query: async () => ({ rows: [] }) };
  const r = await att.lateness(c, 1, 'T', '2026-11-25', new Date('2026-11-25T14:00:00Z'), 'Africa/Cairo');
  assert.deepStrictEqual(r, { late: 0, status: 'present' });
});
test('shift assigned: lateness still computed', async () => {
  const c = { query: async () => ({ rows: [{ start_time: '09:00', grace_minutes: 10 }] }) };
  const r = await att.lateness(c, 1, 'T', '2026-11-25', new Date('2026-11-25T09:00:00Z'), 'UTC');
  assert.strictEqual(r.late, 0);
  const r2 = await att.lateness(c, 1, 'T', '2026-11-25', new Date('2026-11-25T10:00:00Z'), 'UTC');
  assert.strictEqual(r2.late, 50); assert.strictEqual(r2.status, 'late');
});
test('quotation approve route is limited to admin/manager', () => {
  const layer = quoteRoutes.stack.find(l => l.route && l.route.path === '/:id/approve');
  const guard = layer.route.stack[0].handle;
  const run = (role) => { const res = mkRes(); let nexted = false; guard({ user: { role } }, res, () => { nexted = true; }); return { nexted, code: res.code }; };
  assert.strictEqual(run('admin').nexted, true);
  assert.strictEqual(run('manager').nexted, true);
  assert.strictEqual(run('user').nexted, false);
  assert.strictEqual(run('user').code, 403);
});
