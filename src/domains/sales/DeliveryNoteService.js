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
const JournalEngine = require('../accounting/JournalEngine');
const AccountService = require('../accounting/AccountService');
const InventoryValuationService = require('../inventory/InventoryValuationService');

/**
 * Create Delivery Note linked to a Sales Order.
 */
async function createDeliveryNote(tenantId, branchId, data, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
    const { sales_order_id, delivery_date, warehouse_id, items, notes } = data;

    if (!sales_order_id) throw new Error('sales_order_id is required.');
    if (!items || items.length === 0) throw new Error('Delivery Note must contain at least one item.');

    const soRes = await client.query('SELECT customer_id FROM sales_orders WHERE id = $1 AND tenant_id::text = $2::text', [sales_order_id, String(tenantId)]);
    if (soRes.rows.length === 0) throw new Error('Sales Order not found.');

    const customerId = soRes.rows[0].customer_id;
    const year = new Date(delivery_date || new Date()).getFullYear();
    const number = await nextSequence(client, { tenantId, branchId, docType: 'DN', fiscalYear: year });

    const dnRes = await client.query(`
      INSERT INTO delivery_notes
        (tenant_id, branch_id, number, sales_order_id, customer_id, delivery_date, warehouse_id, status, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9)
      RETURNING *
    `, [String(tenantId), branchId || null, number, sales_order_id, customerId, delivery_date || new Date(), warehouse_id || null, notes || null, userId]);

    const deliveryNote = dnRes.rows[0];

    for (const item of items) {
      await client.query(`
        INSERT INTO delivery_note_items
          (delivery_note_id, sales_order_item_id, product_id, quantity_delivered, tenant_id)
        VALUES ($1, $2, $3, $4, $5)
      `, [deliveryNote.id, item.sales_order_item_id || null, item.product_id, item.quantity_delivered, String(tenantId)]);
    }

    return deliveryNote;
  });
}

/**
 * Confirm Delivery Note & Post COGS Journal Entry.
 */
async function confirmDeliveryNote(tenantId, branchId, deliveryNoteId, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
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

    const cogsAccount = await AccountService.getAccountBySubType(tenantId, 'cogs');
    const invAccount  = await AccountService.getAccountBySubType(tenantId, 'inventory');

    for (const item of items) {
      // Validate Negative Stock
      await InventoryValuationService.validateNegativeStock(client, item.product_id, item.quantity_delivered, tenantId);

      // Snapshot current product avg_cost into delivery_note_items.unit_cost
      const pRes = await client.query('SELECT avg_cost, name FROM products WHERE id::text = $1::text FOR UPDATE', [String(item.product_id)]);
      const currentAvgCost = Number(pRes.rows[0]?.avg_cost || 0);
      const itemCOGS = Number(item.quantity_delivered) * currentAvgCost;
      totalCOGSValue += itemCOGS;

      await client.query('UPDATE delivery_note_items SET unit_cost = $1 WHERE id = $2', [currentAvgCost, item.id]);

      // Record outbound stock movement
      await client.query(`
        INSERT INTO stock_movements
          (type, product_id, from_warehouse_id, quantity, unit_cost, status, tenant_id, reference_type, reference_id, created_by)
        VALUES ('out', $1, $2, $3, $4, 'approved', $5, 'delivery_note', $6, $7)
      `, [item.product_id, dn.warehouse_id, item.quantity_delivered, currentAvgCost, String(tenantId), dn.id, userId]);

      // Update current_qty on product
      await client.query(`
        UPDATE products SET current_qty = COALESCE(current_qty, 0) - $1 WHERE id::text = $2::text
      `, [item.quantity_delivered, String(item.product_id)]);

      // Update quantity_delivered on sales_order_item
      if (item.sales_order_item_id) {
        await client.query(`
          UPDATE sales_order_items SET quantity_delivered = COALESCE(quantity_delivered, 0) + $1 WHERE id = $2
        `, [item.quantity_delivered, item.sales_order_item_id]);
      }
    }

    // Auto-post COGS Journal Entry: DR Cost of Goods Sold / CR Inventory Asset
    let journal = null;
    if (totalCOGSValue > 0) {
      journal = await JournalEngine.postJournal(client, {
        tenantId,
        branchId,
        date: dn.delivery_date,
        sourceType: 'delivery_note',
        sourceId: dn.id,
        entryPurpose: 'cogs_inventory',
        description: `COGS for Delivery Note ${dn.number}`,
        postedBy: userId,
        entries: [
          { account_id: cogsAccount.id, debit: totalCOGSValue, credit: 0, description: `COGS Expense (${dn.number})` },
          { account_id: invAccount.id,  debit: 0, credit: totalCOGSValue, description: `Inventory Reduction (${dn.number})` }
        ]
      });
    }

    // Update Delivery Note status
    const updatedDN = await client.query(`
      UPDATE delivery_notes
      SET status = 'delivered', accounting_status = $1, journal_entry_id = $2
      WHERE id = $3 RETURNING *
    `, [journal ? 'posted' : 'unposted', journal ? journal.id : null, dn.id]);

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
