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
        const to = changes?.status?.to || 'Unknown';
        return `Moved from ${from} → ${to}`;
    },
    'deal.created': () => 'Created Deal',
    'deal.updated': (changes) => {
        const fields = changes?.fields_updated?.to || [];
        return fields.length ? `Updated ${fields.join(', ')}` : 'Updated Deal';
    },
    'deal.stage_changed': (changes) => {
        const from = changes?.pipeline_stage?.from || 'Unknown';
        const to = changes?.pipeline_stage?.to || 'Unknown';
        return `Moved from ${from} → ${to}`;
    },
    'customer.created': () => 'Created Customer',
    'customer.updated': (changes) => {
        const fields = changes?.fields_updated?.to || [];
        return fields.length ? `Updated ${fields.join(', ')}` : 'Updated Customer';
    },
    'customer.assigned': (changes) => {
        const to = changes?.assigned_to?.to || 'Unassigned';
        return `Assigned to User ID: ${to}`; // Usually we resolve this to name on frontend or via join, but this serves as the backend formatter.
    }
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
    
    // Pagination (Limit / Offset initially, can be converted to cursor later)
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    try {
        const query = `
            SELECT a.*, u.name as user_name 
            FROM activities a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.tenant_id::text = $1::text 
              AND a.entity_type = $2 
              AND a.entity_id = $3
            ORDER BY a.created_at DESC
            LIMIT $4 OFFSET $5
        `;
        const result = await db.query(query, [tenant_id, entity_type, entity_id, limit, offset]);

        // Format data before sending to frontend
        const formattedData = result.rows.map(activity => {
            const meta = typeof activity.meta === 'string' ? JSON.parse(activity.meta) : (activity.meta || {});
            
            // Snapshot fallback: if user was deleted (u.name is null), use snapshot name
            const display_user_name = activity.user_name || meta?.user_snapshot?.user_name || 'System';
            
            return {
                id: activity.id,
                action: activity.action,
                entity_type: activity.entity_type,
                entity_id: activity.entity_id,
                created_at: activity.created_at,
                user_name: display_user_name,
                formatted_message: formatActivity(activity.entity_type, activity.action, meta),
                meta: meta
            };
        });

        res.json({ status: 'success', data: formattedData });
    } catch (err) {
        console.error('[Activity API Error]', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to fetch activities' });
    }
};
