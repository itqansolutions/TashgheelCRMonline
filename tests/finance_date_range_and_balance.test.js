const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// ---- Mock config/db BEFORE loading any controller: no real database is ever touched. ----
const dbPath = require.resolve('../config/db');
const calls = [];
let handlers = {};
const fakeDb = {
  query: async (sql, params = []) => {
    calls.push({ sql, params });
    if (/^\s*(CREATE|ALTER|DROP)\b/i.test(sql)) return { rows: [] };
    if (/FROM treasury_accounts/i.test(sql)) return handlers.account(params);
    if (/AS total_incoming/i.test(sql)) return handlers.balance(params);
    if (/SELECT \* FROM \(/i.test(sql)) return handlers.txns(params);
    return { rows: [] };
  },
  pool: {}, connect: async () => ({}),
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const finance = require('../controllers/financeController');
const { validateDateRange } = require('../utils/dateRange');

const mkRes = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const reset = () => { calls.length = 0; };
const dataCalls = () => calls.filter(c => !/^\s*(CREATE|ALTER|DROP)\b/i.test(c.sql));
const ACCOUNT = { id: 104, tenant_id: 'T1', branch_id: 'B1', opening_balance: '1000.00', is_active: true };
const setDefaults = () => {
  handlers = {
    account: (p) => ({ rows: p[1] === 'T1' && String(p[0]) === '104' ? [ACCOUNT] : [] }),
    balance: () => ({ rows: [{ total_incoming: '500.00', total_outgoing: '200.00' }] }),
    txns: () => ({ rows: [] }),
  };
};
const req = (over = {}) => ({
  user: { tenant_id: 'T1', branch_id: null }, branchId: undefined,
  params: { id: '104' }, query: {}, ...over,
});

test('validateDateRange (backend helper)', () => {
  assert.equal(validateDateRange(undefined, undefined), null);
  assert.equal(validateDateRange('2026-10-01', undefined), null);
  assert.equal(validateDateRange(undefined, '2026-10-01'), null);
  assert.equal(validateDateRange('2026-10-01', '2026-10-01'), null, 'same day is valid');
  assert.equal(validateDateRange('2026-10-01', '2026-10-15'), null);
  assert.match(validateDateRange('2026-10-15', '2026-10-01'), /date_from must not be after date_to/);
  assert.match(validateDateRange('not-a-date', '2026-10-01'), /Invalid date_from/);
  assert.match(validateDateRange('2026-10-01', '2026-13-45'), /Invalid date_to/);
});

test('frontend isInvalidDateRange rejects reversed range, never swaps', async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '../frontend/src/utils/dateRange.js')).href);
  assert.equal(mod.isInvalidDateRange('2026-10-15', '2026-10-01'), true);
  assert.equal(mod.isInvalidDateRange('2026-10-01', '2026-10-15'), false);
  assert.equal(mod.isInvalidDateRange('2026-10-01', '2026-10-01'), false);
  assert.equal(mod.isInvalidDateRange('', '2026-10-01'), false);
  assert.equal(mod.isInvalidDateRange('2026-10-01', ''), false);
});

test('frontend pages block the request before calling the API', () => {
  const dir = path.join(__dirname, '../frontend/src/pages/Finance');
  for (const f of ['Treasury.jsx', 'Reports.jsx', 'CustomerAccounts.jsx']) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const guard = src.indexOf('isInvalidDateRange(dateFrom, dateTo)');
    const apiCall = src.indexOf("params.append('date_from'");
    assert.ok(guard > -1, `${f} must validate the range`);
    assert.ok(guard < apiCall, `${f} must validate BEFORE building/sending the request`);
    assert.doesNotMatch(src, /setDateFrom\(dateTo\)|setDateTo\(dateFrom\)/, `${f} must not auto-swap dates`);
  }
});

test('Reversed range => HTTP 400 and NO database access (all 3 finance endpoints)', async () => {
  setDefaults();
  const q = { date_from: '2026-10-15', date_to: '2026-10-01' };
  for (const [name, r] of [
    ['getTreasuryAccountTransactions', req({ query: q })],
    ['getCustomerStatement', req({ query: q })],
    ['getFinancialReports', req({ query: q })],
  ]) {
    reset();
    const res = mkRes();
    await finance[name](r, res);
    assert.equal(res.statusCode, 400, `${name} must return 400`);
    assert.match(res.body.message, /date_from must not be after date_to/);
    assert.equal(calls.length, 0, `${name} must not touch the DB`);
  }
});

