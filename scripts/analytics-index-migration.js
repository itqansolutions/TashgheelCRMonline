const db = require('../config/db');

/**
 * PRODUCTION-GRADE ANALYTICS INDEX MIGRATION
 * Strategy:
 * Add Partial Indexes for the Intelligence Dashboard. 
 * This specifically targets data from the last 365 days,
 * drastically improving aggregation queries across Time + Tenant + Branch.
 */
const migrate = async () => {
    try {
        console.log('--- 📊 Intelligence Engine: Index Rollout ---');
        console.log('Starting index creation... this may take a moment depending on dataset size.');

        const queries = [
            `CREATE INDEX IF NOT EXISTS idx_payments_analytics ON payments (tenant_id, branch_id, payment_date) WHERE payment_date > NOW() - INTERVAL '1 year';`,
            
            `CREATE INDEX IF NOT EXISTS idx_expenses_analytics ON expenses (tenant_id, branch_id, expense_date) WHERE expense_date > NOW() - INTERVAL '1 year';`,
            
            `CREATE INDEX IF NOT EXISTS idx_deals_analytics_won ON deals (tenant_id, branch_id, pipeline_stage) WHERE pipeline_stage = 'won' AND updated_at > NOW() - INTERVAL '1 year';`,
            
            `CREATE INDEX IF NOT EXISTS idx_tasks_analytics ON tasks (tenant_id, branch_id, status) WHERE status = 'completed' AND updated_at > NOW() - INTERVAL '1 year';`
        ];

        for (const query of queries) {
            console.log(`Executing: ${query.split('ON')[1].split('(')[0].trim()}...`);
            await db.query(query);
            console.log('✅ Index created successfully.');
        }

        console.log('🚀 [FINAL] BI Dashboard Index Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('💣 [FATAL] Index Migration Error:', err.message);
        process.exit(1);
    }
};

migrate();
