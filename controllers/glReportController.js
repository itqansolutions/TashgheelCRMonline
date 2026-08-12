/**
 * glReportController.js — Financial Reports REST API Controller
 */

const GLReportService = require('../src/domains/accounting/GLReportService');

// GET /api/erp/reports/trial-balance
exports.getTrialBalance = async (req, res) => {
  const { start_date, end_date } = req.query;
  try {
    const data = await GLReportService.getTrialBalance(req.user.tenant_id, { startDate: start_date, endDate: end_date });
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[glReportController] getTrialBalance error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /api/erp/reports/balance-sheet
exports.getBalanceSheet = async (req, res) => {
  const { as_of_date } = req.query;
  try {
    const data = await GLReportService.getBalanceSheet(req.user.tenant_id, { asOfDate: as_of_date });
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[glReportController] getBalanceSheet error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /api/erp/reports/income-statement
exports.getIncomeStatement = async (req, res) => {
  const { start_date, end_date } = req.query;
  try {
    const data = await GLReportService.getIncomeStatement(req.user.tenant_id, { startDate: start_date, endDate: end_date });
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[glReportController] getIncomeStatement error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /api/erp/reports/ar-aging
exports.getARAging = async (req, res) => {
  try {
    const data = await GLReportService.getARAging(req.user.tenant_id);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[glReportController] getARAging error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};
