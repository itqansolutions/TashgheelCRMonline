const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'tashgheel_crm',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('Starting Activities Indexes migration...');
        await client.query('BEGIN');

        console.log('Creating performance indexes on activities table...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(entity_type, entity_id);
            CREATE INDEX IF NOT EXISTS idx_activities_tenant ON activities(tenant_id);
            CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);
        `);

        await client.query('COMMIT');
        console.log('Indexes Migration completed successfully!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
