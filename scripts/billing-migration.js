const db = require('../config/db');

const migrate = async () => {
    try {
        console.log('--- 💳 Billing Simulation Layer ---');
        await db.query('BEGIN');

        // 1. upgrade_requests table
        console.log('1. Building [upgrade_requests] table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS upgrade_requests (
                id SERIAL PRIMARY KEY,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                current_plan_id INTEGER REFERENCES plans(id),
                requested_plan_id INTEGER REFERENCES plans(id),
                status VARCHAR(30) DEFAULT 'pending',
                -- pending | approved | rejected | cancelled
                notes TEXT,
                reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                reviewed_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. 'pending_upgrade' is a valid subscription status — no schema change needed.
        // subscriptions.status already supports free-form strings.
        // We add an index for fast lookups
        await db.query(`CREATE INDEX IF NOT EXISTS idx_upgrade_requests_tenant ON upgrade_requests (tenant_id);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_upgrade_requests_status ON upgrade_requests (status);`);

        await db.query('COMMIT');
        console.log('✅ Billing Simulation Layer Deployed (upgrade_requests ready).');
        process.exit(0);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('💣 Billing Migration Error:', err.message);
        process.exit(1);
    }
};

migrate();
