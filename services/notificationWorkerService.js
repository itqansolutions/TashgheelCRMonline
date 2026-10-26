const db = require('../config/db');
const { getWhatsAppSettings, callWhatsAppApi, sendDirectTextMessage } = require('./whatsappService');

/**
 * ⚙️ NotificationWorkerService
 * Reliable background worker for processing queued notification jobs:
 *  - Exponential backoff retry handling
 *  - Monotonic status advancement
 *  - Safe dryRun mode for tests and development without hitting Meta API
 *  - Tenant-isolated WhatsApp Cloud API dispatching
 */
class NotificationWorkerService {
    constructor() {
        this.timer = null;
        this.isRunning = false;
        this.isProcessing = false;
    }

    /**
     * Process pending notification jobs batch
     * @param {Object} options
     * @param {number} [options.batchSize=10]
     * @param {boolean} [options.dryRun=false] - If true, skips Meta API call and generates mock wamid
     * @returns {Promise<{processed: number, succeeded: number, failed: number, retried: number}>}
     */
    async processPendingJobs({ batchSize = 10, dryRun = false } = {}) {
        const isDryRun = dryRun || process.env.WHATSAPP_DRY_RUN === 'true';

        let jobs = [];
        try {
            const res = await db.query(`
                SELECT * FROM notification_jobs 
                WHERE status = 'pending' AND scheduled_at <= NOW()
                ORDER BY priority DESC, created_at ASC 
                LIMIT $1
                FOR UPDATE SKIP LOCKED
            `, [batchSize]);
            jobs = res.rows;
        } catch (err) {
            console.error('❌ [NotificationWorker] Query Error:', err.message);
            return { processed: 0, succeeded: 0, failed: 0, retried: 0, error: err.message };
        }

        if (jobs.length === 0) {
            return { processed: 0, succeeded: 0, failed: 0, retried: 0 };
        }

        console.log(`📬 [NotificationWorker] Processing ${jobs.length} pending notification job(s)... (dryRun: ${isDryRun})`);

        let succeeded = 0;
        let failed = 0;
        let retried = 0;

        for (const job of jobs) {
            try {
                // 1. Mark job as processing
                await db.query(`
                    UPDATE notification_jobs 
                    SET status = 'processing', updated_at = NOW() 
                    WHERE id = $1
                `, [job.id]);

                // 2. Dry-Run Mode (Safe testing & simulated environments)
                if (isDryRun) {
                    const mockWamid = `wamid.mock.${job.id}`;
                    await db.query(`
                        UPDATE notification_jobs 
                        SET status = 'completed', 
                            processed_at = NOW(), 
                            meta_message_id = $1,
                            updated_at = NOW()
                        WHERE id = $2
                    `, [mockWamid, job.id]);

                    await db.query(`
                        UPDATE notification_logs 
                        SET delivery_status = 'sent', 
                            sent_at = NOW(), 
                            meta_message_id = $1,
                            updated_at = NOW()
                        WHERE job_id = $2
                    `, [mockWamid, job.id]);

                    console.log(`🧪 [NotificationWorker - DRY RUN] Simulated send for Job ${job.id} to ${job.recipient_phone} | Mock WAMID: ${mockWamid}`);
                    succeeded++;
                    continue;
                }

                // 3. Real Dispatch via Meta Cloud API
                const settings = await getWhatsAppSettings(job.tenant_id);
                if (!settings || !settings.phone_number_id || !settings.access_token) {
                    const errMsg = 'WhatsApp Cloud API credentials not configured or inactive for organization';
                    await this._markJobFailed(job, errMsg, 'NOT_CONFIGURED');
                    failed++;
                    continue;
                }

                const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : (job.payload || {});
                let sendResult = null;

                if (payload.templateName) {
                    // Pre-approved template dispatch
                    sendResult = await callWhatsAppApi({
                        phoneNumberId: settings.phone_number_id,
                        accessToken: settings.access_token,
                        toPhone: job.recipient_phone,
                        templateName: payload.templateName,
                        languageCode: payload.languageCode || settings.template_language_ar || 'ar',
                        components: payload.components || [],
                        tenantId: job.tenant_id
                    });
                } else if (payload.messageText) {
                    // Direct free-form text dispatch (within 24h customer window or employee internal test)
                    sendResult = await sendDirectTextMessage({
                        phoneNumberId: settings.phone_number_id,
                        accessToken: settings.access_token,
                        toPhone: job.recipient_phone,
                        text: payload.messageText
                    });
                } else {
                    // Fallback to tenant default template if configured
                    const defaultTemplate = settings.template_name || 'hello_world';
                    sendResult = await callWhatsAppApi({
                        phoneNumberId: settings.phone_number_id,
                        accessToken: settings.access_token,
                        toPhone: job.recipient_phone,
                        templateName: defaultTemplate,
                        languageCode: settings.template_language_ar || 'ar',
                        components: payload.recipientName ? [{
                            type: 'body',
                            parameters: [{ type: 'text', text: payload.recipientName }]
                        }] : [],
                        tenantId: job.tenant_id
                    });
                }

                if (sendResult && sendResult.success) {
                    const metaMessageId = sendResult.messageId || null;

                    await db.query(`
                        UPDATE notification_jobs 
                        SET status = 'completed', 
                            processed_at = NOW(), 
                            meta_message_id = $1,
                            updated_at = NOW()
                        WHERE id = $2
                    `, [metaMessageId, job.id]);

                    await db.query(`
                        UPDATE notification_logs 
                        SET delivery_status = 'sent', 
                            sent_at = NOW(), 
                            meta_message_id = $1,
                            updated_at = NOW()
                        WHERE job_id = $2
                    `, [metaMessageId, job.id]);

                    console.log(`✅ [NotificationWorker] Dispatched Job ${job.id} to ${job.recipient_phone} | WAMID: ${metaMessageId}`);
                    succeeded++;
                } else {
                    const sendError = sendResult?.error || 'Failed to dispatch WhatsApp message';
                    const newAttempts = (job.attempts || 0) + 1;

                    if (newAttempts >= job.max_attempts) {
                        await this._markJobFailed(job, sendError, sendResult?.code || 'MAX_RETRIES_REACHED');
                        failed++;
                    } else {
                        // Exponential backoff retry: 30s, 60s, 120s...
                        const backoffSeconds = Math.pow(2, newAttempts) * 30;
                        await db.query(`
                            UPDATE notification_jobs 
                            SET status = 'pending',
                                attempts = $1,
                                scheduled_at = NOW() + ($2 || ' seconds')::interval,
                                error_message = $3,
                                updated_at = NOW()
                            WHERE id = $4
                        `, [newAttempts, backoffSeconds, sendError, job.id]);

                        console.warn(`⏳ [NotificationWorker] Job ${job.id} failed attempt ${newAttempts}/${job.max_attempts}. Retrying in ${backoffSeconds}s. Error: ${sendError}`);
                        retried++;
                    }
                }
            } catch (jobErr) {
                console.error(`❌ [NotificationWorker] Exception on Job ${job.id}:`, jobErr.message);
                const newAttempts = (job.attempts || 0) + 1;
                if (newAttempts >= job.max_attempts) {
                    await this._markJobFailed(job, jobErr.message, 'UNHANDLED_EXCEPTION');
                    failed++;
                } else {
                    const backoffSeconds = Math.pow(2, newAttempts) * 30;
                    await db.query(`
                        UPDATE notification_jobs 
                        SET status = 'pending',
                            attempts = $1,
                            scheduled_at = NOW() + ($2 || ' seconds')::interval,
                            error_message = $3,
                            updated_at = NOW()
                        WHERE id = $4
                    `, [newAttempts, backoffSeconds, jobErr.message, job.id]);
                    retried++;
                }
            }
        }

        return {
            processed: jobs.length,
            succeeded,
            failed,
            retried
        };
    }

