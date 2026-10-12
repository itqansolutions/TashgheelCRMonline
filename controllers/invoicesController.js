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
    const invoice = await salesService.convertQuotationToInvoice(req.params.quotationId, tenant_id, {
      userId: req.user.id,
      branchId: req.branchId || null
    });
    
    // Log Billing Event
    logAction({ req, action: ACTIONS.BILLING, entityType: 'Invoice', entityId: invoice.id, details: { source: 'quotation', sourceId: req.params.quotationId } });

    const statusCode = invoice && (invoice._alreadyConverted || invoice._alreadyExists) ? 200 : 201;
    res.status(statusCode).json({ status: 'success', data: invoice });
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

    if (invoice._alreadyExists) {
      const { _alreadyExists, ...cleanInvoice } = invoice;
      return res.status(200).json({
        status: 'success',
        message: 'Invoice already exists for this deal',
        data: cleanInvoice
      });
    }

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
  const { amount, payment_method, notes, treasury_account_id } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;

  try {
    const { recordPaymentInternal } = require('./financeController');
    const result = await recordPaymentInternal({
      tenant_id,
      branch_id,
      invoice_id: req.params.id,
      amount,
      payment_method,
      notes,
      user_id: req.user.id,
      req,
      treasury_account_id
    });

    // Post-commit side effects: isolated so notification errors don't fail response
    try {
      notificationService.notifyRole({
        role: 'manager',
        type: 'success',
        title: 'Payment Received',
        message: `Payment of ${amount} recorded for invoice`,
        tenant_id: tenant_id,
        branch_id: branch_id,
        link: '/accounting'
      });
    } catch (postErr) {
      console.warn('[invoicesController.addPayment] Post-commit notification notice:', postErr.message);
    }

    return res.json({
      status: 'success',
      data: result.payment,
      invoiceStatus: result.newStatus,
      voucher: result.voucher
    });
  } catch (err) {
    console.error('[invoicesController.addPayment Error]', err.message);
    const statusCode = err.status || ((err.message && (
      err.message.includes('exceeds remaining') ||
      err.message.includes('not found') ||
      err.message.includes('unauthorized') ||
      err.message.includes('treasury') ||
      err.message.includes('greater than zero') ||
      err.message.includes('positive') ||
      err.message.includes('Invalid')
    )) ? 400 : 500);
    return res.status(statusCode).json({ status: 'error', message: err.message || 'Server error' });
  }
};

// @desc    Delete invoice
// @route   DELETE /api/invoices/:id
// @access  Private
exports.deleteInvoice = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    // 1. Verify invoice exists under this tenant
    const invRes = await db.query(
      'SELECT id, invoice_number FROM invoices WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text',
      [req.params.id, tenant_id, branch_id]
    );
    if (invRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Invoice not found or unauthorized' });
    }

    // 2. Financial Integrity Guard: reject deletion if active payments or vouchers exist
    const paymentsCheck = await db.query(
      `SELECT COUNT(*)::int as count FROM payments 
       WHERE invoice_id = $1 AND tenant_id::text = $2::text AND (status IS NULL OR status != 'cancelled')`,
      [req.params.id, tenant_id]
    );
    if (paymentsCheck.rows[0].count > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete invoice with existing payment records. Cancel payments or vouchers first.'
      });
    }

    try {
      const vouchersCheck = await db.query(
        `SELECT COUNT(*)::int as count FROM finance_vouchers 
         WHERE invoice_id = $1 AND tenant_id::text = $2::text AND (status IS NULL OR status != 'cancelled')`,
        [req.params.id, tenant_id]
      );
      if (vouchersCheck.rows[0].count > 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot delete invoice linked to active financial vouchers. Cancel vouchers first.'
        });
      }
    } catch (_) {
      // finance_vouchers table or column may not exist in pre-migration state
    }

    const result = await db.query(
      'DELETE FROM invoices WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text RETURNING *',
      [req.params.id, tenant_id, branch_id]
    );
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
