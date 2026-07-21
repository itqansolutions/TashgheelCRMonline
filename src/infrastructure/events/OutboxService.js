const db = require('../../../config/db');
const { eventBus } = require('./LocalEventBus');

/**
 * 📬 OutboxService (Transactional Outbox Pattern Engine)
 * Guarantees zero event loss: Writes domain events to outbox_events inside DB transactions,
 * then dispatches them asynchronously to the EventBus.
 */
class OutboxService {
    /**
     * Stage event inside Outbox table
     * @param {Object} client - DB Client (if inside UnitOfWork)
     * @param {import('./DomainEvent')} event 
     */
    async stageEvent(client, event) {
        const query = `
            INSERT INTO outbox_events (
                id, tenant_id, branch_id, aggregate_type, aggregate_id, 
                event_name, version, payload, actor_id, status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
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
            event.actorId
        ];

        const executor = client || db;
        await executor.query(query, values);
        console.log(`📬 [Outbox] Staged event ${event.qualifiedName} in outbox.`);
    }

    /**
     * Background Poller: Flushes pending outbox events to EventBus
     */
    async processOutbox() {
        try {
            const pending = await db.query(`
                SELECT * FROM outbox_events 
                WHERE status = 'pending' 
                ORDER BY created_at ASC 
                LIMIT 50
                FOR UPDATE SKIP LOCKED
            `);

            if (pending.rows.length === 0) return;

            console.log(`📬 [OutboxEngine] Processing ${pending.rows.length} pending outbox event(s)...`);

            for (const row of pending.rows) {
                try {
                    // Reconstruct event payload
                    const event = {
                        id: row.id,
                        eventName: row.event_name,
                        version: row.version,
                        qualifiedName: `${row.event_name}.${row.version}`,
                        tenantId: row.tenant_id,
                        branchId: row.branch_id,
                        aggregateType: row.aggregate_type,
                        aggregateId: row.aggregate_id,
                        payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
                        actorId: row.actor_id,
                        occurredAt: row.created_at
                    };

                    await eventBus.publish(event);

                    // Mark as processed
                    await db.query(`
                        UPDATE outbox_events 
                        SET status = 'published', processed_at = CURRENT_TIMESTAMP 
                        WHERE id = $1
                    `, [row.id]);
                } catch (err) {
                    console.error(`❌ [OutboxEngine] Error publishing event ${row.id}:`, err.message);
                    await db.query(`
                        UPDATE outbox_events 
                        SET status = 'failed', retry_count = retry_count + 1 
                        WHERE id = $1
                    `, [row.id]);
                }
            }
        } catch (err) {
            console.error('❌ [OutboxEngine] Processing Error:', err.message);
        }
    }

    /**
     * Starts background poller
     */
    startOutboxPoller(intervalMs = 5000) {
        console.log(`📬 [OutboxEngine] Outbox Poller active (polling every ${intervalMs}ms).`);
        setInterval(() => this.processOutbox(), intervalMs);
    }
}

module.exports = new OutboxService();
