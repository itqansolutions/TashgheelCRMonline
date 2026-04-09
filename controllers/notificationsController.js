const db = require('../config/db');

// @desc    Get current user notifications
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
  const userId = req.user.id;
  const tenant_id = req.user.tenant_id;
  
  try {
    const result = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 50',
      [userId, tenant_id]
    );
    
    // Get unread count
    const countResult = await db.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND tenant_id = $2 AND is_read = false',
      [userId, tenant_id]
    );

    res.json({ 
      status: 'success', 
      data: result.rows,
      unreadCount: parseInt(countResult.rows[0].count)
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Mark notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const tenant_id = req.user.tenant_id;

  try {
    const result = await db.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 AND tenant_id = $3 RETURNING *',
      [id, userId, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Notification not found' });
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Mark all as read
// @route   PATCH /api/notifications/read-all
// @access  Private
exports.markAllAsRead = async (req, res) => {
  const userId = req.user.id;
  const tenant_id = req.user.tenant_id;

  try {
    await db.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND tenant_id = $2',
      [userId, tenant_id]
    );
    res.json({ status: 'success', message: 'All notifications marked as read' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
exports.deleteNotification = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const tenant_id = req.user.tenant_id;

  try {
    const result = await db.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 AND tenant_id = $3 RETURNING *',
      [id, userId, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Notification not found' });
    }

    res.json({ status: 'success', message: 'Notification deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
