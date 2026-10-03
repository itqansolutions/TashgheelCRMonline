const db = require('../config/db');

async function migrate() {
    console.log('--- Applying Phase 2.1: Real Estate Hierarchy Migration ---');
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS re_developers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                contact_person VARCHAR(255),
                phone VARCHAR(50),
                email VARCHAR(255),
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS re_projects (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                developer_id UUID REFERENCES re_developers(id) ON DELETE SET NULL,
                name VARCHAR(255) NOT NULL,
                location VARCHAR(255),
                description TEXT,
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS re_phases (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id UUID NOT NULL REFERENCES re_projects(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS re_buildings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id UUID NOT NULL REFERENCES re_projects(id) ON DELETE CASCADE,
                phase_id UUID REFERENCES re_phases(id) ON DELETE SET NULL,
                name VARCHAR(255) NOT NULL,
                floors_count INTEGER DEFAULT 1,
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            ALTER TABLE re_units ADD COLUMN IF NOT EXISTS developer_id UUID NULL REFERENCES re_developers(id) ON DELETE SET NULL;
            ALTER TABLE re_units ADD COLUMN IF NOT EXISTS project_id UUID NULL REFERENCES re_projects(id) ON DELETE SET NULL;
            ALTER TABLE re_units ADD COLUMN IF NOT EXISTS phase_id UUID NULL REFERENCES re_phases(id) ON DELETE SET NULL;
            ALTER TABLE re_units ADD COLUMN IF NOT EXISTS building_id UUID NULL REFERENCES re_buildings(id) ON DELETE SET NULL;
        `);
        console.log('✅ Real Estate hierarchy schema successfully created and verified.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
