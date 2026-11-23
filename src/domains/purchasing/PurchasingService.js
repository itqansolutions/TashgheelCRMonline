/**
 * PurchasingService — ERP Purchasing & Procurement Service
 *
 * Responsibilities:
 *  - Suppliers Master Data Management
 *  - Purchase Orders (PO) — Commitment documents only, NO journal entry posted on PO
 *  - Goods Receipt Notes (GRN) — Approval updates WAC + posts DR Inventory Asset / CR GRNI
 *  - Supplier Invoices — 3-Way Match validation + posts DR GRNI [+ DR PPV] / CR Accounts Payable
 */

const db = require('../../../config/db');
const { nextSequence } = require('../../infrastructure/sequencing/DocumentSequencer');
const TransactionEngine = require('../shared/TransactionEngine');
const InventoryValuationService = require('../inventory/InventoryValuationService');
const ThreeWayMatchService = require('./ThreeWayMatchService');

// ── SUPPLIERS ──

async function getSuppliers(tenantId) {
  const res = await db.query('SELECT * FROM suppliers WHERE tenant_id::text = $1::text ORDER BY name ASC', [String(tenantId)]);
  return res.rows;
}

async function createSupplier(tenantId, branchId, data) {
  const { name, company_name, email, phone, address, tax_no, payment_terms, credit_limit, currency } = data;
  if (!String(name || '').trim()) throw new Error('Supplier name is required.');
  // Creating a supplier must not seed or modify the tenant's chart of accounts.
  const payable = await db.query(`SELECT id FROM accounts WHERE tenant_id::text = $1::text
    AND sub_type = 'payable' AND is_active = true AND is_group = false ORDER BY code LIMIT 1`, [String(tenantId)]);
  if (!payable.rows.length) throw new Error('Configure an active payable posting account before creating an ERP supplier.');
  const apAccount = payable.rows[0];

  const res = await db.query(`
    INSERT INTO suppliers
      (tenant_id, branch_id, name, company_name, email, phone, address, tax_no, payment_terms, credit_limit, currency, ap_account_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `, [
    String(tenantId), branchId || null, name, company_name || null, email || null,
    phone || null, address || null, tax_no || null, payment_terms || 30,
    credit_limit || 0, currency || 'EGP', apAccount.id
  ]);

  return res.rows[0];
}

// ── PURCHASE ORDERS (Commitment document — NO Accounting Entry) ──

async function createPurchaseOrder(tenantId, branchId, data, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
    const { supplier_id, purchase_request_id, order_date, expected_date, items, currency, exchange_rate, notes } = data;

    if (!supplier_id) throw new Error('supplier_id is required.');
    if (!items || items.length === 0) throw new Error('Purchase Order must contain at least one item.');

    const year = new Date(order_date || new Date()).getFullYear();
    const number = await nextSequence(client, { tenantId, branchId, docType: 'PO', fiscalYear: year });

    const curr = currency || 'EGP';
    const exRate = Number(exchange_rate || 1.0);

    let totalAmount = 0;
    items.forEach(item => {
      totalAmount += (Number(item.quantity || 1) * Number(item.unit_cost || 0));
    });

    const localValue = totalAmount * exRate;

    const poRes = await client.query(`
      INSERT INTO erp_legacy_purchase_orders
        (tenant_id, branch_id, number, supplier_id, purchase_request_id, order_date, expected_date, status, total_amount, currency, exchange_rate, local_value, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      String(tenantId), branchId || null, number, supplier_id, purchase_request_id || null,
      order_date || new Date(), expected_date || null, totalAmount, curr, exRate, localValue, notes || null, userId
    ]);

    const po = poRes.rows[0];

    for (const item of items) {
      const qty = Number(item.quantity || 1);
      const cost = Number(item.unit_cost || 0);
      const subtotal = qty * cost;

      await client.query(`
        INSERT INTO erp_legacy_purchase_order_items
          (purchase_order_id, product_id, description, quantity, unit_cost, subtotal, tenant_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [po.id, item.product_id, item.description || null, qty, cost, subtotal, String(tenantId)]);
    }

    return po;
  });
}

async function getPurchaseOrders(tenantId, branchId) {
  const res = await db.query(`
    SELECT po.*, po.number AS po_number, po.order_date AS po_date, s.name as supplier_name,
      COALESCE(json_agg(json_build_object(
        'id', poi.id,
        'product_id', poi.product_id,
        'product_name', p.name,
        'quantity', poi.quantity,
        'unit_cost', poi.unit_cost,
        'subtotal', poi.subtotal,
        'quantity_received', poi.quantity_received
      )) FILTER (WHERE poi.id IS NOT NULL), '[]'::json) as items
    FROM erp_legacy_purchase_orders po
    LEFT JOIN suppliers s ON po.supplier_id = s.id
    LEFT JOIN erp_legacy_purchase_order_items poi ON poi.purchase_order_id = po.id
    LEFT JOIN products p ON poi.product_id = p.id
    WHERE po.tenant_id::text = $1::text AND (po.branch_id::text = $2::text OR $2 IS NULL)
    GROUP BY po.id, s.name
    ORDER BY po.created_at DESC
  `, [String(tenantId), branchId || null]);

  return res.rows;
}

