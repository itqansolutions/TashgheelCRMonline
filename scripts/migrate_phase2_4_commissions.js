/**
 * migrate_phase2_4_commissions.js
 * Migration for Phase 2.4: Real Estate Agent / Broker Commissions
 */

const db = require('../config/db');

async function migrate() {
    console.log('🚀 Running Phase 2.4 Migration: re_commissions...');
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS re_commissions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
                contract_id UUID NULL REFERENCES re_contracts(id) ON DELETE CASCADE,
                beneficiary_type VARCHAR(50) NOT NULL DEFAULT 'internal_agent',
                beneficiary_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
                beneficiary_name VARCHAR(255) NOT NULL,
                commission_type VARCHAR(50) NOT NULL DEFAULT 'percentage',
                rate NUMERIC(7,4) DEFAULT 0.0000,
                base_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (base_amount >= 0),
                calculated_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (calculated_amount >= 0),
                paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
                status VARCHAR(50) NOT NULL DEFAULT 'Pending',
                approval_date DATE NULL,
                payment_date DATE NULL,
                notes TEXT,
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_re_commissions_deal ON re_commissions(deal_id);
            CREATE INDEX IF NOT EXISTS idx_re_commissions_contract ON re_commissions(contract_id);
            CREATE INDEX IF NOT EXISTS idx_re_commissions_tenant ON re_commissions(tenant_id);
        `);
        console.log('✅ re_commissions table created successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
