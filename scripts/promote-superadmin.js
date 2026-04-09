const db = require('../config/db');
require('dotenv').config();

const SYSTEM_DEFAULT_TENANT = '00000000-0000-0000-0000-000000000000';

const promote = async () => {
    const email = process.argv[2];

    if (!email) {
        console.error('❌ Usage: node scripts/promote-superadmin.js <email>');
        process.exit(1);
    }

    try {
        console.log(`--- Promoting User to SuperAdmin: ${email} ---`);

        // 1. Check if user exists
        const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            console.error(`❌ User with email ${email} not found.`);
            process.exit(1);
        }

        const user = userResult.rows[0];

        // 2. Ensure System Default Tenant exists
        await db.query(`
            INSERT INTO tenants (id, name, slug, plan, status)
            VALUES ($1, 'System Default', 'system-default', 'enterprise', 'active')
            ON CONFLICT (id) DO NOTHING
        `, [SYSTEM_DEFAULT_TENANT]);

        // 3. Promote User
        await db.query(
            'UPDATE users SET tenant_id = $1, role = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [SYSTEM_DEFAULT_TENANT, 'admin', user.id]
        );

        console.log(`✅ Success! User ${user.name} (${email}) has been promoted to Global SuperAdmin.`);
        console.log(`👉 Please log out and log back in to activate your new permissions.`);
        
        process.exit(0);
    } catch (err) {
        console.error('❌ Promotion Error:', err.message);
        process.exit(1);
    }
};

promote();
