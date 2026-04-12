const db = require('../config/db');

const migrate = async () => {
    try {
        console.log('--- SaaS Phase: Migrating Tenant Identity Schema ---');
        
        await db.query(`
            ALTER TABLE tenants 
            ADD COLUMN IF NOT EXISTS logo_url TEXT,
            ADD COLUMN IF NOT EXISTS address TEXT,
            ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
            ADD COLUMN IF NOT EXISTS tax_no VARCHAR(50),
            ADD COLUMN IF NOT EXISTS reg_no VARCHAR(50),
            ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'EGP',
            ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5, 2) DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS invoice_prefix VARCHAR(20) DEFAULT 'INV-',
            ADD COLUMN IF NOT EXISTS invoice_footer TEXT,
            ADD COLUMN IF NOT EXISTS terms TEXT;
        `);

        console.log('✅ tenants table successfully upgraded with Identity and Financial columns.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
};

migrate();
