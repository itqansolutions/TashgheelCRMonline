const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');
const calls = []; let failInsert = false;
const db = { query: async (sql, params) => { calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params }); if (failInsert && /INSERT/.test(sql)) { const e = new Error('relation missing'); e.code = '42P01'; throw e; } return { rows: [] }; } };
const orig = Module._load;
Module._load = function (r, p, ...rest) { if (/config\/db$/.test(r)) return db; return orig.call(this, r, p, ...rest); };
const log = require(path.join(__dirname, '../services/attendanceRejectLog.js'));
Module._load = orig;
const base = { tenant: 'T', branch: 'B', user: 7, mode: 'in' };
test('outside-area reject stores distance/accuracy/radius only, no coordinates', async () => {
  const err = Object.assign(new Error('x'), { code: 'GEO_OUTSIDE_AREA', details: { distance_m: 420, accuracy_m: 12, radius_m: 150, fix_age_seconds: 3 } });
  assert.strictEqual(await log.recordReject({ ...base, err }), true);
  const ins = calls.find(c => /INSERT INTO hr_attendance_location_rejects/.test(c.sql));
  assert.deepStrictEqual(ins.params, ['T', 'B', 7, 'in', 'GEO_OUTSIDE_AREA', 420, 12, 150, 3]);
  assert.ok(!/lat|lng|lon/i.test(ins.sql.replace('location_rejects', '')));
  assert.ok(calls.some(c => /DELETE FROM hr_attendance_location_rejects/.test(c.sql)), 'retention purge ran');
});
test('config errors and unknown codes are not logged', async () => {
  calls.length = 0;
  assert.strictEqual(await log.recordReject({ ...base, err: Object.assign(new Error('x'), { code: 'GEO_NO_AREA' }) }), false);
  assert.strictEqual(await log.recordReject({ ...base, err: Object.assign(new Error('x'), { code: '23505' }) }), false);
  assert.strictEqual(calls.length, 0);
});
test('a missing table never throws (logging is best-effort)', async () => {
  failInsert = true;
  const err = Object.assign(new Error('x'), { code: 'GEO_FIX_STALE', details: { fix_age_seconds: 300 } });
  assert.strictEqual(await log.recordReject({ ...base, err }), false);
});
test('validate attaches distance details to outside-area rejections', () => {
  const { validate } = require('../services/attendanceLocationService');
  try { validate({ center_lat: 30, center_lng: 31, radius_m: 150, max_fix_age_seconds: 60, max_future_skew_seconds: 5, require_mobile: true }, { latitude: 30.01, longitude: 31, accuracy: 10, timestamp: Date.now() }, 'iPhone'); assert.fail('should reject'); }
  catch (e) { assert.strictEqual(e.code, 'GEO_OUTSIDE_AREA'); assert.ok(e.details.distance_m > 1000); assert.strictEqual(e.details.radius_m, 150); assert.ok(!('latitude' in e.details)); }
});
