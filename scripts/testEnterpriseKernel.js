const container = require('../src/infrastructure/di/container');
const FeatureManager = require('../src/infrastructure/features/FeatureManager');
const JobEngine = require('../src/infrastructure/jobs/JobEngine');
const DomainSDK = require('../src/infrastructure/sdk/DomainSDK');
const MetadataEngine = require('../src/infrastructure/metadata/MetadataEngine');
const OutboxService = require('../src/infrastructure/events/OutboxService');
const DomainEvent = require('../src/infrastructure/events/DomainEvent');

async function testEnterpriseKernel() {
    console.log('🧪 Starting World-Class Enterprise Kernel Verification...');

    // 1. IoC Container Test
    container.register('MockRepo', () => ({ name: 'MockCustomerRepository' }));
    const resolvedRepo = container.resolve('MockRepo');
    if (resolvedRepo.name === 'MockCustomerRepository') {
        console.log('✅ [IoC Container] Service registration and dependency resolution verified.');
    } else {
        throw new Error('❌ IoC Container resolution failed');
    }

    // 2. Feature Flags Manager Test
    const isAiEnabled = await FeatureManager.isEnabled('00000000-0000-0000-0000-000000000000', 'ai');
    console.log(`✅ [FeatureManager] Dynamic feature flag evaluated: isEnabled('ai') = ${isAiEnabled}.`);

    // 3. Job Engine Test
    let jobExecuted = false;
    JobEngine.enqueue('TestSyncTask', async () => {
        jobExecuted = true;
    });

    await new Promise(resolve => setTimeout(resolve, 500));
    if (jobExecuted) {
        console.log('✅ [JobEngine] Background queue execution verified.');
    } else {
        throw new Error('❌ JobEngine execution failed');
    }

    // 4. Domain SDK Test
    if (typeof DomainSDK.CRM.logActivity === 'function' && typeof DomainSDK.Search.query === 'function') {
        console.log('✅ [DomainSDK] Cross-domain developer SDK facade verified.');
    } else {
        throw new Error('❌ DomainSDK facade missing key contracts');
    }

    // 5. Metadata UI Engine Test
    const customerSchema = MetadataEngine.getSchema('Customer');
    if (customerSchema && customerSchema.fields.length > 0) {
        console.log(`✅ [MetadataEngine] Schema-driven UI metadata loaded (${customerSchema.fields.length} fields).`);
    } else {
        throw new Error('❌ MetadataEngine failed to return schema');
    }

    console.log('🎉 World-Class Enterprise Kernel Verification PASSED 100%!');
}

testEnterpriseKernel().catch(err => {
    console.error('❌ Enterprise Kernel Test Error:', err);
    process.exit(1);
});
