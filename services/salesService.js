const db = require('../config/db');

/**
 * Converts a Quotation into an Invoice
 * @param {number} quotationId 
 * @param {string} tenant_id 
 * @returns {Promise<object>} The new invoice
 */
exports.convertQuotationToInvoice = async (quotationId, tenant_id) => {
  // 1. Get quotation details with isolation check
  const quoteResult = await db.query('SELECT * FROM quotations WHERE id = $1 AND tenant_id = $2', [quotationId, tenant_id]);
  if (quoteResult.rows.length === 0) throw new Error('Quotation not found or unauthorized');
  
  const quotation = quoteResult.rows[0];
  if (quotation.status !== 'approved') throw new Error('Quotation must be approved before invoicing');

  // 2. Create Invoice with tenant context
  const invoiceNumber = `INV-${Date.now()}`;
  const invoiceResult = await db.query(
    'INSERT INTO invoices (quotation_id, client_id, invoice_number, total_amount, due_date, status, tenant_id, branch_id, deal_id) VALUES ($1, $2, $3, $4, CURRENT_DATE + INTERVAL \'15 days\', \'unpaid\', $5, $6, $7) RETURNING *',
    [quotationId, quotation.client_id, invoiceNumber, quotation.total_amount, tenant_id, quotation.branch_id, quotation.deal_id || null]
  );
  
  const invoice = invoiceResult.rows[0];

  // 3. Update Quotation Status with isolation
  await db.query('UPDATE quotations SET status = $1 WHERE id = $2 AND tenant_id = $3', ['invoiced', quotationId, tenant_id]);

  return invoice;
};

/**
 * Converts a Sales Order into an Invoice
 * @param {number} salesOrderId 
 * @param {string} tenant_id 
 * @returns {Promise<object>} The new invoice
 */
exports.convertSalesOrderToInvoice = async (salesOrderId, tenant_id) => {
  const soRes = await db.query('SELECT * FROM sales_orders WHERE id = $1 AND tenant_id::text = $2::text', [salesOrderId, String(tenant_id)]);
  if (soRes.rows.length === 0) throw new Error('Sales Order not found or unauthorized');

  const so = soRes.rows[0];

  const invoiceNumber = `INV-${Date.now()}`;
  const invRes = await db.query(
    `INSERT INTO invoices (client_id, invoice_number, total_amount, due_date, status, notes, tenant_id, branch_id, deal_id, quotation_id)
     VALUES ($1, $2, $3, CURRENT_DATE + INTERVAL '15 days', 'unpaid', $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      so.customer_id,
      invoiceNumber,
      so.total_amount || 0,
      `Generated from Sales Order #${so.order_number || so.number || so.id}. ${so.notes || ''}`.trim(),
      tenant_id,
      so.branch_id || null,
      so.deal_id || null,
      so.quotation_id || null
    ]
  );

  const invoice = invRes.rows[0];

  // Mark Sales Order status as invoiced if not delivered
  await db.query(`UPDATE sales_orders SET status = 'invoiced', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND tenant_id::text = $2::text`, [salesOrderId, String(tenant_id)]);

  return invoice;
};

/**
 * Converts a Deal into an Invoice
 * @param {number} dealId 
 * @param {string} tenant_id
 * @returns {Promise<object>} The new invoice
 */
exports.convertDealToInvoice = async (dealId, tenant_id) => {
  // 1. Get deal details with unit metadata if applicable
  const dealResult = await db.query(`
    SELECT d.*, c.name as client_name, 
           u.project_name, u.unit_number, u.floor, u.area, u.type as unit_type
    FROM deals d
    JOIN customers c ON d.client_id = c.id
    LEFT JOIN re_units u ON d.unit_id = u.id
    WHERE d.id = $1 AND d.tenant_id = $2
  `, [dealId, tenant_id]);
  
  if (dealResult.rows.length === 0) throw new Error('Deal not found or unauthorized');
  const deal = dealResult.rows[0];

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
