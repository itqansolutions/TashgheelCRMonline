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
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS manager_id UUID`);
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS source TEXT`);
        await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS assigned_to UUID`);

        // Users: Multi-Tenant & Branch Scoping (Integer IDs)
        await db.query(`ALTER TABLE users ALTER COLUMN tenant_id TYPE INTEGER USING tenant_id::text::integer`);
        await db.query(`ALTER TABLE users ALTER COLUMN branch_id TYPE INTEGER USING branch_id::text::integer`);
        await db.query(`ALTER TABLE customers ALTER COLUMN tenant_id TYPE INTEGER USING tenant_id::text::integer`);
        await db.query(`ALTER TABLE customers ALTER COLUMN branch_id TYPE INTEGER USING branch_id::text::integer`);

        // Units: Operational Table & Columns (Re-aligned to Integer IDs)
        await db.query(`DROP TABLE IF EXISTS re_payments_mvp`); // Drop first due to potential dependencies
        await db.query(`DROP TABLE IF EXISTS re_units`);
        
        await db.query(`
            CREATE TABLE IF NOT EXISTS re_units (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                project_name VARCHAR(255),
                unit_number VARCHAR(100),
                type VARCHAR(100),
                floor VARCHAR(50),
                area_sqm VARCHAR(50),
                price NUMERIC DEFAULT 0,
                status VARCHAR(20) DEFAULT 'available',
                tenant_id INTEGER,
                branch_id INTEGER,
                vendor_id UUID,
                responsible_person_id UUID,
                transaction_type VARCHAR(20) DEFAULT 'sale',
                rooms INTEGER DEFAULT 0,
                location TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Payments: RE Payment Schedules (MVP Alignment - Integer IDs)
        await db.query(`
            CREATE TABLE IF NOT EXISTS re_payments_mvp (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                unit_id UUID,
                customer_id UUID,
                deal_id UUID,
                total_amount NUMERIC DEFAULT 0,
                paid_amount NUMERIC DEFAULT 0,
                next_payment_date DATE,
                status VARCHAR(20) DEFAULT 'pending',
                tenant_id INTEGER,
                branch_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Lead Statuses: Customizable lookup table (Integer IDs)
        await db.query(`
            CREATE TABLE IF NOT EXISTS lead_statuses (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER,
                name VARCHAR(50) NOT NULL,
                color VARCHAR(20),
                is_default BOOLEAN DEFAULT false,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Notifications: System-wide alert table (MVP Alignment - Integer IDs)
        await db.query(`
            CREATE TABLE IF NOT EXISTS system_notifications (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id INTEGER,
                branch_id INTEGER,
                user_id UUID,
                type VARCHAR(50) DEFAULT 'info',
                title VARCHAR(255),
                message TEXT,
                is_read BOOLEAN DEFAULT false,
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

/**
 * Resilient Wrapper for RECON
 */
const startReconciliationWithRetry = async (retries = 3, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
        try {
            await reconcileDatabase();
            return; // Success!
        } catch (err) {
            console.error(`⚠️ [DB-RECON] Attempt ${i + 1} failed: ${err.message}`);
            if (i < retries - 1) {
                console.log(`📡 [DB-RECON] Retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error('❌ [DB-RECON] Maximum retries reached. System might be unstable.');
            }
        }
    }
};

module.exports = startReconciliationWithRetry;
