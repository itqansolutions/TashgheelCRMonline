const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

let calls = []; let existingSame = false; let userOk = true; let shiftOk = true;
const q = async (sql, params = []) => {
  calls.push({ sql, params });
  if (/ON CONFLICT/.test(sql)) throw new Error('there is no unique or exclusion constraint matching the ON CONFLICT specification');
  if (/FROM users WHERE id = \$1 AND tenant_id::text = \$2::text$/.test(sql.trim())) return { rows: userOk ? [{ id: 1 }] : [] };
  if (/FROM hr_shifts WHERE/.test(sql)) return { rows: shiftOk ? [{ id: 2 }] : [] };
  if (/SELECT id FROM hr_user_shifts/.test(sql)) return { rows: existingSame ? [{ id: 9 }] : [] };
  if (/INSERT INTO hr_user_shifts/.test(sql)) return { rows: [{ id: 10, user_id: params[0], shift_id: params[1] }] };
  if (/UPDATE hr_user_shifts SET shift_id/.test(sql)) return { rows: [{ id: 9, shift_id: params[0] }] };
  return { rows: [], rowCount: 0 };
};
const db = { query: q, pool: { connect: async () => ({ query: q, release() {} }) } };
const origLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (parent && parent.filename && /controllers\/hrShiftsController\.js$/.test(parent.filename) && request === '../config/db') return db;
  return origLoad.call(this, request, parent, ...rest);
};
const ctrl = require(path.join(__dirname, '../controllers/hrShiftsController.js'));
Module._load = origLoad;
const { parseSalary } = require('../services/hrProfileService.js');
const mkRes = () => { const r = { code: 200, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
const req = (body) => ({ user: { tenant_id: 'T1' }, body });

test('assign inserts a new row without ON CONFLICT', async () => {
  calls = []; existingSame = false; userOk = true; shiftOk = true;
  const res = mkRes(); await ctrl.assignUserShift(req({ user_id: 5, shift_id: 2, effective_from: '2026-11-25' }), res);
  assert.strictEqual(res.code, 201);
  assert.ok(calls.some(c => /INSERT INTO hr_user_shifts/.test(c.sql)));
  assert.ok(!calls.some(c => /ON CONFLICT/.test(c.sql)));
  assert.ok(calls.some(c => c.sql === 'COMMIT'));
});
test('assign on the same date updates the existing row', async () => {
  calls = []; existingSame = true;
  const res = mkRes(); await ctrl.assignUserShift(req({ user_id: 5, shift_id: 3, effective_from: '2026-11-25' }), res);
  assert.strictEqual(res.code, 201);
  assert.ok(calls.some(c => /UPDATE hr_user_shifts SET shift_id/.test(c.sql)));
  assert.ok(!calls.some(c => /INSERT INTO hr_user_shifts/.test(c.sql)));
});
test('assign closes earlier open assignments and is tenant scoped', async () => {
  calls = []; existingSame = false;
  const res = mkRes(); await ctrl.assignUserShift(req({ user_id: 5, shift_id: 2, effective_from: '2026-11-25' }), res);
  const close = calls.find(c => /SET effective_to = \$1/.test(c.sql));
  assert.ok(close && close.params.includes('T1'));
});
test('assign returns 404 for a user or shift outside the tenant', async () => {
  userOk = false; let res = mkRes(); await ctrl.assignUserShift(req({ user_id: 5, shift_id: 2 }), res); assert.strictEqual(res.code, 404);
  userOk = true; shiftOk = false; res = mkRes(); await ctrl.assignUserShift(req({ user_id: 5, shift_id: 2 }), res); assert.strictEqual(res.code, 404);
  shiftOk = true;
});
test('parseSalary', () => {
  assert.deepStrictEqual(parseSalary(''), { ok: true, value: undefined });
  assert.deepStrictEqual(parseSalary('8,000.5'), { ok: true, value: 8000.5 });
  assert.strictEqual(parseSalary('-1').ok, false);
  assert.strictEqual(parseSalary('abc').ok, false);
});
