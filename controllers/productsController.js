const db = require('../config/db');

// @desc    Get all products
// @route   GET /api/products
// @access  Private
exports.getProducts = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    const result = await db.query(
      'SELECT * FROM products WHERE tenant_id = $1 AND branch_id = $2 ORDER BY name ASC',
      [tenant_id, branch_id]
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
    const result = await db.query(
      'SELECT * FROM products WHERE id = $1 AND tenant_id = $2 AND branch_id = $3',
      [req.params.id, tenant_id, branch_id]
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
  const { name, sku, description, cost_price, selling_price, category } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    const result = await db.query(
      'INSERT INTO products (name, sku, description, cost_price, selling_price, category, tenant_id, branch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [name, sku, description, cost_price, selling_price, category, tenant_id, branch_id]
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
  const { name, sku, description, cost_price, selling_price, category } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    const result = await db.query(
      'UPDATE products SET name = $1, sku = $2, description = $3, cost_price = $4, selling_price = $5, category = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 AND tenant_id = $8 AND branch_id = $9 RETURNING *',
      [name, sku, description, cost_price, selling_price, category, req.params.id, tenant_id, branch_id]
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
  const branch_id = req.branchId || req.user?.branch_id;

  try {
    const result = await db.query(
      'DELETE FROM products WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 RETURNING *',
      [req.params.id, tenant_id, branch_id]
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
