const db = require('../config/db');

async function patchQuotationSettings() {
    console.log('--- Starting Quotation Settings Patch ---');
    try {
        // Simple ping to ensure connection
        await db.query('SELECT 1');
        
        // Add quotation columns to tenants table
        console.log('Adding quotation columns to tenants table...');
        await db.query(`
            ALTER TABLE tenants 
            ADD COLUMN IF NOT EXISTS quotation_terms TEXT,
            ADD COLUMN IF NOT EXISTS quotation_footer TEXT,
            ADD COLUMN IF NOT EXISTS quotation_prefix VARCHAR(50) DEFAULT 'QUO-';
        `);

        console.log('Adding line items support to quotations...');
        // We need a quotation_items table if we want it to be like invoices
        await db.query(`
            CREATE TABLE IF NOT EXISTS quotation_items (
                id SERIAL PRIMARY KEY,
                quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
                description TEXT,
                quantity INTEGER DEFAULT 1,
                unit_price DECIMAL(12, 2) NOT NULL,
                subtotal DECIMAL(15, 2) NOT NULL,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                branch_id UUID,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Check if quotations table has client_id (it was missing or referenced through deal_id)
        // From schema.sql, quotations has deal_id.
        // If we want it like invoices, we might want client_id directly too.
        await db.query(`
            ALTER TABLE quotations 
            ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
        `);

        console.log('Patch completed successfully!');
    } catch (err) {
        console.error('Patch failed:', err.message);
    } finally {
        process.exit();
    }
}

patchQuotationSettings();
