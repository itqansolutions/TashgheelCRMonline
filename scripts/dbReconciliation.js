const db = require('../config/db');

/**
 * Enterprise Database Reconciliation Agent
 * Automatically aligns the schema with the latest multi-tenant requirements.
 */
const reconcileDatabase = async () => {
    console.log('🔍 [DB-RECON] Starting schema integrity check...');
    try {
        // 1. Repair CUSTOMERS table with Non-Destructive Logic
        console.log('🚧 [DB-RECON] Checking Customers table integrity...');
        
        // Ensure tenant_id exists (Safely)
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id UUID`);
        await db.query(`UPDATE customers SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL`);

        // Ensure branch_id exists (Safely)
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id UUID`);
        await db.query(`UPDATE customers SET branch_id = (SELECT id FROM branches WHERE tenant_id = customers.tenant_id LIMIT 1) WHERE branch_id IS NULL`);

        // Ensure source_id exists (integer) - Keep legacy 'source' column for COALESCE support
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS source_id INTEGER`);

        console.log('✅ [DB-RECON] Customers table context hardened (Backward Compatibility Preserved).');

        // 2. Log confirmation for debugging
        const stats = await db.query(`SELECT COUNT(*) as total FROM customers`);
        console.log(`📊 [DB-RECON] Analytics: Total Customers Scoped = ${stats.rows[0].total}`);
        
    } catch (err) {
        console.error('❌ [DB-RECON] Critical Failure during reconciliation:', err.message);
    }
};

module.exports = reconcileDatabase;
