const BaseRepository = require('../../../shared/repositories/BaseRepository');

/**
 * 📜 ActivityRepository
 * Interacts with `activities` table supporting polymorphic logging (entity_type, entity_id).
 */
class ActivityRepository extends BaseRepository {
    constructor() {
        super('activities', 'id');
    }

    /**
     * Gets chronological activity timeline feed for any entity
     * @param {string} tenantId 
     * @param {string} entityType - e.g. 'Customer', 'REUnit', 'Deal', 'Invoice'
     * @param {string} entityId 
     * @param {Object} [options={}]
     */
    async getTimeline(tenantId, entityType, entityId, { limit = 50, offset = 0 } = {}) {
        const query = `
            SELECT * FROM activities
            WHERE tenant_id::text = $1::text AND entity_type = $2 AND entity_id::text = $3::text
            ORDER BY created_at DESC
            LIMIT $4 OFFSET $5
        `;
        const result = await this.db.query(query, [String(tenantId), entityType, String(entityId), limit, offset]);
        return result.rows;
    }
}

module.exports = new ActivityRepository();
