const db = require('../config/db');

/**
 * HR Attendance Devices Migration (ADMS Push Protocol)
 * - hr_attendance_devices: ماكينات البصمة ZKTeco
 * - users.badge_number: كود الموظف على البصمة
 */
const migrate = async () => {
  try {
    console.log('--- 🖥️ HR Attendance Devices: Migration ---');
    await db.query('BEGIN');

    console.log('1. Building [hr_attendance_devices]...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS hr_attendance_devices (
        id SERIAL PRIMARY KEY,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
        name VARCHAR(100) NOT NULL,
        serial_number VARCHAR(100),
        ip_address VARCHAR(50),
        location TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        last_seen TIMESTAMPTZ,
        total_pushes INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('2. Adding badge_number to users...');
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS badge_number VARCHAR(50);`);

    console.log('3. Applying indexes...');
    await db.query(`CREATE INDEX IF NOT EXISTS idx_hr_devices_tenant ON hr_attendance_devices(tenant_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_hr_devices_serial ON hr_attendance_devices(serial_number);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_users_badge ON users(badge_number, tenant_id);`);

    await db.query('COMMIT');
    console.log('✅ HR Devices migration completed successfully.');
    process.exit(0);
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('💣 HR Devices migration failed:', err.message);
    process.exit(1);
  }
};

migrate();
