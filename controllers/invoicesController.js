const db = require('../config/db');
const salesService = require('../services/salesService');
const { sendNotification, notifyAdmins } = require('../services/notificationService');
const { logAction, logDelete, ACTIONS } = require('../services/loggerService');

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Private
exports.getInvoices = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(`
      SELECT i.*, c.name as client_name 
      FROM invoices i
      LEFT JOIN customers c ON i.client_id = c.id
      WHERE i.tenant_id::text = $1::text
      ORDER BY i.created_at DESC
    `, [tenant_id]);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get single invoice
// @route   GET /api/invoices/:id
// @access  Private
exports.getInvoiceById = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(`
      SELECT i.*, c.name as client_name 
      FROM invoices i
      LEFT JOIN customers c ON i.client_id = c.id
      WHERE i.id = $1 AND i.tenant_id::text = $2::text
    `, [req.params.id, tenant_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Invoice not found or unauthorized' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create invoice from quotation
// @route   POST /api/invoices/from-quotation/:quotationId
// @access  Private
exports.createInvoiceFromQuotation = async (req, res) => {
  try {
    // Note: salesService handles the creation logic, ensuring it inherits tenant_id
    const invoice = await salesService.convertQuotationToInvoice(req.params.quotationId);
    
    // Log Billing Event
    logAction({ req, action: ACTIONS.BILLING, entityType: 'Invoice', entityId: invoice.id, details: { source: 'quotation', sourceId: req.params.quotationId } });

    res.status(201).json({ status: 'success', data: invoice });
  } catch (err) {
    console.error(err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// @desc    Create invoice from deal
// @route   POST /api/invoices/from-deal/:dealId
// @access  Private
exports.createInvoiceFromDeal = async (req, res) => {
  try {
    const invoice = await salesService.convertDealToInvoice(req.params.dealId);

    // Log Billing Event
    logAction({ req, action: ACTIONS.BILLING, entityType: 'Invoice', entityId: invoice.id, details: { source: 'deal', sourceId: req.params.dealId } });

    res.status(201).json({ status: 'success', data: invoice });
  } catch (err) {
    console.error(err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// @desc    Add Payment to Invoice
// @route   POST /api/invoices/:id/payments
// @access  Private
exports.addPayment = async (req, res) => {
  const { amount, payment_method, notes } = req.body;
  const tenant_id = req.user.tenant_id;
  try {
    // 1. Verify invoice ownership
    const invoiceResult = await db.query('SELECT invoice_number, total_amount FROM invoices WHERE id = $1 AND tenant_id::text = $2::text', [req.params.id, tenant_id]);
    if (invoiceResult.rows.length === 0) {
       return res.status(404).json({ status: 'error', message: 'Invoice not found or unauthorized' });
    }
    const { invoice_number } = invoiceResult.rows[0];

    // 2. Insert Payment with tenant isolation
    const paymentResult = await db.query(
      'INSERT INTO payments (invoice_id, amount, payment_method, notes, tenant_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.params.id, amount, payment_method, notes, tenant_id]
    );
    
    const payment = paymentResult.rows[0];

    // 3. Update invoice status
    const paymentsResult = await db.query('SELECT SUM(amount) as paid FROM payments WHERE invoice_id = $1 AND tenant_id::text = $2::text', [req.params.id, tenant_id]);
    
    const total = invoiceResult.rows[0].total_amount;
    const paid = parseFloat(paymentsResult.rows[0].paid || 0);

    let status = 'partial';
    if (paid >= total) status = 'paid';

    await db.query('UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id::text = $3::text', [status, req.params.id, tenant_id]);

    // Log Payment Event
    logAction({ req, action: ACTIONS.PAYMENT, entityType: 'Invoice', entityId: req.params.id, details: { amount, method: payment_method } });

    // Trigger Notification for Admins
    notifyAdmins(tenant_id, {
        type: 'success',
        title: 'Payment Received',
        message: `Payment of ${amount} recorded for ${invoice_number}`,
        link: '/accounting'
    });

    res.json({ status: 'success', data: payment, invoiceStatus: status });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete invoice
// @route   DELETE /api/invoices/:id
// @access  Private
exports.deleteInvoice = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query('DELETE FROM invoices WHERE id = $1 AND tenant_id::text = $2::text RETURNING *', [req.params.id, tenant_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Invoice not found or unauthorized' });
    }

    // Log Deletion
    logDelete(req, 'Invoice', req.params.id, { invoice_number: result.rows[0].invoice_number });

    res.json({ status: 'success', message: 'Invoice deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