    async _markJobFailed(job, errorMessage, errorCode = 'FAILED') {
        await db.query(`
            UPDATE notification_jobs 
            SET status = 'failed', 
                processed_at = NOW(), 
                error_message = $1,
                updated_at = NOW()
            WHERE id = $2
        `, [errorMessage, job.id]);

        await db.query(`
            UPDATE notification_logs 
            SET delivery_status = 'failed', 
                failed_at = NOW(), 
                error_code = $1,
                error_message = $2,
                updated_at = NOW()
            WHERE job_id = $3
        `, [errorCode, errorMessage, job.id]);

        console.error(`❌ [NotificationWorker] Job ${job.id} marked FAILED: ${errorMessage}`);
    }

    /**
     * Start background poller worker
     * @param {number} [intervalMs=5000]
     */
    startWorker(intervalMs = 5000) {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log(`🚀 [NotificationWorker] Worker active (polling every ${intervalMs}ms).`);
        this.timer = setInterval(async () => {
            if (this.isProcessing) return;
            this.isProcessing = true;
            try {
                await this.processPendingJobs();
            } finally {
                this.isProcessing = false;
            }
        }, intervalMs);
    }

    /**
     * Stop background worker
     */
    stopWorker() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.isRunning = false;
        console.log(`🛑 [NotificationWorker] Worker stopped.`);
    }
}

module.exports = new NotificationWorkerService();
