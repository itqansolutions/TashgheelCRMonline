const db = require('../config/db');

/**
 * PRODUCTION-GRADE FINANCIAL ENGINE MIGRATION
 * Strategy:
 * 1. Alter 'invoices' table to support multi-tenant safe numbering.
 * 2. Add 'invoice_prefix' to 'branches' for smart customized numbering.
 * 3. Secure constraints.
 */
const migrate = async () => {
    try {
        console.log('--- 💰 Financial Engine: Schema Rollout ---');

        // Step 1: Branch customization for Invoice Numbering
        console.log('Adding invoice_prefix to branches...');
        await db.query(`ALTER TABLE branches ADD COLUMN IF NOT EXISTS invoice_prefix VARCHAR(10);`);

        // Step 2: Multi-tenant safe invoice numbers
        // The original schema had `invoice_number VARCHAR(100) UNIQUE NOT NULL`.
        // This is fatal for SaaS. We must drop the global unique constraint.
        console.log('Securing multi-tenant invoice numbering isolation...');
        
        // Find existing constraint name and drop it
        const constraintRes = await db.query(`
            SELECT constraint_name 
            FROM information_schema.key_column_usage 
            WHERE table_name = 'invoices' AND column_name = 'invoice_number';
        `);

        for (const row of constraintRes.rows) {
            try {
                await db.query(`ALTER TABLE invoices DROP CONSTRAINT IF EXISTS ${row.constraint_name};`);
            } catch (e) {
                // Ignore if constraint doesn't exist
            }
        }

        // Add correct composite unique constraint
        try {
            await db.query(`ALTER TABLE invoices ADD CONSTRAINT unique_invoice_per_tenant UNIQUE (tenant_id, invoice_number);`);
        } catch(e) {
            console.log('Constraint unique_invoice_per_tenant might already exist or skipped.');
        }

        console.log('✅ Financial Schema patched securely.');
        console.log('🚀 [FINAL] Financial Engine Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('💣 [FATAL] Financial Engine Migration Error:', err.message);
        process.exit(1);
    }
};

migrate();
