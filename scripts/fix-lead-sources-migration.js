const db = require('../config/db');

/**
 * PRODUCTION-SAFE MIGRATION: Fix Lead Sources Multi-Tenant Uniqueness
 * This script drops the global unique constraint on 'name' and replaces it 
 * with a composite (name, tenant_id) unique constraint to allow multiple tenants 
 * to share the same lead source names (e.g., 'Facebook').
 */
const migrate = async () => {
    try {
        console.log('--- [SAFE-MIGRATION] Lead Sources Hardening ---');

        await db.query('BEGIN');

        // 1. Safely drop the existing UNIQUE constraint if it exists
        // PostgreSQL names the default unique key as 'table_column_key'
        await db.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.table_constraints 
                    WHERE constraint_name = 'lead_sources_name_key'
                ) THEN
                    ALTER TABLE lead_sources DROP CONSTRAINT lead_sources_name_key;
                    RAISE NOTICE 'Legacy global unique constraint dropped.';
                END IF;
            END$$;
        `);

        // 2. Add the Multi-Tenant Unique Index
        console.log('Applying Multi-Tenant Composite Constraint (name, tenant_id)...');
        await db.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_sources_tenant_unique 
            ON lead_sources(name, tenant_id);
        `);

        await db.query('COMMIT');
        console.log('✅ Lead Sources migration completed successfully.');
        process.exit(0);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('💣 [FATAL] Lead Sources Migration Failed:', err.message);
        process.exit(1);
    }
};

migrate();
