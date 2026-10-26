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
     * @param {string} [params.type='info'] - 'info', 'success', 'warning', 'danger', 'activity_reminder'
     * @param {string} params.title
     * @param {string} params.message
     * @param {string} [params.link] - Target UI link
     * @param {Array<string>} [params.channels=['in_app']] - ['in_app', 'email', 'whatsapp', 'sms']
     * @param {string} [params.deduplicationKey] - Explicit deduplication key for queueing
     * @param {Object} [params.metadata] - Extra metadata to persist with in-app & job
     * @returns {Promise<{inAppSent: boolean, whatsappEnqueued: boolean, inAppError?: string, whatsappError?: string}>}
     */
    async dispatch({
        tenantId,
        branchId = null,
        userId,
        type = 'info',
        title,
        message,
        link = null,
        channels = ['in_app'],
        deduplicationKey = null,
        metadata = null,
        eventName = null
    }) {
        if (!tenantId || !title) {
            return { inAppSent: false, whatsappEnqueued: false, inAppError: 'Missing required dispatch parameters' };
        }

        const result = {
            inAppSent: false,
            whatsappEnqueued: false,
            inAppError: null,
            whatsappError: null
        };

        // 1. In-App Notification (Synchronous & Isolated)
        if (channels.includes('in_app')) {
            try {
                await db.query(`
                    INSERT INTO system_notifications (tenant_id, branch_id, user_id, type, title, message, link, metadata)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [tenantId, branchId, userId, type, title, message, link, metadata ? JSON.stringify(metadata) : null]);
                console.log(`🔔 [Notification] Sent In-App alert to User #${userId}: '${title}'`);
                result.inAppSent = true;
            } catch (err) {
                console.error('❌ [Notification] In-App dispatch error:', err.message);
                result.inAppError = err.message;
            }
        }

        // 2. Email Channel Stub
        if (channels.includes('email')) {
            console.log(`📧 [Notification] Queueing Email to User #${userId}: '${title}'`);
        }

        // 3. WhatsApp Channel (Asynchronous Queueing with Failure Isolation)
        if (channels.includes('whatsapp')) {
            try {
                if (!userId) {
                    console.log(`ℹ️ [Notification] No userId provided. Skipping WhatsApp channel.`);
                    result.whatsappError = 'NO_USER_ID';
                } else {
                    const userRes = await db.query(
                        `SELECT id, name, phone FROM users WHERE id = $1 AND tenant_id::text = $2::text LIMIT 1`,
                        [userId, tenantId]
                    );
                    if (userRes.rows.length > 0 && userRes.rows[0].phone) {
                        const recipientUser = userRes.rows[0];
                        const notificationQueueService = require('../../../../services/notificationQueueService');
                        
                        const finalDedupKey = deduplicationKey || `${type || 'alert'}:${userId}:${tenantId}:${new Date().toISOString().slice(0, 13)}`;

                        const resolvedEventName = eventName || (type === 'activity_reminder' ? 'activity.reminder' : (type === 'task_overdue' ? 'task.overdue' : (type ? `alert.${type}` : 'system.alert')));

                        const qRes = await notificationQueueService.enqueueNotificationJob({
                            tenantId,
                            branchId,
                            eventName: resolvedEventName,
                            channel: 'whatsapp',
                            recipientType: 'employee',
                            recipientId: userId,
                            recipientPhone: recipientUser.phone,
                            recipientName: recipientUser.name,
                            payload: {
                                title,
                                message,
                                link,
                                messageText: `${title}\n${message}${link ? `\nLink: ${link}` : ''}`,
                                metadata
                            },
                            deduplicationKey: finalDedupKey
                        });

                        if (qRes && qRes.enqueued) {
                            result.whatsappEnqueued = true;
                            console.log(`📱 [Notification] Enqueued WhatsApp message for User #${userId} (${recipientUser.phone}): '${title}'`);
                        } else if (qRes && qRes.reason === 'DUPLICATE_JOB') {
                            result.whatsappEnqueued = false;
                            result.whatsappError = 'DUPLICATE_JOB';
                        } else {
                            result.whatsappError = qRes?.reason || 'Failed to enqueue WhatsApp job';
                        }
                    } else {
                        console.log(`ℹ️ [Notification] User #${userId} has no registered phone number or does not belong to tenant. Skipping WhatsApp.`);
                        result.whatsappError = 'NO_PHONE_OR_CROSS_TENANT';
                    }
                }
            } catch (waErr) {
                console.error('❌ [Notification] WhatsApp queueing error (non-fatal for in_app):', waErr.message);
                result.whatsappError = waErr.message;
            }
        }

        return result;
    }
}

module.exports = new NotificationDispatcher();
