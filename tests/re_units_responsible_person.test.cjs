const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

const calls = [];
let userExists = true;
const db = { query: async (sql, params = []) => {
  calls.push({ sql, params });
  if (/FROM users WHERE id::text/.test(sql)) return { rows: userExists ? [{ '?column?': 1 }] : [] };
  if (/INSERT INTO re_units/.test(sql)) return { rows: [{ id: 'new-unit', responsible_person_id: params[11] }] };
  if (/UPDATE re_units/.test(sql)) return { rows: [{ id: 'u1' }], rowCount: 1 };
  return { rows: [] };
}, connect: async () => ({ query: db.query, release() {} }) };
const origLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (parent && parent.filename && parent.filename.endsWith('controllers/reUnitsController.js')) {
    if (request === '../config/db') return db;
    if (request === '../services/reDeletionGuard') return { countUnitLinks: async () => 0 };
    if (request === '../services/loggerService') return { logDelete: async () => {} };
    if (request.startsWith('../services/unitEventService')) return { recordUnitEvent: async () => {}, recordEvent: async () => {} };
  }
  return origLoad.call(this, request, parent, ...rest);
};
const ctrl = require(path.join(__dirname, '../controllers/reUnitsController.js'));
Module._load = origLoad;

const mkRes = () => { const r = { code: 200, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
const user = { tenant_id: 'T1', branch_id: null, role: 'admin', id: 1 };

test('create with a responsible person from another tenant is rejected before any insert', async () => {
  userExists = false; calls.length = 0;
  const res = mkRes();
  await ctrl.createUnit({ user, body: { name: 'x', project_name: 'p', unit_number: 'u', area_sqm: 1, rooms: 1, floor: '1', price: 1, responsible_person_id: '999' } }, res);
  assert.strictEqual(res.code, 400);
  assert.strictEqual(res.body.code, 'INVALID_RESPONSIBLE_PERSON');
  assert.ok(!calls.some(c => /INSERT INTO re_units/.test(c.sql)));
  assert.ok(calls[0].params.includes('T1'), 'lookup is tenant scoped');
});
test('update with an invalid responsible person is rejected before any update', async () => {
  userExists = false; calls.length = 0;
  const res = mkRes();
  await ctrl.updateUnit({ user, params: { id: 'u1' }, body: { responsible_person_id: '999' } }, res);
  assert.strictEqual(res.code, 400);
  assert.strictEqual(res.body.code, 'INVALID_RESPONSIBLE_PERSON');
  assert.ok(!calls.some(c => /UPDATE re_units/.test(c.sql)));
});
test('clearing the responsible person (empty value) needs no lookup and is allowed', async () => {
  userExists = false; calls.length = 0;
  const res = mkRes();
  await ctrl.updateUnit({ user, params: { id: 'u1' }, body: { responsible_person_id: '' } }, res);
  assert.notStrictEqual(res.body && res.body.code, 'INVALID_RESPONSIBLE_PERSON');
  assert.ok(!calls.some(c => /FROM users WHERE id::text/.test(c.sql)));
});
test('a valid same-tenant responsible person is stored on create', async () => {
  userExists = true; calls.length = 0;
  const res = mkRes();
  await ctrl.createUnit({ user, body: { name: 'x', project_name: 'p', unit_number: 'u', area_sqm: 1, rooms: 1, floor: '1', price: 1, responsible_person_id: '363' } }, res);
  const ins = calls.find(c => /INSERT INTO re_units/.test(c.sql));
  assert.ok(ins, 'insert ran');
  assert.strictEqual(ins.params[11], '363');
});
