/**
 * salesController.js — ERP Sales Cycle REST API Controller
 */

const SalesOrderService = require('../src/domains/sales/SalesOrderService');
const DeliveryNoteService = require('../src/domains/sales/DeliveryNoteService');

// ── SALES ORDERS ──

exports.getSalesOrders = async (req, res) => {
  try {
    const data = await SalesOrderService.getSalesOrders(req.user.tenant_id, req.branchId);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[salesController] getSalesOrders error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createSalesOrder = async (req, res) => {
  try {
    const data = await SalesOrderService.createSalesOrder(req.user.tenant_id, req.branchId, req.body, req.user.id);
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    console.error('[salesController] createSalesOrder error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.confirmSalesOrder = async (req, res) => {
  try {
    const data = await SalesOrderService.confirmSalesOrder(req.user.tenant_id, req.params.id, req.user.id);
    res.json({ status: 'success', message: 'Sales Order confirmed.', data });
  } catch (err) {
    console.error('[salesController] confirmSalesOrder error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.convertQuotation = async (req, res) => {
  try {
    const data = await SalesOrderService.convertQuotationToSalesOrder(req.user.tenant_id, req.branchId, req.params.quotationId, req.user.id);
    res.status(201).json({ status: 'success', message: 'Quotation converted to Sales Order.', data });
  } catch (err) {
    console.error('[salesController] convertQuotation error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// ── DELIVERY NOTES ──

exports.getDeliveryNotes = async (req, res) => {
  try {
    const data = await DeliveryNoteService.getDeliveryNotes(req.user.tenant_id, req.branchId);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[salesController] getDeliveryNotes error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createDeliveryNote = async (req, res) => {
  try {
    const data = await DeliveryNoteService.createDeliveryNote(req.user.tenant_id, req.branchId, req.body, req.user.id);
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    console.error('[salesController] createDeliveryNote error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.confirmDeliveryNote = async (req, res) => {
  try {
    const data = await DeliveryNoteService.confirmDeliveryNote(req.user.tenant_id, req.branchId, req.params.id, req.user.id);
    res.json({ status: 'success', message: 'Delivery Note confirmed and COGS posted.', data });
  } catch (err) {
    console.error('[salesController] confirmDeliveryNote error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};
