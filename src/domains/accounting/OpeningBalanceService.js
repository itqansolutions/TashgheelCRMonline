/**
 * OpeningBalanceService — Opening Balances & Reconciliation Gate
 *
 * Responsibilities:
 *  - GL Opening Balances entry (Accounts, Customers, Suppliers, Inventory)
 *  - Reconciliation Gate: Blocks posting Opening Inventory if
 *    SUM(opening_inventory value) != GL Inventory Account Balance.
 *  - On posting: updates product quantities & seeds initial Weighted Average Cost (WAC).
 */

const db = require('../../../config/db');
const AccountService = require('./AccountService');

/**
 * Set GL Opening Balance for an account.
 */
async function setGLOpeningBalance(tenantId, { fiscalYearId, accountId, debit, credit }) {
  // Validate posting account (must not be group account)
  await AccountService.validatePostingAccount(db, accountId, tenantId);

  const result = await db.query(`
    INSERT INTO opening_balances (tenant_id, fiscal_year_id, account_id, debit, credit)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (tenant_id, fiscal_year_id, account_id) DO UPDATE
      SET debit = EXCLUDED.debit,
          credit = EXCLUDED.credit
    RETURNING *
  `, [String(tenantId), fiscalYearId, accountId, debit || 0, credit || 0]);

  return result.rows[0];
}

/**
 * Add Opening Customer Invoice (AR Detail)
 */
async function addOpeningCustomerInvoice(tenantId, { openingBalanceId, customerId, invoiceReference, invoiceDate, dueDate, amount, currency }) {
  const result = await db.query(`
    INSERT INTO opening_customer_invoices
      (tenant_id, opening_balance_id, customer_id, invoice_reference, invoice_date, due_date, amount, currency)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [String(tenantId), openingBalanceId, customerId, invoiceReference, invoiceDate, dueDate || null, amount, currency || 'EGP']);

  return result.rows[0];
}

/**
 * Add Opening Supplier Invoice (AP Detail)
 */
async function addOpeningSupplierInvoice(tenantId, { openingBalanceId, supplierId, invoiceReference, invoiceDate, dueDate, amount, currency }) {
  const result = await db.query(`
    INSERT INTO opening_supplier_invoices
      (tenant_id, opening_balance_id, supplier_id, invoice_reference, invoice_date, due_date, amount, currency)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [String(tenantId), openingBalanceId, supplierId || null, invoiceReference, invoiceDate, dueDate || null, amount, currency || 'EGP']);

  return result.rows[0];
}

/**
 * Add Opening Inventory Line (Stock Detail)
 */
