const db = require('../config/db');

const migrate = async () => {
    try {
        console.log('--- 💰 SaaS Activation Layer Deployment ---');
        await db.query('BEGIN');

        // 1. PLANS TABLE (Product Catalog)
        console.log('1. Building [plans] table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS plans (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                display_name VARCHAR(100),
                price_monthly DECIMAL(10,2) DEFAULT 0,
                max_users INTEGER DEFAULT 5,
                max_branches INTEGER DEFAULT 1,
                modules JSONB DEFAULT '{}',
                is_active BOOLEAN DEFAULT TRUE,
                sort_order INTEGER DEFAULT 0
            );
        `);

        // 2. SUBSCRIPTIONS TABLE (Tenant → Plan binding)
        console.log('2. Building [subscriptions] table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS subscriptions (
                id SERIAL PRIMARY KEY,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
                plan_id INTEGER REFERENCES plans(id),
                status VARCHAR(50) DEFAULT 'trial',
                trial_ends_at TIMESTAMP WITH TIME ZONE,
                expires_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. SEED THE 3 PLANS
        console.log('3. Seeding default plans (Basic / Pro / Enterprise)...');
        await db.query(`
            INSERT INTO plans (name, display_name, price_monthly, max_users, max_branches, modules, sort_order)
            VALUES
            (
                'basic', 'Basic', 29.00, 10, 1,
                '{"crm": true, "finance": true, "hr": false, "inventory": false, "automation": false}',
                1
            ),
            (
                'pro', 'Pro', 79.00, 50, 5,
                '{"crm": true, "finance": true, "hr": true, "inventory": true, "automation": false}',
                2
            ),
            (
                'enterprise', 'Enterprise', 199.00, -1, -1,
                '{"crm": true, "finance": true, "hr": true, "inventory": true, "automation": true}',
                3
            )
            ON CONFLICT (name) DO NOTHING;
        `);

        // 4. Migrate existing tenants → give them a Pro trial subscription
        console.log('4. Bootstrapping existing tenants with subscriptions...');
        await db.query(`
            INSERT INTO subscriptions (tenant_id, plan_id, status, trial_ends_at, expires_at)
            SELECT 
                t.id, 
                p.id,
                'trial',
                NOW() + INTERVAL '14 days',
                NOW() + INTERVAL '14 days'
            FROM tenants t
            CROSS JOIN plans p
            WHERE p.name = 'pro'
            ON CONFLICT (tenant_id) DO NOTHING;
        `);

        // 5. Indexes
        await db.query(`CREATE INDEX IF NOT EXISTS idx_subs_tenant ON subscriptions (tenant_id);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions (status, expires_at);`);

        await db.query('COMMIT');
        console.log('✅ SaaS Activation Layer Deployed (Plans + Subscriptions ready).');
        process.exit(0);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('💣 SaaS Migration Error:', err.message);
        process.exit(1);
    }
};

migrate();
