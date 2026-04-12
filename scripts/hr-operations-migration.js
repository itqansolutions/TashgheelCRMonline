const db = require('../config/db');

/**
 * Enterprise HRMS Phase 2: Operations & Leaves Migration
 */
const migrate = async () => {
    try {
        console.log('--- 🏖️ Enterprise HRMS: Operations Migration ---');

        await db.query('BEGIN');

        console.log('1. Building [hr_leaves] with strict timeline protection...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS hr_leaves (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
                
                type VARCHAR(50) NOT NULL, -- annual, sick, unpaid
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                days INTEGER NOT NULL,
                
                status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
                reason TEXT,
                
                approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                CONSTRAINT chk_leave_dates CHECK (end_date >= start_date),
                CONSTRAINT chk_leave_days CHECK (days > 0)
            );
        `);

        // Create specialized indexing for Conflict Detection engine queries
        await db.query(`CREATE INDEX IF NOT EXISTS idx_hr_leaves_timeline ON hr_leaves (user_id, start_date, end_date);`);

        console.log('2. Building Generic [hr_requests] system...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS hr_requests (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
                
                type VARCHAR(50) NOT NULL, -- permission, advance, expense
                status VARCHAR(50) DEFAULT 'pending',
                
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('3. Building [hr_overtime] tracking logic...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS hr_overtime (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
                
                date DATE NOT NULL,
                hours DECIMAL(5, 2) NOT NULL,
                
                status VARCHAR(50) DEFAULT 'approved', -- Future proofing
                approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                CONSTRAINT chk_overtime_hours CHECK (hours > 0)
            );
        `);

        // Indexes for multi-tenant isolation
        await db.query(`CREATE INDEX IF NOT EXISTS idx_hr_leaves_iso ON hr_leaves (tenant_id, branch_id);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_hr_requests_iso ON hr_requests (tenant_id, branch_id);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_hr_overtime_iso ON hr_overtime (tenant_id, branch_id);`);
        
        await db.query('COMMIT');

        console.log('✅ HR Operations Schema deployed dynamically.');
        console.log('🚀 [FINAL] Migrations passed securely.');
        process.exit(0);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('💣 [FATAL] HR Operations Migration Error:', err.message);
        process.exit(1);
    }
};

migrate();
