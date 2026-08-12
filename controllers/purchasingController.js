/**
 * purchasingController.js — ERP Purchasing Cycle REST API Controller
 */

const PurchasingService = require('../src/domains/purchasing/PurchasingService');

// ── SUPPLIERS ──

exports.getSuppliers = async (req, res) => {
  try {
    const data = await PurchasingService.getSuppliers(req.user.tenant_id);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[purchasingController] getSuppliers error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createSupplier = async (req, res) => {
  try {
    const data = await PurchasingService.createSupplier(req.user.tenant_id, req.branchId, req.body);
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    console.error('[purchasingController] createSupplier error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// ── PURCHASE ORDERS ──

exports.getPurchaseOrders = async (req, res) => {
  try {
    const data = await PurchasingService.getPurchaseOrders(req.user.tenant_id, req.branchId);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[purchasingController] getPurchaseOrders error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createPurchaseOrder = async (req, res) => {
  try {
    const data = await PurchasingService.createPurchaseOrder(req.user.tenant_id, req.branchId, req.body, req.user.id);
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    console.error('[purchasingController] createPurchaseOrder error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// ── GOODS RECEIPTS (GRN) ──

exports.createGoodsReceipt = async (req, res) => {
  try {
    const data = await PurchasingService.createGoodsReceipt(req.user.tenant_id, req.branchId, req.body, req.user.id);
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    console.error('[purchasingController] createGoodsReceipt error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.approveGoodsReceipt = async (req, res) => {
  try {
    const data = await PurchasingService.approveGoodsReceipt(req.user.tenant_id, req.branchId, req.params.id, req.user.id);
    res.json({ status: 'success', message: 'Goods Receipt approved, stock updated, and GRNI journal posted.', data });
  } catch (err) {
    console.error('[purchasingController] approveGoodsReceipt error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// ── SUPPLIER INVOICES (AP) ──

exports.createSupplierInvoice = async (req, res) => {
  try {
    const data = await PurchasingService.createSupplierInvoice(req.user.tenant_id, req.branchId, req.body, req.user.id);
    res.status(201).json({ status: 'success', message: 'Supplier Invoice created and AP journal posted.', data });
  } catch (err) {
    console.error('[purchasingController] createSupplierInvoice error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};
