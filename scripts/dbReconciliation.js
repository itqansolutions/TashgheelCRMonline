const db = require('../config/db');

/**
 * Universal Database Reconciliation & Gold Demo Seeder
 * RECOVERY MODE: Ensures existence of modular tables WITHOUT altering core legacy types.
 */
const reconcileDatabase = async () => {
    console.log('🔍 [DB-RECON] Starting schema existence check...');
    
    try {
        // 2. ENSURE REAL ESTATE TABLES (Safe Schema with ID Compatibility)
        console.log('🚧 [DB-RECON] Verifying Real Estate schema for ID alignment...');
        
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
                vendor_id VARCHAR(255),
                responsible_person_id VARCHAR(255),
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
                unit_id VARCHAR(255),
                customer_id VARCHAR(255),
                deal_id VARCHAR(255),
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

        // Migration logic for existing property DBs to explicitly support mixed Integer/UUID string types
        try {
            await db.query(`ALTER TABLE re_units ALTER COLUMN vendor_id TYPE VARCHAR(255), ALTER COLUMN responsible_person_id TYPE VARCHAR(255)`);
            await db.query(`ALTER TABLE re_payments_mvp ALTER COLUMN unit_id TYPE VARCHAR(255), ALTER COLUMN customer_id TYPE VARCHAR(255), ALTER COLUMN deal_id TYPE VARCHAR(255)`);
            
            // Hard Schema Resilience (Unconditional)
            await db.query(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS unit_id VARCHAR(255)`);
            await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id VARCHAR(255)`);
            await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deal_id VARCHAR(255)`);
        } catch(e) { /* Ignore - Migration already applied or invalid cast */ }

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

                // No auto-seeding of sample units per user request
                
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
