const db = require('../config/db');
require('dotenv').config();

const createLogsTable = async () => {
    try {
        console.log('--- Creating System Logs Table ---');
        await db.query(`
            CREATE TABLE IF NOT EXISTS system_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                action VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, LOGIN
                entity_type VARCHAR(50) NOT NULL, -- Customer, Deal, Task, etc.
                entity_id INTEGER,
                details JSONB, -- { "fields": ["status", "value"], "old": {...}, "new": {...} }
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ table "system_logs" created successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error creating logs table:', err);
        process.exit(1);
    }
};

createLogsTable();
