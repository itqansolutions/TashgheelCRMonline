const db = require('../config/db');
const { logCreate, logUpdate, logDelete } = require('../services/loggerService');

// @desc    Get all expenses
// @route   GET /api/expenses
// @access  Private
exports.getExpenses = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(
      'SELECT * FROM expenses WHERE tenant_id::text = $1::text AND branch_id::text = $2::text ORDER BY expense_date DESC',
      [tenant_id, branch_id]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[Expenses API Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get single expense
// @route   GET /api/expenses/:id
// @access  Private
exports.getExpenseById = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(
      'SELECT * FROM expenses WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text',
      [req.params.id, tenant_id, branch_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Expense not found or unauthorized' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Expense Detail Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create expense
// @route   POST /api/expenses
// @access  Private
exports.createExpense = async (req, res) => {
  const { title, amount, category, expense_date, is_recurring, project_id } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(
      'INSERT INTO expenses (title, amount, category, expense_date, is_recurring, project_id, recorded_by, tenant_id, branch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [title, amount, category, expense_date || new Date(), is_recurring || false, project_id, req.user.id, tenant_id, branch_id]
    );

    logCreate(req, 'Expense', result.rows[0].id, result.rows[0]);

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Expense Create Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update expense
// @route   PUT /api/expenses/:id
// @access  Private
exports.updateExpense = async (req, res) => {
  const { title, amount, category, expense_date, is_recurring, project_id } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    // Triple Isolation check
    const oldResult = await db.query('SELECT * FROM expenses WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text', [req.params.id, tenant_id, branch_id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Expense not found or unauthorized' });
    }

    const result = await db.query(
      'UPDATE expenses SET title = $1, amount = $2, category = $3, expense_date = $4, is_recurring = $5, project_id = $6 WHERE id = $7 AND tenant_id::text = $8::text AND branch_id::text = $9::text RETURNING *',
      [title, amount, category, expense_date, is_recurring, project_id, req.params.id, tenant_id, branch_id]
    );

    logUpdate(req, 'Expense', req.params.id, oldResult.rows[0], result.rows[0]);

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Expense Update Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete expense
// @route   DELETE /api/expenses/:id
// @access  Private
exports.deleteExpense = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(
      'DELETE FROM expenses WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text RETURNING *',
      [req.params.id, tenant_id, branch_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Expense not found or unauthorized' });
    }

    logDelete(req, 'Expense', req.params.id, { title: result.rows[0].title });

    res.json({ status: 'success', message: 'Expense deleted' });
  } catch (err) {
    console.error('[Expense Delete Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
