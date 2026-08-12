/**
 * SalesOrderService — ERP Sales Order Management Service
 *
 * Responsibilities:
 *  - Create Sales Orders with auto-generated document sequence (SO-YYYY-XXXXX)
 *  - Convert approved Quotations -> Sales Orders automatically
 *  - Confirm Sales Orders
 *  - Track quantity delivered and quantity invoiced per item
 */

const db = require('../../../config/db');
const { nextSequence } = require('../../infrastructure/sequencing/DocumentSequencer');
const TransactionEngine = require('../shared/TransactionEngine');

/**
 * Create a new Sales Order.
 */
async function createSalesOrder(tenantId, branchId, data, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
    const { customer_id, deal_id, quotation_id, order_date, expected_delivery, items, currency, exchange_rate, notes, assigned_to } = data;

    if (!customer_id) throw new Error('customer_id is required for Sales Order.');
    if (!items || items.length === 0) throw new Error('Sales Order must contain at least one item.');

    const year = new Date(order_date || new Date()).getFullYear();
    const number = await nextSequence(client, { tenantId, branchId, docType: 'SO', fiscalYear: year });

    const curr = currency || 'EGP';
    const exRate = Number(exchange_rate || 1.0);

    let totalAmount = 0;
    let totalTax = 0;

    items.forEach(item => {
      const qty = Number(item.quantity || 1);
      const price = Number(item.unit_price || 0);
      const subtotal = qty * price;
      totalAmount += subtotal;
    });

    const localValue = totalAmount * exRate;

    const soRes = await client.query(`
      INSERT INTO sales_orders
        (tenant_id, branch_id, number, customer_id, deal_id, quotation_id, order_date, expected_delivery, status, total_amount, tax_amount, currency, exchange_rate, local_value, notes, assigned_to, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      String(tenantId), branchId || null, number, customer_id, deal_id || null, quotation_id || null,
      order_date || new Date(), expected_delivery || null, totalAmount, totalTax,
      curr, exRate, localValue, notes || null, assigned_to || null, userId
    ]);

    const salesOrder = soRes.rows[0];

    for (const item of items) {
      const qty = Number(item.quantity || 1);
      const price = Number(item.unit_price || 0);
      const subtotal = qty * price;

      await client.query(`
        INSERT INTO sales_order_items
          (sales_order_id, product_id, description, quantity, unit_price, subtotal, tenant_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [salesOrder.id, item.product_id, item.description || null, qty, price, subtotal, String(tenantId)]);
    }

    // Stage Outbox Event
    await TransactionEngine.stageOutboxEvent(client, {
      tenantId, branchId,
      aggregateType: 'SalesOrder',
      aggregateId: salesOrder.id,
      eventName: 'sales_order.created',
      actorId: userId,
      payload: { salesOrderId: salesOrder.id, number: salesOrder.number, totalAmount }
    });

    return salesOrder;
  });
}

/**
 * Convert an approved Quotation into a Sales Order.
 */
async function convertQuotationToSalesOrder(tenantId, branchId, quotationId, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
    const qRes = await client.query('SELECT * FROM quotations WHERE id = $1 AND tenant_id::text = $2::text', [quotationId, String(tenantId)]);
    if (qRes.rows.length === 0) throw new Error('Quotation not found.');

    const quo = qRes.rows[0];

    const itemsRes = await client.query('SELECT * FROM quotation_items WHERE quotation_id = $1', [quotationId]);

    const soData = {
      customer_id: quo.client_id,
      deal_id: quo.deal_id,
      quotation_id: quo.id,
      notes: `Converted from Quotation #${quo.id}. ${quo.notes || ''}`,
      items: itemsRes.rows.map(i => ({
        product_id: i.product_id,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
      }))
    };

    return await createSalesOrder(tenantId, branchId, soData, userId);
  });
}

/**
 * Confirm a Sales Order.
 */
async function confirmSalesOrder(tenantId, salesOrderId, userId) {
  const result = await db.query(`
    UPDATE sales_orders
    SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND tenant_id::text = $2::text AND status = 'draft'
    RETURNING *
  `, [salesOrderId, String(tenantId)]);

  if (result.rows.length === 0) {
    throw new Error('Sales Order not found or not in draft status.');
  }

  return result.rows[0];
}

/**
 * List Sales Orders for tenant/branch.
 */
async function getSalesOrders(tenantId, branchId) {
  const result = await db.query(`
    SELECT so.*, c.name as customer_name,
      COALESCE(json_agg(json_build_object(
        'id', soi.id,
        'product_id', soi.product_id,
        'product_name', p.name,
        'quantity', soi.quantity,
        'unit_price', soi.unit_price,
        'subtotal', soi.subtotal,
        'quantity_delivered', soi.quantity_delivered,
        'quantity_invoiced', soi.quantity_invoiced
      )) FILTER (WHERE soi.id IS NOT NULL), '[]'::json) as items
    FROM sales_orders so
    LEFT JOIN customers c ON so.customer_id = c.id
    LEFT JOIN sales_order_items soi ON soi.sales_order_id = so.id
    LEFT JOIN products p ON soi.product_id = p.id
    WHERE so.tenant_id::text = $1::text AND (so.branch_id::text = $2::text OR $2 IS NULL)
    GROUP BY so.id, c.name
    ORDER BY so.created_at DESC
  `, [String(tenantId), branchId || null]);

  return result.rows;
}

module.exports = {
  createSalesOrder,
  convertQuotationToSalesOrder,
  confirmSalesOrder,
  getSalesOrders,
};
