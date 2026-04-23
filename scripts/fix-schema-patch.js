const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fixSchema() {
    const client = await pool.connect();
    try {
        console.log('🚀 [Fix] Patching Schema for Tenant Isolation & Type Safety...');

        // 1. Fix tasks.parent_id type mismatch
        // We change it to VARCHAR(255) to support UUIDs from Real Estate units
        console.log('Patching tasks.parent_id to VARCHAR(255)...');
        await client.query(`
            ALTER TABLE tasks 
            ALTER COLUMN parent_id TYPE VARCHAR(255) USING parent_id::VARCHAR(255)
        `);

        // 2. Ensure Invoices has correct columns for One-Click Billing
        console.log('Ensuring invoices has client_id and deal_id...');
        await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id VARCHAR(255)`);
        await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deal_id VARCHAR(255)`);
        await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)`);

        // 3. Add notes to invoices if missing
        await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT`);

        console.log('✅ [Fix] Schema patched successfully.');
    } catch (err) {
        console.error('❌ [Fix] Error during schema patch:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

fixSchema();
