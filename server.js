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
app.use(morgan('dev'));
app.use(express.json());

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
const settingsRoutes = require('./routes/settingsRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const branchRoutes = require('./routes/branchRoutes');
const financeRoutes = require('./routes/financeRoutes');
const hrRoutes = require('./routes/hrRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const workflowRoutes = require('./routes/workflowRoutes');
const rulesRoutes = require('./routes/rulesRoutes');

// SaaS Middleware
const authMiddleware = require('./middleware/auth');
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

// Global Subscription Guard (all protected routes below this point)
app.use(authMiddleware, subscriptionGuard);

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
app.use('/api/notifications', notificationRoutes);
app.use('/api/lead-sources', leadSourceRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/branches', branchRoutes);

// Serve Static Assets AFTER all API routes
app.use(express.static(frontendPath));

// Catch-all route for React SPA
app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ status: 'error', message: 'API Route not found' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const db = require('./config/db');

// Error handling middleware (Production grade)
app.use((err, req, res, next) => {
  console.error('🔥 [Internal Server Error]:', err.stack);
  res.status(err.status || 500).json({ 
    status: 'error', 
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
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

app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  // Execute SaaS Auto-Activation
  await promoteOnStartup();
});
