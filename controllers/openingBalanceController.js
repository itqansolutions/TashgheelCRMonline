/**
 * openingBalanceController.js — Opening Balances API Controller
 */

const OpeningBalanceService = require('../src/domains/accounting/OpeningBalanceService');

// GET /api/erp/opening-balances?fiscal_year_id=...
exports.getOpeningBalances = async (req, res) => {
  const { fiscal_year_id } = req.query;
  if (!fiscal_year_id) {
    return res.status(400).json({ status: 'error', message: 'fiscal_year_id is required.' });
  }
  try {
    const data = await OpeningBalanceService.getOpeningBalances(req.user.tenant_id, fiscal_year_id);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[openingBalanceController] getOpeningBalances error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /api/erp/opening-balances/gl
exports.setGLOpeningBalance = async (req, res) => {
  try {
    const data = await OpeningBalanceService.setGLOpeningBalance(req.user.tenant_id, req.body);
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    console.error('[openingBalanceController] setGLOpeningBalance error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// POST /api/erp/opening-balances/customer-invoices
exports.addCustomerInvoice = async (req, res) => {
  try {
    const data = await OpeningBalanceService.addOpeningCustomerInvoice(req.user.tenant_id, req.body);
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    console.error('[openingBalanceController] addCustomerInvoice error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// POST /api/erp/opening-balances/supplier-invoices
exports.addSupplierInvoice = async (req, res) => {
  try {
    const data = await OpeningBalanceService.addOpeningSupplierInvoice(req.user.tenant_id, req.body);
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    console.error('[openingBalanceController] addSupplierInvoice error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// POST /api/erp/opening-balances/inventory
exports.addInventoryLine = async (req, res) => {
  try {
    const data = await OpeningBalanceService.addOpeningInventoryLine(req.user.tenant_id, req.body);
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    console.error('[openingBalanceController] addInventoryLine error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// POST /api/erp/opening-balances/post
exports.postOpeningBalances = async (req, res) => {
  const { fiscal_year_id } = req.body;
  if (!fiscal_year_id) {
    return res.status(400).json({ status: 'error', message: 'fiscal_year_id is required.' });
  }
  try {
    const result = await OpeningBalanceService.validateAndPostOpeningInventory(
      req.user.tenant_id,
      fiscal_year_id,
      req.user.id
    );
    res.json({ status: 'success', message: 'Opening balances reconciled and posted successfully.', data: result });
  } catch (err) {
    console.error('[openingBalanceController] postOpeningBalances error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};