async function addOpeningInventoryLine(tenantId, { openingBalanceId, productId, warehouseId, quantity, unitCost, batchNumber, expiryDate }) {
  const result = await db.query(`
    INSERT INTO opening_inventory
      (tenant_id, opening_balance_id, product_id, warehouse_id, quantity, unit_cost, batch_number, expiry_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [String(tenantId), openingBalanceId, productId, warehouseId || null, quantity, unitCost, batchNumber || null, expiryDate || null]);

  return result.rows[0];
}

/**
 * RECONCILIATION GATE & POSTING:
 * Validates that Opening Inventory total value matches GL Inventory Account balance.
 * If reconciled, posts stock movements and seeds product avg_cost (WAC).
 */
async function validateAndPostOpeningInventory(tenantId, fiscalYearId, userId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Sum all opening_inventory total_value for this tenant + fiscal year
    const invRes = await client.query(`
      SELECT COALESCE(SUM(oi.quantity * oi.unit_cost), 0) AS total_inv_value
      FROM opening_inventory oi
      JOIN opening_balances ob ON oi.opening_balance_id = ob.id
      WHERE oi.tenant_id::text = $1::text AND ob.fiscal_year_id = $2
        AND oi.is_posted = false
    `, [String(tenantId), fiscalYearId]);

    const inventoryTotal = Number(invRes.rows[0].total_inv_value || 0);

    // 2. Sum GL Opening Balance for Inventory account (sub_type = 'inventory')
    const glRes = await client.query(`
      SELECT COALESCE(SUM(ob.debit - ob.credit), 0) AS total_gl_value
      FROM opening_balances ob
      JOIN accounts a ON ob.account_id = a.id
      WHERE ob.tenant_id::text = $1::text AND ob.fiscal_year_id = $2
        AND a.sub_type = 'inventory'
    `, [String(tenantId), fiscalYearId]);

    const glTotal = Number(glRes.rows[0].total_gl_value || 0);
    const difference = Math.abs(inventoryTotal - glTotal);

    // RECONCILIATION GATE CHECK:
    if (difference > 0.01) {
      throw new Error(
        `RECONCILIATION GATE FAILED: Opening Inventory physical value (${inventoryTotal.toFixed(2)} EGP) ` +
        `does not match GL Inventory account balance (${glTotal.toFixed(2)} EGP). ` +
        `Difference: ${difference.toFixed(2)} EGP. Please reconcile values before posting.`
      );
    }

    // 3. Reconciled! Post inventory lines: seed product avg_cost + stock movements
    const lines = await client.query(`
      SELECT oi.*
      FROM opening_inventory oi
      JOIN opening_balances ob ON oi.opening_balance_id = ob.id
      WHERE oi.tenant_id::text = $1::text AND ob.fiscal_year_id = $2 AND oi.is_posted = false
    `, [String(tenantId), fiscalYearId]);

    for (const item of lines.rows) {
      // Seed product current_qty and initial WAC (avg_cost)
      await client.query(`
        UPDATE products
        SET current_qty = COALESCE(current_qty, 0) + $1,
            avg_cost = $2
        WHERE id = $3 AND tenant_id::text = $4::text
      `, [item.quantity, item.unit_cost, item.product_id, String(tenantId)]);

      // Record opening stock movement
      await client.query(`
        INSERT INTO stock_movements (type, product_id, to_warehouse_id, quantity, unit_cost, status, tenant_id, notes, created_by)
        VALUES ('in', $1, $2, $3, $4, 'approved', $5, 'Opening Stock Balance', $6)
      `, [item.product_id, item.warehouse_id, item.quantity, item.unit_cost, String(tenantId), userId]);

      // Mark opening line as posted
      await client.query('UPDATE opening_inventory SET is_posted = true WHERE id = $1', [item.id]);
    }

    // Mark GL Opening Balances header as posted
    await client.query(`
      UPDATE opening_balances
      SET is_posted = true, posted_at = CURRENT_TIMESTAMP, posted_by = $1
      WHERE tenant_id::text = $2::text AND fiscal_year_id = $3
    `, [userId, String(tenantId), fiscalYearId]);

    await client.query('COMMIT');
    return {
      status: 'reconciled_and_posted',
      inventory_total: inventoryTotal,
      gl_total: glTotal,
      posted_lines_count: lines.rows.length,
    };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get all opening balances and subledger details for a fiscal year.
 */
async function getOpeningBalances(tenantId, fiscalYearId) {
  const glBalances = await db.query(`
    SELECT ob.*, a.code as account_code, a.name as account_name, a.type as account_type, a.sub_type
    FROM opening_balances ob
    JOIN accounts a ON ob.account_id = a.id
    WHERE ob.tenant_id::text = $1::text AND ob.fiscal_year_id = $2
    ORDER BY a.code ASC
  `, [String(tenantId), fiscalYearId]);

  const customerInvoices = await db.query(`
    SELECT oci.*, c.name as customer_name
    FROM opening_customer_invoices oci
    LEFT JOIN customers c ON oci.customer_id = c.id
    WHERE oci.tenant_id::text = $1::text
  `, [String(tenantId)]);

  const supplierInvoices = await db.query(`
    SELECT osi.*
    FROM opening_supplier_invoices osi
    WHERE osi.tenant_id::text = $1::text
  `, [String(tenantId)]);

  const inventoryLines = await db.query(`
    SELECT oi.*, p.name as product_name, p.sku as product_sku
    FROM opening_inventory oi
    JOIN products p ON oi.product_id = p.id
    WHERE oi.tenant_id::text = $1::text
  `, [String(tenantId)]);

  return {
    gl_balances: glBalances.rows,
    customer_invoices: customerInvoices.rows,
    supplier_invoices: supplierInvoices.rows,
    inventory_lines: inventoryLines.rows,
  };
}

module.exports = {
  setGLOpeningBalance,
  addOpeningCustomerInvoice,
  addOpeningSupplierInvoice,
  addOpeningInventoryLine,
  validateAndPostOpeningInventory,
  getOpeningBalances,
};
