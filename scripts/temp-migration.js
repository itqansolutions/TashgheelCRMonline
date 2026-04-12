const db = require('../config/db');

const migrate = async () => {
    try {
        console.log('Running SaaS Auth Migration...');
        
        await db.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
            ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMP WITH TIME ZONE;
        `);
        
        console.log('✅ Users table upgraded with reset token columns.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
};

migrate();
