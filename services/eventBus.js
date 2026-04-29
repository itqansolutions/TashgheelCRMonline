const EventEmitter = require('events');

const emitter = new EventEmitter();

/**
 * EventBus Abstraction
 * Currently uses Node.js EventEmitter for Phase 1.5.
 * Designed to be easily swapped with BullMQ or Redis Pub/Sub in the future.
 */
const eventBus = {
    emit: (event, payload) => {
        emitter.emit(event, payload);
    },
    on: (event, handler) => {
        emitter.on(event, handler);
    }
};

module.exports = eventBus;
