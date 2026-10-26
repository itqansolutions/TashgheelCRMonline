const db = require('../config/db');
const { normalisePhone } = require('./whatsappService');

/**
 * 📨 NotificationQueueService
 * Database-backed queue management for WhatsApp & Multi-Channel notifications.
 * Enforces:
 *  - Per-tenant isolation
 *  - Deduplication
 *  - Recipient phone validation
 *  - Tenant notification rules evaluation
 *  - Complete audit logging
 */
class NotificationQueueService {
    /**
     * Enqueue a new notification job
     * @param {Object} params
     * @param {string} params.tenantId - SaaS Tenant UUID
     * @param {string} [params.branchId] - Optional Branch UUID
     * @param {string} params.eventName - e.g. 'lead.assigned', 'task.assigned', 'task.overdue', 'invoice.manual_delivery'
     * @param {string} [params.channel='whatsapp'] - Delivery channel
     * @param {string} params.recipientType - 'employee' or 'customer'
     * @param {string|number} [params.recipientId] - User ID or Customer ID
     * @param {string} params.recipientPhone - Target phone number
     * @param {string} [params.recipientName] - Target recipient name
     * @param {Object} [params.payload={}] - Message / Template payload
     * @param {string} [params.messageBody] - Plain text body if direct message
     * @param {string} [params.templateName] - WhatsApp template name if template message
     * @param {string} [params.deduplicationKey] - Key to prevent duplicate queueing
     * @param {number} [params.priority=10] - Job priority (higher runs earlier)
     * @param {Date|string} [params.scheduledAt] - Deferred dispatch timestamp
     * @returns {Promise<{enqueued: boolean, jobId?: string, logId?: string, reason?: string}>}
     */
    async enqueueNotificationJob({
        tenantId,
        branchId = null,
        eventName,
        channel = 'whatsapp',
        recipientType,
        recipientId = null,
        recipientPhone,
        recipientName = null,
        payload = {},
        messageBody = null,
        templateName = null,
        deduplicationKey = null,
        priority = 10,
        scheduledAt = null
    }) {
        if (!tenantId || !eventName || !recipientPhone || !recipientType) {
            return {
                enqueued: false,
                reason: 'MISSING_REQUIRED_FIELDS'
            };
        }

        // 1. Phone number normalisation
        const normalisedPhone = normalisePhone(recipientPhone);
        if (!normalisedPhone) {
            console.warn(`⚠️ [NotificationQueue] Invalid phone number for recipient '${recipientName || recipientId}': ${recipientPhone}`);
            return {
                enqueued: false,
                reason: 'INVALID_PHONE_NUMBER'
            };
        }

        // 2. Evaluate Tenant Notification Rule (if rule exists and disabled, skip)
        try {
            const ruleRes = await db.query(`
                SELECT is_enabled, channels, template_name, template_language
                FROM notification_rules
                WHERE tenant_id::text = $1::text AND event_name = $2
                LIMIT 1
            `, [tenantId, eventName]);

            if (ruleRes.rows.length > 0) {
                const rule = ruleRes.rows[0];
                if (rule.is_enabled === false) {
                    console.log(`ℹ️ [NotificationQueue] Event '${eventName}' is disabled by tenant rule for tenant ${tenantId}.`);
                    return {
                        enqueued: false,
                        reason: 'RULE_DISABLED'
                    };
                }
                if (Array.isArray(rule.channels) && !rule.channels.includes(channel)) {
                    console.log(`ℹ️ [NotificationQueue] Channel '${channel}' is disabled for event '${eventName}'.`);
                    return {
                        enqueued: false,
                        reason: 'CHANNEL_DISABLED'
                    };
                }
                if (!templateName && rule.template_name) {
                    templateName = rule.template_name;
                }
                if (rule.template_name && payload && typeof payload === 'object') {
                    if (!payload.templateName) {
                        payload.templateName = rule.template_name;
                    }
                    if (!payload.languageCode && rule.template_language) {
                        payload.languageCode = rule.template_language;
                    }
                }
            }
        } catch (ruleErr) {
            console.warn(`[NotificationQueue] Rule evaluation warning (proceeding):`, ruleErr.message);
        }

        // 3. Check Deduplication
        if (deduplicationKey) {
            try {
                const existing = await db.query(`
                    SELECT id FROM notification_jobs
                    WHERE tenant_id::text = $1::text 
                      AND deduplication_key = $2
                      AND status IN ('pending', 'processing', 'completed')
                    LIMIT 1
                `, [tenantId, deduplicationKey]);

                if (existing.rows.length > 0) {
                    console.log(`ℹ️ [NotificationQueue] Job with deduplicationKey '${deduplicationKey}' already active/completed. Skipping duplicate.`);
                    return {
                        enqueued: false,
                        reason: 'DUPLICATE_JOB',
                        jobId: existing.rows[0].id
                    };
                }
            } catch (dedupErr) {
                console.warn(`[NotificationQueue] Deduplication check warning:`, dedupErr.message);
            }
        }

        // 4. Insert into notification_jobs
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            const jobRes = await client.query(`
                INSERT INTO notification_jobs (
                    tenant_id, branch_id, event_name, channel,
                    recipient_type, recipient_id, recipient_phone, recipient_name,
                    payload, deduplication_key, priority, scheduled_at, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, NOW()), 'pending')
                RETURNING id, scheduled_at
            `, [
                tenantId,
                branchId || null,
                eventName,
                channel,
                recipientType,
                recipientId ? String(recipientId) : null,
                normalisedPhone,
                recipientName || null,
                JSON.stringify(payload || {}),
                deduplicationKey || null,
                priority,
                scheduledAt || null
            ]);

            const jobId = jobRes.rows[0].id;

            // 5. Create initial audit entry in notification_logs
            const logRes = await client.query(`
                INSERT INTO notification_logs (
                    job_id, tenant_id, branch_id, channel, event_name,
                    recipient_type, recipient_id, recipient_phone, recipient_name,
                    message_body, template_name, delivery_status, metadata
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'queued', $12)
                RETURNING id
            `, [
                jobId,
                tenantId,
                branchId || null,
                channel,
                eventName,
                recipientType,
                recipientId ? String(recipientId) : null,
                normalisedPhone,
                recipientName || null,
                messageBody || null,
                templateName || null,
                JSON.stringify({
                    deduplicationKey: deduplicationKey || null,
                    priority,
                    payload
                })
            ]);

            await client.query('COMMIT');

            console.log(`📬 [NotificationQueue] Enqueued job ${jobId} (event: ${eventName}) for ${recipientType} ${normalisedPhone}`);
            return {
                enqueued: true,
                jobId,
                logId: logRes.rows[0].id
            };
        } catch (err) {
            await client.query('ROLLBACK');
            if (err.code === '23505' && err.constraint === 'idx_notif_jobs_dedup') {
                return { enqueued: false, reason: 'DUPLICATE_JOB' };
            }
            console.error('❌ [NotificationQueue] Failed to enqueue notification job:', err.message);
            throw err;
        } finally {
            client.release();
        }
    }
}

module.exports = new NotificationQueueService();
