const db = require('../config/db');

/**
 * Universal Database Reconciliation & Gold Demo Seeder
 * FORCED RECOVERY MODE: Converts all tenant/branch IDs to VARCHAR(255) to support mixed UUID/Integer formats.
 */
const reconcileDatabase = async () => {
    console.log('🔍 [DB-RECON] Starting forced schema stabilization...');
    
    // Helper: Forcefully convert ID columns to VARCHAR
    const hardenTableIds = async (tableName) => {
        try {
            // Check if columns exist before altering
            const check = await db.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = $1 AND column_name IN ('tenant_id', 'branch_id')
            `, [tableName]);

            for (const col of check.rows) {
                if (col.data_type !== 'character varying') {
                    console.log(`🚧 [DB-RECON] Force-migrating ${tableName}.${col.column_name} to VARCHAR(255)...`);
                    await db.query(`ALTER TABLE ${tableName} ALTER COLUMN ${col.column_name} TYPE VARCHAR(255) USING ${col.column_name}::text`);
                }
            }
            // If columns don't exist at all, add them
            const existingCols = check.rows.map(r => r.column_name);
            if (!existingCols.includes('tenant_id')) {
                await db.query(`ALTER TABLE ${tableName} ADD COLUMN tenant_id VARCHAR(255)`);
            }
            if (!existingCols.includes('branch_id')) {
                await db.query(`ALTER TABLE ${tableName} ADD COLUMN branch_id VARCHAR(255)`);
            }
        } catch (err) {
            console.warn(`⚠️ [DB-RECON] Skip ${tableName}: ${err.message}`);
        }
    };

    try {
        // 1. HARDEN CORE TABLES (Unify Mixed IDs)
        const coreTables = ['users', 'customers', 'invoices', 'payments', 'expenses', 'tasks', 'deals'];
        for (const table of coreTables) {
            await hardenTableIds(table);
        }

        // 2. RESET REAL ESTATE TABLES (Clean Slate with correct types)
        console.log('🚧 [DB-RECON] Resetting Real Estate Module schema...');
        await db.query(`DROP TABLE IF EXISTS re_payments_mvp CASCADE`);
        await db.query(`DROP TABLE IF EXISTS re_units CASCADE`);
        
        await db.query(`
            CREATE TABLE re_units (
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
            CREATE TABLE re_payments_mvp (
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

        // 3. REANIMATE SUPPORTING TABLES
        await hardenTableIds('lead_statuses');
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

        await hardenTableIds('system_notifications');
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

        console.log('✅ [DB-RECON] Universal ID Unification Successful.');

        // 4. SECURE & SEED GOLD DEMO (Showcase Data)
        const demoEmail = 'demo@tashgheel.com';
        const userRes = await db.query('SELECT u.id, u.tenant_id FROM users u WHERE u.email = $1', [demoEmail]);
        
        if (userRes.rows.length > 0) {
            const { id: userId, tenant_id: tenantId } = userRes.rows[0];
            const tenantIdStr = String(tenantId);

            // Force Dashboard Upgrade
            await db.query('UPDATE tenants SET template_name = $1 WHERE id::text = $2', ['real_estate', tenantIdStr]);
            
            // Seed sample units
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

        console.log('🧹 [DB-RECON] System is ready and stable.');
    } catch (err) {
        console.error('❌ [DB-RECON] Critical Failure during unification:', err.message);
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
