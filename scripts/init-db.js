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
                console.warn(`⚠️ Warning in statement ${i + 1}: ${queryErr.message}`);
                // Continue if it's "already exists" but stop for other errors
                if (!queryErr.message.includes('already exists')) {
                    throw queryErr;
                }
            }
        }

        console.log('✅ Database schema applied successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Critical Error during DB initialization:', err.stack);
        process.exit(1);
    }
};

initDb();
