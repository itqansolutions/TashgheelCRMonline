/**
 * DeliveryNoteService — ERP Delivery Note & COGS Journal Posting Service
 *
 * Responsibilities:
 *  - Create Delivery Notes linked to Sales Orders
 *  - On Confirmation:
 *      1. Snapshots product avg_cost into delivery_note_items.unit_cost
 *      2. Creates stock_movements (type = 'out') to reduce physical stock
 *      3. Auto-posts COGS Journal Entry: DR Cost of Goods Sold (5100) / CR Inventory Asset (1400)
 *      4. Updates quantity_delivered on sales_order_items
 */

const db = require('../../../config/db');
const { nextSequence } = require('../../infrastructure/sequencing/DocumentSequencer');
const TransactionEngine = require('../shared/TransactionEngine');

let inventoryTrackingColumnChecked = false;
async function ensureInventoryTrackingColumn(client) {
  if (inventoryTrackingColumnChecked) return;
  await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_inventory_item BOOLEAN NOT NULL DEFAULT true;`);
  inventoryTrackingColumnChecked = true;
}

/**
 * Create Delivery Note linked to a Sales Order.
 */
async function createDeliveryNote(tenantId, branchId, data, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
    const { sales_order_id, delivery_date, warehouse_id, items, notes } = data;

    if (!sales_order_id) throw new Error('sales_order_id is required.');
    if (!items || items.length === 0) throw new Error('Delivery Note must contain at least one item.');
    if (!warehouse_id) {
      throw new Error('warehouse_id is required when delivering inventory items.');
    }
    await ensureInventoryTrackingColumn(client);

    // 1. Lock Sales Order for update and verify tenant isolation and deliverable status whitelist
    const soRes = await client.query(`
      SELECT id, customer_id, status, branch_id
      FROM sales_orders
      WHERE id = $1 AND tenant_id::text = $2::text
      FOR UPDATE
    `, [sales_order_id, String(tenantId)]);
    if (soRes.rows.length === 0) throw new Error('Sales Order not found.');

    const so = soRes.rows[0];
    const deliverableStatuses = ['confirmed', 'delivered', 'invoiced'];
    if (!deliverableStatuses.includes(so.status)) {
      throw new Error(`Cannot deliver Sales Order: Status is '${so.status}'. Order must be 'confirmed', 'delivered', or 'invoiced' to issue a delivery note.`);
    }

    const customerId = so.customer_id;

    // 2. Do not trust client-provided warehouse ID: verify tenant and branch ownership
    const warehouseRes = await client.query(`
      SELECT id
      FROM warehouses
      WHERE id::text = $1::text
        AND tenant_id::text = $2::text
        AND (branch_id::text = $3::text OR ($3 IS NULL AND branch_id IS NULL))
      FOR UPDATE
    `, [String(warehouse_id), String(tenantId), branchId || null]);
    if (warehouseRes.rows.length === 0) {
      throw new Error('Selected warehouse was not found in the active branch.');
    }

    // 3. Validate items with row-level locks, classification checks, product matching, and quantity bounds
    const validatedItems = [];
    const batchAccumulator = new Map();

    for (const item of items) {
      if (!item.sales_order_item_id) {
        throw new Error('Each Delivery Note item must reference a Sales Order item.');
      }

      const reqQty = Number(item.quantity_delivered);
      if (!Number.isFinite(reqQty) || reqQty <= 0) {
        throw new Error('Each Delivery Note item requires a quantity greater than zero.');
      }

      // Lock sales_order_item row for update to serialize concurrent deliveries
      const soItemRes = await client.query(`
        SELECT id, sales_order_id, product_id, item_type, description, quantity, quantity_delivered
        FROM sales_order_items
        WHERE id::text = $1::text
          AND sales_order_id::text = $2::text
          AND tenant_id::text = $3::text
        FOR UPDATE
      `, [String(item.sales_order_item_id), String(sales_order_id), String(tenantId)]);

      if (soItemRes.rows.length === 0) {
        throw new Error(`Sales Order item ${item.sales_order_item_id} does not belong to Sales Order ${sales_order_id}.`);
      }

      const soItem = soItemRes.rows[0];

      // Item type classification enforcement: ONLY physical inventory items can be delivered
      const itemType = soItem.item_type || 'legacy_unclassified';
      if (itemType === 'service') {
        throw new Error(`Item '${soItem.description || item.sales_order_item_id}' is a service and does not require physical inventory delivery.`);
      }
      if (itemType === 'non_inventory') {
        throw new Error(`Item '${soItem.description || item.sales_order_item_id}' is a non-inventory item and cannot be dispatched from warehouse.`);
      }
      if (itemType === 'legacy_unclassified') {
        throw new Error(`Item '${soItem.description || item.sales_order_item_id}' is an unclassified historical item and cannot be dispatched without a verified inventory classification.`);
      }
      if (itemType !== 'inventory') {
        throw new Error(`Item '${soItem.description || item.sales_order_item_id}' has invalid item_type '${itemType}' for warehouse dispatch.`);
      }

      // Product reference and catalog validation
      if (!soItem.product_id) {
        throw new Error(`Inventory item '${soItem.description || item.sales_order_item_id}' has no associated product.`);
      }
      if (item.product_id && String(item.product_id) !== String(soItem.product_id)) {
        throw new Error(`Product mismatch: requested product ${item.product_id} does not match Sales Order item product ${soItem.product_id}.`);
      }

      const resolvedProductId = soItem.product_id;
      const productRes = await client.query(`
        SELECT id, is_inventory_item FROM products
        WHERE id::text = $1::text AND tenant_id::text = $2::text
      `, [String(resolvedProductId), String(tenantId)]);

      if (productRes.rows.length === 0) {
        throw new Error(`Product ${resolvedProductId} not found.`);
      }
      if (productRes.rows[0].is_inventory_item !== true) {
        throw new Error(`Product ${resolvedProductId} is not a physical inventory item.`);
      }

      // Quantity ceiling check with 6-digit decimal precision
      const totalOrdered = Number(soItem.quantity || 0);
      const deliveredSoFar = Number(soItem.quantity_delivered || 0);
      const remainingQty = Math.round((totalOrdered - deliveredSoFar) * 1e6) / 1e6;

      if (remainingQty <= 0) {
        throw new Error(`Item '${soItem.description || resolvedProductId}' has already been fully delivered.`);
      }

      const currentBatchTotal = Math.round(((batchAccumulator.get(String(soItem.id)) || 0) + reqQty) * 1e6) / 1e6;
      if (currentBatchTotal > remainingQty) {
        throw new Error(`Delivery quantity (${reqQty}) exceeds remaining deliverable quantity (${remainingQty}) for product ${resolvedProductId}.`);
      }
      batchAccumulator.set(String(soItem.id), currentBatchTotal);

      validatedItems.push({
        sales_order_item_id: soItem.id,
        product_id: resolvedProductId,
        quantity_delivered: reqQty
      });
    }

    const year = new Date(delivery_date || new Date()).getFullYear();
    const number = await nextSequence(client, { tenantId, branchId, docType: 'DN', fiscalYear: year });

    const dnRes = await client.query(`
      INSERT INTO delivery_notes
        (tenant_id, branch_id, number, sales_order_id, customer_id, delivery_date, warehouse_id, status, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9)
      RETURNING *
    `, [String(tenantId), branchId || null, number, sales_order_id, customerId, delivery_date || new Date(), warehouse_id, notes || null, userId]);

    const deliveryNote = dnRes.rows[0];

    for (const item of validatedItems) {
      await client.query(`
        INSERT INTO delivery_note_items
          (delivery_note_id, sales_order_item_id, product_id, quantity_delivered, tenant_id)
        VALUES ($1, $2, $3, $4, $5)
      `, [deliveryNote.id, item.sales_order_item_id, item.product_id, item.quantity_delivered, String(tenantId)]);
    }

    return deliveryNote;
  });
}

/**
 * Confirm Delivery Note & Post COGS Journal Entry.
 */
async function confirmDeliveryNote(tenantId, branchId, deliveryNoteId, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
    await ensureInventoryTrackingColumn(client);
    // 1. Fetch Delivery Note
    const dnRes = await client.query(`
      SELECT dn.*, items.items_json
      FROM delivery_notes dn
      LEFT JOIN (
        SELECT delivery_note_id, json_agg(dni.*) as items_json
        FROM delivery_note_items dni
        GROUP BY delivery_note_id
      ) items ON items.delivery_note_id = dn.id
      WHERE dn.id = $1 AND dn.tenant_id::text = $2::text AND dn.status = 'draft'
      FOR UPDATE OF dn
    `, [deliveryNoteId, String(tenantId)]);

    if (dnRes.rows.length === 0) throw new Error('Delivery Note not found or already confirmed.');

    const dn = dnRes.rows[0];
    const items = dn.items_json || [];
    let totalCOGSValue = 0;
    const cogsLines = [];



    let warehouseValidated = false;

    for (const item of items) {
      // The product lock serializes deliveries for this SKU while the warehouse ledger is checked.
      const pRes = await client.query(`
        SELECT COALESCE(cost_price, 0) AS cost_price, name, is_inventory_item FROM products
        WHERE id::text = $1::text AND tenant_id::text = $2::text
        FOR UPDATE
      `, [String(item.product_id), String(tenantId)]);
      if (pRes.rows.length === 0) throw new Error(`Product ${item.product_id} not found.`);
      const product = pRes.rows[0];
      if (product.is_inventory_item !== true) {
        throw new Error(`Product ${item.product_id} is not an inventory item; cannot confirm delivery.`);
      }
      const isInventoryItem = true;
      const currentUnitCost = Number(product.cost_price ?? product.avg_cost ?? 0);

      if (!dn.warehouse_id) {
        throw new Error('Delivery Note has no source warehouse for its inventory items.');
      }

      if (!warehouseValidated) {
        // Re-check a stock source before physically moving inventory, including legacy Delivery Notes.
        const warehouseRes = await client.query(`
          SELECT id FROM warehouses
          WHERE id::text = $1::text
            AND tenant_id::text = $2::text
            AND (branch_id::text = $3::text OR ($3 IS NULL AND branch_id IS NULL))
        `, [String(dn.warehouse_id), String(tenantId), dn.branch_id || branchId || null]);
        if (warehouseRes.rows.length === 0) throw new Error('Delivery Note source warehouse is invalid for this branch.');
        warehouseValidated = true;
      }

      if (isInventoryItem) {
        // Check the source warehouse ledger, rather than the company-wide products.current_qty.
        const stockRes = await client.query(`
        SELECT COALESCE(SUM(
          CASE
            WHEN type IN ('in', 'adjustment') AND to_warehouse_id::text = $1::text THEN quantity
            WHEN type = 'transfer' AND to_warehouse_id::text = $1::text THEN quantity
            WHEN type IN ('out', 'adjustment') AND from_warehouse_id::text = $1::text THEN -quantity
            WHEN type = 'transfer' AND from_warehouse_id::text = $1::text THEN -quantity
            ELSE 0
          END
        ), 0) AS current_stock
        FROM stock_movements
        WHERE product_id::text = $2::text
          AND tenant_id::text = $3::text
          AND status = 'approved'
        `, [String(dn.warehouse_id), String(item.product_id), String(tenantId)]);
        const warehouseStock = Number(stockRes.rows[0]?.current_stock || 0);
        if (warehouseStock < Number(item.quantity_delivered)) {
          throw new Error(`INSUFFICIENT STOCK: Product ${item.product_id} has ${warehouseStock} available in the selected warehouse; ${item.quantity_delivered} requested.`);
        }
      }

      // Prevent multiple Delivery Notes from exceeding the Sales Order quantity.
      if (!item.sales_order_item_id) throw new Error('Delivery Note item is missing its Sales Order item reference.');
      const soItemRes = await client.query(`
        SELECT quantity, quantity_delivered, item_type
        FROM sales_order_items
        WHERE id::text = $1::text
          AND sales_order_id::text = $2::text
          AND product_id::text = $3::text
          AND tenant_id::text = $4::text
        FOR UPDATE
      `, [String(item.sales_order_item_id), String(dn.sales_order_id), String(item.product_id), String(tenantId)]);
      if (soItemRes.rows.length === 0) throw new Error('Delivery Note item does not match its Sales Order.');
      const soItem = soItemRes.rows[0];
      if (soItem.item_type !== 'inventory') {
        throw new Error(`Cannot confirm delivery: item is classified as '${soItem.item_type || 'unclassified'}'. Only 'inventory' items can be delivered.`);
      }
      const totalOrdered = Number(soItem.quantity || 0);
      const deliveredSoFar = Number(soItem.quantity_delivered || 0);
      const remainingQty = Math.round((totalOrdered - deliveredSoFar) * 1e6) / 1e6;
      const reqQty = Number(item.quantity_delivered);
      if (Math.round((reqQty - remainingQty) * 1e6) > 0) {
        throw new Error(`Delivery quantity exceeds the remaining Sales Order quantity for product ${item.product_id}.`);
      }

      if (isInventoryItem) {
        const itemCOGS = Number(item.quantity_delivered) * currentUnitCost;
        totalCOGSValue += itemCOGS;

        await client.query('UPDATE delivery_note_items SET unit_cost = $1 WHERE id = $2', [currentUnitCost, item.id]);

        // Record outbound stock movement for physical inventory only.
        await client.query(`
        INSERT INTO stock_movements
          (type, product_id, from_warehouse_id, quantity, status, tenant_id, branch_id, reference_type, reference_id, created_by)
        VALUES ('out', $1, $2, $3, 'approved', $4, $5, 'delivery_note', $6, $7)
        `, [item.product_id, dn.warehouse_id, item.quantity_delivered, String(tenantId), dn.branch_id || branchId || null, dn.id, userId]);
      }

      // Update quantity_delivered on sales_order_item
      if (item.sales_order_item_id) {
        await client.query(`
          UPDATE sales_order_items
          SET quantity_delivered = COALESCE(quantity_delivered, 0) + $1
          WHERE id::text = $2::text AND tenant_id::text = $3::text
        `, [item.quantity_delivered, String(item.sales_order_item_id), String(tenantId)]);
      }
    }

    // Update Delivery Note status (physical inventory reduction only — no COGS journal)
    const updatedDN = await client.query(`
      UPDATE delivery_notes
      SET status = 'delivered', accounting_status = 'not_applicable', journal_entry_id = NULL
      WHERE id = $1 RETURNING *
    `, [dn.id]);

    // Stage Outbox Event
    await TransactionEngine.stageOutboxEvent(client, {
      tenantId, branchId,
      aggregateType: 'DeliveryNote',
      aggregateId: dn.id,
      eventName: 'delivery_note.confirmed',
      actorId: userId,
      payload: { deliveryNoteId: dn.id, number: dn.number, cogsValue: totalCOGSValue }
    });

    return updatedDN.rows[0];
  });
}

/**
 * List Delivery Notes.
 */
async function getDeliveryNotes(tenantId, branchId) {
  const result = await db.query(`
    SELECT dn.*, c.name as customer_name, so.number as sales_order_number
    FROM delivery_notes dn
    LEFT JOIN customers c ON dn.customer_id = c.id
    LEFT JOIN sales_orders so ON dn.sales_order_id = so.id
    WHERE dn.tenant_id::text = $1::text AND (dn.branch_id::text = $2::text OR $2 IS NULL)
    ORDER BY dn.created_at DESC
  `, [String(tenantId), branchId || null]);

  return result.rows;
}

module.exports = {
  createDeliveryNote,
  confirmDeliveryNote,
  getDeliveryNotes,
};
