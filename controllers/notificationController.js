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

// ============================================================================
// P4 — TENANT NOTIFICATION RULES & DELIVERY AUDIT LOGS
// ============================================================================

const SUPPORTED_NOTIFICATION_EVENTS = [
    {
        event_name: 'lead.assigned',
        title_ar: 'إسناد عميل محتمل جديد للموظف',
        title_en: 'New Lead Assigned to Employee',
        description_ar: 'إرسال إشعار واتساب فوري للموظف عند إسناد عميل محتمل (Lead) جديد إليه',
        description_en: 'Send instant WhatsApp alert when a new lead is assigned to an employee',
        category: 'employee_alerts',
        recipient_type: 'employee',
        default_channels: ['in_app', 'whatsapp']
    },
    {
        event_name: 'task.assigned',
        title_ar: 'تعيين أو تحويل مهمة للموظف',
        title_en: 'Task Assigned or Reassigned',
        description_ar: 'إرسال إشعار واتساب للموظف عند تعيين مهمة جديدة له أو نقلها إليه',
        description_en: 'Send WhatsApp alert to employee when a task is assigned or reassigned to them',
        category: 'employee_alerts',
        recipient_type: 'employee',
        default_channels: ['in_app', 'whatsapp']
    },
    {
        event_name: 'task.overdue',
        title_ar: 'تنبيه المهام المتأخرة',
        title_en: 'Overdue Task Alert',
        description_ar: 'فحص دوري وتنبيه الموظف عبر واتساب عند تجاوز المهمة لموعد الاستحقاق دون إغلاق',
        description_en: 'Periodic scan and WhatsApp alert when an active task passes its due date',
        category: 'employee_alerts',
        recipient_type: 'employee',
        default_channels: ['in_app', 'whatsapp']
    },
    {
        event_name: 'activity.reminder',
        title_ar: 'تذكير مواعيد متابعة العملاء',
        title_en: 'Scheduled Follow-up Reminder',
        description_ar: 'إرسال تذكير واتساب للموظف في الموعد المجدول لمتابعة العميل (مكالمة / اجتماع)',
        description_en: 'Send WhatsApp reminder to employee at scheduled customer follow-up time',
        category: 'employee_alerts',
        recipient_type: 'employee',
        default_channels: ['in_app', 'whatsapp']
    },
    {
        event_name: 'invoice.delivery',
        title_ar: 'إرسال الفواتير للعملاء عبر واتساب',
        title_en: 'Manual Invoice Delivery to Customer',
        description_ar: 'تفعيل زر إرسال تفاصيل الفاتورة للعملاء يدوياً عبر واتساب من شاشة معاينة الفاتورة',
        description_en: 'Enable manual WhatsApp invoice delivery to customers from invoice preview',
        category: 'customer_messaging',
        recipient_type: 'customer',
        default_channels: ['whatsapp']
    }
];

exports.SUPPORTED_NOTIFICATION_EVENTS = SUPPORTED_NOTIFICATION_EVENTS;

// @desc    Get all notification rules for current tenant (merged with defaults)
// @route   GET /api/notifications/rules
// @access  Private
exports.getNotificationRules = async (req, res) => {
    const tenant_id = req.user?.tenant_id;
    if (!tenant_id) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized: missing tenant context' });
    }

    try {
        const dbRes = await db.query(`
            SELECT id, event_name, is_enabled, channels, template_name, template_language, recipient_roles, conditions, updated_at
            FROM notification_rules
            WHERE tenant_id::text = $1::text
        `, [tenant_id]);

        const rulesByEvent = {};
        for (const row of dbRes.rows) {
            rulesByEvent[row.event_name] = row;
        }

        const mergedRules = SUPPORTED_NOTIFICATION_EVENTS.map((meta) => {
            const saved = rulesByEvent[meta.event_name];
            return {
                id: saved?.id || null,
                event_name: meta.event_name,
                title_ar: meta.title_ar,
                title_en: meta.title_en,
                description_ar: meta.description_ar,
                description_en: meta.description_en,
                category: meta.category,
                recipient_type: meta.recipient_type,
                is_enabled: saved !== undefined ? Boolean(saved.is_enabled) : true,
                channels: Array.isArray(saved?.channels) ? saved.channels : meta.default_channels,
                template_name: saved?.template_name || '',
                template_language: saved?.template_language || 'ar',
                updated_at: saved?.updated_at || null
            };
        });

        return res.json({
            status: 'success',
            data: mergedRules
        });
    } catch (err) {
        console.error('[Notifications] getNotificationRules Error:', err.message);
        return res.status(500).json({ status: 'error', message: 'Failed to retrieve notification rules.' });
    }
};

