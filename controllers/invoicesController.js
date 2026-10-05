const db = require('../config/db');
const salesService = require('../services/salesService');
const notificationService = require('../services/notificationService');
const { logAction, logDelete, ACTIONS } = require('../services/loggerService');

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Private
exports.getInvoices = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(`
      SELECT i.*, c.name as client_name 
      FROM invoices i
      LEFT JOIN customers c ON i.client_id::text = c.id::text AND i.tenant_id::text = c.tenant_id::text
      WHERE i.tenant_id::text = $1::text AND i.branch_id::text = $2::text
      ORDER BY i.created_at DESC
    `, [tenant_id, branch_id]);
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
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(`
      SELECT i.*, c.name as client_name 
      FROM invoices i
      LEFT JOIN customers c ON i.client_id::text = c.id::text AND i.tenant_id::text = c.tenant_id::text
      WHERE i.id = $1 AND i.tenant_id::text = $2::text AND i.branch_id::text = $3::text
    `, [req.params.id, tenant_id, branch_id]);
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
  const tenant_id = req.user.tenant_id;
  try {
    const invoice = await salesService.convertQuotationToInvoice(req.params.quotationId, tenant_id);
    
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
  const tenant_id = req.user.tenant_id;
  try {
    const invoice = await salesService.convertDealToInvoice(req.params.dealId, tenant_id);

    // Log Billing Event
    logAction({ req, action: ACTIONS.BILLING, entityType: 'Invoice', entityId: invoice.id, details: { source: 'deal', sourceId: req.params.dealId } });

    res.status(201).json({ status: 'success', data: invoice });
  } catch (err) {
    console.error(err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// @desc    Create invoice from sales order
// @route   POST /api/invoices/from-sales-order/:orderId
// @access  Private
exports.createInvoiceFromSalesOrder = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const invoice = await salesService.convertSalesOrderToInvoice(req.params.orderId, tenant_id);

    // Log Billing Event
    logAction({ req, action: ACTIONS.BILLING, entityType: 'Invoice', entityId: invoice.id, details: { source: 'sales_order', sourceId: req.params.orderId } });

    res.status(201).json({ status: 'success', message: 'Invoice created successfully from Sales Order', data: invoice });
  } catch (err) {
    console.error('[createInvoiceFromSalesOrder]', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// @desc    Add Payment to Invoice
// @route   POST /api/invoices/:id/payments
// @access  Private
exports.addPayment = async (req, res) => {
  const { amount, payment_method, notes } = req.body;
  const payAmount = parseFloat(amount);
  if (!payAmount || isNaN(payAmount) || payAmount <= 0) {
    return res.status(400).json({ status: 'error', message: 'Payment amount must be greater than 0' });
  }

  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;

  const client = db.connect ? await db.connect() : await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify invoice ownership with FOR UPDATE row lock
    const invoiceResult = await client.query(
      `SELECT id, invoice_number, total_amount, client_id, branch_id 
       FROM invoices 
       WHERE id = $1 AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL) 
       FOR UPDATE`,
      [req.params.id, tenant_id, branch_id]
    );

    if (invoiceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Invoice not found or unauthorized' });
    }

    const inv = invoiceResult.rows[0];
    const invoice_number = inv.invoice_number;
    const invBranchId = branch_id || inv.branch_id || null;
    const total = parseFloat(inv.total_amount) || 0;

    // 2. Compute existing paid amount & prevent overpayment
    const paymentsResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as paid 
       FROM payments 
       WHERE invoice_id = $1 AND tenant_id::text = $2::text AND (COALESCE(status, 'active') != 'cancelled')`,
      [req.params.id, tenant_id]
    );
    const existingPaid = parseFloat(paymentsResult.rows?.[0]?.paid || 0);
    const remaining = Number(Math.max(0, total - existingPaid).toFixed(2));

    if (payAmount > (remaining + 0.001)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: `Payment amount (${payAmount}) exceeds remaining invoice balance (${remaining}). Overpayment is not allowed.`
      });
    }

    // 3. Auto-generate sequential receipt voucher number (concurrency safe, advisory locked)
    const { generateVoucherNumber } = require('../services/voucherNumbering');
    const voucherNumber = await generateVoucherNumber(tenant_id, invBranchId, 'receipt', client);

    // 4. Resolve real customer name (tenant-scoped)
    let partyName = 'عميل';
    if (inv.client_id) {
      const custRes = await client.query(
        'SELECT name FROM customers WHERE id::text = $1::text AND tenant_id::text = $2::text',
        [String(inv.client_id), tenant_id]
      );
      if (custRes.rows.length > 0 && custRes.rows[0].name) {
        partyName = custRes.rows[0].name;
      }
    }

    // 5. Create finance_vouchers row
    const voucherRes = await client.query(
      `INSERT INTO finance_vouchers (
        voucher_number, voucher_type, party_type, party_name, customer_id, invoice_id,
        amount, payment_method, notes, voucher_date, created_by, tenant_id, branch_id, status
      ) VALUES ($1, 'receipt', 'customer', $2, $3, $4, $5, $6, $7, CURRENT_DATE, $8, $9, $10, 'active')
      RETURNING id, voucher_number`,
      [
        voucherNumber,
        partyName,
        inv.client_id ? String(inv.client_id) : null,
        req.params.id,
        payAmount,
        payment_method || 'cash',
        notes ? `${notes} (سداد فاتورة ${invoice_number})` : `سداد فاتورة رقم ${invoice_number}`,
        req.user.id,
        tenant_id,
        invBranchId ? String(invBranchId) : null
      ]
    );
    const createdVoucher = voucherRes.rows[0];

    // 5. Insert Payment linked to the voucher
    const paymentResult = await client.query(
      `INSERT INTO payments (invoice_id, amount, payment_method, notes, tenant_id, branch_id, voucher_id, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active') 
       RETURNING *`,
      [req.params.id, payAmount, payment_method || 'cash', notes, tenant_id, invBranchId, createdVoucher.id]
    );
    const payment = paymentResult.rows[0];

    // 6. Update invoice status
    const newPaid = Number((existingPaid + payAmount).toFixed(2));
    let status = 'partial';
    if (newPaid >= (total - 0.01)) status = 'paid';
    else if (newPaid <= 0) status = 'unpaid';

    await client.query(
      `UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id::text = $3::text`,
      [status, req.params.id, tenant_id]
    );

    await client.query('COMMIT');

    // Post-commit side effects: isolated so notification/logging errors don't fail response
    try {
      logAction({ req, action: ACTIONS.PAYMENT, entityType: 'Invoice', entityId: req.params.id, details: { amount: payAmount, method: payment_method } });

      notificationService.notifyRole({
        role: 'manager',
        type: 'success',
        title: 'Payment Received',
        message: `Payment of ${payAmount} recorded for ${invoice_number}`,
        tenant_id: tenant_id,
        branch_id: invBranchId,
        link: '/accounting'
      });
    } catch (postErr) {
      console.warn('[invoicesController.addPayment] Post-commit notification notice:', postErr.message);
    }

    return res.json({ status: 'success', data: payment, invoiceStatus: status });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[invoicesController.addPayment Error]', err.message);
    return res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  } finally {
    client.release();
  }
};

// @desc    Delete invoice
// @route   DELETE /api/invoices/:id
// @access  Private
exports.deleteInvoice = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query('DELETE FROM invoices WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text RETURNING *', [req.params.id, tenant_id, branch_id]);
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
