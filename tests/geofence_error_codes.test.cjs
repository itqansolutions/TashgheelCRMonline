const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../services/attendanceLocationService');
const policy = { center_lat: 30, center_lng: 31, radius_m: 150, max_fix_age_seconds: 60, max_future_skew_seconds: 5, require_mobile: true };
const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
const now = Date.now();
const fix = (o = {}) => ({ latitude: 30, longitude: 31, accuracy: 10, timestamp: now, ...o });
const code = (fn) => { try { fn(); } catch (e) { return { code: e.code, status: e.status }; } return null; };
test('every rejection carries a stable GEO_ code and 403', () => {
  assert.deepStrictEqual(code(() => validate(null, fix(), ua, now)), { code: 'GEO_NO_AREA', status: 403 });
  assert.deepStrictEqual(code(() => validate({ ...policy, radius_m: null }, fix(), ua, now)), { code: 'GEO_POLICY_INVALID', status: 403 });
  assert.deepStrictEqual(code(() => validate(policy, fix(), 'Mozilla/5.0 (Windows NT 10.0)', now)), { code: 'GEO_MOBILE_ONLY', status: 403 });
  assert.strictEqual(code(() => validate(policy, undefined, ua, now)).code, 'GEO_FIX_REQUIRED');
  assert.strictEqual(code(() => validate(policy, fix({ latitude: 95 }), ua, now)).code, 'GEO_FIX_INVALID');
  assert.strictEqual(code(() => validate(policy, fix({ timestamp: now - 120000 }), ua, now)).code, 'GEO_FIX_STALE');
  assert.strictEqual(code(() => validate(policy, fix({ latitude: 30.01 }), ua, now)).code, 'GEO_OUTSIDE_AREA');
});
test('150 m radius: inside passes, accuracy counts against the radius', () => {
  assert.ok(validate(policy, fix({ latitude: 30.001 }), ua, now));          // ~111 m, accuracy 10
  assert.strictEqual(code(() => validate(policy, fix({ latitude: 30.001, accuracy: 60 }), ua, now)).code, 'GEO_OUTSIDE_AREA');
});
