const db = require('../config/db');

/**
 * Universal Database Reconciliation & Gold Demo Seeder
 * Runs on startup to ensure schema integrity and populate showcase data.
 */
const reconcileDatabase = async () => {
    console.log('🔍 [DB-RECON] Starting schema integrity check...');
    try {
        // 1. Repair CUSTOMERS table (Schema Alignment)
        console.log('🚧 [DB-RECON] Checking Customers table integrity...');
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id UUID`);
        await db.query(`UPDATE customers SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL`);
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id UUID`);
        await db.query(`UPDATE customers SET branch_id = (SELECT id FROM branches WHERE tenant_id = customers.tenant_id LIMIT 1) WHERE branch_id IS NULL`);
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS source_id INTEGER`);
        console.log('✅ [DB-RECON] Customers schema verified.');

        // 2. SECURE & SEED GOLD DEMO (Showcase Data)
        console.log('💎 [DB-RECON] Hardening Gold Demo Showcase...');
        const demoEmail = 'demo@tashgheel.com';
        const userRes = await db.query('SELECT u.id, u.tenant_id FROM users u WHERE u.email = $1', [demoEmail]);
        
        if (userRes.rows.length > 0) {
            const { id: userId, tenant_id: tenantId } = userRes.rows[0];
            const bcrypt = require('bcrypt');
            const newHash = await bcrypt.hash('Demo@1234', 10);

            // Force Password & Template Reset
            await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
            await db.query('UPDATE tenants SET template_name = $1 WHERE id = $2', ['real_estate', tenantId]);
            console.log('✅ [DB-RECON] Demo Password & Template Hard-Reset Successful.');
            console.log('✅ [DB-RECON] Demo Tenant upgraded to "real_estate".');
            
            // Seed sample units if empty
            const unitCheck = await db.query('SELECT 1 FROM re_units WHERE tenant_id = $1 LIMIT 1', [tenantId]);
            if (unitCheck.rows.length === 0) {
                console.log('🚧 [DB-RECON] Injecting premium property units...');
                const branchRes = await db.query('SELECT id FROM branches WHERE tenant_id = $1 LIMIT 1', [tenantId]);
                const branchId = branchRes.rows[0]?.id;

                await db.query(`
                    INSERT INTO re_units (name, project_name, floor, area_sqm, price, status, tenant_id, branch_id)
                    VALUES ('Penthouse 402', 'Palm Residences', '4th', '185 sqm', 4500000, 'available', $1, $2)
                `, [tenantId, branchId]);
                
                await db.query(`
                    INSERT INTO re_units (name, project_name, floor, area_sqm, price, status, tenant_id, branch_id)
                    VALUES ('Suite 101', 'Coastal Breeze', 'Ground', '95 sqm', 1800000, 'available', $1, $2)
                `, [tenantId, branchId]);
                
                console.log('✅ [DB-RECON] Showcase units injected.');
            }
        }

        console.log('🧹 [DB-RECON] System is ready and stable.');
    } catch (err) {
        console.error('❌ [DB-RECON] Critical Failure:', err.message);
    }
};

module.exports = reconcileDatabase;
