const fs = require('fs');
const path = require('path');
const db = require('../config/db');
require('dotenv').config();

const initDb = async () => {
    try {
        console.log('--- Database Initialization Started ---');
        
        const schemaPath = path.join(__dirname, '../database/schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Split by semicolon but handle potential issues with triggers or functions if they exist
        // For this schema, simple splitting works
        const queries = schema
            .split(';')
            .map(q => q.trim())
            .filter(q => q.length > 0);

        console.log(`Executing ${queries.length} SQL statements...`);

        for (let i = 0; i < queries.length; i++) {
            try {
                await db.query(queries[i]);
            } catch (queryErr) {
                // Continue if it's "already exists" but stop for other errors
                if (queryErr.message.includes('already exists')) {
                    // Silent skip for existing tables/constraints to keep logs clean
                    continue;
                }
                console.warn(`⚠️ Warning in statement ${i + 1}: ${queryErr.message}`);
                throw queryErr;
            }
        }

        console.log('✅ Database schema applied successfully.');
        
        // --- Custom Migrations ---
        console.log('Running migrations...');
        try {
            // --- SaaS Multi-Tenancy Foundation ---
            console.log('--- SaaS Phase: Implementing Multi-Tenant Architecture ---');
            
            // 1. Enable UUID Extension
            await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

            // 2. Core Tenants Table
            await db.query(`
                CREATE TABLE IF NOT EXISTS tenants (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    name VARCHAR(255) NOT NULL,
                    slug VARCHAR(100) UNIQUE NOT NULL,
                    plan VARCHAR(50) DEFAULT 'basic',
                    status VARCHAR(50) DEFAULT 'active',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `);

            const defaultTenant = '00000000-0000-0000-0000-000000000000';

            // 3. Ensure System Default Tenant
            await db.query(`
                INSERT INTO tenants (id, name, slug, plan, status)
                VALUES ($1, 'System Default', 'system-default', 'enterprise', 'active')
                ON CONFLICT (id) DO NOTHING
            `, [defaultTenant]);

            const tablesToTenantize = [
                'users', 'customers', 'deals', 'quotations', 'invoices', 
                'tasks', 'attachments', 'products', 'lead_sources', 'system_logs',
                'projects', 'expenses'
            ];

            for (const table of tablesToTenantize) {
                // Add column if it doesn't exist
                await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) DEFAULT $1`, [defaultTenant]);
                // Ensure all existing rows have the default tenant assigned
                await db.query(`UPDATE ${table} SET tenant_id = $1 WHERE tenant_id IS NULL`, [defaultTenant]);
                // Create Index safely
                await db.query(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id)`);
                console.log(`✅ Table isolation & indexing enabled: ${table}`);
            }

            // 4. Enhance System Logs with Context
            console.log('Upgrading system_logs schema for Contextual Intelligence...');
            await db.query('ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45)');
            await db.query('ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS user_agent TEXT');
            await db.query('ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS level VARCHAR(20) DEFAULT \'INFO\'');
            
            // Performance Indexes for Filtering
            await db.query('CREATE INDEX IF NOT EXISTS idx_logs_tenant ON system_logs(tenant_id)');
            await db.query('CREATE INDEX IF NOT EXISTS idx_logs_action ON system_logs(action)');
            await db.query('CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level)');
            await db.query('CREATE INDEX IF NOT EXISTS idx_logs_created ON system_logs(created_at)');
            console.log('✅ Migration: SaaS Multi-Tenancy & Unified Logging confirmed');

            // --- Existing Migrations ---
            console.log('Running existing logic migrations...');
            await db.query('ALTER TABLE deals ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id) ON DELETE SET NULL');
            
            // Lead Sources Table
            await db.query(`
                CREATE TABLE IF NOT EXISTS lead_sources (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) UNIQUE NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            // Customers Table Updates
            await db.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS source_id INTEGER REFERENCES lead_sources(id) ON DELETE SET NULL');
            await db.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL');

            // Invoices Table Updates
            await db.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES customers(id) ON DELETE SET NULL');
            await db.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT');

            // Tasks Updates
            await db.query('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS director_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
            await db.query('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
            await db.query(`
                CREATE TABLE IF NOT EXISTS task_followers (
                    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    PRIMARY KEY (task_id, user_id)
                )
            `);

            // Global Settings Table
            await db.query(`
                CREATE TABLE IF NOT EXISTS settings (
                    key VARCHAR(100) PRIMARY KEY,
                    value TEXT,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            const initialKeys = ['company_name', 'company_logo', 'invoice_footer', 'invoice_terms'];
            for (const key of initialKeys) {
                await db.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, '']);
            }
            // --- Notification System ---
            console.log('--- SaaS Phase: Implementing Notification Infrastructure ---');
            await db.query(`
                CREATE TABLE IF NOT EXISTS notifications (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                    type VARCHAR(20) DEFAULT 'info', -- info, success, warning, danger
                    title VARCHAR(255) NOT NULL,
                    message TEXT,
                    link VARCHAR(255), -- Internal route
                    is_read BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await db.query('CREATE INDEX IF NOT EXISTS idx_notify_user ON notifications(user_id)');
            await db.query('CREATE INDEX IF NOT EXISTS idx_notify_tenant ON notifications(tenant_id)');
            await db.query('CREATE INDEX IF NOT EXISTS idx_notify_read ON notifications(is_read)');
            await db.query('CREATE INDEX IF NOT EXISTS idx_notify_created ON notifications(created_at DESC)');

            console.log('✅ Migration: all legacy migrations and SaaS foundation ensured');

        } catch (migErr) {
            console.warn('⚠️ Migration Warning:', migErr.message);
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Critical Error during DB initialization:', err.stack);
        process.exit(1);
    }
};

initDb();
