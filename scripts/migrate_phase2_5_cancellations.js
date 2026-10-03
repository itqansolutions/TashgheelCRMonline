/**
 * migrate_phase2_5_cancellations.js
 * Migration for Phase 2.5: Real Estate Cancellation & Refund
 */

const db = require('../config/db');

async function migrate() {
    console.log('🚀 Running Phase 2.5 Migration: re_cancellations...');
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS re_cancellations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
                contract_id UUID NULL REFERENCES re_contracts(id) ON DELETE CASCADE,
                unit_id VARCHAR(255) NULL,
                cancellation_reason TEXT NOT NULL,
                total_paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
                deduction_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (deduction_amount >= 0),
                refundable_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (refundable_amount >= 0),
                refund_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
                unit_action VARCHAR(50) NOT NULL DEFAULT 'release',
                refund_date DATE NULL,
                processed_by VARCHAR(255) NULL,
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_re_cancellations_deal ON re_cancellations(deal_id);
            CREATE INDEX IF NOT EXISTS idx_re_cancellations_tenant ON re_cancellations(tenant_id);
        `);
        console.log('✅ re_cancellations table created successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
