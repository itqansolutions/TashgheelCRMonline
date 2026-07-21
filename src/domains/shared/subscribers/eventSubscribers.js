const activityService = require('../services/activityService');
const notificationDispatcher = require('../services/notificationDispatcher');

/**
 * 📡 Register Global Event Subscribers
 * Listens to domain events and executes cross-cutting side effects automatically:
 *  - Universal Activity Feed logging
 *  - Notification dispatching
 *  - Audit Trail generation
 */
function registerGlobalSubscribers(eventBus) {
    console.log('📡 [Subscribers] Registering global domain event listeners...');

    // Wildcard subscriber for Activity Feed & Audit Logging
    eventBus.subscribe('*', async (event) => {
        try {
            await activityService.logActivity({
                tenantId: event.tenantId,
                branchId: event.branchId,
                entityType: event.aggregateType,
                entityId: event.aggregateId,
                activityType: event.eventName.toUpperCase().replace(/\./g, '_'),
                actorId: event.actorId,
                title: `Event: ${event.eventName} (${event.version})`,
                details: event.payload
            });
        } catch (err) {
            console.error('❌ [Subscribers] Activity logging failed:', err.message);
        }
    });

    // 1. Property Reservation Created Listener
    eventBus.subscribe('reservation.created', async (event) => {
        const { unitNumber, price, customerId, assignedTo } = event.payload || {};
        
        if (assignedTo) {
            await notificationDispatcher.dispatch({
                tenantId: event.tenantId,
                branchId: event.branchId,
                userId: assignedTo,
                type: 'success',
                title: '🏢 New Property Reservation',
                message: `Unit #${unitNumber || event.aggregateId} has been reserved.`,
                link: '/real-estate/units',
                channels: ['in_app']
            });
        }
    });

    // 2. Deal Stage Changed Listener
    eventBus.subscribe('deal.stage_changed', async (event) => {
        const { dealTitle, newStage, assignedTo } = event.payload || {};
        
        if (assignedTo) {
            await notificationDispatcher.dispatch({
                tenantId: event.tenantId,
                branchId: event.branchId,
                userId: assignedTo,
                type: 'info',
                title: '💼 Deal Stage Updated',
                message: `Deal '${dealTitle}' moved to stage '${newStage}'.`,
                link: '/deals',
                channels: ['in_app']
            });
        }
    });

    // 3. Payment Received Listener
    eventBus.subscribe('payment.received', async (event) => {
        const { invoiceNumber, amount, receivedBy } = event.payload || {};
        
        if (receivedBy) {
            await notificationDispatcher.dispatch({
                tenantId: event.tenantId,
                branchId: event.branchId,
                userId: receivedBy,
                type: 'success',
                title: '💰 Payment Received',
                message: `Payment of EGP ${amount} recorded for Invoice ${invoiceNumber}.`,
                link: '/invoices',
                channels: ['in_app']
            });
        }
    });
}

module.exports = registerGlobalSubscribers;
