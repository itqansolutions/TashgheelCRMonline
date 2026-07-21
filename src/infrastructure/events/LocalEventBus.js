const EventEmitter = require('events');
const EventBusInterface = require('./EventBusInterface');

/**
 * ⚡ LocalEventBus (In-Memory Async Driver)
 * Concrete implementation of IDomainEventBus using Node.js EventEmitter.
 * Features:
 *  - Async subscriber execution without blocking main thread
 *  - Safe Error Boundaries (one subscriber failing does not stop others)
 *  - Automatic Event Store persistence hook
 */
class LocalEventBus extends EventBusInterface {
    constructor(eventStoreRepository = null) {
        super();
        this.emitter = new EventEmitter();
        // Increase max listeners for heavy subscriber counts
        this.emitter.setMaxListeners(100);
        this.eventStore = eventStoreRepository;
    }

    /**
     * Attaches an EventStore repository dynamically after DB initialization.
     * @param {Object} eventStoreRepository 
     */
    setEventStore(eventStoreRepository) {
        this.eventStore = eventStoreRepository;
    }

    /**
     * @param {import('./DomainEvent')} event 
     */
    async publish(event) {
        if (!event || !event.eventName) {
            console.warn('⚠️ [LocalEventBus] Received invalid event object.');
            return;
        }

        console.log(`📢 [EventBus] Emitting Event: ${event.qualifiedName} | Tenant: ${event.tenantId} | Aggregate: ${event.aggregateType}#${event.aggregateId}`);

        // 1. Persist event to Event Store asynchronously (if available)
        if (this.eventStore) {
            this.eventStore.saveEvent(event).catch(err => {
                console.error(`❌ [EventStore] Failed to persist event ${event.id}:`, err.message);
            });
        }

        // 2. Trigger qualified listeners e.g. 'reservation.created.v1'
        const qualifiedListeners = this.emitter.listeners(event.qualifiedName);
        for (const handler of qualifiedListeners) {
            this._safeExecute(handler, event);
        }

        // 3. Trigger generic listeners e.g. 'reservation.created'
        const genericListeners = this.emitter.listeners(event.eventName);
        for (const handler of genericListeners) {
            this._safeExecute(handler, event);
        }

        // 4. Trigger wildcard listeners e.g. '*'
        const wildcardListeners = this.emitter.listeners('*');
        for (const handler of wildcardListeners) {
            this._safeExecute(handler, event);
        }
    }

    /**
     * @param {Array<import('./DomainEvent')>} events 
     */
    async publishBatch(events) {
        if (!Array.isArray(events)) return;
        for (const event of events) {
            await this.publish(event);
        }
    }

    /**
     * @param {string} eventName 
     * @param {Function} handler 
     */
    subscribe(eventName, handler) {
        this.emitter.on(eventName, handler);
        console.log(`📡 [EventBus] Subscribed to event: '${eventName}'`);
    }

    /**
     * @param {string} eventName 
     * @param {Function} handler 
     */
    unsubscribe(eventName, handler) {
        this.emitter.removeListener(eventName, handler);
        console.log(`🔕 [EventBus] Unsubscribed from event: '${eventName}'`);
    }

    /**
     * Executes subscriber handler safely in isolated async block
     */
    async _safeExecute(handler, event) {
        try {
            await handler(event);
        } catch (err) {
            console.error(`🔥 [EventBus] Handler Error on event '${event.qualifiedName}':`, {
                message: err.message,
                stack: err.stack,
                eventId: event.id
            });
        }
    }
}

// Singleton Instance export
const globalEventBus = new LocalEventBus();
module.exports = {
    LocalEventBus,
    eventBus: globalEventBus
};
