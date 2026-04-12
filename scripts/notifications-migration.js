const db = require('../config/db');

/**
 * Enterprise System Intelligence Base
 * Notification Engine Migration
 */
const migrate = async () => {
    try {
        console.log('--- 🧠 System Intelligence Layout Deployment ---');

        await db.query('BEGIN');

        console.log('1. Building [system_notifications] Nodes...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS system_notifications (
                id SERIAL PRIMARY KEY,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                
                type VARCHAR(50) NOT NULL, -- LOW_STOCK, INVOICE_PAID, MOVEMENT_CREATED, EMPLOYEE_LATE, SYSTEM_ALERT
                title VARCHAR(255) NOT NULL,
                message TEXT,
                link VARCHAR(255),
                
                is_read BOOLEAN DEFAULT FALSE,
                metadata JSONB,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('2. Applying Notification Isolation Indexes...');
        // Multitenant & Quick Retrieval Indexes
        await db.query(`CREATE INDEX IF NOT EXISTS idx_notifications_iso ON system_notifications (tenant_id, branch_id);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON system_notifications (user_id, is_read);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_notifications_created ON system_notifications (created_at DESC);`);

        await db.query('COMMIT');

        console.log('✅ Intelligence Engine Deployed (Notifications Layer Activated).');
        process.exit(0);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('💣 [FATAL] Intelligence Migration Error:', err.message);
        process.exit(1);
    }
};

migrate();
