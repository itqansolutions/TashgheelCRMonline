const db = require('../config/db');

/**
 * Universal Database Reconciliation & Gold Demo Seeder
 * Runs on startup to ensure schema integrity and populate showcase data.
 */
const reconcileDatabase = async () => {
    console.log('🔍 [DB-RECON] Starting schema integrity check...');
    try {
        // 1. Repair CUSTOMERS & RE_UNITS table (Schema Alignment)
        console.log('🚧 [DB-RECON] Checking Customers & Units integrity...');
        
        // Customers: Multi-Tenant & RE Matching Columns
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id UUID`);
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id UUID`);
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS source_id INTEGER`);
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS entity_type VARCHAR(20) DEFAULT 'customer'`);
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS budget_min NUMERIC DEFAULT 0`);
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS budget_max NUMERIC DEFAULT 0`);
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_area_min NUMERIC DEFAULT 0`);
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_area_max NUMERIC DEFAULT 0`);
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_location TEXT`);
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_rooms INTEGER DEFAULT 0`);

        // Units: Operational Columns
        await db.query(`ALTER TABLE re_units ADD COLUMN IF NOT EXISTS vendor_id UUID`);
        await db.query(`ALTER TABLE re_units ADD COLUMN IF NOT EXISTS responsible_person_id UUID`);
        await db.query(`ALTER TABLE re_units ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(20) DEFAULT 'sale'`);
        await db.query(`ALTER TABLE re_units ADD COLUMN IF NOT EXISTS rooms INTEGER DEFAULT 0`);
        await db.query(`ALTER TABLE re_units ADD COLUMN IF NOT EXISTS location TEXT`);

        // Lead Statuses: Customizable lookup table
        await db.query(`
            CREATE TABLE IF NOT EXISTS lead_statuses (
                id SERIAL PRIMARY KEY,
                tenant_id UUID,
                name VARCHAR(50) NOT NULL,
                color VARCHAR(20),
                is_default BOOLEAN DEFAULT false,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ [DB-RECON] Tables schema verified.');

        // 2. SECURE & SEED GOLD DEMO (Showcase Data)
        console.log('💎 [DB-RECON] Hardening Gold Demo Showcase...');
        const demoEmail = 'demo@tashgheel.com';
        const userRes = await db.query('SELECT u.id, u.tenant_id FROM users u WHERE u.email = $1', [demoEmail]);
        
        if (userRes.rows.length > 0) {
            const { id: userId, tenant_id: tenantId } = userRes.rows[0];

            // Seed default Lead Statuses for RE if empty
            const statusCheck = await db.query('SELECT 1 FROM lead_statuses WHERE tenant_id = $1 LIMIT 1', [tenantId]);
            if (statusCheck.rows.length === 0) {
                console.log('🚧 [DB-RECON] Seeding default Real Estate lead statuses...');
                await db.query(`
                    INSERT INTO lead_statuses (tenant_id, name, color, is_default, sort_order)
                    VALUES 
                    ($1, 'New Lead', '#ef4444', true, 1),
                    ($1, 'Site Visit', '#f59e0b', false, 2),
                    ($1, 'Negotiation', '#3b82f6', false, 3),
                    ($1, 'Reserved', '#8b5cf6', false, 4),
                    ($1, 'Closed/Sold', '#10b981', false, 5)
                `, [tenantId]);
            }
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
