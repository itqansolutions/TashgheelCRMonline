const db = require('../config/db');

// @desc    Get all lead sources
// @route   GET /api/lead-sources
// @access  Private
exports.getSources = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM lead_sources WHERE tenant_id::text = $1::text ORDER BY name ASC', [req.user.tenant_id]);
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
      'INSERT INTO lead_sources (name, tenant_id) VALUES ($1, $2) RETURNING *',
      [name, req.user.tenant_id]
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
      'UPDATE lead_sources SET name = $1 WHERE id = $2 AND tenant_id::text = $3::text RETURNING *',
      [name, req.params.id, req.user.tenant_id]
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
    const result = await db.query('DELETE FROM lead_sources WHERE id = $1 AND tenant_id::text = $2::text RETURNING *', [req.params.id, req.user.tenant_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Source not found' });
    }
    res.json({ status: 'success', message: 'Source deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error (might be in use)' });
  }
};
