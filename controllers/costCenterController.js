/**
 * costCenterController.js — Cost Center Management API Controller
 */

const db = require('../config/db');

// GET /api/erp/cost-centers
exports.getCostCenters = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(`
      SELECT c.*, p.name as parent_name, p.code as parent_code
      FROM cost_centers c
      LEFT JOIN cost_centers p ON c.parent_id = p.id
      WHERE c.tenant_id::text = $1::text
      ORDER BY c.code ASC
    `, [String(tenant_id)]);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[costCenterController] getCostCenters error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /api/erp/cost-centers
exports.createCostCenter = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  const { code, name, type, parent_id } = req.body;

  try {
    const result = await db.query(`
      INSERT INTO cost_centers (tenant_id, branch_id, code, name, type, parent_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [String(tenant_id), branch_id || null, code, name, type || 'department', parent_id || null]);

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[costCenterController] createCostCenter error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};
