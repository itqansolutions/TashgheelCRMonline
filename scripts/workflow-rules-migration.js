const db = require('../config/db');

const migrate = async () => {
    try {
        console.log('--- 🧠 Phase 3: DB-Driven Rules Engine Deployment ---');
        await db.query('BEGIN');

        console.log('1. Building [workflow_rules] (User-Programmable Logic Table)...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS workflow_rules (
                id SERIAL PRIMARY KEY,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,

                name VARCHAR(255) NOT NULL,

                trigger_event VARCHAR(100) NOT NULL,
                -- Supported: LOW_STOCK, INVOICE_PAID, EMPLOYEE_LATE, DEAL_CREATED

                conditions JSONB NOT NULL DEFAULT '{}',
                -- Example: { "stock": { "lt": 10 }, "late_count": { "gte": 3 } }

                actions JSONB NOT NULL DEFAULT '[]',
                -- Example: [{ "type": "notify_manager", "params": {} }, { "type": "create_purchase_request" }]

                is_active BOOLEAN DEFAULT TRUE,
                cooldown_minutes INTEGER DEFAULT 0,

                -- Audit
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

                -- Safety: max 20 rules per tenant enforced at app level
                CONSTRAINT chk_trigger CHECK (trigger_event IN (
                    'LOW_STOCK', 'INVOICE_PAID', 'EMPLOYEE_LATE', 'DEAL_CREATED', 'MOVEMENT_APPROVED'
                ))
            );
        `);

        console.log('2. Applying Rule Isolation Indexes...');
        await db.query(`CREATE INDEX IF NOT EXISTS idx_wr_iso ON workflow_rules (tenant_id, branch_id);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_wr_trigger ON workflow_rules (trigger_event, is_active);`);

        await db.query('COMMIT');
        console.log('✅ Phase 3 DB Deployed (workflow_rules table ready).');
        process.exit(0);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('💣 Phase 3 Migration Error:', err.message);
        process.exit(1);
    }
};

migrate();
