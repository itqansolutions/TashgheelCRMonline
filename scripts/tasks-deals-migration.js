const db = require('../config/db');

/**
 * Task-to-Deal Pipeline & Profile Dashboard Migration
 * Safely introduces polymorphic relationships, dynamic task statuses, and data mapping.
 */
const migrate = async () => {
    try {
        console.log('--- 🚀 Enterprise CRM: Task-to-Deal Pipeline Migration ---');

        await db.query('BEGIN');

        console.log('1. Creating [task_statuses] table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS task_statuses (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                can_make_deal BOOLEAN DEFAULT FALSE,
                is_final BOOLEAN DEFAULT FALSE,
                order_index INTEGER DEFAULT 0,
                color VARCHAR(20) DEFAULT '#64748b',
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (tenant_id, name)
            );
        `);

        console.log('2. Updating [tasks] and [deals] tables...');
        // Add status_id to tasks safely
        await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_id INTEGER REFERENCES task_statuses(id) ON DELETE SET NULL;`);
        
        // Add polymorphic source relation to deals
        await db.query(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS source_type VARCHAR(50);`);
        await db.query(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS source_id VARCHAR(255);`);

        console.log('3. Applying Indexes for Performance...');
        await db.query(`CREATE INDEX IF NOT EXISTS idx_tasks_status_id ON tasks(status_id);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_deals_source ON deals(source_type, source_id);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_task_statuses_tenant ON task_statuses(tenant_id);`);

        console.log('4. Executing Safe Data Migration for Task Statuses...');
        
        // Get all unique tenants
        const tenantsRes = await db.query('SELECT id FROM tenants');
        const tenants = tenantsRes.rows;

        const defaultStatuses = [
            { name: 'Todo', can_make_deal: false, is_final: false, order_index: 0, color: '#94a3b8' },
            { name: 'In Progress', can_make_deal: false, is_final: false, order_index: 1, color: '#3b82f6' },
            { name: 'Qualified', can_make_deal: true, is_final: false, order_index: 2, color: '#8b5cf6' },
            { name: 'Done', can_make_deal: false, is_final: true, order_index: 3, color: '#10b981' }
        ];

        // Ensure default statuses exist for all active tenants
        for (const tenant of tenants) {
            for (const status of defaultStatuses) {
                await db.query(`
                    INSERT INTO task_statuses (name, can_make_deal, is_final, order_index, color, tenant_id)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (tenant_id, name) DO NOTHING
                `, [status.name, status.can_make_deal, status.is_final, status.order_index, status.color, tenant.id]);
            }
        }

        // Migrate legacy tasks
        const tasksRes = await db.query('SELECT id, status, tenant_id FROM tasks WHERE status_id IS NULL AND status IS NOT NULL');
        let mappedCount = 0;
        
        // Flexible fallback map for standard status strings
        const statusMap = {
            'todo': 'Todo',
            'in progress': 'In Progress',
            'in_progress': 'In Progress',
            'done': 'Done',
            'completed': 'Done'
        };

        for (const task of tasksRes.rows) {
            if (!task.tenant_id) continue;
            
            // Normalize legacy status string
            const legacyStatus = (task.status || '').trim().toLowerCase();
            let targetName = statusMap[legacyStatus];

            // If not found in map, we dynamically create it
            if (!targetName) {
                // Capitalize first letter for presentation
                targetName = task.status.charAt(0).toUpperCase() + task.status.slice(1);
                
                // Attempt to insert it (ignoring if it somehow exists)
                await db.query(`
                    INSERT INTO task_statuses (name, can_make_deal, is_final, order_index, color, tenant_id)
                    VALUES ($1, false, false, 99, '#64748b', $2)
                    ON CONFLICT (tenant_id, name) DO NOTHING
                `, [targetName, task.tenant_id]);
            }

            // Find the ID of the target status
            const statusRes = await db.query('SELECT id FROM task_statuses WHERE tenant_id = $1 AND name = $2', [task.tenant_id, targetName]);
            
            if (statusRes.rows.length > 0) {
                await db.query('UPDATE tasks SET status_id = $1 WHERE id = $2', [statusRes.rows[0].id, task.id]);
                mappedCount++;
            }
        }

        console.log(`✅ Successfully mapped ${mappedCount} legacy tasks to dynamic statuses.`);

        await db.query('COMMIT');

        console.log('✅ Pipeline Migration deployed successfully.');
        process.exit(0);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('💣 [FATAL] Pipeline Migration Error:', err.message);
        process.exit(1);
    }
};

migrate();
