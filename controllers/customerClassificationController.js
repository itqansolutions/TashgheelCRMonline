const db = require('../config/db');

// Ensure customer_classifications table exists with tenant isolation
let tableEnsured = false;
async function ensureClassificationsTable() {
  if (tableEnsured) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS customer_classifications (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        color VARCHAR(30) DEFAULT '#3b82f6',
        description TEXT,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_customer_classifications_tenant ON customer_classifications(tenant_id);
    `);
    tableEnsured = true;
  } catch (err) {
    console.error('[CustomerClassifications] Table guard error:', err.message);
  }
}

// @desc    Get all customer classifications for tenant
// @route   GET /api/customer-classifications
// @access  Private
exports.getClassifications = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    await ensureClassificationsTable();
    const result = await db.query(
      `SELECT 
        cc.*,
        (SELECT COUNT(*) FROM customers c WHERE c.classification_id = cc.id AND c.tenant_id::text = $1::text) as customers_count
       FROM customer_classifications cc
       WHERE cc.tenant_id::text = $1::text 
       ORDER BY cc.name ASC`,
      [tenant_id]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[CustomerClassifications GET Error]:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch customer classifications' });
  }
};

// @desc    Create new customer classification
// @route   POST /api/customer-classifications
// @access  Private
exports.createClassification = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { name, color, description } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ status: 'error', message: 'Classification name is required.' });
  }

  try {
    await ensureClassificationsTable();
    const result = await db.query(
      `INSERT INTO customer_classifications (name, color, description, tenant_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), color || '#3b82f6', description || null, tenant_id]
    );
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[CustomerClassifications CREATE Error]:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Update customer classification
// @route   PUT /api/customer-classifications/:id
// @access  Private
exports.updateClassification = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { name, color, description } = req.body;

  try {
    await ensureClassificationsTable();
    const result = await db.query(
      `UPDATE customer_classifications
       SET name = COALESCE($1, name),
           color = COALESCE($2, color),
           description = COALESCE($3, description)
       WHERE id = $4 AND tenant_id::text = $5::text
       RETURNING *`,
      [name ? name.trim() : null, color || null, description !== undefined ? description : null, req.params.id, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Classification not found or unauthorized' });
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[CustomerClassifications UPDATE Error]:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Delete customer classification
// @route   DELETE /api/customer-classifications/:id
// @access  Private
exports.deleteClassification = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    await ensureClassificationsTable();
    // 1. Unset classification from any customers referencing it so they aren't deleted
    await db.query(
      `UPDATE customers SET classification_id = NULL WHERE classification_id = $1 AND tenant_id::text = $2::text`,
      [req.params.id, tenant_id]
    );

    // 2. Delete the classification
    const result = await db.query(
      `DELETE FROM customer_classifications WHERE id = $1 AND tenant_id::text = $2::text RETURNING *`,
      [req.params.id, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Classification not found or unauthorized' });
    }

    res.json({ status: 'success', message: 'Classification deleted successfully' });
  } catch (err) {
    console.error('[CustomerClassifications DELETE Error]:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};
