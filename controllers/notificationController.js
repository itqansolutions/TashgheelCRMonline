const db = require('../config/db');

// @desc    Get All Notifications for current User
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const user_id = req.user.id;

    try {
        // Fetch up to 50 latest notifications explicitly targeting the user (or optionally branch-wide if we expand it)
        const result = await db.query(`
            SELECT * FROM system_notifications 
            WHERE tenant_id = $1 AND (branch_id = $2 OR branch_id IS NULL) 
            AND (user_id = $3 OR user_id IS NULL)
            ORDER BY created_at DESC
            LIMIT 50
        `, [tenant_id, branch_id, user_id]);

        // Calculate exact unread count 
        const unreadRes = await db.query(`
            SELECT COUNT(*) FROM system_notifications 
            WHERE tenant_id = $1 AND (branch_id = $2 OR branch_id IS NULL) 
            AND (user_id = $3 OR user_id IS NULL)
            AND is_read = FALSE
        `, [tenant_id, branch_id, user_id]);

        res.json({ 
            status: 'success', 
            data: result.rows,
            unreadCount: parseInt(unreadRes.rows[0].count)
        });
    } catch (err) {
        console.error('getNotifications Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to retrieve notifications.' });
    }
};

// @desc    Mark specific notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const user_id = req.user.id;
    const notification_id = req.params.id;

    try {
        const result = await db.query(`
            UPDATE system_notifications 
            SET is_read = TRUE 
            WHERE id = $1 AND tenant_id = $2 AND (user_id = $3 OR user_id IS NULL)
            RETURNING *
        `, [notification_id, tenant_id, user_id]);

        if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Notification not found' });
        
        res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to mark notification.' });
    }
};

// @desc    Mark ALL notifications as read
// @route   PATCH /api/notifications/read-all
// @access  Private
exports.markAllRead = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const user_id = req.user.id;

    try {
        await db.query(`
            UPDATE system_notifications 
            SET is_read = TRUE 
            WHERE tenant_id = $1 AND (branch_id = $2 OR branch_id IS NULL) 
            AND (user_id = $3 OR user_id IS NULL) AND is_read = FALSE
        `, [tenant_id, branch_id, user_id]);

        res.json({ status: 'success', message: 'All notifications marked as read' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to sweep notifications.' });
    }
};
