const activityRepository = require('../repositories/activityRepository');

/**
 * 📜 ActivityService
 * Manages creation and retrieval of universal activity feed items across any entity.
 */
class ActivityService {
    /**
     * Records an activity item
     */
    async logActivity({
        tenantId,
        branchId = null,
        entityType,
        entityId,
        activityType,
        actorId = 'SYSTEM',
        actorName = 'System Automator',
        title,
        details = {},
        visibility = 'internal'
    }) {
        if (!tenantId || !entityType || !entityId || !title) {
            console.warn('⚠️ [ActivityService] Missing required parameters for activity logging.');
            return null;
        }

        return await activityRepository.insert(tenantId, {
            entity_type: entityType,
            entity_id: String(entityId),
            activity_type: activityType || 'NOTE',
            actor_id: String(actorId),
            actor_name: actorName,
            title,
            details: JSON.stringify(details),
            visibility
        }, branchId);
    }

    /**
     * Gets timeline for a specific entity (e.g. Customer, REUnit, Deal)
     */
    async getEntityTimeline(tenantId, entityType, entityId, options = {}) {
        return await activityRepository.getTimeline(tenantId, entityType, entityId, options);
    }
}

module.exports = new ActivityService();
