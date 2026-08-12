/**
 * closingController.js — Period Closing & Assets API Controller
 */

const PeriodClosingService = require('../src/domains/accounting/PeriodClosingService');
const FixedAssetService = require('../src/domains/accounting/FixedAssetService');

// POST /api/erp/closing/month-end
exports.monthEndClosing = async (req, res) => {
  const { period_id } = req.body;
  if (!period_id) return res.status(400).json({ status: 'error', message: 'period_id is required.' });
  try {
    const data = await PeriodClosingService.performMonthEndClosing(req.user.tenant_id, period_id, req.user.id);
    res.json({ status: 'success', message: 'Month-End Closing completed successfully.', data });
  } catch (err) {
    console.error('[closingController] monthEndClosing error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// POST /api/erp/closing/year-end
exports.yearEndClosing = async (req, res) => {
  const { fiscal_year_id } = req.body;
  if (!fiscal_year_id) return res.status(400).json({ status: 'error', message: 'fiscal_year_id is required.' });
  try {
    const data = await PeriodClosingService.performYearEndClosing(req.user.tenant_id, fiscal_year_id, req.user.id);
    res.json({ status: 'success', message: 'Year-End Closing completed and Retained Earnings posted.', data });
  } catch (err) {
    console.error('[closingController] yearEndClosing error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// ── FIXED ASSETS ──

exports.getFixedAssets = async (req, res) => {
  try {
    const data = await FixedAssetService.getFixedAssets(req.user.tenant_id);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[closingController] getFixedAssets error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createFixedAsset = async (req, res) => {
  try {
    const data = await FixedAssetService.createFixedAsset(req.user.tenant_id, req.branchId, req.body);
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    console.error('[closingController] createFixedAsset error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.runDepreciation = async (req, res) => {
  const { asset_id, period_date } = req.body;
  if (!asset_id) return res.status(400).json({ status: 'error', message: 'asset_id is required.' });
  try {
    const data = await FixedAssetService.runAssetDepreciation(req.user.tenant_id, asset_id, period_date, req.user.id);
    res.json({ status: 'success', message: 'Asset depreciation posted.', data });
  } catch (err) {
    console.error('[closingController] runDepreciation error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};
