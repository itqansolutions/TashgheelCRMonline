const db = require('../config/db');

/**
 * PRODUCTION-GRADE HRMS MIGRATION (Phase 1)
 * Strategy:
 * 1. hr_profiles (User details)
 * 2. hr_attendance (Clock-in logic with date uniqueness)
 */
const migrate = async () => {
    try {
        console.log('--- 👥 Enterprise HRMS: Core Migration ---');

        await db.query('BEGIN');

        console.log('1. Building [hr_profiles]...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS hr_profiles (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
                
                job_title VARCHAR(150),
                employment_type VARCHAR(50) DEFAULT 'full_time',
                salary DECIMAL(15, 2) DEFAULT 0.00,
                
                hire_date DATE,
                status VARCHAR(50) DEFAULT 'active',
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('2. Building [hr_attendance] with strict constraints...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS hr_attendance (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
                
                check_in TIMESTAMP WITH TIME ZONE,
                attendance_date DATE, -- Dedicated column for immutable indexing
                check_out TIMESTAMP WITH TIME ZONE,
                
                work_hours DECIMAL(5, 2),
                late_minutes INTEGER DEFAULT 0,
                
                status VARCHAR(50) DEFAULT 'present',
                source VARCHAR(50) DEFAULT 'manual',
                
                ip_address TEXT,
                device_id VARCHAR(100),
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Indexing & Validations
        console.log('3. Applying Security Indexes & Unique Daily constraint...');
        
        // Ensure isolation logic scales
        await db.query(`CREATE INDEX IF NOT EXISTS idx_hr_attendance_isolation ON hr_attendance (tenant_id, branch_id);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_hr_profiles_isolation ON hr_profiles (tenant_id, branch_id);`);
        
        // Protect against duplicate day entries (The user_id MUST only have one check-in base per day)
        await db.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_daily_attendance 
            ON hr_attendance (user_id, attendance_date) 
            WHERE attendance_date IS NOT NULL;
        `);

        await db.query('COMMIT');

        console.log('✅ HR Schema deployed dynamically.');
        console.log('🚀 [FINAL] HRMS Migration passed securely.');
        process.exit(0);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('💣 [FATAL] HRMS Migration Error:', err.message);
        process.exit(1);
    }
};

migrate();
