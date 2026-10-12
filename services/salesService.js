const db = require('../config/db');
const SalesOrderService = require('../src/domains/sales/SalesOrderService');

/**
 * Converts a Quotation into an Invoice via the authoritative Sales Order workflow.
 * Executes inside a SINGLE database transaction with row-level locks, ensuring full ACID atomicity.
 *
 * Flow:
 * 1. Locks quotation (FOR UPDATE), validates status ('approved' or 'converted_to_so').
 * 2. Blocks real estate quotations (unit_id).
 * 3. Resolves or atomically creates Sales Order with all items.
 * 4. Resolves or atomically creates Invoice with all items from the Sales Order.
 * 5. Handles repeated calls (Idempotent) returning the existing invoice linked to the Sales Order.
 *
 * @param {number|string} quotationId
 * @param {string} tenant_id
 * @param {object} [options] - optional { userId, branchId }
 * @returns {Promise<object>} The invoice
 */
exports.convertQuotationToInvoice = async (quotationId, tenant_id, options = {}) => {
  const { ensureInvoicesTable } = require('../controllers/financeController');
  await ensureInvoicesTable();

  const { userId = 1, branchId = null } = options;
  const client = db.connect ? await db.connect() : await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Row-level lock on Quotation
    const qRes = await client.query(
      `SELECT * FROM quotations
       WHERE id = $1 AND tenant_id::text = $2::text
       FOR UPDATE`,
      [quotationId, String(tenant_id)]
    );
    if (qRes.rows.length === 0) {
      throw new Error('Quotation not found or unauthorized');
    }

    const quo = qRes.rows[0];

    // 2. Strict Real Estate Isolation
    if (quo.unit_id) {
      throw new Error('Quotation is linked to a Real Estate unit and cannot be converted through the general sales order/invoice workflow.');
    }

    // 2b. Strict Branch Isolation
    if (branchId && quo.branch_id && String(branchId) !== String(quo.branch_id)) {
      throw new Error(`Branch isolation violation: Quotation belongs to branch '${quo.branch_id}', unauthorized from branch '${branchId}'`);
    }

    // 3. Status Validation
    if (quo.status !== 'approved' && quo.status !== 'converted_to_so' && quo.status !== 'invoiced') {
      throw new Error(`Quotation must be approved before invoicing (current status: '${quo.status}')`);
    }

    // 4. Check for existing Sales Order linked to this quotation
    const existingSoRes = await client.query(
      `SELECT * FROM sales_orders
       WHERE quotation_id = $1
         AND tenant_id::text = $2::text
         AND (status IS NULL OR status != 'cancelled')
       ORDER BY created_at DESC
       LIMIT 1`,
      [quotationId, String(tenant_id)]
    );

    let salesOrder;
    if (existingSoRes.rows.length > 0) {
      salesOrder = existingSoRes.rows[0];
    } else {
      // Convert quotation to sales order atomically using the SAME database client
      salesOrder = await SalesOrderService.convertQuotationToSalesOrder(
        tenant_id,
        branchId || quo.branch_id || null,
        quotationId,
        userId,
        client
      );
    }

    // 5. Idempotency Check: check if active invoice already exists for this sales_order_id
    const existingInvRes = await client.query(
      `SELECT * FROM invoices
       WHERE sales_order_id::text = $1::text
         AND tenant_id::text = $2::text
         AND (status IS NULL OR status != 'cancelled')
       LIMIT 1`,
      [String(salesOrder.id), String(tenant_id)]
    );

    if (existingInvRes.rows.length > 0) {
      // Mark quotation as invoiced if not already
      await client.query(
        `UPDATE quotations SET status = 'invoiced', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND tenant_id::text = $2::text`,
        [quotationId, String(tenant_id)]
      );

      await client.query('COMMIT');
      return {
        ...existingInvRes.rows[0],
        _alreadyConverted: true,
        _alreadyExists: true
      };
    }

    // 6. Convert Sales Order to Invoice atomically using the SAME database client
    const invoice = await exports.convertSalesOrderToInvoice(salesOrder.id, tenant_id, client);

    // 7. Update Quotation Status to 'invoiced'
    await client.query(
      `UPDATE quotations SET status = 'invoiced', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id::text = $2::text`,
      [quotationId, String(tenant_id)]
    );

    await client.query('COMMIT');
    return invoice;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Converts a Sales Order into an Invoice
 * @param {number} salesOrderId
 * @param {string} tenant_id
 * @returns {Promise<object>} The new or existing invoice
 */
exports.convertSalesOrderToInvoice = async (salesOrderId, tenant_id, clientOverride = null) => {
  const { ensureInvoicesTable, generateInvoiceNumber } = require('../controllers/financeController');
  if (!clientOverride) {
    await ensureInvoicesTable();
  }

  const isExternalClient = !!clientOverride;
  const client = clientOverride || (db.connect ? await db.connect() : await db.pool.connect());

  try {
    if (!isExternalClient) {
      await client.query('BEGIN');
    }

    // 1. FOR UPDATE lock on the Sales Order scoped to tenant
    const soRes = await client.query(
      `SELECT * FROM sales_orders
       WHERE id = $1 AND tenant_id::text = $2::text
       FOR UPDATE`,
      [salesOrderId, String(tenant_id)]
    );
    if (soRes.rows.length === 0) {
      throw new Error('Sales Order not found or unauthorized');
    }

    const so = soRes.rows[0];

    // 2. Idempotency Check: look for existing active invoice linked to this sales_order_id
    const existingInvRes = await client.query(
      `SELECT * FROM invoices
       WHERE sales_order_id::text = $1::text
         AND tenant_id::text = $2::text
         AND (status IS NULL OR status != 'cancelled')
       LIMIT 1`,
      [String(salesOrderId), String(tenant_id)]
    );

    if (existingInvRes.rows.length > 0) {
      await client.query('COMMIT');
      return {
        ...existingInvRes.rows[0],
        _alreadyExists: true
      };
    }

    // 3. Lock and retrieve Sales Order Items
    const itemsRes = await client.query(
      `SELECT * FROM sales_order_items
       WHERE sales_order_id = $1 AND tenant_id::text = $2::text
       ORDER BY id ASC
       FOR UPDATE`,
      [salesOrderId, String(tenant_id)]
    );

    // Progressive quantity verification: Ensure items exist and have remaining uninvoiced quantity
    let totalInvoiceAmount = 0;
    const itemsToInvoice = [];

    for (const item of itemsRes.rows) {
      const orderQty = parseFloat(item.quantity) || 0;
      const currentInvoiced = parseFloat(item.quantity_invoiced) || 0;
      const remainingQty = Math.max(0, orderQty - currentInvoiced);

      if (remainingQty > 0) {
        const unitPrice = parseFloat(item.unit_price) || 0;
        const lineSubtotal = remainingQty * unitPrice;
        totalInvoiceAmount += lineSubtotal;

        itemsToInvoice.push({
          itemId: item.id,
          productId: item.product_id,
          description: item.description,
          invoiceQty: remainingQty,
          unitPrice: unitPrice,
          subtotal: lineSubtotal,
          newInvoicedTotal: currentInvoiced + remainingQty
        });
      }
    }

    // If order had items but all were already invoiced
    if (itemsRes.rows.length > 0 && itemsToInvoice.length === 0) {
      throw new Error('All items for this Sales Order have already been fully invoiced.');
    }

    // 4. Generate deterministic, collision-free invoice number
    const invoiceNumber = await generateInvoiceNumber(tenant_id, so.branch_id, client);

    // 5. Insert Invoice Header with sales_order_id
    const finalAmount = itemsToInvoice.length > 0 ? totalInvoiceAmount : (parseFloat(so.total_amount) || 0);
    const invoiceNotes = `Generated from Sales Order #${so.order_number || so.number || so.id}. ${so.notes || ''}`.trim();

    const invRes = await client.query(
      `INSERT INTO invoices (
        client_id, customer_id, invoice_number, total_amount, due_date, status,
        notes, tenant_id, branch_id, deal_id, quotation_id, sales_order_id
      ) VALUES ($1, $2, $3, $4, CURRENT_DATE + INTERVAL '15 days', 'unpaid', $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        so.customer_id,
        so.customer_id,
        invoiceNumber,
        finalAmount,
        invoiceNotes,
        String(tenant_id),
        so.branch_id || null,
        so.deal_id || null,
        so.quotation_id || null,
        String(salesOrderId)
      ]
    );

    const invoice = invRes.rows[0];

    // 6. Copy Sales Order Items to Invoice Items and update quantity_invoiced progressively
    for (const itemData of itemsToInvoice) {
      await client.query(
        `INSERT INTO invoice_items (
          invoice_id, product_id, description, quantity, unit_price, subtotal, tenant_id, branch_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          invoice.id,
          itemData.productId || null,
          itemData.description || null,
          itemData.invoiceQty,
          itemData.unitPrice,
          itemData.subtotal,
          String(tenant_id),
          so.branch_id || null
        ]
      );

      // Progressive increment: quantity_invoiced += invoiceQty
      await client.query(
        `UPDATE sales_order_items
         SET quantity_invoiced = $1
         WHERE id = $2 AND tenant_id::text = $3::text`,
        [itemData.newInvoicedTotal, itemData.itemId, String(tenant_id)]
      );
    }

    // 7. Update Sales Order status
    // If delivery has already occurred, status remains 'delivered' or progresses to 'invoiced'
    const newSoStatus = so.status === 'delivered' ? 'delivered' : 'invoiced';
    await client.query(
      `UPDATE sales_orders
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id::text = $3::text`,
      [newSoStatus, salesOrderId, String(tenant_id)]
    );

    if (!isExternalClient) {
      await client.query('COMMIT');
    }
    return invoice;
  } catch (err) {
    if (!isExternalClient) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    throw err;
  } finally {
    if (!isExternalClient) {
      client.release();
    }
  }
};


