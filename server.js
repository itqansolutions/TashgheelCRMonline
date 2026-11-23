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
app.use(express.json({
  verify: (req, res, buffer) => {
    // Meta signs the exact request body. Keep the raw bytes only for its
    // webhook endpoints so the controller can verify X-Hub-Signature-256.
    if (req.originalUrl.startsWith('/api/meta/webhook') || req.originalUrl.startsWith('/api/whatsapp/webhook') || req.originalUrl.startsWith('/api/propertyfinder/webhook')) {
      req.rawBody = Buffer.from(buffer);
    }
  }
}));
app.use(tracingMiddleware);

// Serve static files from uploads folder
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
  console.log('✅ Created placeholder uploads directory');
}
const secureUploads = require('./middleware/secureUploads');
app.use('/uploads', secureUploads(uploadsDir));

// Health check for Railway monitoring
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: 'v-5b4-hotfix-3', timestamp: new Date().toISOString() });
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

const metaRoutes = require('./routes/metaRoutes');
const metaController = require('./controllers/metaController');

// Public Legal Endpoints (Privacy Policy & Terms for Meta App Verification)
const legalController = require('./controllers/legalController');
app.get('/privacy', legalController.getPrivacyPolicy);
app.get('/terms', legalController.getTermsOfService);
app.get('/data-deletion', legalController.getDataDeletion);

// Public SaaS endpoints (no auth required)
app.get('/api/plans', plansController.getPlans);
app.use('/api/settings', settingsRoutes);

// Public Meta Webhook Handshake & Events (no JWT auth header sent by Meta)
app.get('/api/meta/webhook', metaController.handleWebhookVerification);
app.post('/api/meta/webhook', metaController.handleWebhookEvent);

// Public WhatsApp Webhook Handshake & Events (no JWT auth header sent by Meta)
const whatsappController = require('./controllers/whatsappController');
app.get('/api/whatsapp/webhook', whatsappController.handleWebhookVerification);
app.post('/api/whatsapp/webhook', whatsappController.handleWebhookEvent);

// Public Property Finder Webhook Inbound Receiver (HMAC-SHA256 authenticated)
const propertyFinderController = require('./controllers/propertyFinderController');
app.post('/api/propertyfinder/webhook', propertyFinderController.handleWebhook);
app.post('/api/propertyfinder/webhook/:tenantId', propertyFinderController.handleWebhook);

// Public Real Estate Unit Gallery (Publicly accessible for client photo showcase, no auth required)
const reUnitsController = require('./controllers/reUnitsController');
app.get('/api/public/units/:id/gallery', reUnitsController.getPublicUnitGallery);

// Protected SaaS subscription endpoint
app.get('/api/me/subscription', authMiddleware, subscriptionGuard, plansController.getMySubscription);

// Admin Pricing Engine (Super Admin only — bypasses subscription guard)
app.use('/api/admin', adminPlanRoutes);

