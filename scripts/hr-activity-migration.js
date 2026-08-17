const db = require('../config/db');

/**
 * HR Activity Types & Balances Migration
 * - hr_activity_types: تعريف أنواع الأنشطة (إذن تأخير، إجازة سنوية...)
 * - hr_activity_balances: أرصدة الموظفين من كل نشاط لكل فترة
 */
const migrate = async () => {
  try {
    console.log('--- 📋 HR Activity Module: Migration ---');
    await db.query('BEGIN');

    console.log('1. Building [hr_activity_types]...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS hr_activity_types (
        id SERIAL PRIMARY KEY,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(150) NOT NULL,
        unit VARCHAR(20) NOT NULL DEFAULT 'hours',
        start_post INTEGER DEFAULT 0,
        end_post INTEGER DEFAULT 0,
        min_value DECIMAL(8,2) DEFAULT 0,
        max_value DECIMAL(8,2) DEFAULT 30,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('2. Building [hr_activity_balances]...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS hr_activity_balances (
        id SERIAL PRIMARY KEY,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        activity_type_id INTEGER REFERENCES hr_activity_types(id) ON DELETE CASCADE,
        period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
        period_year INTEGER NOT NULL,
        allocated DECIMAL(8,2) NOT NULL DEFAULT 0,
        used DECIMAL(8,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_activity_balance UNIQUE (user_id, activity_type_id, period_month, period_year)
      );
    `);

    console.log('3. Applying indexes...');
    await db.query(`CREATE INDEX IF NOT EXISTS idx_activity_types_tenant ON hr_activity_types(tenant_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_activity_balances_user ON hr_activity_balances(user_id, period_year, period_month);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_activity_balances_tenant ON hr_activity_balances(tenant_id, branch_id);`);

    await db.query('COMMIT');
    console.log('✅ HR Activity migration completed successfully.');
    process.exit(0);
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('💣 HR Activity migration failed:', err.message);
    process.exit(1);
  }
};

migrate();
