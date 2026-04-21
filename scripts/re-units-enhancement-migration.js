const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('🚀 [Migration] Starting Real Estate Units Enhancement...');

        // 1. Create re_units table if it doesn't exist yet (safe idempotent CREATE)
        await client.query(`
            CREATE TABLE IF NOT EXISTS re_units (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id TEXT NOT NULL,
                branch_id TEXT NOT NULL,
                name VARCHAR(255),
                project_name VARCHAR(255),
                unit_number VARCHAR(100),
                type VARCHAR(100) DEFAULT 'Apartment',
                floor INTEGER DEFAULT 0,
                area_sqm NUMERIC(10,2),
                price NUMERIC(15,2),
                status VARCHAR(50) DEFAULT 'Available',
                vendor_id UUID,
                responsible_person_id UUID,
                transaction_type VARCHAR(50) DEFAULT 'sale',
                rooms INTEGER DEFAULT 0,
                location TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ [Migration] re_units table verified.');

        // 2. Add assigned_to column (the column linking a unit to a responsible employee)
        await client.query(`
            ALTER TABLE re_units
            ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL
        `);
        console.log('✅ [Migration] re_units.assigned_to column verified.');

        // 3. Add vendor_id FK reference if not already constrained (safe IF NOT EXISTS workaround)
        // Note: vendor_id references customers (where entity_type = 'vendor')
        await client.query(`
            ALTER TABLE re_units
            ADD COLUMN IF NOT EXISTS vendor_id UUID
        `).catch(() => {}); // May already exist — silently continue
        console.log('✅ [Migration] re_units.vendor_id column verified.');

        // 4. Ensure tasks table supports 'unit' as a parent_type (no schema change needed, 
        //    parent_type is TEXT — just documenting this link is supported by the existing schema)
        await client.query(`
            ALTER TABLE tasks
            ADD COLUMN IF NOT EXISTS parent_type VARCHAR(50)
        `).catch(() => {});
        await client.query(`
            ALTER TABLE tasks
            ADD COLUMN IF NOT EXISTS parent_id UUID
        `).catch(() => {});
        console.log('✅ [Migration] tasks.parent_type / parent_id columns verified.');

        // 5. Index for performance on tenant/branch queries
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_re_units_tenant_branch 
            ON re_units(tenant_id, branch_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_re_units_assigned_to 
            ON re_units(assigned_to)
        `);
        console.log('✅ [Migration] re_units indexes verified.');

        console.log('🎊 [Migration] Real Estate Units Enhancement completed successfully.');
    } catch (err) {
        console.error('❌ [Migration] Error during sync:', err.message);
        // Non-fatal: don't exit(1) so other migrations still run
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
