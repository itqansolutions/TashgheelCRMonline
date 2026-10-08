/**
 * SalesReturnService — ERP Sales Return & Stock IN Service (Phase G-5)
 *
 * Responsibilities:
 *  - Create Sales Return draft linked to a confirmed Delivery Note (delivery_notes.status = 'delivered')
 *  - Validate return quantities against remaining returnable quantities per delivery_note_item_id:
 *      available_to_return = quantity_delivered - SUM(previously confirmed returned)
 *  - On Confirmation:
 *      1. Locks delivery_note, sales_return, sales_return_items, and products in a single transaction (FOR UPDATE)
 *      2. Re-verifies available_to_return atomically to prevent race condition over-returns
 *      3. Creates stock_movements (type = 'in', reference_type = 'sales_return') for authoritative physical stock restoration
 *      4. Updates products.current_qty = current_qty + quantity_returned
 *      5. Leaves sales_order_items.quantity_delivered untouched to preserve historical delivery audit trail
 *      6. Sets sales_returns.status = 'completed', accounting_status = 'not_applicable', journal_entry_id = NULL
 *  - Zero GL / COGS journal entries (ERP Accounting unposted / not_applicable for General workflow)
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
 * Create a Sales Return draft linked to a Delivery Note.
 */
async function createSalesReturn(tenantId, branchId, data, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
    await ensureInventoryTrackingColumn(client);
    const { delivery_note_id, return_date, items, notes } = data;

    if (!delivery_note_id) throw new Error('delivery_note_id is required.');
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('Sales Return must contain at least one item.');
    }

    // 1. Verify Delivery Note exists, is tenant-scoped, and is in 'delivered' status
    const dnRes = await client.query(`
      SELECT dn.*, c.name as customer_name
      FROM delivery_notes dn
      LEFT JOIN customers c ON dn.customer_id = c.id
      WHERE dn.id = $1 AND dn.tenant_id::text = $2::text
      FOR UPDATE OF dn
    `, [delivery_note_id, String(tenantId)]);

    if (dnRes.rows.length === 0) {
      throw new Error('Delivery Note not found.');
    }

    const dn = dnRes.rows[0];
    if (dn.status !== 'delivered') {
      throw new Error(`Cannot return items for a Delivery Note in '${dn.status}' status. Only 'delivered' notes can be returned.`);
    }

    // 2. Fetch delivery_note_items with previously confirmed returned quantities
    const dniRes = await client.query(`
      SELECT 
        dni.*,
        COALESCE(ret_agg.total_returned, 0) as already_returned
      FROM delivery_note_items dni
      LEFT JOIN (
        SELECT sri.delivery_note_item_id, SUM(sri.quantity_returned) as total_returned
        FROM sales_return_items sri
        JOIN sales_returns sr ON sri.sales_return_id = sr.id
        WHERE sr.tenant_id::text = $1::text
          AND sr.status = 'completed'
        GROUP BY sri.delivery_note_item_id
      ) ret_agg ON ret_agg.delivery_note_item_id = dni.id
      WHERE dni.delivery_note_id = $2 AND dni.tenant_id::text = $1::text
      FOR UPDATE OF dni
    `, [String(tenantId), delivery_note_id]);

    const dniMap = new Map();
    dniRes.rows.forEach(row => dniMap.set(String(row.id), row));

    // 3. Validate items against available returnable quantity
    let totalReturnAmount = 0;
    const validatedItems = [];

    for (const item of items) {
      const dniId = String(item.delivery_note_item_id || '');
      const dni = dniMap.get(dniId);

      if (!dni) {
        throw new Error(`Item ${dniId} does not belong to Delivery Note ${dn.number || delivery_note_id}.`);
      }

      const returnQty = Number(item.quantity_returned || 0);
      if (returnQty <= 0) {
        throw new Error(`Returned quantity must be greater than zero for product ${dni.product_id}.`);
      }

      const deliveredQty = Number(dni.quantity_delivered || 0);
      const alreadyReturnedQty = Number(dni.already_returned || 0);
      const availableToReturn = Math.max(0, deliveredQty - alreadyReturnedQty);

      if (returnQty > availableToReturn) {
        throw new Error(
          `Cannot return quantity ${returnQty}. Maximum returnable quantity for item ${dni.id} is ${availableToReturn} (Delivered: ${deliveredQty}, Already Returned: ${alreadyReturnedQty}).`
        );
      }

      const unitCost = Number(dni.unit_cost || 0);
      totalReturnAmount += returnQty * unitCost;

      validatedItems.push({
        delivery_note_item_id: dni.id,
        product_id: dni.product_id,
        quantity_returned: returnQty,
        unit_cost: unitCost
      });
    }

    // 4. Generate document number & insert header
    const year = new Date(return_date || new Date()).getFullYear();
    const number = await nextSequence(client, { tenantId, branchId, docType: 'SR', fiscalYear: year });

    const srRes = await client.query(`
      INSERT INTO sales_returns
        (tenant_id, branch_id, number, delivery_note_id, customer_id, return_date, status, accounting_status, journal_entry_id, total_amount, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, 'draft', 'unposted', NULL, $7, $8, $9)
      RETURNING *
    `, [
      String(tenantId),
      branchId || null,
      number,
      delivery_note_id,
      dn.customer_id,
      return_date || new Date(),
      totalReturnAmount,
      notes || null,
      userId
    ]);

    const salesReturn = srRes.rows[0];

    // 5. Insert sales_return_items
    for (const vItem of validatedItems) {
      await client.query(`
        INSERT INTO sales_return_items
          (sales_return_id, delivery_note_item_id, product_id, quantity_returned, unit_cost, tenant_id)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        salesReturn.id,
        vItem.delivery_note_item_id,
        vItem.product_id,
        vItem.quantity_returned,
        vItem.unit_cost,
        String(tenantId)
      ]);
    }

    return {
      ...salesReturn,
      items: validatedItems
    };
  });
}

/**
 * Confirm a Sales Return:
 * - Atomic FOR UPDATE lock on return, delivery note, and products
 * - Validates available returnable quantities
 * - Restores physical stock via stock_movements (type = 'in', reference_type = 'sales_return')
 * - Increments products.current_qty
 * - Sets status = 'completed'
 * - Idempotency: second confirmation throws or returns already completed
 */
async function confirmSalesReturn(tenantId, branchId, returnId, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
    await ensureInventoryTrackingColumn(client);
    // 1. Fetch and Lock Sales Return
    const srRes = await client.query(`
      SELECT sr.*, items.items_json
      FROM sales_returns sr
      LEFT JOIN (
        SELECT sales_return_id, json_agg(sri.*) as items_json
        FROM sales_return_items sri
        GROUP BY sales_return_id
      ) items ON items.sales_return_id = sr.id
      WHERE sr.id = $1 AND sr.tenant_id::text = $2::text
      FOR UPDATE OF sr
    `, [returnId, String(tenantId)]);

    if (srRes.rows.length === 0) {
      throw new Error('Sales Return not found.');
    }

    const sr = srRes.rows[0];

    // Idempotency guard: already completed return cannot be re-confirmed
    if (sr.status === 'completed') {
      return {
        ...sr,
        _already_confirmed: true,
        message: 'Sales Return has already been confirmed.'
      };
    }

    if (sr.status !== 'draft') {
      throw new Error(`Cannot confirm Sales Return with status '${sr.status}'.`);
    }

    const items = sr.items_json || [];
    if (items.length === 0) {
      throw new Error('Sales Return has no items to process.');
    }

    // 2. Fetch and Lock Delivery Note to resolve warehouse
    const dnRes = await client.query(`
      SELECT * FROM delivery_notes
      WHERE id = $1 AND tenant_id::text = $2::text
      FOR UPDATE
    `, [sr.delivery_note_id, String(tenantId)]);

    if (dnRes.rows.length === 0) {
      throw new Error('Associated Delivery Note not found.');
    }
    const dn = dnRes.rows[0];

    // 3. Process each item: atomic validation, stock_movement (IN), and product current_qty restoration
    for (const item of items) {
      const returnQty = Number(item.quantity_returned || 0);

      // Re-verify against Delivery Note item limits atomically
      const dniRes = await client.query(`
        SELECT dni.*,
               COALESCE((
                 SELECT SUM(other_sri.quantity_returned)
                 FROM sales_return_items other_sri
                 JOIN sales_returns other_sr ON other_sri.sales_return_id = other_sr.id
                 WHERE other_sr.tenant_id::text = $1::text
                   AND other_sr.status = 'completed'
                   AND other_sri.delivery_note_item_id = dni.id
                   AND other_sr.id != $2
               ), 0) as already_returned
        FROM delivery_note_items dni
        WHERE dni.id = $3 AND dni.tenant_id::text = $1::text
        FOR UPDATE
      `, [String(tenantId), sr.id, item.delivery_note_item_id]);

      if (dniRes.rows.length === 0) {
        throw new Error(`Delivery Note item ${item.delivery_note_item_id} not found.`);
      }

      const dni = dniRes.rows[0];
      const deliveredQty = Number(dni.quantity_delivered || 0);
      const otherReturned = Number(dni.already_returned || 0);
      const remainingAvailable = Math.max(0, deliveredQty - otherReturned);

      if (returnQty > remainingAvailable) {
        throw new Error(
          `Cannot confirm return: quantity ${returnQty} exceeds remaining returnable quantity ${remainingAvailable} for product ${item.product_id}.`
        );
      }

      // Lock product row to prevent race conditions during physical stock increment
      const pRes = await client.query(`
        SELECT id, current_qty, avg_cost, is_inventory_item
        FROM products
        WHERE id::text = $1::text AND tenant_id::text = $2::text
        FOR UPDATE
      `, [String(item.product_id), String(tenantId)]);

      if (pRes.rows.length === 0) {
        throw new Error(`Product ${item.product_id} not found.`);
      }

      const product = pRes.rows[0];
      const isInventoryItem = product.is_inventory_item !== false;
      const unitCost = Number(item.unit_cost || product.avg_cost || 0);

      if (isInventoryItem && !dn.warehouse_id) {
        throw new Error('Associated Delivery Note has no warehouse to receive this inventory return.');
      }

      if (isInventoryItem) {
        // 4. Restore physical inventory only; service returns never create Stock IN.
        await client.query(`
        INSERT INTO stock_movements
          (type, product_id, to_warehouse_id, quantity, unit_cost, status, tenant_id, branch_id, reference_type, reference_id, created_by)
        VALUES ('in', $1, $2, $3, $4, 'approved', $5, $6, 'sales_return', $7, $8)
        `, [
        item.product_id,
        dn.warehouse_id,
        returnQty,
        unitCost,
        String(tenantId),
        dn.branch_id || branchId || null,
        sr.id,
        userId
        ]);

        // 5. Restore the company-wide inventory cache only for physical items.
        await client.query(`
        UPDATE products
        SET current_qty = COALESCE(current_qty, 0) + $1
        WHERE id::text = $2::text AND tenant_id::text = $3::text
        `, [returnQty, String(item.product_id), String(tenantId)]);
      }

      // Note: sales_order_items.quantity_delivered is intentionally PRESERVED as historical delivered qty.
      // Net Delivered is dynamically derived as (quantity_delivered - total_returned).
    }

    // 6. Finalize Sales Return: status = 'completed', accounting_status = 'not_applicable'
    const updatedSR = await client.query(`
      UPDATE sales_returns
      SET status = 'completed', accounting_status = 'not_applicable', journal_entry_id = NULL
      WHERE id = $1
      RETURNING *
    `, [sr.id]);

    // 7. Stage Outbox Event
    await TransactionEngine.stageOutboxEvent(client, {
      tenantId,
      branchId,
      aggregateType: 'SalesReturn',
      aggregateId: sr.id,
      eventName: 'sales_return.confirmed',
      actorId: userId,
      payload: { salesReturnId: sr.id, number: sr.number, deliveryNoteId: sr.delivery_note_id }
    });

    return updatedSR.rows[0];
  });
}

/**
 * List Sales Returns with summary info.
 */
async function getSalesReturns(tenantId, branchId) {
  const result = await db.query(`
    SELECT sr.*,
           c.name as customer_name,
           dn.number as delivery_note_number,
           COALESCE(items.item_count, 0) as item_count,
           COALESCE(items.total_quantity_returned, 0) as total_quantity_returned
    FROM sales_returns sr
    LEFT JOIN customers c ON sr.customer_id = c.id
    LEFT JOIN delivery_notes dn ON sr.delivery_note_id = dn.id
    LEFT JOIN (
      SELECT sales_return_id,
             COUNT(id) as item_count,
             SUM(quantity_returned) as total_quantity_returned
      FROM sales_return_items
      GROUP BY sales_return_id
    ) items ON items.sales_return_id = sr.id
    WHERE sr.tenant_id::text = $1::text AND (sr.branch_id::text = $2::text OR $2 IS NULL)
    ORDER BY sr.created_at DESC
  `, [String(tenantId), branchId || null]);

  return result.rows;
}

/**
 * Get Net Delivery status for a Sales Order or Delivery Note:
 * Computes:
 *   Ordered Qty
 *   Delivered Qty (historical)
 *   Returned Qty (confirmed)
 *   Net Delivered Qty
 */
async function getDeliveryNoteNetDelivered(tenantId, deliveryNoteId) {
  const result = await db.query(`
    SELECT 
      dni.id as delivery_note_item_id,
      dni.product_id,
      p.name as product_name,
      dni.quantity_delivered,
      COALESCE(ret.total_returned, 0) as total_returned,
      (dni.quantity_delivered - COALESCE(ret.total_returned, 0)) as net_delivered
    FROM delivery_note_items dni
    JOIN products p ON dni.product_id = p.id
    LEFT JOIN (
      SELECT sri.delivery_note_item_id, SUM(sri.quantity_returned) as total_returned
      FROM sales_return_items sri
      JOIN sales_returns sr ON sri.sales_return_id = sr.id
      WHERE sr.tenant_id::text = $1::text
        AND sr.status = 'completed'
      GROUP BY sri.delivery_note_item_id
    ) ret ON ret.delivery_note_item_id = dni.id
    WHERE dni.delivery_note_id = $2 AND dni.tenant_id::text = $1::text
  `, [String(tenantId), deliveryNoteId]);

  return result.rows;
}

module.exports = {
  createSalesReturn,
  confirmSalesReturn,
  getSalesReturns,
  getDeliveryNoteNetDelivered
};
