const db = require('../config/db');

const migrate = async () => {
    try {
        console.log('--- [SAFE-MIGRATION] Departments Hardening ---');
        await db.query('BEGIN');

        // 1. Add tenant_id to departments if it does not exist
        await db.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='departments' AND column_name='tenant_id'
                ) THEN
                    ALTER TABLE departments ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
                    RAISE NOTICE 'Added tenant_id to departments table.';
                END IF;
            END$$;
        `);

        // 2. Drop the existing global UNIQUE constraint on name if it exists
        await db.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.table_constraints 
                    WHERE constraint_name = 'departments_name_key'
                ) THEN
                    ALTER TABLE departments DROP CONSTRAINT departments_name_key;
                    RAISE NOTICE 'Legacy global unique constraint dropped on departments.';
                END IF;
            END$$;
        `);

        // 3. Add the Multi-Tenant Unique Index
        console.log('Applying Multi-Tenant Composite Constraint (name, tenant_id) to departments...');
        await db.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_tenant_unique 
            ON departments(name, tenant_id);
        `);

        await db.query('COMMIT');
        console.log('✅ Departments migration completed successfully.');
        process.exit(0);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('💣 [FATAL] Departments Migration Failed:', err.message);
        process.exit(1);
    }
};

migrate();
