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
const JournalEngine = require('../accounting/JournalEngine');
const AccountService = require('../accounting/AccountService');
const InventoryValuationService = require('../inventory/InventoryValuationService');
const ThreeWayMatchService = require('./ThreeWayMatchService');

// ── SUPPLIERS ──

async function getSuppliers(tenantId) {
  const res = await db.query('SELECT * FROM suppliers WHERE tenant_id::text = $1::text ORDER BY name ASC', [String(tenantId)]);
  return res.rows;
}

async function createSupplier(tenantId, branchId, data) {
  const { name, company_name, email, phone, address, tax_no, payment_terms, credit_limit, currency } = data;
  const apAccount = await AccountService.getAccountBySubType(tenantId, 'payable');

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
      INSERT INTO purchase_orders
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
        INSERT INTO purchase_order_items
          (purchase_order_id, product_id, description, quantity, unit_cost, subtotal, tenant_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [po.id, item.product_id, item.description || null, qty, cost, subtotal, String(tenantId)]);
    }

    return po;
  });
}

async function getPurchaseOrders(tenantId, branchId) {
  const res = await db.query(`
    SELECT po.*, s.name as supplier_name,
      COALESCE(json_agg(json_build_object(
        'id', poi.id,
        'product_id', poi.product_id,
        'product_name', p.name,
        'quantity', poi.quantity,
        'unit_cost', poi.unit_cost,
        'subtotal', poi.subtotal,
        'quantity_received', poi.quantity_received
      )) FILTER (WHERE poi.id IS NOT NULL), '[]'::json) as items
    FROM purchase_orders po
    LEFT JOIN suppliers s ON po.supplier_id = s.id
    LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
    LEFT JOIN products p ON poi.product_id = p.id
    WHERE po.tenant_id::text = $1::text AND (po.branch_id::text = $2::text OR $2 IS NULL)
    GROUP BY po.id, s.name
    ORDER BY po.created_at DESC
  `, [String(tenantId), branchId || null]);

  return res.rows;
}

// ── GOODS RECEIPT NOTES (GRN) — Posts DR Inventory Asset / CR GRNI ──

async function createGoodsReceipt(tenantId, branchId, data, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
    const { purchase_order_id, receipt_date, warehouse_id, items, notes } = data;

    if (!purchase_order_id) throw new Error('purchase_order_id is required.');

    const poRes = await client.query('SELECT supplier_id FROM purchase_orders WHERE id = $1 AND tenant_id::text = $2::text', [purchase_order_id, String(tenantId)]);
    if (poRes.rows.length === 0) throw new Error('Purchase Order not found.');

    const supplierId = poRes.rows[0].supplier_id;
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
    const items = grn.items_json || [];
    let totalGRNValue = 0;

    const invAccount  = await AccountService.getAccountBySubType(tenantId, 'inventory');
    const grniAccount = await AccountService.getAccountBySubType(tenantId, 'grni');

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
          UPDATE purchase_order_items SET quantity_received = COALESCE(quantity_received, 0) + $1 WHERE id = $2
        `, [item.quantity_received, item.purchase_order_item_id]);
      }
    }

    // Auto-post GRNI Journal Entry: DR Inventory Asset / CR Goods Received Not Invoiced
    const journal = await JournalEngine.postJournal(client, {
      tenantId,
      branchId,
      date: grn.receipt_date,
      sourceType: 'goods_receipt',
      sourceId: grn.id,
      entryPurpose: 'inventory_grni',
      description: `GRN Receipt ${grn.number}`,
      postedBy: userId,
      entries: [
        { account_id: invAccount.id,  debit: totalGRNValue, credit: 0, description: `Inventory Increase (${grn.number})` },
        { account_id: grniAccount.id, debit: 0, credit: totalGRNValue, description: `GRNI Liability Accrual (${grn.number})` }
      ]
    });

    const updatedGRN = await client.query(`
      UPDATE goods_receipts
      SET status = 'received', accounting_status = 'posted', journal_entry_id = $1
      WHERE id = $2 RETURNING *
    `, [journal.id, grn.id]);

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

    const grniAccount = await AccountService.getAccountBySubType(tenantId, 'grni');
    const apAccount   = await AccountService.getAccountBySubType(tenantId, 'payable');
    const ppvAccount  = await AccountService.getAccountBySubType(tenantId, 'ppv');

    let ppvTotal = 0;

    // 3-Way Match Check if PO and GRN are linked
    if (purchase_order_id && goods_receipt_id && items && items.length > 0) {
      for (const item of items) {
        const poItemRes  = await client.query('SELECT unit_cost FROM purchase_order_items WHERE id = $1', [item.purchase_order_item_id]);
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

    // Auto-post AP Journal Entry: DR GRNI [+ DR PPV] / CR Accounts Payable
    const entries = [
      { account_id: grniAccount.id, debit: grossAmount - ppvTotal, credit: 0, description: `GRNI Settlement (${number})` }
    ];

    if (ppvTotal !== 0 && ppvAccount) {
      if (ppvTotal > 0) {
        entries.push({ account_id: ppvAccount.id, debit: ppvTotal, credit: 0, description: `PPV Expense (${number})` });
      } else {
        entries.push({ account_id: ppvAccount.id, debit: 0, credit: Math.abs(ppvTotal), description: `PPV Gain (${number})` });
      }
    }

    entries.push({ account_id: apAccount.id, debit: 0, credit: grossAmount, description: `Accounts Payable Accrual (${number})` });

    const journal = await JournalEngine.postJournal(client, {
      tenantId,
      branchId,
      date: invoice_date || new Date(),
      sourceType: 'supplier_invoice',
      sourceId: number,
      entryPurpose: 'grni_ap_settlement',
      description: `Supplier Invoice ${number}`,
      postedBy: userId,
      entries
    });

    const siRes = await client.query(`
      INSERT INTO supplier_invoices
        (tenant_id, branch_id, number, supplier_id, purchase_order_id, goods_receipt_id, invoice_date, due_date, total_amount, tax_amount, status, accounting_status, ppv_amount, journal_entry_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'unpaid', 'posted', $11, $12, $13)
      RETURNING *
    `, [
      String(tenantId), branchId || null, number, supplier_id, purchase_order_id || null, goods_receipt_id || null,
      invoice_date || new Date(), due_date || null, grossAmount, tax_amount || 0, ppvTotal, journal.id, userId
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
