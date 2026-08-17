const db = require('../config/db');

// @desc    Get all job titles
// @route   GET /api/job-titles
// @access  Private
exports.getJobTitles = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM job_titles WHERE tenant_id::text = $1::text ORDER BY name ASC',
      [req.user.tenant_id]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[JobTitles Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create job title
// @route   POST /api/job-titles
// @access  Private (Admin)
exports.createJobTitle = async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ status: 'error', message: 'Job title name is required' });
  }
  try {
    const result = await db.query(
      'INSERT INTO job_titles (name, tenant_id) VALUES ($1, $2) RETURNING *',
      [name.trim(), req.user.tenant_id]
    );
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Create JobTitle Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update job title
// @route   PUT /api/job-titles/:id
// @access  Private (Admin)
exports.updateJobTitle = async (req, res) => {
  const { name } = req.body;
  try {
    const result = await db.query(
      'UPDATE job_titles SET name = $1 WHERE id = $2 AND tenant_id::text = $3::text RETURNING *',
      [name, req.params.id, req.user.tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Job title not found' });
    }
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Update JobTitle Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete job title
// @route   DELETE /api/job-titles/:id
// @access  Private (Admin)
exports.deleteJobTitle = async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM job_titles WHERE id = $1 AND tenant_id::text = $2::text RETURNING *',
      [req.params.id, req.user.tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Job title not found' });
    }
    res.json({ status: 'success', message: 'Job title deleted' });
  } catch (err) {
    console.error('[Delete JobTitle Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
