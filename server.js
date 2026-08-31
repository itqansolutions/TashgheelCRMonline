// Tashgheel CRM - Industry-Aware Multi-Tenant System [STABLE - 2026-04-16 16:47]
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabling CSP for smoother Railway deployment
}));
app.use(cors({
  origin: '*', // Adjust to specific domain for extra security later
  credentials: true
}));
const { tracingMiddleware } = require('./src/infrastructure/observability/tracer');
app.use(morgan('dev'));
app.use(express.json());
app.use(tracingMiddleware);

// Serve static files from uploads folder
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
  console.log('✅ Created placeholder uploads directory');
}
app.use('/uploads', express.static(uploadsDir));

// Health check for Railway monitoring
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customerRoutes');
const productRoutes = require('./routes/productRoutes');
const taskRoutes = require('./routes/taskRoutes');
const dealRoutes = require('./routes/dealRoutes');
const quotationRoutes = require('./routes/quotationRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const accountingRoutes = require('./routes/accountingRoutes');
const userRoutes = require('./routes/userRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const fileRoutes = require('./routes/fileRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const reportRoutes = require('./routes/reportRoutes');
const logRoutes = require('./routes/logRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const leadSourceRoutes = require('./routes/leadSourceRoutes');
const taskStatusRoutes = require('./routes/taskStatusRoutes');
const profileRoutes = require('./routes/profileRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const branchRoutes = require('./routes/branchRoutes');
const reUnitRoutes = require('./routes/reUnitRoutes');
const rePaymentRoutes = require('./routes/rePaymentRoutes');
const financeRoutes = require('./routes/financeRoutes');
const hrRoutes = require('./routes/hrRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const workflowRoutes = require('./routes/workflowRoutes');
const rulesRoutes = require('./routes/rulesRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const activityRoutes = require('./routes/activityRoutes');
const vendorRoutes = require('./routes/vendorRoutes');
const jobTitleRoutes = require('./routes/jobTitleRoutes');
const hrActivityRoutes = require('./routes/hrActivityRoutes');
const hrActivityBalanceRoutes = require('./routes/hrActivityBalanceRoutes');
const hrShiftsRoutes = require('./routes/hrShiftsRoutes');
const hrDevicesRoutes = require('./routes/hrDevicesRoutes');
const ZkAdmsService = require('./services/ZkAdmsService');
const moduleRegistry = require('./src/infrastructure/plugins/ModuleRegistry');

// SaaS Middleware
const authMiddleware = require('./middleware/auth');
const branchScope = require('./middleware/branchScope');
const subscriptionGuard = require('./middleware/subscriptionGuard');
const moduleGuard = require('./middleware/moduleGuard');
const usageLimits = require('./middleware/usageLimits');
const plansController = require('./controllers/plansController');
const adminPlanRoutes = require('./routes/adminPlanRoutes');
const billingRoutes = require('./routes/billingRoutes');

// Register ZKTeco ADMS Push Endpoints (PUBLIC - no auth header sent by ZK devices)
ZkAdmsService(app);

// API Routes — must be registered BEFORE static file serving
const frontendPath = path.join(__dirname, 'frontend', 'dist');
app.use('/api/auth', authRoutes);

// Public SaaS endpoints (no auth required)
app.get('/api/plans', plansController.getPlans);
app.use('/api/settings', settingsRoutes);

// Protected SaaS subscription endpoint
app.get('/api/me/subscription', authMiddleware, subscriptionGuard, plansController.getMySubscription);

// Admin Pricing Engine (Super Admin only — bypasses subscription guard)
app.use('/api/admin', adminPlanRoutes);

// Serve Static Assets (PUBLIC — must be before auth guard)
app.use(express.static(frontendPath));

// Global Subscription & Branch Guard (applies only to /api routes below)
app.use('/api', authMiddleware, branchScope, subscriptionGuard);

app.use('/api/customers', customerRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/products', productRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/finance', financeRoutes);

// Module-Guarded Routes (require specific plan modules)
app.use('/api/hr',        moduleGuard('hr'),        hrRoutes);
app.use('/api/inventory', moduleGuard('inventory'), inventoryRoutes);
app.use('/api/workflows', moduleGuard('automation'), workflowRoutes);
app.use('/api/rules',     moduleGuard('automation'), rulesRoutes);

app.use('/api/notifications', notificationRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/lead-sources', leadSourceRoutes);
app.use('/api/task-statuses', taskStatusRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/lead-statuses', require('./routes/leadStatusRoutes'));
app.use('/api/tenants', tenantRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/re-units', reUnitRoutes);
app.use('/api/re-payments', rePaymentRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/job-titles', jobTitleRoutes);

// HR Extension Modules
app.use('/api/hr/activity-types', hrActivityRoutes);
app.use('/api/hr/activity-balances', hrActivityBalanceRoutes);
app.use('/api/hr/shifts', hrShiftsRoutes);
app.use('/api/hr/devices', hrDevicesRoutes);
app.use('/api/erp/fiscal-years', require('./routes/erpFiscalYearRoutes'));
app.use('/api/erp/accounts', require('./routes/accountRoutes'));
app.use('/api/erp/cost-centers', require('./routes/costCenterRoutes'));
app.use('/api/erp/opening-balances', require('./routes/openingBalanceRoutes'));
app.use('/api/erp/taxes', require('./routes/taxRoutes'));
app.use('/api/erp/journals', require('./routes/journalRoutes'));
app.use('/api/erp/reconciliation', require('./routes/reconciliationRoutes'));
app.use('/api/erp/sales', require('./routes/salesRoutes'));
app.use('/api/sales', require('./routes/salesRoutes'));
app.use('/api/erp/purchasing', require('./routes/purchasingRoutes'));
app.use('/api/erp/reports', require('./routes/glReportRoutes'));
app.use('/api/erp/banking', require('./routes/bankingRoutes'));
app.use('/api/erp/closing', require('./routes/closingRoutes'));

// Load Domain Modules (Plugin Architecture)
require('./src/domains/realestate');
moduleRegistry.mountRoutes(app);


const db = require('./config/db');

// SPA Catch-all (PUBLIC — serves index.html for all frontend routes)
// Must be the LAST route defined
app.get(/.*/, (req, res) => {
  // If the request starts with /api but didn't match anything above, it's a real API 404
  if (req.url.startsWith('/api')) {
    console.warn(`⚠️ [API 404] Unmatched Route: ${req.method} ${req.url} | User: ${req.user?.email || 'Guest'}`);
    return res.status(404).json({ status: 'error', message: `API Endpoint ${req.url} not found` });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware (Production grade)
app.use((err, req, res, next) => {
  console.error('🔥 [Internal Server Error]:', {
    path: req.url,
    message: err.message,
    stack: err.stack
  });
  res.status(err.status || 500).json({ 
    status: 'error', 
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    debug: err.message
  });
});

// ---------------------------------------------------------
// SaaS SuperAdmin Auto-Promotion (Cloud Native)
// ---------------------------------------------------------
const promoteOnStartup = async () => {
  const emailToPromote = process.env.PROMOTE_USER_EMAIL;
  if (emailToPromote) {
    try {
      const SYSTEM_DEFAULT_TENANT = '00000000-0000-0000-0000-000000000000';
      console.log(`🚀 [SaaS OS] Attempting Cloud-Promotion for: ${emailToPromote}`);
      
      // Ensure System Tenant exists
      await db.query(`
        INSERT INTO tenants (id, name, slug, plan, status)
        VALUES ($1, 'System Default', 'system-default', 'enterprise', 'active')
        ON CONFLICT (id) DO NOTHING
      `, [SYSTEM_DEFAULT_TENANT]);

      // Promote User
      const result = await db.query(
        'UPDATE users SET tenant_id = $1, role = $2, updated_at = CURRENT_TIMESTAMP WHERE email = $3 RETURNING name',
        [SYSTEM_DEFAULT_TENANT, 'admin', emailToPromote]
      );

      if (result.rows.length > 0) {
        console.log(`✅ [SaaS OS] Success! ${result.rows[0].name} promoted to SuperAdmin.`);
      } else {
        console.warn(`⚠️ [SaaS OS] Promotion failed: User ${emailToPromote} not found in database.`);
      }
    } catch (err) {
      console.error('❌ [SaaS OS] Cloud-Promotion Error:', err.message);
    }
  }
};

const reconcileDatabase = require('./scripts/dbReconciliation');
const { startReservationScanner } = require('./services/reservationService');
const { eventBus } = require('./src/infrastructure/events/LocalEventBus');
const eventStoreRepository = require('./src/infrastructure/events/EventStoreRepository');
const registerGlobalSubscribers = require('./src/domains/shared/subscribers/eventSubscribers');

// Process-level Error Safety Guards (Prevent Railway 502 Crashes)
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 [UnhandledRejection]:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('🔥 [UncaughtException]:', err.message, err.stack);
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server is running on port ${PORT} (host: 0.0.0.0)`);

  try {
    // ── Failsafe inline migration runner (bulletproof individual queries) ──
    const execSql = async (sql, label) => {
      try {
        await db.query(sql);
        console.log(`✅ [Boot Migration] ${label}`);
      } catch (e) {
        console.warn(`⚠️ [Boot Migration] ${label}: ${e.message}`);
      }
    };

    // 1. Vendors table & columns
    await execSql(`
      CREATE TABLE IF NOT EXISTS vendors (
        id SERIAL PRIMARY KEY,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        tax_no VARCHAR(100),
        reg_no VARCHAR(100),
        contact_person VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `, 'vendors table');
    await execSql(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;`, 'vendors.branch_id');
    await execSql(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;`, 'vendors.updated_at');

    // 2. Job Titles table & columns
    await execSql(`
      CREATE TABLE IF NOT EXISTS job_titles (
        id SERIAL PRIMARY KEY,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255),
        title VARCHAR(255),
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `, 'job_titles table');
    await execSql(`ALTER TABLE job_titles ADD COLUMN IF NOT EXISTS name VARCHAR(255);`, 'job_titles.name');
    await execSql(`ALTER TABLE job_titles ADD COLUMN IF NOT EXISTS title VARCHAR(255);`, 'job_titles.title');

    // 3. Customers extra fields
    await execSql(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_no VARCHAR(100);`, 'customers.tax_no');
    await execSql(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS reg_no VARCHAR(100);`, 'customers.reg_no');
    await execSql(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;`, 'customers.is_active');
    await execSql(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_blacklisted BOOLEAN DEFAULT FALSE;`, 'customers.is_blacklisted');

    // 4. Users HR extra fields
    await execSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id VARCHAR(50);`, 'users.national_id');
    await execSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_no VARCHAR(50);`, 'users.insurance_no');
    await execSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marital_status VARCHAR(50) DEFAULT 'single';`, 'users.marital_status');
    await execSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(20) DEFAULT 'male';`, 'users.gender');
    await execSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;`, 'users.birth_date');
    await execSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title_id INTEGER REFERENCES job_titles(id) ON DELETE SET NULL;`, 'users.job_title_id');
    await execSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);`, 'users.phone');
    await execSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;`, 'users.address');
    await execSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS salary NUMERIC DEFAULT 0;`, 'users.salary');
    await execSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS hire_date DATE;`, 'users.hire_date');
    await execSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS badge_number VARCHAR(50);`, 'users.badge_number');
    await execSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS device_code VARCHAR(50);`, 'users.device_code');
    await execSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_working BOOLEAN DEFAULT TRUE;`, 'users.is_working');

    // 5. Departments manager_id
    await execSql(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL;`, 'departments.manager_id');

    // 6. HR Activity Types & Balances
    await execSql(`
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
    `, 'hr_activity_types table');

    await execSql(`
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
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `, 'hr_activity_balances table');

    // 7. HR Shifts & User Shifts
    await execSql(`
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
    `, 'hr_shifts table');

    await execSql(`
      CREATE TABLE IF NOT EXISTS hr_user_shifts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        shift_id INTEGER REFERENCES hr_shifts(id) ON DELETE CASCADE,
        effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
        effective_to DATE,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE
      );
    `, 'hr_user_shifts table');

    // 8. HR Attendance Devices
    await execSql(`
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
    `, 'hr_attendance_devices table');
    await execSql(`ALTER TABLE hr_attendance_devices ADD COLUMN IF NOT EXISTS total_pushes INTEGER DEFAULT 0;`, 'hr_attendance_devices.total_pushes');

    // 9. Real estate units assigned_to & vendor_id
    await execSql(`ALTER TABLE re_units ADD COLUMN IF NOT EXISTS assigned_to UUID;`, 're_units.assigned_to');
    await execSql(`ALTER TABLE re_units ADD COLUMN IF NOT EXISTS vendor_id UUID;`, 're_units.vendor_id');

    // 10. Sales Orders & Items
    await execSql(`
      CREATE TABLE IF NOT EXISTS sales_orders (
        id SERIAL PRIMARY KEY,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
        number VARCHAR(50),
        order_number VARCHAR(50),
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
        order_date DATE DEFAULT CURRENT_DATE,
        expected_delivery DATE,
        status VARCHAR(50) DEFAULT 'draft',
        total_amount NUMERIC DEFAULT 0,
        tax_amount NUMERIC DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'EGP',
        exchange_rate NUMERIC DEFAULT 1.0,
        local_value NUMERIC DEFAULT 0,
        notes TEXT,
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `, 'sales_orders table');
    await execSql(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS quotation_id INTEGER;`, 'sales_orders.quotation_id');
    await execSql(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS number VARCHAR(50);`, 'sales_orders.number');

    await execSql(`
      CREATE TABLE IF NOT EXISTS sales_order_items (
        id SERIAL PRIMARY KEY,
        sales_order_id INTEGER REFERENCES sales_orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        description TEXT,
        quantity NUMERIC DEFAULT 1,
        unit_price NUMERIC DEFAULT 0,
        subtotal NUMERIC DEFAULT 0,
        quantity_delivered NUMERIC DEFAULT 0,
        quantity_invoiced NUMERIC DEFAULT 0,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE
      );
    `, 'sales_order_items table');

    // 11. Sales Targets & Price Tiers
    await execSql(`
      CREATE TABLE IF NOT EXISTS sales_targets (
        id SERIAL PRIMARY KEY,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        period VARCHAR(50) NOT NULL,
        target_amount NUMERIC NOT NULL DEFAULT 0,
        achieved_amount NUMERIC DEFAULT 0,
        commission_rate NUMERIC DEFAULT 0,
        bonus_threshold NUMERIC DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `, 'sales_targets table');

    await execSql(`
      CREATE TABLE IF NOT EXISTS sales_price_tiers (
        id SERIAL PRIMARY KEY,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(150) NOT NULL,
        code VARCHAR(50),
        discount_percentage NUMERIC DEFAULT 0,
        min_order_quantity INTEGER DEFAULT 1,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `, 'sales_price_tiers table');

    await reconcileDatabase();
    
    // 🚀 Initialize Enterprise Event Bus, Event Store & Outbox Engine
    eventBus.setEventStore(eventStoreRepository);
    registerGlobalSubscribers(eventBus);
    moduleRegistry.bootstrapEvents(eventBus);
    const outboxService = require('./src/infrastructure/events/OutboxService');
    outboxService.startOutboxPoller(10000);
    console.log('⚡ [Boot] Enterprise Event Bus, Event Store & Outbox Engine initialized.');

    startReservationScanner(10);
    await promoteOnStartup();
    await seedDemoAccount();
  } catch (bootErr) {
    console.error('⚠️ [Boot Warning] Post-launch initialization encountered an error (non-fatal):', bootErr.message);
  }
});


// ---------------------------------------------------------
// Auto-Seed Demo Account on Startup (Idempotent)
// ---------------------------------------------------------
const seedDemoAccount = async () => {
  try {
    const bcrypt = require('bcrypt');

    // 1. Ensure Demo Tenant exists
    await db.query(`
      INSERT INTO tenants (name, slug, plan, status)
      VALUES ('Itqan Demo Corp', 'demo-corp', 'enterprise', 'active')
      ON CONFLICT (slug) DO NOTHING
    `);
    const tResult = await db.query(`SELECT id FROM tenants WHERE slug = 'demo-corp'`);
    const tenantId = tResult.rows[0].id;

    // 2. Ensure Demo User exists
    const existing = await db.query(`SELECT id FROM users WHERE email = 'demo@tashgheel.com'`);
    if (existing.rows.length === 0) {
      const passwordHash = await bcrypt.hash('Demo@1234', 10);
      await db.query(`
        INSERT INTO users (name, email, password_hash, role, tenant_id)
        VALUES ('Demo Manager', 'demo@tashgheel.com', $1, 'admin', $2)
        ON CONFLICT (email) DO NOTHING
      `, [passwordHash, tenantId]);

      // 3. Ensure Main Branch exists for demo tenant
      const bResult = await db.query(`
        INSERT INTO branches (name, address, tenant_id)
        VALUES ('Cairo HQ', 'New Cairo, Egypt', $1)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [tenantId]);

      if (bResult.rows.length > 0) {
        const branchId = bResult.rows[0].id;
        const uResult = await db.query(`SELECT id FROM users WHERE email = 'demo@tashgheel.com'`);
        const userId = uResult.rows[0].id;
        await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, branchId]);
        await db.query(`UPDATE users SET branch_id = $1 WHERE id = $2`, [branchId, userId]);
      }

      console.log('✅ [Demo] Demo account seeded: demo@tashgheel.com');
    } else {
      console.log('✅ [Demo] Demo account already exists.');
    }
  } catch (err) {
    console.error('⚠️ [Demo] Auto-seed warning (non-fatal):', err.message);
  }
};
