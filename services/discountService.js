/**
 * Sales discount helper (quotation -> sales order -> invoice).
 * total_amount on every document is the NET figure (after discount); line items stay gross.
 */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

/**
 * @param {number} gross  sum of line subtotals
 * @param {string|null} type  'percent' | 'fixed' | null/'' (none)
 * @param {number|string} value  what the user typed (percent 0-100, or an amount)
 * @returns {{type:string|null,value:number,amount:number,gross:number,net:number}}
 */
function computeDiscount(gross, type, value) {
  const g = round2(gross);
  const t = type ? String(type).trim().toLowerCase() : '';
  const v = Number(value);
  if (!t || value === undefined || value === null || value === '' || (Number.isFinite(v) && v === 0)) {
    return { type: null, value: 0, amount: 0, gross: g, net: g };
  }
  if (!['percent', 'fixed'].includes(t)) throw badRequest('Discount type must be percent or fixed.');
  if (!Number.isFinite(v) || v < 0) throw badRequest('Discount must be a positive number.');
  let amount;
  if (t === 'percent') {
    if (v > 100) throw badRequest('Discount percentage cannot exceed 100%.');
    amount = round2(g * v / 100);
  } else {
    amount = round2(v);
  }
  if (amount > g) throw badRequest('Discount cannot be larger than the subtotal.');
  return { type: t, value: v, amount, gross: g, net: round2(g - amount) };
}

/** Share of a parent document's discount for a partial child (by gross share). */
function prorateDiscount(parent, childGross, parentGross) {
  const pAmount = Number(parent.discount_amount) || 0;
  if (!(pAmount > 0) || !(parentGross > 0)) return computeDiscount(childGross, null, 0);
  const isFull = Math.abs(childGross - parentGross) < 0.005;
  const amount = isFull ? pAmount : round2(pAmount * childGross / parentGross);
  const type = parent.discount_type === 'percent' ? 'percent' : 'fixed';
  const value = type === 'percent' ? Number(parent.discount_value) || 0 : amount;
  const g = round2(childGross);
  return { type, value, amount, gross: g, net: round2(g - amount) };
}

module.exports = { computeDiscount, prorateDiscount, round2 };
