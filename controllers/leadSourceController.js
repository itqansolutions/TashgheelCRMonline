const db = require('../config/db');

// @desc    Get all lead sources
// @route   GET /api/lead-sources
// @access  Private
exports.getSources = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM lead_sources ORDER BY name ASC');
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create lead source
// @route   POST /api/lead-sources
// @access  Private (Admin)
exports.createSource = async (req, res) => {
  const { name } = req.body;
  try {
    const result = await db.query(
      'INSERT INTO lead_sources (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update lead source
// @route   PUT /api/lead-sources/:id
// @access  Private (Admin)
exports.updateSource = async (req, res) => {
  const { name } = req.body;
  try {
    const result = await db.query(
      'UPDATE lead_sources SET name = $1 WHERE id = $2 RETURNING *',
      [name, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Source not found' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete lead source
// @route   DELETE /api/lead-sources/:id
// @access  Private (Admin)
exports.deleteSource = async (req, res) => {
  try {
    const result = await db.query('DELETE FROM lead_sources WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Source not found' });
    }
    res.json({ status: 'success', message: 'Source deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error (might be in use)' });
  }
};
