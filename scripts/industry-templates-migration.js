const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('🚀 [Migration] Starting Industry Templates Sync...');

        // 1. Create business_templates table
        await client.query(`
            CREATE TABLE IF NOT EXISTS business_templates (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                config JSONB NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ [Migration] business_templates table verified.');

        // 2. Add contact info to tenants
        await client.query(`
            ALTER TABLE tenants 
            ADD COLUMN IF NOT EXISTS admin_name VARCHAR(255),
            ADD COLUMN IF NOT EXISTS admin_email VARCHAR(255),
            ADD COLUMN IF NOT EXISTS admin_phone VARCHAR(50),
            ADD COLUMN IF NOT EXISTS template_name VARCHAR(100) DEFAULT 'general'
        `);
        console.log('✅ [Migration] tenants contact columns verified.');

        // 3. Add custom_fields to deals
        await client.query(`
            ALTER TABLE deals 
            ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'
        `);
        console.log('✅ [Migration] deals.custom_fields column verified.');

        // 4. Upsert default templates (Seeding)
        const templates = [
            {
                name: 'general',
                config: {
                    name: 'General',
                    deal_fields: [],
                    pipeline: ['Discovery', 'Proposal', 'Negotiation', 'Won', 'Lost'],
                    automation_rules: []
                }
            },
            {
                name: 'real_estate',
                config: {
                    name: 'Real Estate',
                    deal_fields: [
                        { key: 'unit_type', label: 'Unit Type', icon: 'Building2', type: 'text' },
                        { key: 'project', label: 'Property Project', icon: 'MapPin', type: 'text' },
                        { key: 'price', label: 'Price (Expected)', icon: 'Coins', type: 'number' },
                        { key: 'area', label: 'Total Area (m²)', icon: 'Ruler', type: 'number' }
                    ],
                    pipeline: ['Lead', 'Interested', 'Site Visit', 'Negotiation', 'Closed'],
                    automation_rules: [
                        {
                            trigger: 'stage_change',
                            condition: { stage: 'Site Visit' },
                            actions: [
                                { type: 'create_task', title: 'Follow up after site visit' },
                                { type: 'notify', message: 'New follow-up task created' }
                            ]
                        }
                    ]
                }
            }
        ];

        for (const t of templates) {
            await client.query(
                `INSERT INTO business_templates (name, config) 
                 VALUES ($1, $2) 
                 ON CONFLICT (name) DO UPDATE SET config = $2`,
                [t.name, JSON.stringify(t.config)]
            );
        }
        console.log('✅ [Migration] Default templates seeded/updated.');

        console.log('🎊 [Migration] Industry Templates Sync completed successfully.');
    } catch (err) {
        console.error('❌ [Migration] Error during sync:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