/**
 * Converts a Deal into an Invoice
 * @param {number} dealId
 * @param {string} tenant_id
 * @returns {Promise<object>} The new invoice
 */
exports.convertDealToInvoice = async (dealId, tenant_id) => {
  // 1. Get deal details with unit metadata if applicable, locking the deal row
  const dealResult = await db.query(`
    SELECT d.*, c.name as client_name,
           u.project_name, u.unit_number, u.floor, u.area, u.type as unit_type
    FROM deals d
    JOIN customers c ON d.client_id = c.id
    LEFT JOIN re_units u ON d.unit_id = u.id
    WHERE d.id = $1 AND d.tenant_id = $2
    FOR UPDATE OF d
  `, [dealId, tenant_id]);

  if (dealResult.rows.length === 0) throw new Error('Deal not found or unauthorized');
  const deal = dealResult.rows[0];

  // Idempotency check: Return existing active invoice for this deal if one already exists
  const existingInv = await db.query(
    `SELECT * FROM invoices
     WHERE deal_id::text = $1::text
       AND tenant_id::text = $2::text
       AND (status IS NULL OR status != 'cancelled')
     LIMIT 1`,
    [deal.id, tenant_id]
  );

  if (existingInv.rows.length > 0) {
    return {
      ...existingInv.rows[0],
      _alreadyExists: true
    };
  }

  // 2. Construct Premium Description for Real Estate
  let invoiceNotes = `Generated from Deal: ${deal.title}`;
  if (deal.unit_id) {
    invoiceNotes = `🏢 ${deal.project_name}\nUnit #${deal.unit_number} — ${deal.unit_type}\nFloor ${deal.floor} • ${deal.area}m²`;
  }

  // 3. Create Invoice with tenant context
  const invoiceNumber = `INV-${Date.now()}`;
  const invoiceResult = await db.query(
    'INSERT INTO invoices (invoice_number, client_id, total_amount, due_date, status, notes, tenant_id, branch_id, deal_id) VALUES ($1, $2, $3, CURRENT_DATE + INTERVAL \'15 days\', \'unpaid\', $4, $5, $6, $7) RETURNING *',
    [invoiceNumber, deal.client_id, deal.value, invoiceNotes, tenant_id, deal.branch_id, deal.id]
  );

  const invoice = invoiceResult.rows[0];

  // 4. Update Deal Stage with isolation
  await db.query("UPDATE deals SET pipeline_stage = 'won' WHERE id = $1 AND tenant_id = $2", [dealId, tenant_id]);

  return invoice;
};

/**
 * Checks for expired quotations and updates their status per tenant (if triggered)
 * @param {string} tenant_id Optional
 */
exports.checkExpiredQuotations = async (tenant_id = null) => {
  let query = "UPDATE quotations SET status = 'expired' WHERE status IN ('draft', 'sent') AND expiry_date < CURRENT_TIMESTAMP";
  const params = [];

  if (tenant_id) {
    query += " AND tenant_id = $1";
    params.push(tenant_id);
  }

  const result = await db.query(query + " RETURNING id", params);
  return result.rows;
};
