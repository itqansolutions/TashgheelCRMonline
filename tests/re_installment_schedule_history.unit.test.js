/**
 * Offline unit test: no database or network. config/db and loggerService are replaced
 * with fakes in require.cache before the controller loads, so nothing can connect.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const dbPath = require.resolve('../config/db');
const logPath = require.resolve('../services/loggerService');

let calls = [];
let state;
const fakeClient = {
  query: async (sql, params = []) => {
    const q = String(sql);
    calls.push({ q, params });
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(q) || /pg_advisory_xact_lock/.test(q)) return { rows: [] };
    if (/FROM re_contracts rc/.test(q)) return { rows: [state.contract] };
    if (/paid_amount > 0/.test(q)) return { rows: [{ count: '0' }] };
    if (/FROM finance_vouchers/.test(q)) return { rows: [{ count: '0' }] };
    if (/SELECT \* FROM re_installments/.test(q)) return { rows: state.existing };
    if (/INSERT INTO re_installment_schedule_history/.test(q)) {
      if (state.historyFails) throw new Error('relation does not exist');
      return { rows: [{ id: 'hist-1' }] };
    }
    if (/DELETE FROM re_installments/.test(q)) { state.deleted = true; return { rows: [] }; }
    if (/INSERT INTO re_installments/.test(q)) return { rows: [{ id: 'new-' + params[2], amount: params[4] }] };
    if (/UPDATE re_contracts/.test(q)) { state.contractUpdated = params; return { rows: [] }; }
    return { rows: [] };
  },
  release: () => {}
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => ({ rows: [] }), connect: async () => fakeClient } };
const logged = [];
require.cache[logPath] = { id: logPath, filename: logPath, loaded: true, exports: { logAction: (d) => logged.push(d), ACTIONS: { CREATE: 'CREATE', UPDATE: 'UPDATE' } } };
const { generateSchedule } = require('../controllers/reInstallmentsController');

function mkRes() {
  return { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}
function mkReq(extra = {}) {
  return { user: { tenant_id: 't1', id: 5, role: 'admin' }, branchId: null, body: { contract_id: 'c1', down_payment: 1000000, number_of_installments: 3, frequency: 'quarterly', start_date: '2026-12-01', ...extra } };
}
async function tokenFor() {
  const r = mkRes(); await generateSchedule(mkReq(), r);
  assert.equal(r.code, 409);
  calls = [];
  return r.body.confirm_replace_token;
}
function reset(over = {}) {
  calls = []; logged.length = 0;
  state = { contract: { id: 'c1', deal_id: 9, branch_id: 'b1', contract_value: '2500000', down_payment: '0', status: 'Draft' }, existing: [], ...over };
}

test('first generation: no confirmation needed, no history row, audit CREATE', async () => {
  reset();
  const res = mkRes(); await generateSchedule(mkReq(), res);
  assert.equal(res.code, 201);
  assert.equal(res.body.history_id, null);
  assert.ok(!calls.some(c => /re_installment_schedule_history/.test(c.q)));
  assert.equal(logged.length, 1); assert.equal(logged[0].action, 'CREATE');
});

test('replacing an existing schedule without confirm_replace is refused and changes nothing', async () => {
  reset({ existing: [{ id: 'old1', amount: '500000', installment_number: 0 }, { id: 'old2', amount: '500000', installment_number: 1 }] });
  const res = mkRes(); await generateSchedule(mkReq(), res);
  assert.equal(res.code, 409);
  assert.equal(res.body.code, 'SCHEDULE_REPLACE_CONFIRMATION_REQUIRED');
  assert.deepEqual(res.body.existing.ids, ['old1', 'old2']);
  assert.equal(state.deleted, undefined);
  assert.ok(calls.some(c => /ROLLBACK/.test(c.q)));
  assert.equal(logged.length, 0);
});

test('confirmed replacement snapshots old rows, then deletes, inserts, updates contract, audits UPDATE', async () => {
  reset({ existing: [{ id: 'old1', amount: '500000', installment_number: 0 }] , contract: { id: 'c1', deal_id: 9, branch_id: 'b1', contract_value: '2500000', down_payment: '500000', status: 'Draft' } });
  const tok = await tokenFor(); const res = mkRes(); await generateSchedule(mkReq({ confirm_replace_token: tok }), res);
  assert.equal(res.code, 201); assert.equal(res.body.history_id, 'hist-1');
  const iHist = calls.findIndex(c => /INSERT INTO re_installment_schedule_history/.test(c.q));
  const iDel = calls.findIndex(c => /DELETE FROM re_installments/.test(c.q));
  assert.ok(iHist >= 0 && iDel > iHist, 'history must be written before delete');
  const snap = JSON.parse(calls[iHist].params[6]);
  assert.equal(snap[0].id, 'old1');
  assert.equal(calls[iHist].params[4], 500000); assert.equal(calls[iHist].params[5], 1000000);
  assert.equal(logged[0].action, 'UPDATE');
  assert.equal(logged[0].details.prior_down_payment, 500000); assert.equal(logged[0].details.new_down_payment, 1000000);
});

test('a wrong or boolean token is refused with a fresh token', async () => {
  reset({ existing: [{ id: 'old1', amount: '1', installment_number: 0 }] });
  const res = mkRes(); await generateSchedule(mkReq({ confirm_replace_token: true }), res);
  assert.equal(res.code, 409); assert.ok(res.body.confirm_replace_token); assert.equal(state.deleted, undefined);
});

test('fails closed: if history cannot be written, nothing is deleted and the transaction rolls back', async () => {
  reset({ existing: [{ id: 'old1', amount: '1', installment_number: 0 }] });
  const tok = await tokenFor(); state.historyFails = true; const res = mkRes(); await generateSchedule(mkReq({ confirm_replace_token: tok }), res);
  assert.equal(res.code, 500);
  assert.equal(state.deleted, undefined);
  assert.ok(calls.some(c => /ROLLBACK/.test(c.q)));
  assert.equal(logged.length, 0);
});

test('Signed contract still enforces existing governance (down payment cannot change)', async () => {
  reset({ existing: [{ id: 'old1', amount: '1', installment_number: 0 }], contract: { id: 'c1', deal_id: 9, branch_id: 'b1', contract_value: '2500000', down_payment: '500000', status: 'Signed' } });
  const res = mkRes(); await generateSchedule(mkReq({ confirm_replace_token: 'x' }), res);
  assert.equal(res.code, 409); assert.equal(state.deleted, undefined);
});

test('stale token (schedule changed after review) is refused with SCHEDULE_CHANGED_SINCE_CONFIRMATION', async () => {
  reset({ existing: [{ id: 'old1', amount: '500000', installment_number: 0 }] });
  const tok = await tokenFor();
  state.existing = [{ id: 'old1', amount: '500001', installment_number: 0 }];
  const res = mkRes(); await generateSchedule(mkReq({ confirm_replace_token: tok }), res);
  assert.equal(res.code, 409); assert.equal(res.body.code, 'SCHEDULE_CHANGED_SINCE_CONFIRMATION'); assert.notEqual(res.body.confirm_replace_token, tok);
  assert.equal(state.deleted, undefined);
});
