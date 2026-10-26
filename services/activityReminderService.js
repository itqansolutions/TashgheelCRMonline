const db = require('../config/db');
const notificationDispatcher = require('../src/domains/shared/services/notificationDispatcher');
const { ensureActivitiesTable } = require('../controllers/activityController');

/**
 * ⏰ Activity Follow-Up & Reminder Background Service
 *
 * Scans scheduled client interaction logs (e.g., calls, meetings, follow-ups)
 * and dispatches in-app notifications to assigned representatives when the scheduled time arrives.
 */

async function scanAndSendReminders() {
    try {
        await ensureActivitiesTable();

        const query = `
            SELECT a.id, a.tenant_id, a.user_id, a.entity_type, a.entity_id, a.action, 
                   a.scheduled_at, a.reminder_note, a.meta,
                   u.name as creator_name,
                   c.name as customer_name, c.phone as customer_phone, c.branch_id as customer_branch_id,
                   d.title as deal_title, d.branch_id as deal_branch_id
            FROM activities a
            LEFT JOIN users u ON a.user_id = u.id
            LEFT JOIN customers c ON (LOWER(a.entity_type) = 'customer' AND a.entity_id::text = c.id::text)
            LEFT JOIN deals d ON (LOWER(a.entity_type) = 'deal' AND a.entity_id::text = d.id::text)
            WHERE a.scheduled_at IS NOT NULL
              AND a.scheduled_at <= CURRENT_TIMESTAMP
              AND a.reminder_sent_at IS NULL
              AND (a.is_reminder_dismissed IS NULL OR a.is_reminder_dismissed = FALSE)
            ORDER BY a.scheduled_at ASC
            LIMIT 50
        `;

        const res = await db.query(query);
        if (!res || !res.rows || res.rows.length === 0) return 0;

        let sentCount = 0;
        for (const row of res.rows) {
            try {
                const rawMeta = typeof row.meta === 'string' ? JSON.parse(row.meta) : (row.meta || {});
                const note = row.reminder_note || rawMeta?.reminder_note || rawMeta?.changes?.note?.to || 'متابعة مجدولة';

                let title = '';
                let message = '';
                let link = '';
                const cleanType = String(row.entity_type || 'customer').toLowerCase();

                if (cleanType === 'customer') {
                    const custName = row.customer_name || 'العميل';
                    const phoneTxt = row.customer_phone ? ` (${row.customer_phone})` : '';
                    title = `⏰ تذكير بمتابعة عميل: ${custName}`;
                    message = `حان موعد الاتصال والتواصل مع العميل ${custName}${phoneTxt}. ملاحظة: "${note}"`;
                    link = `/customers?customer360=${row.entity_id}`;
                } else if (cleanType === 'deal') {
                    const dealTitle = row.deal_title || 'الصفقة';
                    title = `⏰ تذكير بمتابعة صفقة: ${dealTitle}`;
                    message = `حان موعد متابعة الصفقة ${dealTitle}. ملاحظة: "${note}"`;
                    link = `/deals?dealId=${row.entity_id}`;
                } else {
                    title = `⏰ تذكير بمتابعة مجدولة`;
                    message = `حان موعد المتابعة المجدولة. ملاحظة: "${note}"`;
                    link = `/customers?customer360=${row.entity_id}`;
                }

                // If user_id is assigned, send notification to that user
                const targetUserId = row.user_id || null;
                const branchId = row.customer_branch_id || row.deal_branch_id || null;

                const dedupKey = `activity.reminder:${row.tenant_id}:${row.id}:${targetUserId || 'all'}:${new Date(row.scheduled_at).getTime()}`;

                const dispatchRes = await notificationDispatcher.dispatch({
                    tenantId: row.tenant_id,
                    branchId,
                    userId: targetUserId,
                    type: 'activity_reminder',
                    title,
                    message,
                    link,
                    channels: ['in_app', 'whatsapp'],
                    deduplicationKey: dedupKey,
                    metadata: {
                        activity_id: row.id,
                        entity_type: row.entity_type,
                        entity_id: row.entity_id,
                        scheduled_at: row.scheduled_at,
                        reminder_note: note
                    }
                });

                // Mark reminder as sent ONLY if in-app notification succeeded
                if (dispatchRes.inAppSent) {
                    await db.query(
                        `UPDATE activities SET reminder_sent_at = CURRENT_TIMESTAMP WHERE id = $1`,
                        [row.id]
                    );
                    sentCount++;
                } else {
                    console.warn(`[ActivityReminder] In-App notification failed for activity #${row.id}: ${dispatchRes.inAppError || 'Unknown error'}. Leaving reminder_sent_at as NULL.`);
                }
            } catch (itemErr) {
                console.error(`[ActivityReminder] Failed to process reminder for activity #${row.id}:`, itemErr.message);
            }
        }

        if (sentCount > 0) {
            console.log(`⏰ [ActivityReminder] Sent ${sentCount} scheduled follow-up notifications.`);
        }
        return sentCount;
    } catch (err) {
        console.error('[ActivityReminder] Scanner error:', err.message);
        return 0;
    }
}

let reminderScannerInterval = null;
function startActivityReminderScanner(intervalSeconds = 30) {
    console.log(`⏰ [ActivityReminder] Scanner activated. Checking scheduled reminders every ${intervalSeconds}s.`);
    setTimeout(() => scanAndSendReminders().catch(() => {}), 5000);
    reminderScannerInterval = setInterval(() => scanAndSendReminders().catch(() => {}), intervalSeconds * 1000);
    return reminderScannerInterval;
}

module.exports = {
    scanAndSendReminders,
    startActivityReminderScanner
};
