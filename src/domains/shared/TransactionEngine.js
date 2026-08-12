/**
 * TransactionEngine — Central ERP Atomic Multi-Step Business Transaction Orchestrator
 *
 * Responsibilities:
 *  - Executes multi-step business transactions inside a SINGLE database transaction.
 *  - Enforces the pattern:
 *      1. BEGIN
 *      2. Validate request
 *      3. Lock rows (SELECT ... FOR UPDATE)
 *      4. Perform business calculations
 *      5. Persist document / entities
 *      6. Post Journal Entry (via JournalEngine)
 *      7. Stage Domain Event into Transactional Outbox (OutboxService)
 *      8. COMMIT
 *  - Guaranteed atomic rollback if ANY step throws an error.
 */

const db = require('../../../config/db');
const outboxService = require('../../infrastructure/events/OutboxService');
const DomainEvent = require('../../infrastructure/events/DomainEvent');

/**
 * Execute a transactional operation atomically.
 *
 * @param {Function} handlerFn - async function(client) returning payload/result
 * @returns {Promise<any>}
 */
async function executeTransaction(handlerFn) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const result = await handlerFn(client);

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Helper to stage a Domain Event into the Transactional Outbox inside an active transaction.
 */
async function stageOutboxEvent(client, { tenantId, branchId = null, aggregateType, aggregateId, eventName, actorId = 'SYSTEM', payload = {} }) {
  const event = new DomainEvent({
    tenantId,
    branchId,
    aggregateType,
    aggregateId: String(aggregateId),
    eventName,
    actorId: String(actorId),
    payload
  });

  return await outboxService.stageEvent(client, event);
}

module.exports = {
  executeTransaction,
  stageOutboxEvent,
};
