const db = require('../config/db');
const eventBus = require('../services/eventBus');


/**
 * Log an activity to the activities timeline and emit an event for the Automation Engine.
 * 
 * @param {string} tenant_id - UUID of the tenant
 * @param {object} user - User object containing { id, name, role }
 * @param {string} entity_type - Type of entity ('task', 'deal', 'customer')
 * @param {number} entity_id - ID of the entity
 * @param {string} action - Action performed (e.g., 'created', 'updated', 'status_changed')
 * @param {object} [dbClient=null] - Optional pg client for participating in a transaction
 */
const logActivity = async (tenant_id, user, entity_type, entity_id, action, changes = {}, dbClient = null) => {
    try {
        const client = dbClient || db;
        // Construct User Snapshot and Meta Data
        const meta = {
            user_snapshot: {
                user_id: user?.id || null,
                user_name: user?.name || 'System',
                user_role: user?.role || 'System'
            },
            changes: changes
        };

        const eventName = `${entity_type}.${action}`;

        const query = `
            INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, meta)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        const values = [tenant_id, user?.id || null, entity_type, entity_id, action, JSON.stringify(meta)];
        const result = await client.query(query, values);

        const activityRecord = result.rows[0];

        // Emit to EventBus for Automation Engine (Phase 2 Prep)
        // If inside transaction, caller handles post-commit dispatch.
        if (!dbClient) {
            eventBus.emit(eventName, activityRecord);
        }

        return activityRecord;

    } catch (err) {
        console.error(`[ActivityLogger] Failed to log activity for ${entity_type} ${entity_id}:`, err);
        if (dbClient) throw err;
    }
};

module.exports = { logActivity };
