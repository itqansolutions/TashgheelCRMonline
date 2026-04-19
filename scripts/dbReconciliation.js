const db = require('../config/db');

/**
 * Universal Database Reconciliation & Gold Demo Seeder
 * RECOVERY MODE: Ensures existence of modular tables WITHOUT altering core legacy types.
 */
const reconcileDatabase = async () => {
    console.log('🔍 [DB-RECON] Starting schema existence check...');
    
    try {
        // 1. Create Modular Tables (Type-Agnostic VARCHAR for flexibility)
        console.log('🚧 [DB-RECON] Ensuring Real Estate tables exist...');
        
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
                tenant_id VARCHAR(255),
                branch_id VARCHAR(255),
                vendor_id UUID,
                responsible_person_id UUID,
                transaction_type VARCHAR(20) DEFAULT 'sale',
                rooms INTEGER DEFAULT 0,
                location TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

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
                tenant_id VARCHAR(255),
                branch_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS lead_statuses (
                id SERIAL PRIMARY KEY,
                tenant_id VARCHAR(255),
                name VARCHAR(50) NOT NULL,
                color VARCHAR(20),
                is_default BOOLEAN DEFAULT false,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS system_notifications (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255),
                branch_id VARCHAR(255),
                user_id UUID,
                type VARCHAR(50) DEFAULT 'info',
                title VARCHAR(255),
                message TEXT,
                is_read BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ [DB-RECON] Modular tables verified.');

        // 2. SEED GOLD DEMO (Showcase Data)
        const demoEmail = 'demo@tashgheel.com';
        const userRes = await db.query('SELECT u.id, u.tenant_id FROM users u WHERE u.email = $1', [demoEmail]);
        
        if (userRes.rows.length > 0) {
            const { id: userId, tenant_id: tenantId } = userRes.rows[0];
            const tenantIdStr = String(tenantId);

            // Force Dashboard Upgrade (Generic casting for legacy tables)
            await db.query('UPDATE tenants SET template_name = $1 WHERE id::text = $2', ['real_estate', tenantIdStr]);
            
            // Seed sample units if empty
            const unitCheck = await db.query('SELECT 1 FROM re_units WHERE tenant_id::text = $1 LIMIT 1', [tenantIdStr]);
            if (unitCheck.rows.length === 0) {
                const branchRes = await db.query('SELECT id FROM branches WHERE tenant_id::text = $1 LIMIT 1', [tenantIdStr]);
                const branchIdStr = String(branchRes.rows[0]?.id || '1');

                await db.query(`
                    INSERT INTO re_units (name, project_name, unit_number, floor, area_sqm, price, status, tenant_id, branch_id)
                    VALUES 
                    ('Penthouse 402', 'Palm Residences', 'P402', '4th', '185 sqm', 4500000, 'available', $1, $2),
                    ('Suite 101', 'Coastal Breeze', 'S101', 'Ground', '95 sqm', 1800000, 'available', $1, $2)
                `, [tenantIdStr, branchIdStr]);
                
                console.log('✅ [DB-RECON] Real Estate Demo Active.');
            }
        }

        console.log('🧹 [DB-RECON] System is ready and stable.');
    } catch (err) {
        console.error('❌ [DB-RECON] Failure:', err.message);
    }
};

/**
 * Resilient Wrapper for RECON
 */
const startReconciliationWithRetry = async (retries = 3, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
        try {
            await reconcileDatabase();
            return;
        } catch (err) {
            console.error(`⚠️ [DB-RECON] Attempt ${i + 1} failed: ${err.message}`);
            if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

module.exports = startReconciliationWithRetry;
