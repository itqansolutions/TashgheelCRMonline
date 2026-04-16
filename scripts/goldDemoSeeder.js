const db = require('../config/db');

/**
 * Gold Demo Seeder - Real Estate Edition
 * This script transforms the demo environment into a high-fidelity Real Estate showcase.
 */
const seedGoldDemo = async () => {
    console.log('💎 [GOLD-DEMO] Initializing Real Estate Showcase...');
    
    try {
        // 1. Find the Demo Tenant & User
        const demoEmail = 'demo@tashgheel.com';
        const userRes = await db.query('SELECT u.id, u.tenant_id FROM users u WHERE u.email = $1', [demoEmail]);
        
        if (userRes.rows.length === 0) {
            throw new Error('Demo user not found. Please run individual seeder first.');
        }

        const { id: userId, tenant_id: tenantId } = userRes.rows[0];

        // 2. UPGRADE Tenant to Real Estate Template
        await db.query('UPDATE tenants SET template_name = $1 WHERE id = $2', ['real_estate', tenantId]);
        console.log('✅ [GOLD-DEMO] Tenant upgraded to "real_estate" template.');

        // 3. SEED a Premium Project/Units
        console.log('🚧 [GOLD-DEMO] Seeding units...');
        const branchRes = await db.query('SELECT id FROM branches WHERE tenant_id = $1 LIMIT 1', [tenantId]);
        const branchId = branchRes.rows[0]?.id;

        const units = [
            { name: 'Unit 101-A', project: 'Palm Residences', floor: '1st', area: '120 sqm', price: 2500000, status: 'sold' },
            { name: 'Unit 204-B', project: 'Palm Residences', floor: '2nd', area: '145 sqm', price: 3100000, status: 'available' },
            { name: 'Villa-V12', project: 'Coastal Breeze', floor: 'G+1', area: '350 sqm', price: 8500000, status: 'reserved' }
        ];

        for (const u of units) {
            await db.query(`
                INSERT INTO re_units (name, project_name, floor, area_sqm, price, status, tenant_id, branch_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT DO NOTHING
            `, [u.name, u.project, u.floor, u.area, u.price, u.status, tenantId, branchId]);
        }

        // 4. Create a "Won" Deal for the Sold Unit
        const unitRes = await db.query('SELECT id FROM re_units WHERE name = $1 AND tenant_id = $2', ['Unit 101-A', tenantId]);
        const unitId = unitRes.rows[0].id;
        
        const customerRes = await db.query('SELECT id FROM customers WHERE tenant_id = $1 LIMIT 1', [tenantId]);
        const customerId = customerRes.rows[0]?.id;

        if (customerId && unitId) {
            const dealResult = await db.query(`
                INSERT INTO deals (title, value, status, customer_id, unit_id, tenant_id, branch_id, assigned_to)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
            `, ['Purchase: Unit 101-A', 2500000, 'won', customerId, unitId, tenantId, branchId, userId]);

            const dealId = dealResult.rows[0].id;

            // 5. Seed a Payment (To show revenue on dashboard)
            await db.query(`
                INSERT INTO re_payments_mvp (deal_id, tenant_id, branch_id, total_amount, paid_amount, next_payment_date)
                VALUES ($1, $2, $3, $4, $5, CURRENT_DATE + 30)
            `, [dealId, tenantId, branchId, 2500000, 500000]);
            
            console.log('✅ [GOLD-DEMO] Sample Sold Transaction Seeded.');
        }

        console.log('🏆 [GOLD-DEMO] Showcase is ready! Please logout and login to refresh your session.');

    } catch (err) {
        console.error('❌ [GOLD-DEMO] Seeding failed:', err.message);
    }
};

seedGoldDemo();
