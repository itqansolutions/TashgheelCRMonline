/**
 * 🛡️ IDomainEventBus Abstraction Interface
 * 
 * Domain Services & Application Handlers interact ONLY with this interface.
 * Allows seamless switching between LocalEventBus (EventEmitter), RabbitMQ, Kafka, AWS SQS, etc.
 */
class EventBusInterface {
    /**
     * Publishes a single domain event to all registered subscribers.
     * @param {import('./DomainEvent')} event 
     * @returns {Promise<void>}
     */
    async publish(event) {
        throw new Error('EventBusInterface.publish() must be implemented by concrete driver');
    }

    /**
     * Publishes a batch of domain events in sequence or parallel.
     * @param {Array<import('./DomainEvent')>} events 
     * @returns {Promise<void>}
     */
    async publishBatch(events) {
        throw new Error('EventBusInterface.publishBatch() must be implemented by concrete driver');
    }

    /**
     * Subscribes a handler function to a specific event name.
     * @param {string} eventName 
     * @param {Function} handler 
     */
    subscribe(eventName, handler) {
        throw new Error('EventBusInterface.subscribe() must be implemented by concrete driver');
    }

    /**
     * Unsubscribes a handler function from a specific event name.
     * @param {string} eventName 
     * @param {Function} handler 
     */
    unsubscribe(eventName, handler) {
        throw new Error('EventBusInterface.unsubscribe() must be implemented by concrete driver');
    }
}

module.exports = EventBusInterface;
