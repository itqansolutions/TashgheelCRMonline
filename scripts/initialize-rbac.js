const db = require('../config/db');
const bcrypt = require('bcrypt');
require('dotenv').config();

const INITIAL_PAGES = [
    '/dashboard',
    '/customers',
    '/products',
    '/deals',
    '/tasks',
    '/accounting',
    '/employees',
    '/files',
    '/reports'
];

const initializeRBAC = async () => {
    try {
        console.log('--- Initializing RBAC System ---');

        // 1. Create user_access table
        await db.query(`
            CREATE TABLE IF NOT EXISTS user_access (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                page_path VARCHAR(255) NOT NULL,
                can_access BOOLEAN DEFAULT FALSE,
                UNIQUE(user_id, page_path)
            );
        `);
        console.log('✅ table "user_access" ensured.');

        // 2. Check for existing Admin
        const adminCheck = await db.query('SELECT * FROM users WHERE email = $1 OR name = $2', ['admin@tashgheel.com', 'admin']);
        let adminId;

        if (adminCheck.rows.length === 0) {
            console.log('Seeding default Admin user...');
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('itq@n123456', salt);

            const newAdmin = await db.query(
                'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
                ['admin', 'admin@tashgheel.com', hashedPassword, 'admin']
            );
            adminId = newAdmin.rows[0].id;
            console.log('✅ Default Admin created (admin@tashgheel.com / itq@n123456)');
        } else {
            adminId = adminCheck.rows[0].id;
            console.log('⚠️ Admin user already exists. ID:', adminId);
        }

        // 3. Grant all permissions to the Admin
        console.log('Granting full access to Admin...');
        for (const path of INITIAL_PAGES) {
            await db.query(
                'INSERT INTO user_access (user_id, page_path, can_access) VALUES ($1, $2, $3) ON CONFLICT (user_id, page_path) DO UPDATE SET can_access = EXCLUDED.can_access',
                [adminId, path, true]
            );
        }
        console.log('✅ Full access granted to Admin.');

        console.log('--- RBAC Initialization Complete ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error during RBAC initialization:', err);
        process.exit(1);
    }
};

initializeRBAC();