// Serve Static Assets (PUBLIC — must be before auth guard)
app.use(express.static(frontendPath, {
  setHeaders: (res, filePath) => {
    const normalized = filePath.replace(/\\/g, '/');
    if (normalized.endsWith('/index.html') || normalized.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (normalized.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Global Subscription & Branch Guard (applies only to /api routes below)
app.use('/api', authMiddleware, require('./middleware/deleteRoleBoundary'), branchScope, subscriptionGuard);

const templateGuard = require('./middleware/templateGuard');

app.use('/api/customers', moduleGuard('crm'), customerRoutes);
app.use('/api/meta', moduleGuard('marketing', 'crm'), metaRoutes);
app.use('/api/whatsapp', moduleGuard('marketing', 'crm'), require('./routes/whatsappRoutes'));
app.use('/api/billing', billingRoutes);
app.use('/api/products', moduleGuard('inventory'), productRoutes);
app.use('/api/tasks', moduleGuard('crm'), taskRoutes);
app.use('/api/deals', moduleGuard('crm'), dealRoutes);
app.use('/api/quotations', moduleGuard('crm', 'sales'), quotationRoutes);
// Module-Guarded Routes (require specific plan modules)
app.use('/api/finance',   moduleGuard('finance'),   financeRoutes);
app.use('/api/hr',        moduleGuard('hr'),        hrRoutes);
app.use('/api/inventory', moduleGuard('inventory'), inventoryRoutes);
app.use('/api/workflows', moduleGuard('automation'), workflowRoutes);
app.use('/api/rules',     moduleGuard('automation'), rulesRoutes);

app.use('/api/notifications', notificationRoutes);
app.use('/api/invoices', moduleGuard('finance'), invoiceRoutes);
app.use('/api/expenses', moduleGuard('finance'), expenseRoutes);

app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports',   moduleGuard('reports'),   reportRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/lead-sources', leadSourceRoutes);
app.use('/api/customer-classifications', require('./routes/customerClassificationRoutes'));
app.use('/api/customer-areas', require('./routes/customerAreaRoutes'));
app.use('/api/task-statuses', taskStatusRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/lead-statuses', require('./routes/leadStatusRoutes'));
app.use('/api/tenants', tenantRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/sales-teams', moduleGuard('sales', 'crm'), require('./routes/salesTeamRoutes'));
app.use('/api/sales-management', moduleGuard('crm'), require('./routes/salesManagementRoutes'));

// Real Estate Module Routes (Protected by templateGuard)
app.use('/api/re-units',         templateGuard('real_estate'), reUnitRoutes);
app.use('/api/re-payments',      templateGuard('real_estate'), rePaymentRoutes);
app.use('/api/re-hierarchy',     templateGuard('real_estate'), require('./routes/reHierarchyRoutes'));
app.use('/api/re-contracts',     templateGuard('real_estate'), require('./routes/reContractRoutes'));
app.use('/api/re-installments',  templateGuard('real_estate'), require('./routes/reInstallmentRoutes'));
app.use('/api/re-commissions',   templateGuard('real_estate'), require('./routes/reCommissionRoutes'));
app.use('/api/re-cancellations', templateGuard('real_estate'), require('./routes/reCancellationRoutes'));
app.use('/api/re-handovers',     templateGuard('real_estate'), require('./routes/reHandoverRoutes'));
app.use('/api/re-targets',       templateGuard('real_estate'), require('./routes/reTargetRoutes'));
app.use('/api/propertyfinder',   templateGuard('real_estate'), require('./routes/propertyFinderRoutes'));

app.use('/api/super-admin', superAdminRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/vendors', moduleGuard('purchasing', 'inventory'), vendorRoutes);

// Purchasing & Procurement Routes
// Purchasing currently falls back to inventory for backward compatibility with existing plans.
// Future plan migration may make purchasing a standalone entitlement.
app.use('/api/purchases',         moduleGuard('purchasing', 'inventory'), require('./routes/purchaseRoutes'));
app.use('/api/purchase-requests', moduleGuard('purchasing', 'inventory'), require('./routes/purchaseRequestRoutes'));
app.use('/api/rfqs',              moduleGuard('purchasing', 'inventory'), require('./routes/rfqRoutes'));
app.use('/api/purchase-orders',   moduleGuard('purchasing', 'inventory'), require('./routes/purchaseOrderRoutes'));
app.use('/api/purchasing',        moduleGuard('purchasing', 'inventory'), require('./routes/purchasingRoutes'));
app.use('/api/erp/purchasing',    moduleGuard('purchasing', 'inventory'), require('./routes/purchasingRoutes'));

// General Sales & Delivery Routes (General template core + explicit sales module entitlement)
app.use('/api/sales',             moduleGuard('sales'), templateGuard('general'), require('./routes/salesRoutes'));
app.use('/api/erp/sales',         moduleGuard('sales'), templateGuard('general'), require('./routes/salesRoutes'));
app.use('/api/job-titles', jobTitleRoutes);

// HR Extension Modules
app.use('/api/hr/activity-types', moduleGuard('hr'), hrActivityRoutes);
app.use('/api/hr/activity-balances', moduleGuard('hr'), hrActivityBalanceRoutes);
app.use('/api/hr/activity-balance', moduleGuard('hr'), hrActivityBalanceRoutes);
app.use('/api/hr/shifts', moduleGuard('hr'), hrShiftsRoutes);
app.use('/api/hr/devices', moduleGuard('hr'), hrDevicesRoutes);

// ── ISOLATED ERP ACCOUNTING MODULE ──────────────────────────────
// Parked — isolated from Tashgheel CRM UX and API surface.
// Prevents normal CRM users from reaching double-entry GL/closing/COA endpoints.
const erpAccountingDisabled = (req, res) => {
  return res.status(404).json({
    status: 'error',
    message: 'ERP Accounting is not enabled in Tashgheel CRM.',
    code: 'ERP_ACCOUNTING_DISABLED'
  });
};

if (process.env.ENABLE_ERP_ACCOUNTING === 'true') {
  app.use('/api/accounting/journals', require('./routes/journalRoutes'));
  app.use('/api/accounting', accountingRoutes);
  app.use('/api/erp/fiscal-years', require('./routes/erpFiscalYearRoutes'));
  app.use('/api/erp/accounts', require('./routes/accountRoutes'));
  app.use('/api/erp/cost-centers', require('./routes/costCenterRoutes'));
  app.use('/api/erp/opening-balances', require('./routes/openingBalanceRoutes'));
  app.use('/api/erp/taxes', require('./routes/taxRoutes'));
  app.use('/api/erp/journals', require('./routes/journalRoutes'));
  app.use('/api/erp/reconciliation', require('./routes/reconciliationRoutes'));
  app.use('/api/erp/reports', require('./routes/glReportRoutes'));
  app.use('/api/erp/banking', require('./routes/bankingRoutes'));
  app.use('/api/erp/closing', require('./routes/closingRoutes'));
} else {
  // Graceful read fallback for dormant journal queries (returns empty ledger instead of 404)
  app.get(['/api/accounting/journals', '/api/erp/journals'], (req, res) => res.json({ status: 'success', data: [] }));
  app.use('/api/accounting', erpAccountingDisabled);
  app.use('/api/erp/fiscal-years', erpAccountingDisabled);
  app.use('/api/erp/accounts', erpAccountingDisabled);
  app.use('/api/erp/cost-centers', erpAccountingDisabled);
  app.use('/api/erp/opening-balances', erpAccountingDisabled);
  app.use('/api/erp/taxes', erpAccountingDisabled);
  app.use('/api/erp/journals', erpAccountingDisabled);
  app.use('/api/erp/reconciliation', erpAccountingDisabled);
  app.use('/api/erp/reports', erpAccountingDisabled);
  app.use('/api/erp/banking', erpAccountingDisabled);
  app.use('/api/erp/closing', erpAccountingDisabled);
}

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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware (Production grade)
app.use((err, req, res, next) => {
  if (err && (err.name === 'MulterError' || (err.message && err.message.includes('File type not supported')))) {
    return res.status(400).json({
      status: 'error',
      message: err.message || 'File upload error',
      code: err.code || 'UPLOAD_ERROR'
    });
  }

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

// Serving startup never runs legacy migrations, seeders or reconciliation.
const { startServing } = require('./startup/serving');
const startup = startServing({
  db,
  workerMode: process.env.STARTUP_WORKER_MODE,
  registerEvents: async () => {
    eventBus.setEventStore(eventStoreRepository);
    registerGlobalSubscribers(eventBus);
    moduleRegistry.bootstrapEvents(eventBus);
  },
  startWorkers: async () => {
    require('./src/infrastructure/events/OutboxService').startOutboxPoller(10000);
    require('./services/notificationWorkerService').startWorker(5000);
    startReservationScanner(10);
    require('./services/contractExpiryService').startContractExpiryScanner(60);
    require('./services/dealSlaService').startSlaScanner(15);
    require('./services/activityReminderService').startActivityReminderScanner(30);
    require('./services/taskOverdueService').startTaskOverdueScanner(60);
  },
  listen: () => app.listen(PORT, '0.0.0.0')
});
startup.catch(async error => {
  console.error('[Startup blocked]', error.message);
  process.exitCode = 1;
  const deadline=setTimeout(()=>process.exit(1),5000);
  try{if(db.pool) await db.pool.end();}finally{clearTimeout(deadline);process.exit(1);}
});
module.exports = { app, startup };
