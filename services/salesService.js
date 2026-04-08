const db = require('../config/db');

/**
 * Converts a Quotation into an Invoice
 * @param {number} quotationId 
 * @returns {Promise<object>} The new invoice
 */
exports.convertQuotationToInvoice = async (quotationId) => {
  // 1. Get quotation details
  const quoteResult = await db.query('SELECT * FROM quotations WHERE id = $1', [quotationId]);
  if (quoteResult.rows.length === 0) throw new Error('Quotation not found');
  
  const quotation = quoteResult.rows[0];
  if (quotation.status !== 'approved') throw new Error('Quotation must be approved before invoicing');

  // 2. Create Invoice
  const invoiceNumber = `INV-${Date.now()}`;
  const invoiceResult = await db.query(
    'INSERT INTO invoices (quotation_id, invoice_number, total_amount, due_date, status) VALUES ($1, $2, $3, CURRENT_DATE + INTERVAL \'15 days\', \'unpaid\') RETURNING *',
    [quotationId, invoiceNumber, quotation.total_amount]
  );
  
  const invoice = invoiceResult.rows[0];

  // 3. (Optional) Copy items - assuming invoice_items is where we track specific product entries
  // For now, let's assume the quotation itself has its own item listing logic or we link via the quoteId.
  // In a full implementation, we'd loop through quote items and insert into invoice_items.

  // 4. Update Quotation Status
  await db.query('UPDATE quotations SET status = $1 WHERE id = $2', ['invoiced', quotationId]);

  return invoice;
};

/**
 * Converts a Deal into an Invoice
 * @param {number} dealId 
 * @returns {Promise<object>} The new invoice
 */
exports.convertDealToInvoice = async (dealId) => {
  // 1. Get deal details
  const dealResult = await db.query(`
    SELECT d.*, c.name as client_name 
    FROM deals d
    JOIN customers c ON d.client_id = c.id
    WHERE d.id = $1
  `, [dealId]);
  
  if (dealResult.rows.length === 0) throw new Error('Deal not found');
  const deal = dealResult.rows[0];

  // 2. Create Invoice
  const invoiceNumber = `INV-${Date.now()}`;
  const invoiceResult = await db.query(
    'INSERT INTO invoices (invoice_number, client_id, total_amount, due_date, status, notes) VALUES ($1, $2, $3, CURRENT_DATE + INTERVAL \'15 days\', \'unpaid\', $4) RETURNING *',
    [invoiceNumber, deal.client_id, deal.value, `Generated from Deal: ${deal.title}`]
  );
  
  const invoice = invoiceResult.rows[0];

  // 3. Update Deal Stage (optional, set to won if helpful)
  await db.query("UPDATE deals SET pipeline_stage = 'won' WHERE id = $1", [dealId]);

  return invoice;
};

/**
 * Checks for expired quotations and updates their status
 */
exports.checkExpiredQuotations = async () => {
  const result = await db.query(
    "UPDATE quotations SET status = 'expired' WHERE status IN ('draft', 'sent') AND expiry_date < CURRENT_TIMESTAMP RETURNING id"
  );
  return result.rows;
};
