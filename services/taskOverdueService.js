const db = require('../config/db');
const notificationDispatcher = require('../src/domains/shared/services/notificationDispatcher');

/**
 * ⏰ Task Overdue Background Scanner Service (P2.3 — Employee Alerts)
 *
 * Scans active tasks past their due_date and dispatches an alert (In-App + WhatsApp)
 * to the assigned employee with strict deduplication per due cycle.
 */

async function scanAndSendOverdueTaskAlerts({ tenantId = null, queryable = db } = {}) {
    try {
        const query = `
            SELECT t.id, t.title, t.description, t.priority, t.status, t.status_id,
                   t.assigned_to, t.due_date, t.tenant_id, t.branch_id,
                   u.name as assignee_name, u.phone as assignee_phone, u.tenant_id as assignee_tenant_id,
                   ts.is_final, ts.name as status_name
            FROM tasks t
            JOIN users u ON t.assigned_to = u.id AND t.tenant_id::text = u.tenant_id::text
            LEFT JOIN task_statuses ts ON t.status_id = ts.id
            WHERE t.due_date IS NOT NULL
              AND t.due_date <= CURRENT_TIMESTAMP
              AND LOWER(COALESCE(t.status, '')) NOT IN ('completed', 'cancelled', 'closed', 'done')
              AND (ts.is_final IS NULL OR ts.is_final = FALSE)
              AND (ts.name IS NULL OR LOWER(ts.name) NOT IN ('completed', 'cancelled', 'closed', 'done'))
              AND ($1::text IS NULL OR t.tenant_id::text = $1::text)
              AND NOT EXISTS (
                  SELECT 1 FROM system_notifications sn
                  WHERE sn.tenant_id::text = t.tenant_id::text
                    AND sn.user_id::text = t.assigned_to::text
                    AND sn.type = 'task_overdue'
                    AND sn.metadata->>'deduplication_key' = ('task.overdue:' || t.tenant_id::text || ':' || t.id::text || ':' || t.assigned_to::text || ':' || FLOOR(EXTRACT(EPOCH FROM t.due_date) * 1000)::text)
              )
            ORDER BY t.due_date ASC
            LIMIT 50
        `;

        const res = await queryable.query(query, [tenantId || null]);
        if (!res || !res.rows || res.rows.length === 0) return 0;

        let alertedCount = 0;
        for (const task of res.rows) {
            try {
                const dueTime = new Date(task.due_date).getTime();
                const dedupKey = `task.overdue:${task.tenant_id}:${task.id}:${task.assigned_to}:${dueTime}`;

                const priorityText = task.priority ? ` [الأولوية: ${task.priority}]` : '';
                const dueFormatted = new Date(task.due_date).toLocaleDateString('ar-EG');
                const title = `⚠️ مهمة متأخرة: ${task.title}${priorityText}`;
                const message = `تجاوزت المهمة "${task.title}" موعد استحقاقها المحدد (${dueFormatted}). يرجى مراجعتها وتحديث الموقف.`;
                const link = '/tasks';

                const dispatchRes = await notificationDispatcher.dispatch({
                    tenantId: task.tenant_id,
                    branchId: task.branch_id || null,
                    userId: task.assigned_to,
                    type: 'task_overdue',
                    eventName: 'task.overdue',
                    title,
                    message,
                    link,
                    channels: ['in_app', 'whatsapp'],
                    deduplicationKey: dedupKey,
                    metadata: {
                        task_id: task.id,
                        task_title: task.title,
                        due_date: task.due_date,
                        due_date_epoch: dueTime,
                        priority: task.priority,
                        deduplication_key: dedupKey
                    }
                });

                if (dispatchRes.inAppSent) {
                    alertedCount++;
                    console.log(`⏰ [TaskOverdue] Dispatched overdue alert for Task #${task.id} (${task.title}) to User #${task.assigned_to}`);
                }
            } catch (itemErr) {
                console.error(`[TaskOverdue] Error processing task #${task.id}:`, itemErr.message);
            }
        }

        if (alertedCount > 0) {
            console.log(`⏰ [TaskOverdue] Processed ${alertedCount} overdue task alerts.`);
        }
        return alertedCount;
    } catch (err) {
        console.error('❌ [TaskOverdue] Scanner Error:', err.message);
        return 0;
    }
}

let overdueScannerInterval = null;
function startTaskOverdueScanner(intervalSeconds = 60) {
    console.log(`⏰ [TaskOverdue] Scanner active. Checking overdue tasks every ${intervalSeconds}s.`);
    setTimeout(() => scanAndSendOverdueTaskAlerts().catch(() => {}), 8000);
    overdueScannerInterval = setInterval(() => scanAndSendOverdueTaskAlerts().catch(() => {}), intervalSeconds * 1000);
    return overdueScannerInterval;
}

module.exports = {
    scanAndSendOverdueTaskAlerts,
    startTaskOverdueScanner
};
