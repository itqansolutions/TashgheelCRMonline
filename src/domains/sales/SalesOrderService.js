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
 * Enforces pre-validation of all line items, domain types, tenant isolation, and mathematical sanity before any insert.
 */
async function _createSalesOrderInternal(client, { tenantId, branchId, data, userId, executionContext = { source: 'direct_api' } }) {
  const { customer_id, deal_id, quotation_id, order_date, expected_delivery, items, currency, exchange_rate, notes, assigned_to } = data;

  if (!customer_id) throw new Error('customer_id is required for Sales Order.');
  if (!items || !Array.isArray(items) || items.length === 0) throw new Error('Sales Order must contain at least one item.');

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Pre-validation of each item before any database insertion or total calculation
  // ─────────────────────────────────────────────────────────────────────────────
  const validatedItems = [];
  let totalAmount = 0;
  const allowedTypes = ['inventory', 'service', 'non_inventory'];
  const isQuotationConversion = executionContext && executionContext.source === 'quotation_conversion' && executionContext.quotationId && Number(executionContext.quotationId) === Number(quotation_id);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const rowNum = idx + 1;

    // A. Validate positive finite quantity (reject 0, negative, NaN, Infinity)
    const rawQty = Number(item.quantity);
    if (!Number.isFinite(rawQty) || rawQty <= 0) {
      throw new Error(`Item #${rowNum} ('${item.description || 'Unnamed'}') has invalid quantity (${item.quantity}). Quantity must be a strictly positive number.`);
    }

    // B. Validate non-negative finite unit price
    const rawPrice = Number(item.unit_price);
    if (!Number.isFinite(rawPrice) || rawPrice < 0) {
      throw new Error(`Item #${rowNum} ('${item.description || 'Unnamed'}') has invalid unit price (${item.unit_price}). Price cannot be negative or NaN.`);
    }

    // C. Validate product reference and tenant isolation
    let parsedProductId = null;
    let catalogProduct = null;
    if (item.product_id !== null && item.product_id !== undefined && item.product_id !== '') {
      const numPid = Number(item.product_id);
      if (!Number.isInteger(numPid) || numPid <= 0) {
        throw new Error(`Item #${rowNum} has invalid product_id (${item.product_id}). Product ID must be a positive integer.`);
      }
      parsedProductId = numPid;

      const pRes = await client.query(
        `SELECT id, is_inventory_item FROM products WHERE id = $1 AND tenant_id::text = $2::text`,
        [parsedProductId, String(tenantId)]
      );
      if (pRes.rows.length === 0) {
        throw new Error(`Product ID ${parsedProductId} not found in this company's product catalog.`);
      }
      catalogProduct = pRes.rows[0];
    }

    // D. Validate / Infer item_type
    let itemType = item.item_type ? String(item.item_type).trim().toLowerCase() : null;

    // Automatic inference rule: If item_type is omitted and product is a verified inventory item, infer 'inventory'
    if (!itemType && catalogProduct && catalogProduct.is_inventory_item === true) {
      itemType = 'inventory';
    }

    const isQuotationConversion = executionContext.source === 'quotation_conversion';
    const verifiedLegacyItemIds = executionContext.verifiedLegacyQuotationItemIds;
    const isItemVerifiedLegacy = isQuotationConversion &&
      itemType === 'legacy_unclassified' &&
      Boolean(item.quotation_item_id) &&
      (verifiedLegacyItemIds instanceof Set
        ? verifiedLegacyItemIds.has(item.quotation_item_id)
        : (Array.isArray(verifiedLegacyItemIds) && verifiedLegacyItemIds.includes(item.quotation_item_id)));

    if (itemType === 'legacy_unclassified' && !isItemVerifiedLegacy) {
      throw new Error(`Item #${rowNum}: 'legacy_unclassified' is a restricted historical state and cannot be assigned to new order items.`);
    }

    if (!itemType || (!allowedTypes.includes(itemType) && !isItemVerifiedLegacy)) {
      throw new Error(`Item #${rowNum} must specify a valid item_type: ${allowedTypes.join(', ')}.`);
    }

    // E. Type-specific business rules
    if (itemType === 'inventory') {
      if (!parsedProductId || !catalogProduct) {
        throw new Error(`Item #${rowNum} ('${item.description || 'Unnamed'}') is classified as 'inventory' but has no valid product reference.`);
      }
      if (catalogProduct.is_inventory_item !== true) {
        throw new Error(`Product ID ${parsedProductId} is not a physical inventory item; cannot be assigned to an 'inventory' line item.`);
      }
    } else if (['service', 'non_inventory'].includes(itemType)) {
      if (parsedProductId && catalogProduct) {
        if (catalogProduct.is_inventory_item !== false) {
          throw new Error(`Product ID ${parsedProductId} is an inventory item (or has unverified tracking); cannot be classified as '${itemType}'.`);
        }
      } else if (!item.description || String(item.description).trim() === '') {
        throw new Error(`Line item #${rowNum} of type '${itemType}' requires a descriptive name or description.`);
      }
    }

    // F. Safe subtotal and total calculation
    const subtotal = rawQty * rawPrice;
    if (!Number.isFinite(subtotal) || subtotal < 0) {
      throw new Error(`Item #${rowNum} produced an invalid or non-finite subtotal.`);
    }

    totalAmount += subtotal;
    if (!Number.isFinite(totalAmount)) {
      throw new Error('Order total amount exceeds allowable mathematical limits.');
    }

    validatedItems.push({
      product_id: parsedProductId,
      description: item.description ? String(item.description).trim() : null,
      item_type: itemType,
      quantity: rawQty,
      unit_price: rawPrice,
      subtotal: subtotal
    });
  }

  const year = new Date(order_date || new Date()).getFullYear();
  const number = await nextSequence(client, { tenantId, branchId, docType: 'SO', fiscalYear: year });

  const curr = currency || 'EGP';
  const exRate = Number(exchange_rate || 1.0);
  if (!Number.isFinite(exRate) || exRate <= 0) {
    throw new Error('Exchange rate must be a strictly positive finite number.');
  }

  const localValue = totalAmount * exRate;
  if (!Number.isFinite(localValue)) {
    throw new Error('Local currency value exceeds allowable mathematical limits.');
  }

  const totalTax = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Insert Sales Order Header only after all items and totals are strictly validated
  // ─────────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Insert validated and classified line items
  // ─────────────────────────────────────────────────────────────────────────────
  for (const item of validatedItems) {
    await client.query(`
      INSERT INTO sales_order_items
        (sales_order_id, product_id, description, item_type, quantity, unit_price, subtotal, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [salesOrder.id, item.product_id, item.description, item.item_type, item.quantity, item.unit_price, item.subtotal, String(tenantId)]);
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
    return await _createSalesOrderInternal(client, { tenantId, branchId, data, userId, executionContext: { source: 'direct_api' } });
  });
}

/**
 * Internal helper to convert Quotation to Sales Order.
 */
async function _convertQuotationToSalesOrderInternal(client, { tenantId, branchId, quotationId, userId }) {
  // 1. Row-level lock on the Quotation record scoped to tenant
  const qRes = await client.query(
    `SELECT * FROM quotations
     WHERE id = $1 AND tenant_id::text = $2::text
     FOR UPDATE`,
    [quotationId, String(tenantId)]
  );
  if (qRes.rows.length === 0) throw new Error('Quotation not found.');

  const quo = qRes.rows[0];

  // Real estate isolation: general sales cycle cannot convert quotations linked to real estate units
  if (quo.unit_id) {
    throw new Error('Quotation is linked to a Real Estate unit and cannot be converted through the general sales order workflow.');
  }

  // Branch isolation: if caller specifies branchId and quotation is bound to another branch, reject
  if (branchId && quo.branch_id && String(branchId) !== String(quo.branch_id)) {
    throw new Error(`Branch isolation violation: Quotation belongs to branch '${quo.branch_id}', unauthorized from branch '${branchId}'`);
  }

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

  // 6. Inspect quotation items for legacy unclassified items and validate inventory products
  const verifiedLegacyQuotationItemIds = new Set();
  for (const qItem of itemsRes.rows) {
    const rawType = qItem.item_type;
    if (!rawType || rawType === 'legacy_unclassified') {
      verifiedLegacyQuotationItemIds.add(qItem.id);
    } else if (rawType === 'inventory') {
      if (!qItem.product_id) {
        throw new Error(`Quotation item '${qItem.description || ''}' is marked as inventory but has no product reference.`);
      }
      const prodCheck = await client.query(
        `SELECT id, is_inventory_item FROM products WHERE id::text = $1::text AND tenant_id::text = $2::text`,
        [String(qItem.product_id), String(tenantId)]
      );
      if (prodCheck.rows.length === 0 || prodCheck.rows[0].is_inventory_item !== true) {
        throw new Error(`Quotation item references invalid or non-inventory product ${qItem.product_id}.`);
      }
    }
  }

  const soData = {
    customer_id: customerId,
    deal_id: quo.deal_id ? (parseInt(quo.deal_id, 10) || null) : null,
    quotation_id: quo.id,
    notes: `Converted from Quotation #${quo.number || quo.id}. ${quo.notes || ''}`.trim(),
    items: itemsRes.rows.map(i => ({
      quotation_item_id: i.id,
      product_id: i.product_id ? (parseInt(i.product_id, 10) || null) : null,
      description: i.description,
      item_type: i.item_type || 'legacy_unclassified',
      quantity: i.quantity,
      unit_price: i.unit_price,
    }))
  };

  // 7. Create Sales Order atomically using the SAME transaction client (no nested transaction)
  // Internal executionContext ensures only verified quotation items can pass legacy_unclassified status
  const salesOrder = await _createSalesOrderInternal(client, {
    tenantId,
    branchId: branchId || quo.branch_id || null,
    data: soData,
    userId,
    executionContext: {
      source: 'quotation_conversion',
      quotationId: quo.id,
      verifiedLegacyQuotationItemIds
    }
  });

  // 8. Update Quotation status to converted_to_so within the same transaction
  await client.query(
    `UPDATE quotations
     SET status = 'converted_to_so', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND tenant_id::text = $2::text`,
    [quotationId, String(tenantId)]
  );

  return salesOrder;
}

