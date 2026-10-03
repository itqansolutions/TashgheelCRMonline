/**
 * migrate_phase2_6_handovers.js
 * Migration for Phase 2.6: Real Estate Handover Lightweight Milestone
 */

const db = require('../config/db');

async function migrate() {
    console.log('🚀 Running Phase 2.6 Migration: re_handovers...');
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS re_handovers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
                contract_id UUID NULL REFERENCES re_contracts(id) ON DELETE CASCADE,
                unit_id VARCHAR(255) NOT NULL,
                customer_id INTEGER NULL REFERENCES customers(id) ON DELETE SET NULL,
                scheduled_date DATE NULL,
                actual_handover_date DATE NULL,
                snagging_notes TEXT,
                status VARCHAR(50) NOT NULL DEFAULT 'Scheduled',
                keys_handed_over BOOLEAN DEFAULT false,
                clearance_certificate BOOLEAN DEFAULT false,
                handled_by VARCHAR(255) NULL,
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_deal_handover UNIQUE(deal_id, tenant_id)
            );

            CREATE INDEX IF NOT EXISTS idx_re_handovers_deal ON re_handovers(deal_id);
            CREATE INDEX IF NOT EXISTS idx_re_handovers_unit ON re_handovers(unit_id);
            CREATE INDEX IF NOT EXISTS idx_re_handovers_tenant ON re_handovers(tenant_id);
        `);
        console.log('✅ re_handovers table created successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
