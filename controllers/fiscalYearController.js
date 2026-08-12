/**
 * fiscalYearController.js — Fiscal Year & Period Management API
 *
 * Routes:
 *   GET    /api/erp/fiscal-years           - list all fiscal years for tenant
 *   POST   /api/erp/fiscal-years           - create / ensure fiscal year for a date
 *   PUT    /api/erp/fiscal-periods/:id/close   - close a period
 *   PUT    /api/erp/fiscal-periods/:id/lock    - lock a period
 *   PUT    /api/erp/fiscal-periods/:id/reopen  - reopen a period (admin only)
 */

const FiscalYearService = require('../src/domains/accounting/FiscalYearService');
const db = require('../config/db');

// GET /api/erp/fiscal-years
exports.listFiscalYears = async (req, res) => {
  try {
    const data = await FiscalYearService.listFiscalYears(req.user.tenant_id);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[FiscalYear] listFiscalYears error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /api/erp/fiscal-years — ensure fiscal year exists for a date
exports.ensureFiscalYear = async (req, res) => {
  const { for_date } = req.body;
  try {
    const result = await FiscalYearService.ensureFiscalYear(db, req.user.tenant_id, for_date || new Date());
    res.json({ status: 'success', data: result });
  } catch (err) {
    console.error('[FiscalYear] ensureFiscalYear error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// PUT /api/erp/fiscal-periods/:id/close
exports.closePeriod = async (req, res) => {
  try {
    const period = await FiscalYearService.closePeriod(req.params.id, req.user.tenant_id, req.user.id);
    res.json({ status: 'success', message: `Period "${period.name}" closed.`, data: period });
  } catch (err) {
    console.error('[FiscalYear] closePeriod error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// PUT /api/erp/fiscal-periods/:id/lock
exports.lockPeriod = async (req, res) => {
  try {
    const period = await FiscalYearService.lockPeriod(req.params.id, req.user.tenant_id, req.user.id);
    res.json({ status: 'success', message: `Period "${period.name}" locked.`, data: period });
  } catch (err) {
    console.error('[FiscalYear] lockPeriod error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// PUT /api/erp/fiscal-periods/:id/reopen
exports.reopenPeriod = async (req, res) => {
  try {
    const period = await FiscalYearService.reopenPeriod(req.params.id, req.user.tenant_id, req.user.id);
    res.json({ status: 'success', message: `Period "${period.name}" reopened.`, data: period });
  } catch (err) {
    console.error('[FiscalYear] reopenPeriod error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};
