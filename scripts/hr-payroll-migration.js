const db = require('../config/db');

/**
 * Enterprise HRMS Phase 3: The Payroll Engine Migration
 */
const migrate = async () => {
    try {
        console.log('--- 💰 Enterprise HRMS: Payroll Engine Deployment ---');

        await db.query('BEGIN');

        console.log('1. Building Base [hr_payroll] core...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS hr_payroll (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
                
                payroll_month INTEGER NOT NULL,
                payroll_year INTEGER NOT NULL,
                
                base_salary DECIMAL(15, 2) DEFAULT 0.00,
                total_work_hours DECIMAL(10, 2) DEFAULT 0.00,
                
                overtime_amount DECIMAL(15, 2) DEFAULT 0.00,
                bonus_amount DECIMAL(15, 2) DEFAULT 0.00,
                deduction_amount DECIMAL(15, 2) DEFAULT 0.00,
                
                net_salary DECIMAL(15, 2) NOT NULL,
                
                status VARCHAR(50) DEFAULT 'draft', -- draft, finalized, paid
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                -- Ensure only one payroll slip per user per month
                UNIQUE (user_id, payroll_month, payroll_year)
            );
        `);

        console.log('2. Building Transparent [hr_payroll_items] breakdown...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS hr_payroll_items (
                id SERIAL PRIMARY KEY,
                payroll_id INTEGER REFERENCES hr_payroll(id) ON DELETE CASCADE,
                
                type VARCHAR(50) NOT NULL, -- overtime, leave_unpaid, penalty_late, bonus
                amount DECIMAL(15, 2) NOT NULL, -- Can be positive or negative
                description TEXT,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('3. Applying Security & Multi-Tenant Indexes...');
        // Multitenant mapping indexes
        await db.query(`CREATE INDEX IF NOT EXISTS idx_hr_payroll_iso ON hr_payroll (tenant_id, branch_id);`);

        // Create trigger function to block updates to Finalized payrolls (Payroll Lock)
        await db.query(`
            CREATE OR REPLACE FUNCTION prevent_finalized_update()
            RETURNS TRIGGER AS $$
            BEGIN
                IF OLD.status = 'finalized' AND NEW.status != 'paid' THEN
                    RAISE EXCEPTION 'Payroll Lock: Cannot modify a finalized and locked payroll slip.';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // Attach trigger
        await db.query(`DROP TRIGGER IF EXISTS trg_prevent_finalized_update ON hr_payroll;`);
        await db.query(`
            CREATE TRIGGER trg_prevent_finalized_update
            BEFORE UPDATE ON hr_payroll
            FOR EACH ROW
            EXECUTE FUNCTION prevent_finalized_update();
        `);

        await db.query('COMMIT');

        console.log('✅ HR Payroll Engine deployed with Strict Mutability Locks.');
        console.log('🚀 [FINAL] Migrations passed securely.');
        process.exit(0);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('💣 [FATAL] HR Payroll Migration Error:', err.message);
        process.exit(1);
    }
};

migrate();
