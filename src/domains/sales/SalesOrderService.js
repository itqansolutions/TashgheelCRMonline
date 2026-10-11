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
 * Internal helper to create a Sales Order using an existing database transaction client.
 */
async function _createSalesOrderInternal(client, { tenantId, branchId, data, userId }) {
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
}

/**
 * Create a new Sales Order.
 */
async function createSalesOrder(tenantId, branchId, data, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
    return await _createSalesOrderInternal(client, { tenantId, branchId, data, userId });
  });
}

/**
 * Convert an approved Quotation into a Sales Order.
 * Executes inside a single connected database transaction with row-level locking.
 */
async function convertQuotationToSalesOrder(tenantId, branchId, quotationId, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
    // 1. Row-level lock on the Quotation record scoped to tenant
    const qRes = await client.query(
      `SELECT * FROM quotations
       WHERE id = $1 AND tenant_id::text = $2::text
       FOR UPDATE`,
      [quotationId, String(tenantId)]
    );
    if (qRes.rows.length === 0) throw new Error('Quotation not found.');

    const quo = qRes.rows[0];

    // 2. Validate Quotation status: must be 'approved' or 'converted_to_so' (if prior SO was cancelled)
    if (quo.status !== 'approved' && quo.status !== 'converted_to_so') {
      throw new Error(`Cannot convert Quotation: Current status is '${quo.status}'. Quotation must be 'approved' to convert to Sales Order.`);
    }

    // 3. Idempotency Check: check if an active (non-cancelled) Sales Order already exists for this quotation
    const existingSoRes = await client.query(
      `SELECT * FROM sales_orders
       WHERE quotation_id = $1
         AND tenant_id::text = $2::text
         AND (status IS NULL OR status != 'cancelled')
       ORDER BY created_at DESC
       LIMIT 1`,
      [quotationId, String(tenantId)]
    );

    if (existingSoRes.rows.length > 0) {
      return {
        ...existingSoRes.rows[0],
        _alreadyConverted: true
      };
    }

    // 4. Validate customer association
    const customerId = quo.client_id ? (parseInt(quo.client_id, 10) || null) : null;
    if (!customerId) {
      throw new Error('Quotation must have a valid customer associated to convert to Sales Order.');
    }

    // 5. Fetch quotation items
    const itemsRes = await client.query(
      `SELECT * FROM quotation_items
       WHERE quotation_id = $1
       ORDER BY id ASC`,
      [quotationId]
    );

    if (itemsRes.rows.length === 0) {
      throw new Error('Quotation contains no items to convert to Sales Order.');
    }

    const soData = {
      customer_id: customerId,
      deal_id: quo.deal_id ? (parseInt(quo.deal_id, 10) || null) : null,
      quotation_id: quo.id,
      notes: `Converted from Quotation #${quo.number || quo.id}. ${quo.notes || ''}`.trim(),
      items: itemsRes.rows.map(i => ({
        product_id: i.product_id ? (parseInt(i.product_id, 10) || null) : null,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
      }))
    };

    // 6. Create Sales Order atomically using the SAME transaction client (no nested transaction)
    const salesOrder = await _createSalesOrderInternal(client, {
      tenantId,
      branchId: branchId || quo.branch_id || null,
      data: soData,
      userId
    });

    // 7. Update Quotation status to converted_to_so within the same transaction
    await client.query(
      `UPDATE quotations
       SET status = 'converted_to_so', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id::text = $2::text`,
      [quotationId, String(tenantId)]
    );

    return salesOrder;
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
