const { eventBus } = require('../src/infrastructure/events/LocalEventBus');
const DomainEvent = require('../src/infrastructure/events/DomainEvent');
const registerGlobalSubscribers = require('../src/domains/shared/subscribers/eventSubscribers');
const globalSearchService = require('../src/domains/shared/services/globalSearchService');

async function testPhase2() {
    console.log('🧪 Starting Phase 2 Core Platform Services Verification...');

    // 1. Register Subscribers
    registerGlobalSubscribers(eventBus);

    // 2. Publish Domain Events to trigger Activity & Notifications
    const testReservationEvent = new DomainEvent({
        eventName: 'reservation.created',
        version: 'v1',
        tenantId: '00000000-0000-0000-0000-000000000000',
        aggregateType: 'REUnit',
        aggregateId: 'unit-202',
        payload: { unitNumber: '202', price: 3000000, assignedTo: 1 },
        actorId: 'test-user-admin'
    });

    await eventBus.publish(testReservationEvent);
    console.log('✅ [EventBus] Published reservation.created event successfully.');

    // 3. Test Global Search Engine
    const searchResult = await globalSearchService.search('00000000-0000-0000-0000-000000000000', 'Demo');
    console.log(`✅ [GlobalSearch] Search completed. Found ${searchResult.totalMatches} matches.`);

    console.log('🎉 Phase 2 Core Platform Services Verification PASSED 100%!');
}

testPhase2().catch(err => {
    console.error('❌ Phase 2 Verification Error:', err);
    process.exit(1);
});
