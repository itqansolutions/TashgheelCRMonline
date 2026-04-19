const db = require('../config/db');

// @desc    Get all system logs with advanced filters
// @route   GET /api/logs
// @access  Private (Admin)
exports.getLogs = async (req, res) => {
  const { 
    user_id, 
    action, 
    entity_type, 
    level, 
    from, 
    to, 
    limit = 50, 
    offset = 0 
  } = req.query;
  
  const tenant_id = req.user.tenant_id;

  try {
    let query = `
      SELECT l.*, u.name as user_name, u.email as user_email
      FROM system_logs l
      LEFT JOIN users u ON l.user_id = u.id
      WHERE l.tenant_id::text = $1::text
    `;
    const params = [tenant_id];

    if (user_id) {
      params.push(user_id);
      query += ` AND l.user_id = $${params.length}`;
    }

    if (action) {
      params.push(action);
      query += ` AND l.action = $${params.length}`;
    }

    if (entity_type) {
      params.push(entity_type);
      query += ` AND l.entity_type = $${params.length}`;
    }

    if (level) {
      params.push(level);
      query += ` AND l.level = $${params.length}`;
    }

    if (from) {
      params.push(from);
      query += ` AND l.created_at >= $${params.length}`;
    }

    if (to) {
      params.push(to);
      query += ` AND l.created_at <= $${params.length}`;
    }

    // Count query for pagination (must include tenant filter)
    const countQuery = query.replace('SELECT l.*, u.name as user_name, u.email as user_email', 'SELECT COUNT(*)');
    const totalResult = await db.query(countQuery, params);
    const total = parseInt(totalResult.rows[0].count);

    // Final result query with ordering and pagination
    query += ` ORDER BY l.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    
    res.json({ 
      status: 'success', 
      data: result.rows,
      total
    });
  } catch (err) {
    console.error('Audit Log Retrieval Error:', err.message);
    res.status(500).json({ status: 'error', message: 'Server error retrieving logs' });
  }
};
