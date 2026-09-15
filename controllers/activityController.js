const db = require('../config/db');

// Ensure activities table exists and has all required columns to prevent DB crashes.
// The activities table may have been created by dbReconciliation.js with a different schema
// (using actor_id/activity_type/title instead of user_id/action/meta). We add the missing
// columns idempotently so the controller queries always work regardless of creation order.
let activitiesTableEnsured = false;
async function ensureActivitiesTable() {
    if (activitiesTableEnsured) return;
    try {
        // Create table with legacy schema if it doesn't exist at all
        await db.query(`
            CREATE TABLE IF NOT EXISTS activities (
                id SERIAL PRIMARY KEY,
                tenant_id UUID,
                user_id INTEGER,
                entity_type VARCHAR(50) NOT NULL,
                entity_id VARCHAR(50) NOT NULL,
                action VARCHAR(100) NOT NULL,
                meta JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Backfill columns that may be missing if dbReconciliation.js created the table first
        await db.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS user_id INTEGER;`);
        await db.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS action VARCHAR(100);`);
        await db.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}';`);
        await db.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS entity_id VARCHAR(255);`);
        // Drop NOT NULL constraints added by dbReconciliation.js that block legacy INSERTs
        await db.query(`ALTER TABLE activities ALTER COLUMN activity_type DROP NOT NULL;`).catch(() => {});
        await db.query(`ALTER TABLE activities ALTER COLUMN title DROP NOT NULL;`).catch(() => {});
        await db.query(`ALTER TABLE activities ALTER COLUMN entity_type DROP NOT NULL;`).catch(() => {});
        await db.query(`ALTER TABLE activities ALTER COLUMN tenant_id DROP NOT NULL;`).catch(() => {});
        await db.query(`CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(tenant_id, entity_type, entity_id);`);
        activitiesTableEnsured = true;
    } catch (e) {
        console.error('[Activities] Ensure table notice:', e.message);
    }
}

// --- Formatter Layer ---
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
        return `Assigned to User ID: ${to}`;
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
    const key = `${entity_type?.toLowerCase()}.${action}`;
    const formatter = formatters[key];
    if (formatter) {
        return formatter(meta?.changes || {});
    }
    return `Performed action: ${action}`;
};

// @desc    Get activities for a specific entity
// @route   GET /api/activities/:entity_type/:entity_id
// @access  Private
exports.getActivities = async (req, res) => {
    await ensureActivitiesTable();
    const { entity_type, entity_id } = req.params;
    const tenant_id = req.user.tenant_id;

    // Pagination
    const limit  = parseInt(req.query.limit)  || 30;
    const offset = parseInt(req.query.offset) || 0;

    try {
        const query = `
            SELECT a.*, u.name as user_name 
            FROM activities a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.tenant_id::text = $1::text 
              AND LOWER(a.entity_type) = LOWER($2) 
              AND a.entity_id::text   = $3::text
            ORDER BY a.created_at DESC
            LIMIT $4 OFFSET $5
        `;
        const result = await db.query(query, [tenant_id, entity_type, entity_id, limit, offset]);

        // Format data before sending to frontend
        const formattedData = result.rows.map(activity => {
            const meta = typeof activity.meta === 'string'
                ? JSON.parse(activity.meta)
                : (activity.meta || {});

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
        console.error('[Activity API Error]', err.message, err.detail || '', err.hint || '');
        res.status(500).json({ status: 'error', message: 'Failed to fetch activities', debug: err.message });
    }
};

// @desc    Manually create an activity log entry (call log, meeting, note, etc.)
// @route   POST /api/activities/:entity_type/:entity_id
// @access  Private
exports.createActivity = async (req, res) => {
    await ensureActivitiesTable();
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

        const cleanEntityType = (entity_type || 'customer').toLowerCase();

        const result = await db.query(
            `INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, meta)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [tenant_id, req.user.id, cleanEntityType, String(entity_id), action, JSON.stringify(meta)]
        );

        const activity = result.rows[0];
        const formattedMessage = formatActivity(cleanEntityType, action, meta);

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
