const db = require('../config/db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

/**
 * 💣 THE DEMO SEEDER
 * Goal: Create a vibrant, data-rich "Demo Company" for Itqan Solutions.
 * Strategy: One Tenant, One User, All Modules Activated.
 */
const seed = async () => {
    try {
        console.log('🚀 [DEMO-SEED] Building the Itqan Experience...');

        await db.query('BEGIN');

        // 1. Create Demo Tenant
        const tenantId = crypto.randomUUID();
        console.log(`🏢 Creating Demo Tenant: ${tenantId}`);
        await db.query(`
            INSERT INTO tenants (id, name, slug, plan, status)
            VALUES ($1, 'Itqan Demo Corp', 'demo-corp', 'enterprise', 'active')
            ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
        `, [tenantId]);

        // Fix: Use the ID from DB if slug existed
        const tResult = await db.query('SELECT id FROM tenants WHERE slug = $1', ['demo-corp']);
        const actualTenantId = tResult.rows[0].id;

        // 2. Create Demo User
        console.log('👤 Creating Demo User: demo@tashgheel.com');
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash('demo123', salt);
        
        await db.query(`
            INSERT INTO users (name, email, password_hash, role, tenant_id)
            VALUES ($1, $2, $3, $4, $actualTenantId)
            ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
        `, ['Demo Manager', 'demo@tashgheel.com', passwordHash, 'admin']);

        const uResult = await db.query('SELECT id FROM users WHERE email = $1', ['demo@tashgheel.com']);
        const userId = uResult.rows[0].id;

        // 3. Create Main Branch
        console.log('🏢 Creating Main Demo Branch...');
        const bResult = await db.query(`
            INSERT INTO branches (name, address, tenant_id)
            VALUES ($1, $2, $actualTenantId)
            RETURNING id
        `, ['Cairo HQ', 'New Cairo, Egypt']);
        const branchId = bResult.rows[0].id;

        // Link User to Branch
        await db.query('INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, branchId]);
        await db.query('UPDATE users SET branch_id = $1 WHERE id = $2', [branchId, userId]);

        // 4. Seed Customers (The WOW Factor)
        console.log('👥 Seeding Customers...');
        const customers = [
            ['Ahmed Zaki', 'ahmed@example.com', '01012345678'],
            ['Sarah Mansour', 'sarah@example.com', '01123456789'],
            ['Nile Logistics', 'contact@nile.com', '01211223344'],
            ['Alpha Tech', 'info@alphatech.com', '01566778899']
        ];
        for (const [name, email, phone] of customers) {
            await db.query(`
                INSERT INTO customers (name, email, phone, tenant_id) 
                VALUES ($1, $2, $3, $actualTenantId)
            `, [name, email, phone]);
        }

        // 5. Seed Deals
        console.log('💰 Seeding CRM Deals...');
        const customerResult = await db.query('SELECT id FROM customers WHERE tenant_id = $1 LIMIT 2', [actualTenantId]);
        const c1 = customerResult.rows[0].id;
        const c2 = customerResult.rows[1].id;

        await db.query(`
            INSERT INTO deals (title, value, status, customer_id, tenant_id)
            VALUES ('Enterprise License Extension', 15000, 'open', $1, $actualTenantId),
                   ('Cloud Migration Project', 45000, 'won', $2, $actualTenantId)
        `, [c1, c2]);

        // 6. Seed HR Data
        console.log('👥 Seeding HR Staff...');
        const staff = [
            ['Omar Khalid', 'omar@demo.com', 'Sales Manager'],
            ['Laila Amin', 'laila@demo.com', 'Finance Specialist']
        ];
        for (const [name, email, title] of staff) {
            const newUser = await db.query(`
                INSERT INTO users (name, email, password_hash, role, tenant_id, branch_id)
                VALUES ($1, $2, 'hashed', 'manager', $actualTenantId, $branchId)
                RETURNING id
            `, [name, email]);
            
            await db.query(`
                INSERT INTO hr_profiles (user_id, tenant_id, job_title, employment_type, salary, status)
                VALUES ($1, $actualTenantId, $2, 'full_time', 12000, 'active')
            `, [newUser.rows[0].id, title]);
        }

        await db.query('COMMIT');
        console.log('✅ Demo Experience Seeded Securely!');
        process.exit(0);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('💣 [FATAL] Demo Seeding Failed:', err.message);
        process.exit(1);
    }
};

seed();
