const { Client } = require('pg');
require('dotenv').config();

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL + (process.env.DATABASE_URL.includes('?') ? '&' : '?') + 'sslmode=require',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 60000,
    });

    try {
        console.log('Connecting...');
        await client.connect();
        console.log('Connected!');

        await client.query('BEGIN');
        
        console.log('1. Patching quotations table structure...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS quotations (
                id SERIAL PRIMARY KEY,
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                total_amount NUMERIC DEFAULT 0,
                status VARCHAR(20) DEFAULT 'draft',
                notes TEXT,
                valid_until DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS deal_id VARCHAR(255)`);
        await client.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_id VARCHAR(255)`);
        await client.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS unit_id VARCHAR(255)`);

        console.log('2. Patching quotation_items...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS quotation_items (
                id SERIAL PRIMARY KEY,
                quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
                product_id VARCHAR(255),
                description TEXT,
                quantity NUMERIC DEFAULT 1,
                unit_price NUMERIC DEFAULT 0,
                subtotal NUMERIC DEFAULT 0,
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255)
            )
        `);

        console.log('3. Patching invoices & tasks...');
        await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS unit_id VARCHAR(255)`);
        await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id VARCHAR(255)`);
        await client.query(`ALTER TABLE tasks ALTER COLUMN parent_id TYPE VARCHAR(255)`);

        console.log('4. Patching tenant branding...');
        await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS quotation_terms TEXT`);
        await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS quotation_footer TEXT`);
        await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS quotation_prefix VARCHAR(10) DEFAULT 'QUO-'`);

        await client.query('COMMIT');
        console.log('🎉 NUCLEAR PATCH SUCCESSFUL!');
    } catch (e) {
        console.error('💥 PATCH FAILED:', e.message);
        if (client) await client.query('ROLLBACK').catch(() => {});
    } finally {
        await client.end().catch(() => {});
        process.exit(0);
    }
}

run();
