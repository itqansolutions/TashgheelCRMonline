/**
 * taxController.js — Tax Component API Controller
 */

const TaxEngine = require('../src/domains/accounting/TaxEngine');

// GET /api/erp/taxes
exports.getTaxComponents = async (req, res) => {
  try {
    const data = await TaxEngine.getTaxComponents(req.user.tenant_id);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[taxController] getTaxComponents error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /api/erp/taxes/calculate — preview tax calculation for line amounts
exports.calculateTaxes = async (req, res) => {
  const { line_amount, component_ids } = req.body;
  if (line_amount === undefined || line_amount === null) {
    return res.status(400).json({ status: 'error', message: 'line_amount is required.' });
  }
  try {
    const data = await TaxEngine.calculateLineTaxes(Number(line_amount), component_ids || [], req.user.tenant_id);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[taxController] calculateTaxes error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};
