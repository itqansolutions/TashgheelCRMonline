const { Pool } = require('pg');
const eventBus = require('../services/eventBus');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'tashgheel_crm',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
});

/**
 * Log an activity to the activities timeline and emit an event for the Automation Engine.
 * 
 * @param {string} tenant_id - UUID of the tenant
 * @param {object} user - User object containing { id, name, role }
 * @param {string} entity_type - Type of entity ('task', 'deal', 'customer')
 * @param {number} entity_id - ID of the entity
 * @param {string} action - Action performed (e.g., 'created', 'updated', 'status_changed')
 * @param {object} changes - Structured changes object { status: { from: 'A', to: 'B' } }
 */
const logActivity = async (tenant_id, user, entity_type, entity_id, action, changes = {}) => {
    try {
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
        const result = await pool.query(query, values);

        const activityRecord = result.rows[0];

        // Emit to EventBus for Automation Engine (Phase 2 Prep)
        eventBus.emit(eventName, activityRecord);

    } catch (err) {
        console.error(`[ActivityLogger] Failed to log activity for ${entity_type} ${entity_id}:`, err);
    }
};

module.exports = { logActivity };
