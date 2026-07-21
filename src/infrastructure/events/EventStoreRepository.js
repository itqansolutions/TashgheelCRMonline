const db = require('../../../config/db');

/**
 * 🗄️ EventStoreRepository
 * Encapsulates persistence & querying for domain_events table.
 * Supports Event Replay, Audit Inspection, and Integration Syncing.
 */
class EventStoreRepository {
    /**
     * Persists a DomainEvent instance into PostgreSQL database
     * @param {import('./DomainEvent')} event 
     */
    async saveEvent(event) {
        const query = `
            INSERT INTO domain_events (
                id, tenant_id, branch_id, aggregate_type, aggregate_id, 
                event_name, version, payload, actor_id, occurred_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (id) DO NOTHING
        `;

        const values = [
            event.id,
            event.tenantId,
            event.branchId,
            event.aggregateType,
            event.aggregateId,
            event.eventName,
            event.version,
            JSON.stringify(event.payload || {}),
            event.actorId,
            event.occurredAt
        ];

        await db.query(query, values);
    }

    /**
     * Retrieves event stream for a specific aggregate entity (e.g. RE Unit or Customer)
     * @param {string} tenantId 
     * @param {string} aggregateType 
     * @param {string} aggregateId 
     */
    async getEventsByAggregate(tenantId, aggregateType, aggregateId) {
        const result = await db.query(`
            SELECT * FROM domain_events 
            WHERE tenant_id = $1 AND aggregate_type = $2 AND aggregate_id = $3
            ORDER BY occurred_at ASC
        `, [tenantId, aggregateType, aggregateId]);

        return result.rows;
    }

    /**
     * Replays events from a given timestamp for event replay / debugging
     * @param {string} tenantId 
     * @param {string} fromTimestamp 
     */
    async getEventsFromTimestamp(tenantId, fromTimestamp) {
        const result = await db.query(`
            SELECT * FROM domain_events 
            WHERE tenant_id = $1 AND occurred_at >= $2
            ORDER BY occurred_at ASC
        `, [tenantId, fromTimestamp]);

        return result.rows;
    }
}

module.exports = new EventStoreRepository();
