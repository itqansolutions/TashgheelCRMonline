const db = require('../config/db');

/**
 * Enterprise Business Intelligence - Notification Service
 */
class NotificationService {
    
    /**
     * Dispatch an internal System Notification
     * @param {Object} payload { type, title, message, tenant_id, branch_id, user_id, link, metadata }
     */
    async notify({ type, title, message, tenant_id, branch_id, user_id, link, metadata }) {
        try {
            await db.query(`
                INSERT INTO system_notifications (tenant_id, branch_id, user_id, type, title, message, link, metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                tenant_id, 
                branch_id || null, // Optional for global tenant-wide notifications
                user_id || null,   // Optional for global branch-wide broadcasts
                type, 
                title, 
                message, 
                link || null, 
                metadata ? JSON.stringify(metadata) : null
            ]);
        } catch (err) {
            console.error('NotificationService (notify) Failed:', err.message);
            // Non-blocking fail-safe: Suppress error so it does not crash the calling parent operations.
        }
    }

    /**
     * Helper to broadcast to a specific role within a branch (e.g. notify all 'manager' users about Low Stock)
     */
    async notifyRole({ role, type, title, message, tenant_id, branch_id, link, metadata }) {
        try {
            // Find all users in the branch with that role
            const usersRes = await db.query(`SELECT id FROM users WHERE role = $1 AND tenant_id = $2`, [role, tenant_id]);
            
            for (let u of usersRes.rows) {
                await this.notify({
                    type, title, message, tenant_id, branch_id, user_id: u.id, link, metadata
                });
            }
        } catch (err) {
            console.error('NotificationService (notifyRole) Failed:', err.message);
        }
    }
}

module.exports = new NotificationService();
