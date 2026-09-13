const db = require('../config/db');

// --- Formatter Layer ---
// This is easily extensible for i18n or per-tenant customizations later.
const formatters = {
    'task.created': () => 'Created Task',
    'task.updated': (changes) => {
        const fields = changes?.fields_updated?.to || [];
        return fields.length ? `Updated ${fields.join(', ')}` : 'Updated Task';
    },
    'task.status_changed': (changes) => {
        const from = changes?.status?.from || 'Unknown';
        const to   = changes?.status?.to   || 'Unknown';
        return `Moved from ${from} → ${to}`;
    },
    'deal.created': () => 'Created Deal',
    'deal.updated': (changes) => {
        const fields = changes?.fields_updated?.to || [];
        return fields.length ? `Updated ${fields.join(', ')}` : 'Updated Deal';
    },
    'deal.stage_changed': (changes) => {
        const from = changes?.pipeline_stage?.from || 'Unknown';
        const to   = changes?.pipeline_stage?.to   || 'Unknown';
        return `Moved from ${from} → ${to}`;
    },
    'customer.created': () => 'Created Customer',
    'customer.updated': (changes) => {
        const fields = changes?.fields_updated?.to || [];
        return fields.length ? `Updated ${fields.join(', ')}` : 'Updated Customer';
    },
    'customer.assigned': (changes) => {
        const to = changes?.assigned_to?.to || 'Unassigned';
        return `Assigned to User ID: ${to}`; // Resolved to name on frontend via join
    },

    // ── Manual Interaction Log Formatters ─────────────────────────────────
    'customer.called': (changes) => {
        const note = changes?.note?.to;
        return note ? `📞 Called — "${note}"` : '📞 Called customer';
    },
    'customer.whatsapp': (changes) => {
        const note = changes?.note?.to;
        return note ? `💬 WhatsApp — "${note}"` : '💬 Sent WhatsApp message';
    },
    'customer.meeting': (changes) => {
        const note = changes?.note?.to;
        return note ? `🤝 Meeting — "${note}"` : '🤝 Had a meeting';
    },
    'customer.email_sent': (changes) => {
        const note = changes?.note?.to;
        return note ? `📧 Email Sent — "${note}"` : '📧 Sent email';
    },
    'customer.follow_up': (changes) => {
        const note = changes?.note?.to;
        return note ? `🔔 Follow-Up — "${note}"` : '🔔 Followed up with customer';
    },
    'customer.visited': (changes) => {
        const note = changes?.note?.to;
        return note ? `🏠 Site Visit — "${note}"` : '🏠 Visited site with customer';
    },
    'customer.note': (changes) => {
        const note = changes?.note?.to;
        return note ? `📝 Note — "${note}"` : '📝 Added a note';
    },
    // Generic manual log fallback for deal entity
    'deal.called': (changes) => { const n = changes?.note?.to; return n ? `📞 Called — "${n}"` : '📞 Called'; },
    'deal.note':   (changes) => { const n = changes?.note?.to; return n ? `📝 Note — "${n}"` : '📝 Note'; },
};

const formatActivity = (entity_type, action, meta) => {
    const key = `${entity_type}.${action}`;
    const formatter = formatters[key];
    if (formatter) {
        return formatter(meta?.changes || {});
    }
    // Fallback
    return `Performed action: ${action}`;
};

// @desc    Get activities for a specific entity
// @route   GET /api/activities/:entity_type/:entity_id
// @access  Private
exports.getActivities = async (req, res) => {
    const { entity_type, entity_id } = req.params;
    const tenant_id = req.user.tenant_id;

    // Pagination
    const limit  = parseInt(req.query.limit)  || 20;
    const offset = parseInt(req.query.offset) || 0;

    try {
        const query = `
            SELECT a.*, u.name as user_name 
            FROM activities a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.tenant_id::text = $1::text 
              AND a.entity_type = $2 
              AND a.entity_id   = $3
            ORDER BY a.created_at DESC
            LIMIT $4 OFFSET $5
        `;
        const result = await db.query(query, [tenant_id, entity_type, entity_id, limit, offset]);

        // Format data before sending to frontend
        const formattedData = result.rows.map(activity => {
            const meta = typeof activity.meta === 'string'
                ? JSON.parse(activity.meta)
                : (activity.meta || {});

            // Snapshot fallback: if user was deleted, use snapshot name
            const display_user_name = activity.user_name || meta?.user_snapshot?.user_name || 'System';

            return {
                id:                activity.id,
                action:            activity.action,
                entity_type:       activity.entity_type,
                entity_id:         activity.entity_id,
                created_at:        activity.created_at,
                user_name:         display_user_name,
                formatted_message: formatActivity(activity.entity_type, activity.action, meta),
                meta
            };
        });

        res.json({ status: 'success', data: formattedData });
    } catch (err) {
        console.error('[Activity API Error]', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to fetch activities' });
    }
};

// @desc    Manually create an activity log entry (call log, meeting, note, etc.)
// @route   POST /api/activities/:entity_type/:entity_id
// @access  Private
exports.createActivity = async (req, res) => {
    const { entity_type, entity_id } = req.params;
    const { action, note } = req.body;
    const tenant_id = req.user.tenant_id;

    // Validate action type
    const ALLOWED_MANUAL_ACTIONS = ['called', 'whatsapp', 'meeting', 'email_sent', 'follow_up', 'visited', 'note'];
    if (!action || !ALLOWED_MANUAL_ACTIONS.includes(action)) {
        return res.status(400).json({
            status: 'error',
            message: `Invalid action. Must be one of: ${ALLOWED_MANUAL_ACTIONS.join(', ')}`
        });
    }

    if (!note || note.trim() === '') {
        return res.status(400).json({
            status: 'error',
            message: 'A description/note is required for manual log entries.'
        });
    }

    try {
        const meta = {
            user_snapshot: {
                user_id:   req.user.id,
                user_name: req.user.name || 'Unknown',
                user_role: req.user.role || 'employee'
            },
            changes: {
                note: { to: note.trim() }
            },
            is_manual: true
        };

        const result = await db.query(
            `INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, meta)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [tenant_id, req.user.id, entity_type, entity_id, action, JSON.stringify(meta)]
        );

        const activity = result.rows[0];
        const formattedMessage = formatActivity(entity_type, action, meta);

        res.status(201).json({
            status: 'success',
            data: {
                id:                activity.id,
                action:            activity.action,
                entity_type:       activity.entity_type,
                entity_id:         activity.entity_id,
                created_at:        activity.created_at,
                user_name:         req.user.name || 'Unknown',
                formatted_message: formattedMessage,
                meta
            }
        });
    } catch (err) {
        console.error('[Create Activity Error]', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to save activity log.' });
    }
};
