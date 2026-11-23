const assert = require('node:assert/strict');
const root = require('node:path').resolve(__dirname, '..');
const mock = (file, value) => { const id = require.resolve(root + '/' + file); require.cache[id] = { id, filename: id, loaded: true, exports: value }; };
const punches = [];
mock('config/db', { query: async sql => {
  if (sql.includes('SELECT * FROM hr_attendance_devices')) return { rows: [{ id: 1, tenant_id: 'synthetic', branch_id: 'synthetic-branch' }] };
  if (sql.includes('SELECT id FROM users')) return { rows: [{ id: 7 }] };
  return { rows: [] };
}});
mock('services/attendanceService', { transact: async value => punches.push(value) });
const routes = {};
require(root + '/services/ZkAdmsService')({ post: (path, fn) => routes[path] = fn, get() {} });
const push = (query, body) => new Promise(resolve => {
  const events = {};
  routes['/iclock/cdata']({ query: { SN: 'SYNTHETIC', ...query }, on: (key, fn) => events[key] = fn }, { set() {}, send: resolve });
  events.data(Buffer.from(body)); events.end();
});
(async () => {
  await push({}, 'ATTLOG 7\t2026-11-23 09:00:00\t0\t1');
  assert.equal(punches.length, 1, 'legacy prefixed format remains supported');
  await push({ table: 'ATTLOG' }, '7\t2026-11-23 17:00:00\t1\t1\r\n7\t2026-11-23 12:00:00\t0\t1\r\n');
  assert.equal(punches.length, 3, 'table-qualified raw records must not be silently acknowledged without processing');
  await push({ table: 'OPERLOG' }, '7\t2026-11-23 18:00:00\t1\t1');
  await push({}, '7\t2026-11-23 18:00:00\t1\t1');
  assert.equal(punches.length, 3, 'other tables and unqualified raw data must not become attendance');
  await push({ table: 'ATTLOG' }, 'PIN\tDateTime\tStatus\tVerify\n\n7\tbad-time\t0\t1\n');
  assert.equal(punches.length, 3, 'headers and malformed timestamps are not records');
  console.log('PASS ADMS legacy/raw batch format, table isolation, header/malformed input guards; synthetic route only');
})().catch(error => { console.error(error); process.exitCode = 1; });
