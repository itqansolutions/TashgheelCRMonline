const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');
const orig = Module._load;
const stub = { query: async () => ({ rows: [] }), connect: async () => ({ query: async () => ({ rows: [] }), release() {} }) };
Module._load = function (r, p, ...rest) { if (/config\/db$/.test(r)) return stub; return orig.call(this, r, p, ...rest); };
const router = require(path.join(__dirname, '../routes/hrRoutes.js'));
Module._load = orig;
function allowed(method, routePath, role) {
  const layer = router.stack.find(l => l.route && l.route.path === routePath && l.route.methods[method]);
  assert.ok(layer, `route ${method} ${routePath} exists`);
  // Only the role guard (first handler after auth) is exercised, never the controller.
  let status = null, passed = false;
  layer.route.stack[0].handle({ user: { role } }, { status(c) { status = c; return this; }, json() { return this; } }, () => { passed = true; });
  return passed && status === null;
}
test('rejects log: admin, manager and hr can read; employee, sales cannot', () => {
  for (const r of ['admin', 'manager', 'hr']) assert.strictEqual(allowed('get', '/attendance-policy/rejects', r), true, r);
  for (const r of ['employee', 'sales', 'user']) assert.strictEqual(allowed('get', '/attendance-policy/rejects', r), false, r);
});
test('hr can view staff attendance, leaves and payroll list; cannot generate or finalize payroll', () => {
  for (const p of ['/attendance', '/leaves', '/payroll']) assert.strictEqual(allowed('get', p, 'hr'), true, p);
  assert.strictEqual(allowed('post', '/payroll/generate', 'hr'), false);
  assert.strictEqual(allowed('put', '/payroll/:id/finalize', 'hr'), false);
  assert.strictEqual(allowed('put', '/attendance-policy', 'hr'), false, 'policy save stays admin only');
  assert.strictEqual(allowed('put', '/attendance-policy', 'manager'), false);
});
