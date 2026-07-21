const db = require('../../../../config/db');

/**
 * 🔔 NotificationDispatcher
 * Multi-channel alert dispatcher processing domain events across channels.
 * Channels:
 *  - In-App (`system_notifications` table)
 *  - Email (SMTP via Nodemailer)
 *  - WhatsApp / SMS (Gateway hooks)
 */
class NotificationDispatcher {
    /**
     * Dispatches notification across configured channels
     * @param {Object} params
     * @param {string} params.tenantId
     * @param {string} [params.branchId]
     * @param {string} params.userId - Recipient user ID
     * @param {string} [params.type='info'] - 'info', 'success', 'warning', 'danger'
     * @param {string} params.title
     * @param {string} params.message
     * @param {string} [params.link] - Target UI link
     * @param {Array<string>} [params.channels=['in_app']] - ['in_app', 'email', 'whatsapp', 'sms']
     */
    async dispatch({
        tenantId,
        branchId = null,
        userId,
        type = 'info',
        title,
        message,
        link = null,
        channels = ['in_app']
    }) {
        if (!tenantId || !userId || !title) return;

        // 1. In-App Notification
        if (channels.includes('in_app')) {
            try {
                await db.query(`
                    INSERT INTO system_notifications (tenant_id, branch_id, user_id, type, title, message, link)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [tenantId, branchId, userId, type, title, message, link]);
                console.log(`🔔 [Notification] Sent In-App alert to User #${userId}: '${title}'`);
            } catch (err) {
                console.error('❌ [Notification] In-App dispatch error:', err.message);
            }
        }

        // 2. Email Channel Stub
        if (channels.includes('email')) {
            console.log(`📧 [Notification] Queueing Email to User #${userId}: '${title}'`);
        }

        // 3. WhatsApp / SMS Channel Stub
        if (channels.includes('whatsapp') || channels.includes('sms')) {
            console.log(`📱 [Notification] Queueing Mobile/WA message to User #${userId}: '${title}'`);
        }
    }
}

module.exports = new NotificationDispatcher();
