const db = require('../config/db');

/**
 * Workflow Engine Infrastructure Migration
 * Creates the purchase_requests table to support automated procurement workflow
 */
const migrate = async () => {
    try {
        console.log('--- ⚙️ Workflow Engine Infrastructure Deployment ---');

        await db.query('BEGIN');

        console.log('1. Building [purchase_requests] table (Auto-Procurement Engine)...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS purchase_requests (
                id SERIAL PRIMARY KEY,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,

                quantity_requested DECIMAL(15, 4) NOT NULL,
                quantity_approved DECIMAL(15, 4),

                status VARCHAR(50) DEFAULT 'draft', -- draft, pending_approval, approved, rejected, ordered

                notes TEXT,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,

                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT chk_pr_qty CHECK (quantity_requested > 0)
            );
        `);

        console.log('2. Applying Workflow Infrastructure Indexes...');
        await db.query(`CREATE INDEX IF NOT EXISTS idx_pr_iso ON purchase_requests (tenant_id, branch_id);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_pr_status ON purchase_requests (status);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_pr_product ON purchase_requests (product_id);`);

        await db.query('COMMIT');
        console.log('✅ Workflow Engine Infrastructure Deployed (Purchase Requests Active).');
        process.exit(0);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('💣 [FATAL] Workflow Migration Error:', err.message);
        process.exit(1);
    }
};

migrate();
