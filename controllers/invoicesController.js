const db = require('../config/db');
const salesService = require('../services/salesService');

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Private
exports.getInvoices = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM invoices ORDER BY created_at DESC');
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
  try {
    const result = await db.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Invoice not found' });
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
    const invoice = await salesService.convertQuotationToInvoice(req.params.quotationId);
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
  try {
    // 1. Insert Payment
    const paymentResult = await db.query(
      'INSERT INTO payments (invoice_id, amount, payment_method, notes) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.id, amount, payment_method, notes]
    );
    
    const payment = paymentResult.rows[0];

    // 2. Check totals and update invoice status
    const invoiceResult = await db.query('SELECT total_amount FROM invoices WHERE id = $1', [req.params.id]);
    const paymentsResult = await db.query('SELECT SUM(amount) as paid FROM payments WHERE invoice_id = $1', [req.params.id]);
    
    const total = invoiceResult.rows[0].total_amount;
    const paid = parseFloat(paymentsResult.rows[0].paid || 0);

    let status = 'partial';
    if (paid >= total) status = 'paid';

    await db.query('UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, req.params.id]);

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
  try {
    const result = await db.query('DELETE FROM invoices WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Invoice not found' });
    }
    res.json({ status: 'success', message: 'Invoice deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
