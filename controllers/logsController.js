const db = require('../config/db');

// @desc    Get all system logs
// @route   GET /api/logs
// @access  Private (Admin)
exports.getLogs = async (req, res) => {
  const { user_id, action, entity_type, limit = 100, offset = 0 } = req.query;
  
  try {
    let query = `
      SELECT l.*, u.name as user_name, u.email as user_email
      FROM system_logs l
      LEFT JOIN users u ON l.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

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

    query += ` ORDER BY l.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    
    // Get total count for pagination
    const countResult = await db.query('SELECT COUNT(*) FROM system_logs');
    
    res.json({ 
      status: 'success', 
      data: result.rows,
      total: parseInt(countResult.rows[0].count)
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
