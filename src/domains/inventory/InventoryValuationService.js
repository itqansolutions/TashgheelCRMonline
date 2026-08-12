/**
 * InventoryValuationService — Enterprise Inventory Valuation (WAC) & Negative Stock Engine
 *
 * Responsibilities:
 *  - Calculates Company-Level Weighted Average Cost (WAC) using SELECT FOR UPDATE row locking.
 *  - Enforces negative stock policies (default OFF, with per-tenant/per-product override).
 *  - Auto-posts Inventory Accounting Journal Entries on stock movement approval.
 */

const JournalEngine = require('../accounting/JournalEngine');
const AccountService = require('../accounting/AccountService');

/**
 * Calculates and updates Company-Level Weighted Average Cost (WAC).
 * Thread-safe via SELECT FOR UPDATE row lock on products table.
 *
 * @param {Object} client - pg PoolClient (inside active transaction)
 * @param {number|string} productId
 * @param {string} tenantId
 * @param {number} receivedQty
 * @param {number} receivedCost
 * @returns {Promise<number>} new company average cost
 */
async function updateCompanyWAC(client, productId, tenantId, receivedQty, receivedCost) {
  const rQty = Number(receivedQty || 0);
  const rCost = Number(receivedCost || 0);

  if (rQty <= 0) return 0;

  // Lock product row to prevent concurrent WAC calculation race conditions
  const pRes = await client.query(`
    SELECT current_qty, avg_cost FROM products
    WHERE id::text = $1::text AND tenant_id::text = $2::text
    FOR UPDATE
  `, [String(productId), String(tenantId)]);

  if (pRes.rows.length === 0) {
    throw new Error(`Product ${productId} not found for tenant.`);
  }

  const currentQty = Number(pRes.rows[0].current_qty || 0);
  const currentAvgCost = Number(pRes.rows[0].avg_cost || 0);

  const newTotalQty = currentQty + rQty;
  const newAvgCost = newTotalQty > 0
    ? ((currentQty * currentAvgCost) + (rQty * rCost)) / newTotalQty
    : rCost;

  const roundedCost = Number(newAvgCost.toFixed(4));

  await client.query(`
    UPDATE products
    SET current_qty = $1,
        avg_cost = $2
    WHERE id::text = $3::text AND tenant_id::text = $4::text
  `, [newTotalQty, roundedCost, String(productId), String(tenantId)]);

  console.log(`[WAC] Product ${productId} updated: old_cost=${currentAvgCost}, new_cost=${roundedCost}, new_qty=${newTotalQty}`);
  return roundedCost;
}

/**
 * Enforces negative stock policy.
 * Throws an exception if movement causes stock < 0 and negative stock is OFF.
 */
async function validateNegativeStock(client, productId, requestedQty, tenantId) {
  // Check product override first
  const pRes = await client.query(`
    SELECT current_qty, allow_negative_stock FROM products
    WHERE id::text = $1::text AND tenant_id::text = $2::text
    FOR UPDATE
  `, [String(productId), String(tenantId)]);

  if (pRes.rows.length === 0) return;

  const currentQty = Number(pRes.rows[0].current_qty || 0);
  const productOverride = pRes.rows[0].allow_negative_stock;

  // Check tenant setting
  const tRes = await client.query(`
    SELECT allow_negative_stock FROM tenants
    WHERE id::text = $1::text
  `, [String(tenantId)]);

  const tenantDefault = tRes.rows[0]?.allow_negative_stock ?? false;
  const isAllowed = productOverride !== null && productOverride !== undefined ? productOverride : tenantDefault;

  if (!isAllowed && (currentQty - Number(requestedQty)) < 0) {
    throw new Error(`INSUFFICIENT STOCK: Product ${productId} current stock is ${currentQty}, requested ${requestedQty}. Negative stock is disabled.`);
  }
}

/**
 * Posts automatic Journal Entry for an approved stock movement.
 */
async function postMovementJournal(client, movement, unitCost, userId) {
  const tenantId = movement.tenant_id;
  const totalValue = Number(movement.quantity) * Number(unitCost);

  if (totalValue <= 0) return null;

  let invAccount, adjAccount;
  try {
    invAccount = await AccountService.getAccountBySubType(tenantId, 'inventory');
    adjAccount = await AccountService.getAccountBySubType(tenantId, 'inventory_adjustment');
  } catch (e) {
    console.warn('[InventoryValuation] Skipping journal entry — COA not configured:', e.message);
    return null;
  }

  let entries = [];
  let purpose = '';

  if (movement.type === 'in' || (movement.type === 'adjustment' && movement.quantity > 0)) {
    // Inbound: DR Inventory Asset / CR Inventory Adjustment
    purpose = 'stock_adj_in';
    entries = [
      { account_id: invAccount.id, debit: totalValue, credit: 0, description: `Stock Inbound (${movement.type})` },
      { account_id: adjAccount.id, debit: 0, credit: totalValue, description: `Stock Inbound Counterpart` }
    ];
  } else if (movement.type === 'out' || (movement.type === 'adjustment' && movement.quantity < 0)) {
    // Outbound: DR Inventory Adjustment / CR Inventory Asset
    purpose = 'stock_adj_out';
    entries = [
      { account_id: adjAccount.id, debit: totalValue, credit: 0, description: `Stock Outbound (${movement.type})` },
      { account_id: invAccount.id, debit: 0, credit: totalValue, description: `Stock Outbound Counterpart` }
    ];
  } else {
    // Transfer between warehouses does not change total company GL asset value
    return null;
  }

  return await JournalEngine.postJournal(client, {
    tenantId,
    branchId: movement.branch_id,
    date: new Date(),
    sourceType: 'stock_movement',
    sourceId: movement.id,
    entryPurpose: purpose,
    description: `Stock Movement (${movement.type}) - ${movement.quantity} units @ ${unitCost} EGP`,
    postedBy: userId,
    entries
  });
}

module.exports = {
  updateCompanyWAC,
  validateNegativeStock,
  postMovementJournal,
};
