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
            await db.query('ALTER TABLE deals ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id) ON DELETE SET NULL');
            console.log('✅ Migration: product_id added to deals');

            // Lead Sources Table
            await db.query(`
                CREATE TABLE IF NOT EXISTS lead_sources (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) UNIQUE NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ Migration: lead_sources table ensured');

            // Customers Table Updates
            console.log('Migrating customers table columns...');
            await db.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS source_id INTEGER REFERENCES lead_sources(id) ON DELETE SET NULL');
            await db.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
            console.log('✅ Migration: source_id and manager_id confirmed for customers');

            // Invoices Table Updates
            console.log('Migrating invoices table columns...');
            await db.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES customers(id) ON DELETE SET NULL');
            await db.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT');
            console.log('✅ Migration: client_id and notes confirmed for invoices');

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
            console.log('✅ Migration: tasks updated and followers table ensured');

            // Global Settings Table
            await db.query(`
                CREATE TABLE IF NOT EXISTS settings (
                    key VARCHAR(100) PRIMARY KEY,
                    value TEXT,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            // Seed initial branding keys if not exist
            const initialKeys = ['company_name', 'company_logo', 'invoice_footer', 'invoice_terms'];
            for (const key of initialKeys) {
                await db.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, '']);
            }
            console.log('✅ Migration: global settings table ensured');

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
