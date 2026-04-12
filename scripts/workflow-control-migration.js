const db = require('../config/db');

/**
 * Workflow Control Layer Migration (Phase 2.5)
 * Deploys: workflow_logs + workflow_config tables
 */
const migrate = async () => {
    try {
        console.log('--- 🛡️ Workflow Control Layer Deployment ---');
        await db.query('BEGIN');

        // 1. AUDIT TRAIL: workflow_logs
        console.log('1. Building [workflow_logs] (Full Audit Trail)...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS workflow_logs (
                id SERIAL PRIMARY KEY,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,

                event_type VARCHAR(100) NOT NULL,   -- e.g. LOW_STOCK, EMPLOYEE_LATE
                rule_name  VARCHAR(100) NOT NULL,   -- e.g. Auto Procurement
                status     VARCHAR(50)  DEFAULT 'success', -- success | failed | skipped

                entity_type VARCHAR(100),           -- products, deals, hr_attendance
                entity_id   VARCHAR(100),

                action_taken VARCHAR(255),          -- e.g. created_purchase_request
                metadata     JSONB,

                error_message TEXT,                 -- captured on failure
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. CONTROL PANEL: workflow_config (toggle + cooldown per rule)
        console.log('2. Building [workflow_config] (Rule Toggle + Cooldown)...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS workflow_config (
                id SERIAL PRIMARY KEY,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

                rule_key        VARCHAR(100) NOT NULL,  -- e.g. LOW_STOCK_AUTO_PROCUREMENT
                is_enabled      BOOLEAN DEFAULT TRUE,
                cooldown_minutes INTEGER DEFAULT 360,   -- 6 hours default

                last_triggered_at TIMESTAMP WITH TIME ZONE, -- for cooldown enforcement
                config JSONB,                           -- future: thresholds, recipients, etc.

                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (tenant_id, rule_key)
            );
        `);

        // 3. Indexes
        console.log('3. Applying Control Layer Indexes...');
        await db.query(`CREATE INDEX IF NOT EXISTS idx_wf_logs_iso ON workflow_logs (tenant_id, branch_id);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_wf_logs_event ON workflow_logs (event_type, created_at DESC);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_wf_config_key ON workflow_config (tenant_id, rule_key);`);

        // 4. Idempotency guard on purchase_requests (prevent duplicate drafts)
        console.log('4. Adding Idempotency Constraint on purchase_requests...');
        await db.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_idempotency
            ON purchase_requests (tenant_id, branch_id, product_id)
            WHERE status = 'draft';
        `);

        await db.query('COMMIT');
        console.log('✅ Workflow Control Layer Deployed (Logs + Config + Idempotency).');
        process.exit(0);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('💣 [FATAL] Control Layer Migration Error:', err.message);
        process.exit(1);
    }
};

migrate();
