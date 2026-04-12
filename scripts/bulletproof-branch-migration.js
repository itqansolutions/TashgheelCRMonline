const db = require('../config/db');

/**
 * PRODUCTION-READY BULLET_PROOF BRANCH MIGRATION
 * Strategy:
 * 1. Add columns without constraints to prevent breaking ongoing operations.
 * 2. Seed default branches for all existing tenants.
 * 3. Backfill operational data using Tenant-Branch association.
 * 4. Enforce NOT NULL and Performance Indexes.
 */
const migrate = async () => {
    try {
        console.log('--- [PROD-SAFE] SaaS Multi-Branch Hardening ---');

        // Step 1: Add columns + Main Branch protection check
        await db.query(`
            -- Branch Identity
            CREATE TABLE IF NOT EXISTS branches (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(255) NOT NULL,
                address TEXT,
                phone VARCHAR(50),
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                is_main BOOLEAN DEFAULT false,
                timezone VARCHAR(50) DEFAULT 'Africa/Cairo',
                currency VARCHAR(10) DEFAULT 'EGP',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_main_branch_protection CHECK (is_main = false OR name = 'Main Branch')
            );

            -- User Access Join Table
            CREATE TABLE IF NOT EXISTS user_branches (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
                PRIMARY KEY (user_id, branch_id)
            );
        `);

        // Step 2: Seed Main Branches for every existing tenant
        console.log('🌱 Seeding missing Main Branches for existing tenants...');
        await db.query(`
            INSERT INTO branches (name, tenant_id, is_main, address)
            SELECT 'Main Branch', id, true, 'Corporate Headquarters'
            FROM tenants t
            WHERE NOT EXISTS (
                SELECT 1 FROM branches b WHERE b.tenant_id = t.id AND b.is_main = true
            );
        `);

        const operationalTables = [
            'users', 'customers', 'deals', 'products', 
            'tasks', 'invoices', 'expenses', 
            'payments', 'quotations', 'projects'
        ];

        // Step 3: Progressive Migration (Columns + Backfill)
        for (const table of operationalTables) {
            console.log(`🔨 Hardening scope for table: ${table}...`);
            
            // Add column (nullable initially)
            await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;`);
            
            // Backfill: Match every existing row in the table to the tenant's Main Branch
            await db.query(`
                UPDATE ${table}
                SET branch_id = b.id
                FROM branches b
                WHERE ${table}.tenant_id = b.tenant_id 
                AND b.is_main = true
                AND ${table}.branch_id IS NULL;
            `);

            // Step 4: Constraints & Indexing (Performance Boost)
            // Note: We only set NOT NULL for tables that MUST have a branch scope.
            // For 'users' and 'products' it might be global, but for 'deals/tasks' it's mandatory.
            if (!['users', 'products'].includes(table)) {
                await db.query(`ALTER TABLE ${table} ALTER COLUMN branch_id SET NOT NULL;`);
                await db.query(`CREATE INDEX IF NOT EXISTS idx_${table}_scope ON ${table} (tenant_id, branch_id);`);
                console.log(`✅ ${table} hardened with NOT NULL constraint and composite index.`);
            } else {
                await db.query(`CREATE INDEX IF NOT EXISTS idx_${table}_scope ON ${table} (tenant_id, branch_id);`);
                console.log(`✅ ${table} indexed for performance (Optional scope).`);
            }
        }

        console.log('🚀 [FINAL] Bulletproof branch migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('💣 [FATAL] Branch Migration Error:', err.message);
        process.exit(1);
    }
};

migrate();
