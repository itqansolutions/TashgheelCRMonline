const db = require('../config/db');

// Self-healing schema guard for products.unit
let unitChecked = false;
async function ensureUnitColumn() {
  if (unitChecked) return;
  try {
    await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT 'piece';`);
    unitChecked = true;
  } catch (e) {}
}

// @desc    Get all products
// @route   GET /api/products
// @access  Private
exports.getProducts = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    await ensureUnitColumn();
    const result = await db.query(
      'SELECT id, name, sku, description, cost_price, selling_price, category, COALESCE(unit, \'piece\') as unit, tenant_id, branch_id, created_at, updated_at FROM products WHERE tenant_id::text = $1::text AND (branch_id::text = $2::text OR $2 IS NULL) ORDER BY name ASC',
      [tenant_id, branch_id || null]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[Products API Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch products', data: [] });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Private
exports.getProductById = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    await ensureUnitColumn();
    const result = await db.query(
      'SELECT id, name, sku, description, cost_price, selling_price, category, COALESCE(unit, \'piece\') as unit, tenant_id, branch_id, created_at, updated_at FROM products WHERE id = $1 AND tenant_id::text = $2::text',
      [req.params.id, tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Product not found' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Product Detail Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create product
// @route   POST /api/products
// @access  Private
exports.createProduct = async (req, res) => {
  const { name, sku, description, cost_price, selling_price, category, unit } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    await ensureUnitColumn();
    const result = await db.query(
      'INSERT INTO products (name, sku, description, cost_price, selling_price, category, unit, tenant_id, branch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [name, sku, description, cost_price, selling_price, category, unit || 'piece', tenant_id, branch_id || null]
    );
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Product Create Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to save product' });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private
exports.updateProduct = async (req, res) => {
  const { name, sku, description, cost_price, selling_price, category, unit } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    await ensureUnitColumn();
    const result = await db.query(
      'UPDATE products SET name = $1, sku = $2, description = $3, cost_price = $4, selling_price = $5, category = $6, unit = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8 AND tenant_id::text = $9::text RETURNING *',
      [name, sku, description, cost_price, selling_price, category, unit || 'piece', req.params.id, tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Product not found or unauthorized' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Product Update Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private
exports.deleteProduct = async (req, res) => {
  const tenant_id = req.user.tenant_id;

  try {
    const result = await db.query(
      'DELETE FROM products WHERE id = $1 AND tenant_id::text = $2::text RETURNING *',
      [req.params.id, tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Product not found or unauthorized' });
    }
    res.json({ status: 'success', message: 'Product deleted' });
  } catch (err) {
    console.error('[Product Delete Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