// ── GOODS RECEIPT NOTES (GRN) — Posts DR Inventory Asset / CR GRNI ──

// Recheck ownership and remaining quantities at both draft creation and final receipt.
async function lockReceiptOrder(client, tenantId, branchId, orderId) {
  const result = await client.query(`SELECT * FROM erp_legacy_purchase_orders WHERE id = $1
    AND tenant_id::text = $2::text AND branch_id::text IS NOT DISTINCT FROM $3::text FOR UPDATE`,
    [orderId, String(tenantId), branchId || null]);
  const po = result.rows[0];
  if (!po || ['cancelled', 'canceled', 'void'].includes(String(po.status).toLowerCase())) throw new Error('Purchase Order not found, cancelled or outside this branch.');
  return po;
}
async function validateReceiptWarehouse(client, tenantId, branchId, warehouseId) {
  if (!warehouseId) throw new Error('A destination warehouse is required.');
  const result = await client.query(`SELECT id FROM warehouses WHERE id::text=$1::text
    AND tenant_id::text=$2::text AND branch_id::text IS NOT DISTINCT FROM $3::text FOR SHARE`,
    [String(warehouseId), String(tenantId), branchId || null]);
  if (!result.rows.length) throw new Error('Destination warehouse is outside this tenant/branch.');
}
async function validateReceiptItems(client, tenantId, orderId, items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Receipt must contain at least one item.');
  const quantities = new Map();
  for (const item of items) {
    const qty = Number(item.quantity_received), cost = Number(item.unit_cost);
    if (!['number','string'].includes(typeof item.quantity_received) || !Number.isFinite(qty) || qty <= 0 ||
        !['number','string'].includes(typeof item.unit_cost) || !Number.isFinite(cost) || cost < 0) throw new Error('Receipt quantity/cost is invalid.');
    if (!item.purchase_order_item_id || !item.product_id) throw new Error('Receipt item must reference its Purchase Order item and product.');
    const result = await client.query(`SELECT poi.*, p.id AS verified_product FROM erp_legacy_purchase_order_items poi
      JOIN products p ON p.id = poi.product_id AND p.tenant_id::text = poi.tenant_id::text
      WHERE poi.id::text=$1::text AND poi.purchase_order_id::text=$2::text AND poi.tenant_id::text=$3::text FOR UPDATE OF poi`,
      [String(item.purchase_order_item_id), String(orderId), String(tenantId)]);
    const line = result.rows[0];
    if (!line || String(line.product_id) !== String(item.product_id)) throw new Error('Receipt item does not belong to this Purchase Order/product/tenant.');
    const total = (quantities.get(String(line.id)) || 0) + qty;
    if (total - (Number(line.quantity) - Number(line.quantity_received || 0)) > 0.000001) throw new Error('Receipt exceeds remaining Purchase Order quantity.');
    quantities.set(String(line.id), total);
  }
}

