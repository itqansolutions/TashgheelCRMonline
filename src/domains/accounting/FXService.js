/**
 * FXService — Realized Foreign Exchange (FX) Gain/Loss Service
 *
 * Responsibilities:
 *  - Calculates realized FX Gain or Loss on multi-currency payment settlement.
 *  - Generates journal lines for FX Gain (Revenue/Other Income) or FX Loss (Expense).
 *
 * Scenario:
 *  Supplier Invoice: $1,000 @ 50 EGP/$ = 50,000 EGP (AP booked at 50,000 EGP)
 *  Payment:          $1,000 @ 52 EGP/$ = 52,000 EGP (paid at 52,000 EGP)
 *  FX Loss:          2,000 EGP
 */

const AccountService = require('./AccountService');

/**
 * Calculate Realized FX Gain/Loss for a payment settlement against an invoice.
 *
 * @param {string} tenantId
 * @param {Object} params
 * @param {number} params.foreignAmount - foreign currency amount (e.g. $1000)
 * @param {number} params.originalRate  - exchange rate when invoice was posted
 * @param {number} params.paymentRate   - exchange rate when payment is made
 * @returns {Promise<Object>} { type: 'fx_gain'|'fx_loss'|null, amount: number, lines: Array }
 */
async function calculateRealizedFX(tenantId, { foreignAmount, originalRate, paymentRate }) {
  const originalBase = Number(foreignAmount) * Number(originalRate); // e.g. 50,000
  const paymentBase  = Number(foreignAmount) * Number(paymentRate);  // e.g. 52,000
  const diff         = paymentBase - originalBase;                   // 2,000 (loss for payment out)

  if (Math.abs(diff) < 0.01) {
    return { type: null, amount: 0, lines: [] };
  }

  const isLoss = diff > 0;
  const subType = isLoss ? 'fx_loss' : 'fx_gain';

  let fxAccount;
  try {
    fxAccount = await AccountService.getAccountBySubType(tenantId, subType);
  } catch (e) {
    console.warn(`[FXService] Account for ${subType} not found in COA:`, e.message);
    return { type: null, amount: 0, lines: [] };
  }

  const amount = Number(Math.abs(diff).toFixed(2));

  const lines = isLoss
    ? [{ account_id: fxAccount.id, debit: amount, credit: 0, description: `Realized FX Loss (Rate: ${originalRate} -> ${paymentRate})` }]
    : [{ account_id: fxAccount.id, debit: 0, credit: amount, description: `Realized FX Gain (Rate: ${originalRate} -> ${paymentRate})` }];

  return {
    type: isLoss ? 'fx_loss' : 'fx_gain',
    amount,
    fx_account_id: fxAccount.id,
    lines,
  };
}

module.exports = { calculateRealizedFX };
