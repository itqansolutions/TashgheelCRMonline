const db = require('../config/db');

/**
 * System Logger Utility
 * @param {Object} req - Express request object (to get user_id)
 * @param {string} action - Action type: CREATE, UPDATE, DELETE, LOGIN
 * @param {string} entityType - Entity: Customer, Deal, Task, etc.
 * @param {number} entityId - ID of the affected record
 * @param {Object} details - Additional JSON data (diff, fields, etc.)
 */
const logAction = async (req, userId, action, entityType, entityId, details = null) => {
    try {
        // userId can be passed explicitly (for login) or taken from req.user
        const actorId = userId || (req?.user ? req.user.id : null);
        
        await db.query(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
            [actorId, action, entityType, entityId, details ? JSON.stringify(details) : null]
        );
    } catch (err) {
        // We log to console but don't crash the request if logging fails
        console.error('CRITICAL: Audit logging failed:', err.message);
    }
};

/**
 * Helper to calculate diff between two objects
 */
const getDiff = (oldData, newData) => {
    const changes = {};
    const ignoredFields = ['updated_at', 'created_at', 'id'];
    
    Object.keys(newData).forEach(key => {
        if (!ignoredFields.includes(key) && oldData[key] !== newData[key]) {
            changes[key] = {
                old: oldData[key],
                new: newData[key]
            };
        }
    });
    
    return Object.keys(changes).length > 0 ? changes : null;
};

module.exports = {
    logAction,
    getDiff
};
