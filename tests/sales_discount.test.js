const test = require('node:test');
const assert = require('node:assert');
const { computeDiscount, prorateDiscount } = require('../services/discountService');

test('percent discount', () => {
  const d = computeDiscount(1000, 'percent', 10);
  assert.deepStrictEqual([d.type, d.amount, d.net], ['percent', 100, 900]);
});
test('fixed discount', () => {
  const d = computeDiscount(1000, 'fixed', 250.5);
  assert.deepStrictEqual([d.type, d.amount, d.net], ['fixed', 250.5, 749.5]);
});
test('no discount', () => {
  const d = computeDiscount(500, '', '');
  assert.deepStrictEqual([d.type, d.amount, d.net], [null, 0, 500]);
});
test('rejects bad input', () => {
  assert.throws(() => computeDiscount(100, 'percent', 101));
  assert.throws(() => computeDiscount(100, 'fixed', 100.01));
  assert.throws(() => computeDiscount(100, 'percent', -5));
  assert.throws(() => computeDiscount(100, 'weird', 5));
});
test('proration keeps invoice discounts adding up to the order discount', () => {
  const so = { discount_type: 'fixed', discount_value: 100, discount_amount: 100 };
  const a = prorateDiscount(so, 300, 1000);
  const b = prorateDiscount(so, 700, 1000);
  assert.strictEqual(a.amount, 30);
  assert.strictEqual(b.amount, 70);
  assert.strictEqual(prorateDiscount(so, 1000, 1000).amount, 100);
  const pct = prorateDiscount({ discount_type: 'percent', discount_value: 10, discount_amount: 100 }, 500, 1000);
  assert.deepStrictEqual([pct.type, pct.value, pct.amount, pct.net], ['percent', 10, 50, 450]);
});
