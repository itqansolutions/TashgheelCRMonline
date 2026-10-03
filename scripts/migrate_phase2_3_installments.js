/**
 * migrate_phase2_3_installments.js
 * Migration for Phase 2.3: Real Estate Payment Plan / Installments
 */

const db = require('../config/db');

async function migrate() {
    console.log('🚀 Running Phase 2.3 Migration: re_installments...');
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS re_installments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                contract_id UUID NOT NULL REFERENCES re_contracts(id) ON DELETE CASCADE,
                deal_id INTEGER NULL REFERENCES deals(id) ON DELETE CASCADE,
                installment_number INTEGER NOT NULL,
                installment_type VARCHAR(50) NOT NULL DEFAULT 'installment',
                due_date DATE NOT NULL,
                amount NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0),
                paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
                status VARCHAR(50) NOT NULL DEFAULT 'Pending',
                paid_at TIMESTAMP NULL,
                notes TEXT,
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_contract_installment UNIQUE(contract_id, installment_number)
            );

            CREATE INDEX IF NOT EXISTS idx_re_installments_contract ON re_installments(contract_id);
            CREATE INDEX IF NOT EXISTS idx_re_installments_tenant ON re_installments(tenant_id);
        `);
        console.log('✅ re_installments table created successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
