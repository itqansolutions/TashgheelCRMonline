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

// API Routes — must be registered BEFORE static file serving
const frontendPath = path.join(__dirname, 'frontend', 'dist');
app.use('/api/auth', authRoutes);

// Public SaaS endpoints (no auth required)
app.get('/api/plans', plansController.getPlans);

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
app.use('/api/settings', settingsRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/re-units', reUnitRoutes);
app.use('/api/re-payments', rePaymentRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/erp/fiscal-years', require('./routes/erpFiscalYearRoutes'));
app.use('/api/erp/accounts', require('./routes/accountRoutes'));
app.use('/api/erp/cost-centers', require('./routes/costCenterRoutes'));
app.use('/api/erp/opening-balances', require('./routes/openingBalanceRoutes'));
app.use('/api/erp/taxes', require('./routes/taxRoutes'));
app.use('/api/erp/journals', require('./routes/journalRoutes'));
app.use('/api/erp/reconciliation', require('./routes/reconciliationRoutes'));
app.use('/api/erp/sales', require('./routes/salesRoutes'));
app.use('/api/erp/purchasing', require('./routes/purchasingRoutes'));
app.use('/api/erp/reports', require('./routes/glReportRoutes'));

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
    // ── Failsafe inline migration: ensure re_units has all required columns ──
    try {
      await db.query(`ALTER TABLE re_units ADD COLUMN IF NOT EXISTS assigned_to UUID`);
      await db.query(`ALTER TABLE re_units ADD COLUMN IF NOT EXISTS vendor_id UUID`);
      console.log('✅ [Boot] re_units columns verified (assigned_to, vendor_id).');
    } catch (e) {
      console.warn('⚠️ [Boot] re_units column check:', e.message);
    }

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
