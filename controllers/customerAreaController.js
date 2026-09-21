const db = require('../config/db');

// Ensure customer_areas table exists with tenant isolation
let tableEnsured = false;
async function ensureAreasTable() {
  if (tableEnsured) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS customer_areas (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        color VARCHAR(30) DEFAULT '#0ea5e9',
        description TEXT,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_customer_areas_tenant ON customer_areas(tenant_id);
    `);
    await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS area_id INTEGER;`);
    tableEnsured = true;
  } catch (err) {
    console.error('[CustomerAreas] Table guard error:', err.message);
  }
}

// @desc    Get all customer areas for tenant
// @route   GET /api/customer-areas
// @access  Private
exports.getAreas = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    await ensureAreasTable();
    const result = await db.query(
      `SELECT 
        ca.*,
        (SELECT COUNT(*) FROM customers c WHERE c.area_id = ca.id AND c.tenant_id::text = $1::text) as customers_count
       FROM customer_areas ca
       WHERE ca.tenant_id::text = $1::text 
       ORDER BY ca.name ASC`,
      [tenant_id]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[CustomerAreas GET Error]:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch customer areas' });
  }
};

// @desc    Create new customer area
// @route   POST /api/customer-areas
// @access  Private
exports.createArea = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { name, color, description } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ status: 'error', message: 'Area name is required.' });
  }

  try {
    await ensureAreasTable();
    const result = await db.query(
      `INSERT INTO customer_areas (name, color, description, tenant_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), color || '#0ea5e9', description || null, tenant_id]
    );
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[CustomerAreas CREATE Error]:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Update customer area
// @route   PUT /api/customer-areas/:id
// @access  Private
exports.updateArea = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { name, color, description } = req.body;

  try {
    await ensureAreasTable();
    const result = await db.query(
      `UPDATE customer_areas
       SET name = COALESCE($1, name),
           color = COALESCE($2, color),
           description = COALESCE($3, description)
       WHERE id = $4 AND tenant_id::text = $5::text
       RETURNING *`,
      [name ? name.trim() : null, color || null, description !== undefined ? description : null, req.params.id, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Area not found or unauthorized' });
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[CustomerAreas UPDATE Error]:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Delete customer area
// @route   DELETE /api/customer-areas/:id
// @access  Private
exports.deleteArea = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    await ensureAreasTable();
    // 1. Unset area from any customers referencing it so they aren't deleted
    await db.query(
      `UPDATE customers SET area_id = NULL WHERE area_id = $1 AND tenant_id::text = $2::text`,
      [req.params.id, tenant_id]
    );

    // 2. Delete the area
    const result = await db.query(
      `DELETE FROM customer_areas WHERE id = $1 AND tenant_id::text = $2::text RETURNING *`,
      [req.params.id, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Area not found or unauthorized' });
    }

    res.json({ status: 'success', message: 'Area deleted successfully' });
  } catch (err) {
    console.error('[CustomerAreas DELETE Error]:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};
