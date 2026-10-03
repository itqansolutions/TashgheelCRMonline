const db = require('../config/db');

async function migrateContracts() {
    console.log('--- Applying Phase 2.2: Real Estate Contracts Migration ---');
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS re_contracts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                contract_number VARCHAR(100) NOT NULL,
                deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
                customer_id INTEGER NULL REFERENCES customers(id) ON DELETE SET NULL,
                unit_id VARCHAR(255) NULL,
                contract_date DATE NOT NULL DEFAULT CURRENT_DATE,
                contract_value NUMERIC(15,2) NOT NULL DEFAULT 0.00,
                down_payment NUMERIC(15,2) NOT NULL DEFAULT 0.00,
                remaining_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
                status VARCHAR(50) NOT NULL DEFAULT 'Draft',
                notes TEXT,
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255) NULL,
                created_by VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_deal_contract UNIQUE(deal_id, tenant_id)
            );

            CREATE INDEX IF NOT EXISTS idx_re_contracts_tenant ON re_contracts(tenant_id);
            CREATE INDEX IF NOT EXISTS idx_re_contracts_deal ON re_contracts(deal_id);
            CREATE INDEX IF NOT EXISTS idx_re_contracts_status ON re_contracts(status);
        `);
        console.log('✅ Real Estate contracts schema successfully created and verified.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exit(1);
    }
}

migrateContracts();
