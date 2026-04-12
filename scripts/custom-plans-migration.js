const db = require('../config/db');

/**
 * Phase D+ Migration: tenant_overrides table
 * Enables per-tenant module/limit overrides independent of plan
 */
const migrate = async () => {
    try {
        console.log('--- 💎 Custom Plan Builder Infrastructure ---');
        await db.query('BEGIN');

        console.log('1. Adding created_at to plans table...');
        await db.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`);

        console.log('2. Building [tenant_overrides] table (Per-Tenant Overrides)...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS tenant_overrides (
                id SERIAL PRIMARY KEY,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,

                -- Partial module overrides: null = use plan default
                modules JSONB DEFAULT NULL,

                -- Partial limit overrides: null = use plan default
                limits JSONB DEFAULT NULL,
                -- Example: { "max_users": 25, "max_branches": 3 }

                notes TEXT,  -- Internal admin notes about this override

                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`CREATE INDEX IF NOT EXISTS idx_overrides_tenant ON tenant_overrides (tenant_id);`);

        await db.query('COMMIT');
        console.log('✅ Custom Plan Builder Infrastructure Deployed.');
        process.exit(0);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('💣 Migration Error:', err.message);
        process.exit(1);
    }
};

migrate();
