const crypto = require('crypto');

/**
 * 📦 Base Domain Event Class
 * Standardizes event schema with versioning, tenant/branch isolation, and metadata.
 */
class DomainEvent {
    /**
     * @param {Object} params
     * @param {string} params.eventName - e.g. 'reservation.created'
     * @param {string} [params.version='v1'] - Event version e.g. 'v1', 'v2'
     * @param {string} params.tenantId - SaaS Tenant UUID
     * @param {string} [params.branchId] - Branch ID
     * @param {string} params.aggregateType - Entity type e.g. 'Customer', 'REUnit', 'Deal'
     * @param {string} params.aggregateId - Entity ID
     * @param {Object} [params.payload={}] - Event payload data
     * @param {string} [params.actorId] - User ID or 'SYSTEM' who triggered the event
     */
    constructor({
        eventName,
        version = 'v1',
        tenantId,
        branchId = null,
        aggregateType,
        aggregateId,
        payload = {},
        actorId = 'SYSTEM'
    }) {
        if (!eventName) throw new Error('DomainEvent requires an eventName');
        if (!tenantId) throw new Error('DomainEvent requires a tenantId');
        if (!aggregateType) throw new Error('DomainEvent requires an aggregateType');
        if (!aggregateId) throw new Error('DomainEvent requires an aggregateId');

        this.id = crypto.randomUUID();
        this.eventName = eventName;
        this.version = version;
        this.tenantId = String(tenantId);
        this.branchId = branchId ? String(branchId) : null;
        this.aggregateType = aggregateType;
        this.aggregateId = String(aggregateId);
        this.payload = payload;
        this.actorId = actorId ? String(actorId) : 'SYSTEM';
        this.occurredAt = new Date().toISOString();
    }

    /**
     * Returns full qualified event identifier e.g. 'reservation.created.v1'
     */
    get qualifiedName() {
        return `${this.eventName}.${this.version}`;
    }

    toJSON() {
        return {
            id: this.id,
            eventName: this.eventName,
            version: this.version,
            tenantId: this.tenantId,
            branchId: this.branchId,
            aggregateType: this.aggregateType,
            aggregateId: this.aggregateId,
            payload: this.payload,
            actorId: this.actorId,
            occurredAt: this.occurredAt
        };
    }
}

module.exports = DomainEvent;