test('Treasury: no filter => no date params; balance = opening + in - out', async () => {
  setDefaults();
  handlers.txns = () => ({ rows: [{ direction: 'in', amount: '500.00' }, { direction: 'out', amount: '200.00' }] });
  reset();
  const res = mkRes();
  await finance.getTreasuryAccountTransactions(req(), res);
  assert.equal(res.statusCode, 200);
  const txnCall = calls.find(c => /SELECT \* FROM \(/.test(c.sql));
  assert.equal(txnCall.params.length, 3, 'no date params without filter');
  assert.doesNotMatch(txnCall.sql, /txn_date >=|txn_date <=/);
  assert.equal(res.body.account.current_balance, 1300); // 1000 + 500 - 200
  assert.equal(res.body.count, 2);
});

test('Treasury: date filter limits displayed rows ONLY, not the current balance', async () => {
  setDefaults();
  handlers.txns = () => ({ rows: [] }); // filter window has no transactions
  reset();
  const res = mkRes();
  await finance.getTreasuryAccountTransactions(req({ query: { date_from: '2026-10-01', date_to: '2026-10-02' } }), res);
  const txnCall = calls.find(c => /SELECT \* FROM \(/.test(c.sql));
  assert.deepEqual(txnCall.params.slice(3), ['2026-10-01', '2026-10-02']);
  const balCall = calls.find(c => /AS total_incoming/.test(c.sql));
  assert.equal(balCall.params.length, 3, 'balance query must receive NO date params');
  assert.doesNotMatch(balCall.sql, /txn_date|date_from|voucher_date|payment_date|expense_date/);
  assert.equal(res.body.transactions.length, 0);
  assert.equal(res.body.account.current_balance, 1300, 'balance unchanged by an empty filter window');
});

test('Treasury: tenant isolation (other tenant => 404, no transaction/balance query)', async () => {
  setDefaults();
  reset();
  const res = mkRes();
  await finance.getTreasuryAccountTransactions(req({ user: { tenant_id: 'T2', branch_id: null } }), res);
  assert.equal(res.statusCode, 404);
  assert.equal(dataCalls().length, 1, 'only the ownership check runs');
  assert.equal(calls.find(c => /FROM treasury_accounts/.test(c.sql)).params[1], 'T2');
});

test('Treasury: branch scope is passed to ownership, list and balance queries', async () => {
  setDefaults();
  reset();
  const res = mkRes();
  await finance.getTreasuryAccountTransactions(req({ branchId: 'B1' }), res);
  for (const c of dataCalls()) assert.equal(c.params[2], 'B1', 'branch param must be forwarded');
  reset();
  await finance.getTreasuryAccountTransactions(req(), mkRes());
  for (const c of dataCalls()) assert.equal(c.params[2], null, 'no branch => NULL param');
});

test('SQL guards: tenant scoping, cancelled exclusion, no duplicate-producing join', () => {
  const src = fs.readFileSync(path.join(__dirname, '../controllers/financeController.js'), 'utf8');
  const start = src.indexOf('exports.getTreasuryAccountTransactions');
  const end = src.indexOf('// ==========================================', start);
  const body = src.slice(start, end);

  assert.match(body, /LEFT JOIN LATERAL \([\s\S]*?LIMIT 1[\s\S]*?\) fv ON true/, 'voucher reference join must yield max 1 row per payment');
  assert.doesNotMatch(body, /LEFT JOIN finance_vouchers fv\b/, 'plain join on finance_vouchers can duplicate payment rows');

  const balStart = body.indexOf('const balRes');
  const balSql = body.slice(balStart, body.indexOf('`, [account_id', balStart));
  const tenantChecks = balSql.match(/tenant_id::text = \$2::text/g) || [];
  assert.equal(tenantChecks.length, 4, 'each of the 4 balance sub-selects must be tenant scoped');
  assert.equal((balSql.match(/COALESCE\((?:p|fv)\.status, 'active'\) != 'cancelled'|COALESCE\(status, 'active'\) != 'cancelled'/g) || []).length, 3,
    'payments + both voucher sub-selects must exclude cancelled');
  assert.match(balSql, /fv\.invoice_id IS NULL/, 'invoice-linked receipts are already counted via payments');

  // Same inclusion rules as the accounts list endpoint (so both screens agree)
  const list = src.slice(src.indexOf('exports.getTreasuryAccounts'), src.indexOf('exports.createTreasuryAccount'));
  for (const rule of ["fv.voucher_type = 'receipt'", 'fv.invoice_id IS NULL', "fv.voucher_type = 'payment'", "!= 'cancelled'"]) {
    assert.ok(list.includes(rule) && balSql.includes(rule), `rule "${rule}" must exist in both list and detail balance`);
  }
});