/**
 * Convert an approved Quotation into a Sales Order.
 * Executes inside a single connected database transaction with row-level locking.
 * Can reuse an external client (clientOverride) for composite transactions.
 */
async function convertQuotationToSalesOrder(tenantId, branchId, quotationId, userId, clientOverride = null) {
  if (clientOverride) {
    return await _convertQuotationToSalesOrderInternal(clientOverride, { tenantId, branchId, quotationId, userId });
  }
  return await TransactionEngine.executeTransaction(async (client) => {
    return await _convertQuotationToSalesOrderInternal(client, { tenantId, branchId, quotationId, userId });
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
      -- can_deliver: Authoritative UI indicator, true ONLY IF order is in an active execution state and has deliverable inventory
      COALESCE(bool_or(
        soi.item_type = 'inventory' 
        AND (COALESCE(soi.quantity, 0) - COALESCE(soi.quantity_delivered, 0)) > 0
        AND so.status IN ('confirmed', 'delivered', 'invoiced')
      ), false) AS can_deliver,
      COALESCE(json_agg(json_build_object(
        'id', soi.id,
        'product_id', soi.product_id,
        'product_name', p.name,
        'description', soi.description,
        'item_type', COALESCE(soi.item_type, 'legacy_unclassified'),
        'quantity', soi.quantity,
        'unit_price', soi.unit_price,
        'subtotal', soi.subtotal,
        'quantity_delivered', COALESCE(soi.quantity_delivered, 0),
        'quantity_invoiced', COALESCE(soi.quantity_invoiced, 0),
        'remaining_deliverable', CASE 
          WHEN soi.item_type = 'inventory' THEN GREATEST(0, (COALESCE(soi.quantity, 0) - COALESCE(soi.quantity_delivered, 0)))
          ELSE 0 
        END
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
