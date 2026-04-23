const db = require('../config/db');
const { logCreate, logUpdate, logDelete } = require('../services/loggerService');

// @desc    Get all quotations
// @route   GET /api/quotations
// @access  Private
exports.getQuotations = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(`
      SELECT q.*, d.title as deal_title, COALESCE(c.name, c2.name, 'Generic Customer') as client_name
      FROM quotations q
      LEFT JOIN deals d ON q.deal_id::text = d.id::text AND q.tenant_id::text = d.tenant_id::text
      LEFT JOIN customers c ON d.client_id::text = c.id::text
      LEFT JOIN customers c2 ON q.client_id::text = c2.id::text
      WHERE q.tenant_id::text = $1::text AND q.branch_id::text = $2::text
      ORDER BY q.created_at DESC
    `, [tenant_id, branch_id]);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[Quotations API Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get single quotation
// @route   GET /api/quotations/:id
// @access  Private
exports.getQuotationById = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(
      `SELECT q.*, c.name as client_name, c.email as client_email, c.phone as client_phone,
              u.unit_no, u.project as project_name 
       FROM quotations q 
       LEFT JOIN customers c ON q.client_id::text = c.id::text 
       LEFT JOIN re_units u ON q.unit_id::text = u.id::text
       WHERE q.id = $1 AND q.tenant_id::text = $2::text AND q.branch_id::text = $3::text`,
      [req.params.id, tenant_id, branch_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Quotation not found or unauthorized' });
    }
    
    const quotation = result.rows[0];
    
    // Fetch items
    const itemsResult = await db.query(
      `SELECT qi.*, p.name as product_name 
       FROM quotation_items qi 
       LEFT JOIN products p ON qi.product_id::text = p.id::text 
       WHERE qi.quotation_id = $1`,
      [quotation.id]
    );
    
    quotation.items = itemsResult.rows;
    
    res.json({ status: 'success', data: quotation });
  } catch (err) {
    console.error('[Quotation Detail Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create quotation
// @route   POST /api/quotations
// @access  Private
exports.createQuotation = async (req, res) => {
  const { deal_id, client_id, total_amount, valid_until, notes, items } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  
  try {
    await db.query('BEGIN');

    // 1. Insert Quotation Header
    const result = await db.query(
      'INSERT INTO quotations (deal_id, client_id, total_amount, valid_until, notes, tenant_id, branch_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [deal_id || null, client_id || null, total_amount || 0, valid_until, notes, tenant_id, branch_id]
    );
    const quotation = result.rows[0];

    // 2. Insert Items if any
    if (items && Array.isArray(items)) {
        for (const item of items) {
            await db.query(
                `INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, subtotal, tenant_id, branch_id) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    quotation.id, 
                    item.product_id || null, 
                    item.description || '', 
                    item.quantity || 1, 
                    item.unit_price || 0, 
                    (item.quantity || 1) * (item.unit_price || 0),
                    tenant_id,
                    branch_id
                ]
            );
        }
    }

    await db.query('COMMIT');
    logCreate(req, 'Quotation', quotation.id, quotation);
    res.status(201).json({ status: 'success', data: quotation });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('[Quotation Create Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Approve quotation
// @route   PATCH /api/quotations/:id/approve
// @access  Private
exports.approveQuotation = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(
      "UPDATE quotations SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text RETURNING *",
      [req.params.id, tenant_id, branch_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Quotation not found or unauthorized' });
    }

    logUpdate(req, 'Quotation', req.params.id, { status: 'draft' }, result.rows[0]);

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Quotation Approve Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete quotation
// @route   DELETE /api/quotations/:id
// @access  Private
exports.deleteQuotation = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(
      'DELETE FROM quotations WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text RETURNING *',
      [req.params.id, tenant_id, branch_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Quotation not found or unauthorized' });
    }

    logDelete(req, 'Quotation', req.params.id, { deal_id: result.rows[0].deal_id });

    res.json({ status: 'success', message: 'Quotation deleted' });
  } catch (err) {
    console.error('[Quotation Delete Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
