const test = require('node:test');
const assert = require('node:assert/strict');
test('period options follow current year and preserve historic/custom selection', async () => {
  const { currentQuarter, targetPeriods } = await import('../frontend/src/utils/targetPeriods.mjs');
  const date = new Date(2027, 0, 2);
  assert.equal(currentQuarter(date), '2027-Q1');
  const options = targetPeriods([{period:'2022-Q2'}], '2025-04', '2030-Q4', date);
  for (const value of ['All Periods','2027-01','2027-12','2027-Q1','2027-Q4','2027','2022-Q2','2025-04','2030-Q4']) assert(options.includes(value), value);
  assert.equal(new Set(options).size, options.length);
});
