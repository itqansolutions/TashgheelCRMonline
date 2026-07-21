const { eventBus } = require('../src/infrastructure/events/LocalEventBus');
const DomainEvent = require('../src/infrastructure/events/DomainEvent');
const eventStoreRepository = require('../src/infrastructure/events/EventStoreRepository');
const BasePolicy = require('../src/shared/policies/BasePolicy');
const { Specification } = require('../src/shared/specs/Specification');
const AIService = require('../src/infrastructure/ai/AIService');

async function testPhase1() {
    console.log('🧪 Starting Phase 1 Platform Foundation Verification...');

    // 1. Verify Event Bus Abstraction & Subscribers
    let eventHandled = false;
    eventBus.setEventStore(eventStoreRepository);

    eventBus.subscribe('reservation.created.v1', async (event) => {
        console.log(`✅ [Subscriber] Received domain event: ${event.qualifiedName} | Payload:`, event.payload);
        eventHandled = true;
    });

    const testEvent = new DomainEvent({
        eventName: 'reservation.created',
        version: 'v1',
        tenantId: '00000000-0000-0000-0000-000000000000',
        aggregateType: 'REUnit',
        aggregateId: 'unit-101',
        payload: { unitNumber: '101', price: 2500000 },
        actorId: 'test-user-1'
    });

    await eventBus.publish(testEvent);

    if (!eventHandled) {
        throw new Error('❌ Event subscriber did not receive published event');
    }

    // 2. Test Policy Enforcement
    try {
        BasePolicy.enforce(true, 'Should pass');
        console.log('✅ [Policy] Policy enforce passed successfully.');
    } catch (e) {
        throw new Error('❌ Policy enforcement failed unexpectedly');
    }

    // 3. Test Specification Pattern
    class MinimumPriceSpec extends Specification {
        constructor(minPrice) {
            super();
            this.minPrice = minPrice;
        }
        isSatisfiedBy(unit) {
            return unit.price >= this.minPrice;
        }
    }

    const priceSpec = new MinimumPriceSpec(1000000);
    const validUnit = { price: 2500000 };
    const invalidUnit = { price: 500000 };

    if (priceSpec.isSatisfiedBy(validUnit) && !priceSpec.isSatisfiedBy(invalidUnit)) {
        console.log('✅ [Specification] Specification pattern operating correctly.');
    } else {
        throw new Error('❌ Specification evaluation failed');
    }

    // 4. Test AI Service Abstraction
    const aiResult = await AIService.generateCompletion('Analyze customer potential');
    if (aiResult && aiResult.provider) {
        console.log(`✅ [AIService] AI abstraction operational (Provider: ${aiResult.provider}).`);
    } else {
        throw new Error('❌ AIService execution failed');
    }

    console.log('🎉 Phase 1 Platform Foundation Verification PASSED 100%!');
}

testPhase1().catch(err => {
    console.error('❌ Phase 1 Verification Failed:', err);
    process.exit(1);
});