// @desc    Upsert one or more notification rules for current tenant
// @route   PUT /api/notifications/rules
// @access  Private (Admin / Manager)
exports.updateNotificationRules = async (req, res) => {
    const tenant_id = req.user?.tenant_id;
    if (!tenant_id) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized: missing tenant context' });
    }

    const body = req.body || {};
    const rulesInput = Array.isArray(body.rules)
        ? body.rules
        : (body.event_name ? [body] : []);

    if (rulesInput.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No notification rules provided to update.' });
    }

    const validEventNames = new Set(SUPPORTED_NOTIFICATION_EVENTS.map(e => e.event_name));
    for (const item of rulesInput) {
        if (!item.event_name || !validEventNames.has(item.event_name)) {
            return res.status(400).json({
                status: 'error',
                message: `Unsupported notification event_name: '${item.event_name}'`
            });
        }
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        for (const item of rulesInput) {
            const meta = SUPPORTED_NOTIFICATION_EVENTS.find(e => e.event_name === item.event_name);
            const isEnabled = item.is_enabled !== undefined ? Boolean(item.is_enabled) : true;
            const channels = Array.isArray(item.channels) && item.channels.length > 0
                ? item.channels
                : meta.default_channels;
            const templateName = item.template_name && String(item.template_name).trim()
                ? String(item.template_name).trim()
                : null;
            const templateLang = item.template_language && String(item.template_language).trim()
                ? String(item.template_language).trim()
                : 'ar';

            await client.query(`
                INSERT INTO notification_rules (
                    tenant_id, event_name, is_enabled, channels, template_name, template_language, updated_at
                )
                VALUES ($1, $2, $3, $4::jsonb, $5, $6, CURRENT_TIMESTAMP)
                ON CONFLICT (tenant_id, event_name)
                DO UPDATE SET
                    is_enabled = EXCLUDED.is_enabled,
                    channels = EXCLUDED.channels,
                    template_name = EXCLUDED.template_name,
                    template_language = EXCLUDED.template_language,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                tenant_id,
                item.event_name,
                isEnabled,
                JSON.stringify(channels),
                templateName,
                templateLang
            ]);
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Notifications] updateNotificationRules Error:', err.message);
        return res.status(500).json({ status: 'error', message: 'Failed to update notification rules.' });
    } finally {
        client.release();
    }

    return exports.getNotificationRules(req, res);
};

// @desc    Get WhatsApp & Notification Delivery Audit Logs for current tenant
// @route   GET /api/notifications/delivery-logs
// @access  Private
exports.getNotificationDeliveryLogs = async (req, res) => {
    const tenant_id = req.user?.tenant_id;
    if (!tenant_id) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized: missing tenant context' });
    }

    const { event_name, delivery_status, recipient_type, limit = 50 } = req.query || {};
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

    try {
        const params = [tenant_id];
        let whereClause = `WHERE nl.tenant_id::text = $1::text`;

        if (event_name && String(event_name).trim()) {
            params.push(String(event_name).trim());
            whereClause += ` AND nl.event_name = $${params.length}`;
        }
        if (delivery_status && String(delivery_status).trim()) {
            params.push(String(delivery_status).trim());
            whereClause += ` AND nl.delivery_status = $${params.length}`;
        }
        if (recipient_type && String(recipient_type).trim()) {
            params.push(String(recipient_type).trim());
            whereClause += ` AND nl.recipient_type = $${params.length}`;
        }

        params.push(safeLimit);
        const logsRes = await db.query(`
            SELECT nl.id, nl.job_id, nl.channel, nl.event_name,
                   nl.recipient_type, nl.recipient_id, nl.recipient_phone, nl.recipient_name,
                   nl.message_body, nl.template_name, nl.meta_message_id,
                   nl.delivery_status, nl.error_code, nl.error_message,
                   nl.sent_at, nl.delivered_at, nl.read_at, nl.failed_at,
                   nl.metadata, nl.created_at, nl.updated_at
            FROM notification_logs nl
            ${whereClause}
            ORDER BY nl.created_at DESC
            LIMIT $${params.length}
        `, params);

        // Compute summary KPIs across the tenant
        const summaryRes = await db.query(`
            SELECT 
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE delivery_status = 'queued')::int AS queued,
                COUNT(*) FILTER (WHERE delivery_status = 'sent')::int AS sent,
                COUNT(*) FILTER (WHERE delivery_status = 'delivered')::int AS delivered,
                COUNT(*) FILTER (WHERE delivery_status = 'read')::int AS read,
                COUNT(*) FILTER (WHERE delivery_status = 'failed')::int AS failed
            FROM notification_logs
            WHERE tenant_id::text = $1::text
        `, [tenant_id]);

        return res.json({
            status: 'success',
            data: logsRes.rows,
            summary: summaryRes.rows[0] || { total: 0, queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 }
        });
    } catch (err) {
        console.error('[Notifications] getNotificationDeliveryLogs Error:', err.message);
        return res.status(500).json({ status: 'error', message: 'Failed to retrieve notification delivery logs.' });
    }
};

