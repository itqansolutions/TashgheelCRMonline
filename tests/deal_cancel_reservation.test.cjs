const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

const calls = [];
let deal, unitStatus, hasContract;
const q = async (sql, params = []) => {
  const n = sql.replace(/\s+/g, ' ').trim();
  calls.push({ n, params });
  if (/^(BEGIN|COMMIT|ROLLBACK)/.test(n)) return { rows: [] };
  if (/FROM deals WHERE/.test(n) && /FOR UPDATE/.test(n)) return { rows: deal ? [deal] : [] };
  if (/FROM re_units WHERE/.test(n)) return { rows: [{ id: 'u1', status: unitStatus }] };
  if (/FROM re_contracts/.test(n)) return { rows: hasContract ? [{}] : [] };
  if (/UPDATE re_units/.test(n)) return { rows: [{}], rowCount: 1 };
  if (/UPDATE deals/.test(n)) return { rows: [{ id: deal.id, pipeline_stage: params[0], custom_fields: params[1] }] };
  return { rows: [] };
};
const db = { query: q, connect: async () => ({ query: q, release() {} }) };
const orig = Module._load;
Module._load = function (request, parent, ...rest) {
  if (/config\/db$/.test(request)) return db;
  if (parent && parent.filename && parent.filename.endsWith('controllers/dealsController.js')) {
    if (request === '../services/loggerService') return { logAction() {}, logCreate() {}, logUpdate() {}, logDelete() {}, ACTIONS: {}, LOG_LEVELS: {} };
    if (request === '../services/accessScopeService') return { buildScopePredicate: async () => ({ sql: '1=1', params: [] }) };
  }
  return orig.call(this, request, parent, ...rest);
};
const ctrl = require(path.join(__dirname, '../controllers/dealsController.js'));
Module._load = orig;
const mkRes = () => { const r = { code: 200, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
const req = (body) => ({ params: { id: '5' }, body, user: { id: 1, tenant_id: 'T1', role: 'admin' }, branchId: null });
const reset = () => { calls.length = 0; deal = { id: 5, unit_id: 'u1', pipeline_stage: 'negotiation', custom_fields: { is_unit_reservation: true } }; unitStatus = 'Reserved'; hasContract = false; };

test('reason is required and nothing is touched without it', async () => {
  reset(); const res = mkRes();
  await ctrl.cancelDealReservation(req({ reason: ' ' }), res);
  assert.strictEqual(res.code, 400); assert.strictEqual(res.body.code, 'REASON_REQUIRED');
  assert.strictEqual(calls.length, 0);
});
test('cancels only the reservation: unit Available, deal stays open and linked', async () => {
  reset(); const res = mkRes();
  await ctrl.cancelDealReservation(req({ reason: 'customer postponed' }), res);
  assert.strictEqual(res.code, 200);
  assert.ok(calls.some(c => /UPDATE re_units SET status = 'Available'/.test(c.n)));
  const upd = calls.find(c => /UPDATE deals/.test(c.n));
  assert.strictEqual(upd.params[0], 'negotiation');
  assert.strictEqual(upd.params[1].is_unit_reservation, false);
  assert.strictEqual(upd.params[1].reservation_cancel_reason, 'customer postponed');
  assert.ok(!/unit_id/.test(upd.n), 'unit link kept');
  assert.ok(calls.some(c => c.n === 'COMMIT'));
});
test('a deal in the reserved stage returns to negotiation, not lost', async () => {
  reset(); deal.pipeline_stage = 'reserved';
  const res = mkRes(); await ctrl.cancelDealReservation(req({ reason: 'abc' }), res);
  assert.strictEqual(calls.find(c => /UPDATE deals/.test(c.n)).params[0], 'negotiation');
});
test('refuses when the unit is not reserved, no writes', async () => {
  reset(); unitStatus = 'Available';
  const res = mkRes(); await ctrl.cancelDealReservation(req({ reason: 'abc' }), res);
  assert.strictEqual(res.code, 409);
  assert.ok(!calls.some(c => /^UPDATE/.test(c.n)));
});
test('refuses when another deal holds the reservation (this deal is not the holder)', async () => {
  reset(); deal.custom_fields = {};
  const res = mkRes(); await ctrl.cancelDealReservation(req({ reason: 'abc' }), res);
  assert.strictEqual(res.code, 409);
  assert.ok(!calls.some(c => /^UPDATE/.test(c.n)));
});
test('refuses when the deal has a live contract', async () => {
  reset(); hasContract = true;
  const res = mkRes(); await ctrl.cancelDealReservation(req({ reason: 'abc' }), res);
  assert.strictEqual(res.code, 409); assert.strictEqual(res.body.code, 'CONTRACT_EXISTS');
  assert.ok(!calls.some(c => /^UPDATE/.test(c.n)));
});
test('closed or lost deals are refused', async () => {
  reset(); deal.pipeline_stage = 'lost';
  const res = mkRes(); await ctrl.cancelDealReservation(req({ reason: 'abc' }), res);
  assert.strictEqual(res.code, 400);
});