async function createGoodsReceipt(tenantId, branchId, data, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
    const { purchase_order_id, receipt_date, warehouse_id, items, notes } = data;

    if (!purchase_order_id) throw new Error('purchase_order_id is required.');

    const po = await lockReceiptOrder(client, tenantId, branchId, purchase_order_id);
    await validateReceiptWarehouse(client, tenantId, branchId, warehouse_id);
    await validateReceiptItems(client, tenantId, purchase_order_id, items);

    const supplierId = po.supplier_id;
    const year = new Date(receipt_date || new Date()).getFullYear();
    const number = await nextSequence(client, { tenantId, branchId, docType: 'GRN', fiscalYear: year });

    const grnRes = await client.query(`
      INSERT INTO goods_receipts
        (tenant_id, branch_id, number, purchase_order_id, supplier_id, receipt_date, warehouse_id, status, notes, received_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9)
      RETURNING *
    `, [String(tenantId), branchId || null, number, purchase_order_id, supplierId, receipt_date || new Date(), warehouse_id || null, notes || null, userId]);

    const grn = grnRes.rows[0];

    for (const item of items) {
      await client.query(`
        INSERT INTO goods_receipt_items
          (goods_receipt_id, purchase_order_item_id, product_id, quantity_ordered, quantity_received, unit_cost, tenant_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [grn.id, item.purchase_order_item_id || null, item.product_id, item.quantity_ordered || item.quantity_received, item.quantity_received, item.unit_cost, String(tenantId)]);
    }

    return grn;
  });
}

async function approveGoodsReceipt(tenantId, branchId, goodsReceiptId, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
    const grnRes = await client.query(`
      SELECT grn.*, items.items_json
      FROM goods_receipts grn
      LEFT JOIN (
        SELECT goods_receipt_id, json_agg(gri.*) as items_json
        FROM goods_receipt_items gri
        GROUP BY goods_receipt_id
      ) items ON items.goods_receipt_id = grn.id
      WHERE grn.id = $1 AND grn.tenant_id::text = $2::text AND grn.status = 'draft'
      FOR UPDATE OF grn
    `, [goodsReceiptId, String(tenantId)]);

    if (grnRes.rows.length === 0) throw new Error('Goods Receipt not found or already processed.');

    const grn = grnRes.rows[0];
    if (String(branchId || '') !== String(grn.branch_id || '')) throw new Error('Goods Receipt belongs to another branch.');
    if (grn.received_by && String(grn.received_by) === String(userId)) throw new Error('A different user must approve the Goods Receipt.');
    await lockReceiptOrder(client, tenantId, branchId, grn.purchase_order_id);
    await validateReceiptWarehouse(client, tenantId, branchId, grn.warehouse_id);
    const items = grn.items_json || [];
    await validateReceiptItems(client, tenantId, grn.purchase_order_id, items);
    let totalGRNValue = 0;

    for (const item of items) {
      const lineVal = Number(item.quantity_received) * Number(item.unit_cost);
      totalGRNValue += lineVal;

      // Update Company WAC with SELECT FOR UPDATE
      await InventoryValuationService.updateCompanyWAC(client, item.product_id, tenantId, item.quantity_received, item.unit_cost);

      // Record inbound stock movement
      await client.query(`
        INSERT INTO stock_movements
          (type, product_id, to_warehouse_id, quantity, unit_cost, status, tenant_id, reference_type, reference_id, created_by)
        VALUES ('in', $1, $2, $3, $4, 'approved', $5, 'goods_receipt', $6, $7)
      `, [item.product_id, grn.warehouse_id, item.quantity_received, item.unit_cost, String(tenantId), grn.id, userId]);

      // Update PO item received quantity
      if (item.purchase_order_item_id) {
        await client.query(`
          UPDATE erp_legacy_purchase_order_items SET quantity_received = COALESCE(quantity_received, 0) + $1 WHERE id = $2 AND tenant_id::text = $3::text
        `, [item.quantity_received, item.purchase_order_item_id, String(tenantId)]);
      }
    }

    // Physical inventory increase only — no GRNI accounting journal
    const updatedGRN = await client.query(`
      UPDATE goods_receipts
      SET status = 'received', accounting_status = 'not_applicable', journal_entry_id = NULL
      WHERE id = $1 RETURNING *
    `, [grn.id]);

    return updatedGRN.rows[0];
  });
}

// ── SUPPLIER INVOICES — 3-Way Match + Posts DR GRNI / CR AP ──

async function createSupplierInvoice(tenantId, branchId, data, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
    const { supplier_id, purchase_order_id, goods_receipt_id, invoice_date, due_date, total_amount, tax_amount, items } = data;

    if (!supplier_id) throw new Error('supplier_id is required.');

    const year = new Date(invoice_date || new Date()).getFullYear();
    const number = await nextSequence(client, { tenantId, branchId, docType: 'INV', fiscalYear: year });

    const grossAmount = Number(total_amount);

    let ppvTotal = 0;

    // 3-Way Match Check if PO and GRN are linked
    if (purchase_order_id && goods_receipt_id && items && items.length > 0) {
      for (const item of items) {
        const poItemRes  = await client.query('SELECT unit_cost FROM erp_legacy_purchase_order_items WHERE id = $1', [item.purchase_order_item_id]);
        const grnItemRes = await client.query('SELECT quantity_received FROM goods_receipt_items WHERE goods_receipt_id = $1 AND product_id = $2', [goods_receipt_id, item.product_id]);

        if (poItemRes.rows.length > 0 && grnItemRes.rows.length > 0) {
          const match = await ThreeWayMatchService.performThreeWayMatch(client, {
            tenantId,
            poItem: poItemRes.rows[0],
            grnItem: grnItemRes.rows[0],
            invoiceItem: item,
            supplierInvoiceId: number
          });

          ppvTotal += match.ppv_total_amount;
        }
      }
    }

    // Operational Supplier Invoice (Payable tracking only — no GL journal posting)
    const siRes = await client.query(`
      INSERT INTO supplier_invoices
        (tenant_id, branch_id, number, supplier_id, purchase_order_id, goods_receipt_id, invoice_date, due_date, total_amount, tax_amount, status, accounting_status, ppv_amount, journal_entry_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'unpaid', 'not_applicable', $11, NULL, $12)
      RETURNING *
    `, [
      String(tenantId), branchId || null, number, supplier_id, purchase_order_id || null, goods_receipt_id || null,
      invoice_date || new Date(), due_date || null, grossAmount, tax_amount || 0, ppvTotal, userId
    ]);

    return siRes.rows[0];
  });
}

module.exports = {
  getSuppliers,
  createSupplier,
  createPurchaseOrder,
  getPurchaseOrders,
  createGoodsReceipt,
  approveGoodsReceipt,
  createSupplierInvoice,
};
