const db = require('../config/db');

// @desc    Get all expenses
// @route   GET /api/expenses
// @access  Private
exports.getExpenses = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM expenses ORDER BY expense_date DESC');
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get single expense
// @route   GET /api/expenses/:id
// @access  Private
exports.getExpenseById = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM expenses WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Expense not found' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create expense
// @route   POST /api/expenses
// @access  Private
exports.createExpense = async (req, res) => {
  const { title, amount, category, expense_date, is_recurring, project_id } = req.body;
  try {
    const result = await db.query(
      'INSERT INTO expenses (title, amount, category, expense_date, is_recurring, project_id, recorded_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [title, amount, category, expense_date || new Date(), is_recurring || false, project_id, req.user.id]
    );
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update expense
// @route   PUT /api/expenses/:id
// @access  Private
exports.updateExpense = async (req, res) => {
  const { title, amount, category, expense_date, is_recurring, project_id } = req.body;
  try {
    const result = await db.query(
      'UPDATE expenses SET title = $1, amount = $2, category = $3, expense_date = $4, is_recurring = $5, project_id = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *',
      [title, amount, category, expense_date, is_recurring, project_id, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Expense not found' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete expense
// @route   DELETE /api/expenses/:id
// @access  Private
exports.deleteExpense = async (req, res) => {
  try {
    const result = await db.query('DELETE FROM expenses WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Expense not found' });
    }
    res.json({ status: 'success', message: 'Expense deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
