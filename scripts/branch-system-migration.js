const db = require('../config/db');

const migrate = async () => {
    try {
        console.log('--- SaaS Phase: Migrating Branch Management Schema ---');
        
        // 1. Create Branches Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS branches (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(255) NOT NULL,
                address TEXT,
                phone VARCHAR(50),
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. User-Branch Access Table (Many-to-Many)
        await db.query(`
            CREATE TABLE IF NOT EXISTS user_branches (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
                PRIMARY KEY (user_id, branch_id)
            );
        `);

        // 3. Add branch_id to operational tables
        const tables = [
            'users', 
            'customers', 
            'deals', 
            'tasks', 
            'invoices', 
            'expenses', 
            'payments', 
            'quotations', 
            'projects',
            'products'
        ];

        for (const table of tables) {
            console.log(`Adding branch_id to ${table}...`);
            await db.query(`
                ALTER TABLE ${table} 
                ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
            `);
        }

        console.log('✅ Branch system schema initialized successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Branch Migration failed:', err.message);
        process.exit(1);
    }
};

migrate();
