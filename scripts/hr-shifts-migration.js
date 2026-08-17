const db = require('../config/db');

/**
 * HR Shifts Migration
 * - hr_shifts: تعريف الشيفتات مع قواعد الخصم الديناميكية
 * - hr_user_shifts: ربط الموظف بالشيفت مع تواريخ فعالية
 */
const migrate = async () => {
  try {
    console.log('--- ⏰ HR Shifts Module: Migration ---');
    await db.query('BEGIN');

    console.log('1. Building [hr_shifts]...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS hr_shifts (
        id SERIAL PRIMARY KEY,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        off_days INTEGER[] DEFAULT '{5,6}',
        grace_minutes INTEGER DEFAULT 15,
        deduction_rules JSONB DEFAULT '[]'::jsonb,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('2. Building [hr_user_shifts]...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS hr_user_shifts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        shift_id INTEGER REFERENCES hr_shifts(id) ON DELETE CASCADE,
        effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
        effective_to DATE,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT uq_user_shift_start UNIQUE (user_id, effective_from)
      );
    `);

    console.log('3. Applying indexes...');
    await db.query(`CREATE INDEX IF NOT EXISTS idx_hr_shifts_tenant ON hr_shifts(tenant_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_hr_user_shifts_user ON hr_user_shifts(user_id, effective_from);`);

    await db.query('COMMIT');
    console.log('✅ HR Shifts migration completed successfully.');
    process.exit(0);
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('💣 HR Shifts migration failed:', err.message);
    process.exit(1);
  }
};

migrate();
