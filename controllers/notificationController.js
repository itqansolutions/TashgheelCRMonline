const db = require('../config/db');

let tableReady = false;
async function ensureSystemNotificationsTable() {
    if (tableReady) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS system_notifications (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255),
                branch_id VARCHAR(255),
                user_id VARCHAR(255),
                type VARCHAR(50) DEFAULT 'info',
                title VARCHAR(255),
                message TEXT,
                link VARCHAR(255),
                metadata JSONB,
                is_read BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        tableReady = true;
    } catch (err) {
        console.warn('[Notifications] ensureSystemNotificationsTable:', err.message);
    }
}

// @desc    Get All Notifications for current User
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
    await ensureSystemNotificationsTable();
    const tenant_id = req.user?.tenant_id;
    const branch_id = req.branchId || null;
    const user_id = req.user?.id != null ? String(req.user.id) : null;

    try {
        // Fetch up to 50 latest notifications explicitly targeting the user (or optionally branch-wide if we expand it)
        const result = await db.query(`
            SELECT * FROM system_notifications 
            WHERE tenant_id::text = $1::text 
              AND ($2::text IS NULL OR branch_id IS NULL OR branch_id::text = $2::text) 
              AND ($3::text IS NULL OR user_id IS NULL OR user_id::text = $3::text)
            ORDER BY created_at DESC
            LIMIT 50
        `, [tenant_id, branch_id, user_id]);

        // Calculate exact unread count 
        const unreadRes = await db.query(`
            SELECT COUNT(*) FROM system_notifications 
            WHERE tenant_id::text = $1::text 
              AND ($2::text IS NULL OR branch_id IS NULL OR branch_id::text = $2::text) 
              AND ($3::text IS NULL OR user_id IS NULL OR user_id::text = $3::text)
              AND is_read = FALSE
        `, [tenant_id, branch_id, user_id]);

        res.json({ 
            status: 'success', 
            data: result.rows,
            unreadCount: parseInt(unreadRes.rows[0]?.count || 0)
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
    await ensureSystemNotificationsTable();
    const tenant_id = req.user?.tenant_id;
    const user_id = req.user?.id != null ? String(req.user.id) : null;
    const notification_id = req.params.id;

    try {
        const result = await db.query(`
            UPDATE system_notifications 
            SET is_read = TRUE 
            WHERE id::text = $1::text 
              AND tenant_id::text = $2::text 
              AND ($3::text IS NULL OR user_id IS NULL OR user_id::text = $3::text)
            RETURNING *
        `, [notification_id, tenant_id, user_id]);

        if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Notification not found' });
        
        res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error('markAsRead Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to mark notification.' });
    }
};

// @desc    Mark ALL notifications as read
// @route   PATCH /api/notifications/read-all
// @access  Private
exports.markAllRead = async (req, res) => {
    await ensureSystemNotificationsTable();
    const tenant_id = req.user?.tenant_id;
    const branch_id = req.branchId || null;
    const user_id = req.user?.id != null ? String(req.user.id) : null;

    try {
        await db.query(`
            UPDATE system_notifications 
            SET is_read = TRUE 
            WHERE tenant_id::text = $1::text 
              AND ($2::text IS NULL OR branch_id IS NULL OR branch_id::text = $2::text) 
              AND ($3::text IS NULL OR user_id IS NULL OR user_id::text = $3::text) 
              AND is_read = FALSE
        `, [tenant_id, branch_id, user_id]);

        res.json({ status: 'success', message: 'All notifications marked as read' });
    } catch (err) {
        console.error('markAllRead Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to sweep notifications.' });
    }
};
