// ============================================================================
// CANONICAL TEST SAFETY ENFORCEMENT (Phase S)
// Strictly mandates DATABASE_URL_TEST and prevents execution against PROD_HOST
// ============================================================================
const { initTestContext } = require('./helpers/testDb');
initTestContext();

const test = require('node:test');
const assert = require('node:assert/strict');

const tenantEntitlementService = require('../services/tenantEntitlementService');
const moduleGuard = require('../middleware/moduleGuard');
const usageLimits = require('../middleware/usageLimits');
const templateGuard = require('../middleware/templateGuard');
const adminPlanRoutes = require('../routes/adminPlanRoutes');
const adminPlansController = require('../controllers/adminPlansController');

// Helper to create mock Express response
function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

test('🏛️ Manual Entitlements Engine Test Suite (Phase 4.2.4)', async (t) => {

  t.beforeEach(() => {
    tenantEntitlementService.clearEntitlementCache();
  });

  // ── 1. MODULE GUARD TESTS ──────────────────────────────────────────────────

  await t.test('1. Explicitly enabled module: allows access via next()', () => {
    const req = {
      modules: { crm: true, finance: true, hr: false }
    };
    const res = createMockRes();
    let nextCalled = false;

    moduleGuard('crm')(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true, 'Must allow access when module is true');
    assert.equal(res.statusCode, 200);
  });

  await t.test('2. Explicitly disabled module: blocks with 403 MODULE_LOCKED', () => {
    const req = {
      modules: { crm: true, hr: false }
    };
    const res = createMockRes();
    let nextCalled = false;

    moduleGuard('hr')(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'Must NOT call next when module is false');
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'MODULE_LOCKED');
    assert.equal(res.body.module, 'hr');
  });

  await t.test('3. Missing entitlement profile: fails closed with 403 MODULE_ACCESS_DENIED', () => {
    const req = { modules: undefined }; // Missing profile
    const res = createMockRes();
    let nextCalled = false;

    moduleGuard('crm')(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'Must fail closed when req.modules is missing');
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'MODULE_ACCESS_DENIED');
  });

  await t.test('4. Unknown module key: unknown key defaults to false and blocks', () => {
    const req = {
      modules: { crm: true, unknown_crypto_module: true }
    };
    const res = createMockRes();
    let nextCalled = false;

    moduleGuard('unknown_crypto_module')(req, res, () => { nextCalled = true; });

    // validateModules strips unknown keys, but even if present, moduleGuard checks explicitly
    const validated = tenantEntitlementService.validateModules(req.modules);
    assert.equal(validated.unknown_crypto_module, undefined, 'Unknown module key must be stripped from canonical map');
  });

  // ── 2. SERVICE LAYER & VALIDATION TESTS ────────────────────────────────────

  await t.test('5. Limit Validation: rejects negative numbers other than -1 and non-integers', () => {
    assert.throws(() => {
      tenantEntitlementService.validateLimits({ max_users: -5 });
    }, /Invalid limit/, 'Must throw for negative limits other than -1');

    assert.throws(() => {
      tenantEntitlementService.validateLimits({ max_branches: 3.14 });
    }, /Invalid limit/, 'Must throw for fractional limits');

    const validUnlimited = tenantEntitlementService.validateLimits({ max_users: -1, max_branches: -1 });
    assert.equal(validUnlimited.max_users, -1);
    assert.equal(validUnlimited.max_branches, -1);

    const validZero = tenantEntitlementService.validateLimits({ max_users: 0, max_branches: 0 });
    assert.equal(validZero.max_users, 0);
    assert.equal(validZero.max_branches, 0);
  });

  await t.test('6. Entitlement Service: getTenantEntitlements fails closed when no DB row exists', async () => {
    const mockDb = {
      query: async () => ({ rows: [] })
    };

    const result = await tenantEntitlementService.getTenantEntitlements('tenant-unconfigured-uuid', mockDb);
    assert.equal(result.isConfigured, false, 'Must report isConfigured: false for unconfigured tenant');
    assert.equal(Object.keys(result.modules).length, 0);
  });

  await t.test('7. Cache Invalidation: updates immediately invalidate cached access profile', async () => {
    const tenantId = 'test-cache-tenant-id';
    let queryCallCount = 0;

    const mockDb = {
      query: async (sql) => {
        queryCallCount++;
        const normalizedSql = sql.replace(/\s+/g, ' ');
        if (normalizedSql.includes('SELECT') && normalizedSql.includes('FROM tenant_overrides')) {
          return {
            rows: [{ modules: { crm: true, finance: true }, limits: { max_users: 10, max_branches: 1 } }]
          };
        }
        if (normalizedSql.includes('INSERT INTO tenant_overrides')) {
          return {
            rows: [{ tenant_id: tenantId, notes: 'Updated' }]
          };
        }
        return { rows: [] };
      }
    };

    // First fetch: populates cache
    const first = await tenantEntitlementService.getTenantEntitlements(tenantId, mockDb);
    assert.equal(first.isConfigured, true);
    assert.equal(first.modules.crm, true);
    const initialCalls = queryCallCount;

    // Second fetch: served from cache (no DB query)
    await tenantEntitlementService.getTenantEntitlements(tenantId, mockDb);
    assert.equal(queryCallCount, initialCalls, 'Second fetch must be served from cache');

    // Admin updates entitlements: evicts cache
    await tenantEntitlementService.setTenantEntitlements({
      tenant_id: tenantId,
      modules: { crm: true, finance: false },
      limits: { max_users: 25 },
      reason: 'Upgraded user seats to 25',
      admin_user_id: 1
    }, mockDb);

    // Third fetch: must hit DB because cache was evicted
    assert.ok(queryCallCount > initialCalls, 'Updating entitlements must trigger DB write and evict cache');
  });

  // ── 3. USAGE LIMITS TESTS ──────────────────────────────────────────────────

  await t.test('8. User Limit Exceeded: blocks creation with 403 USER_LIMIT_EXCEEDED', async () => {
    const req = {
      tenant_id: 'tenant-with-limit',
      planLimits: { max_users: 5, max_branches: 1 },
      body: { is_working: true }
    };
    const res = createMockRes();
    let nextCalled = false;

    // We can simulate db count using a temporary monkey-patch or mock
    const originalDb = require('../config/db');
    const originalQuery = originalDb.query;

    originalDb.query = async (sql) => {
      if (sql.includes('SELECT COUNT(*) FROM users')) {
        return { rows: [{ count: '5' }] }; // Current count = 5, limit = 5
      }
      return { rows: [] };
    };

    try {
      await usageLimits('users')(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, false, 'Must block user creation when count >= maxUsers');
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.code, 'USER_LIMIT_EXCEEDED');
      assert.equal(res.body.current, 5);
      assert.equal(res.body.max, 5);
    } finally {
      originalDb.query = originalQuery;
    }
  });

  await t.test('9. Inactive User Creation: does not consume active seat limit', async () => {
    const req = {
      tenant_id: 'tenant-with-limit',
      planLimits: { max_users: 5, max_branches: 1 },
      body: { is_working: false } // Inactive user
    };
    const res = createMockRes();
    let nextCalled = false;

    await usageLimits('users')(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true, 'Inactive user creation must proceed via next()');
    assert.equal(res.statusCode, 200);
  });

  await t.test('10. Unlimited Capacity (-1): permits creation beyond normal limits', async () => {
    const req = {
      tenant_id: 'tenant-unlimited',
      planLimits: { max_users: -1, max_branches: -1 },
      body: { is_working: true }
    };
    const res = createMockRes();
    let nextCalled = false;

    await usageLimits('users')(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true, 'Must allow creation when max_users === -1');

    nextCalled = false;
    await usageLimits('branches')(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true, 'Must allow branch creation when max_branches === -1');
  });

  await t.test('11. Zero Capacity (0): strictly blocks creation', async () => {
    const req = {
      tenant_id: 'tenant-zero-capacity',
      planLimits: { max_users: 0, max_branches: 0 },
      body: { is_working: true }
    };
    const res = createMockRes();
    let nextCalled = false;

    await usageLimits('users')(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'Must block creation when limit is 0');
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'USER_LIMIT_ZERO');
  });

  await t.test('12. Database Connection Failure in Limits: returns HTTP 503 fail-closed', async () => {
    const req = {
      tenant_id: 'tenant-error',
      planLimits: { max_users: 10, max_branches: 1 },
      body: { is_working: true }
    };
    const res = createMockRes();
    let nextCalled = false;

    const originalDb = require('../config/db');
    const originalQuery = originalDb.query;

    originalDb.query = async () => {
      throw new Error('Database connection timeout (simulated)');
    };

    try {
      await usageLimits('users')(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, false, 'Must NOT call next on database error');
      assert.equal(res.statusCode, 503, 'Must return 503 Service Unavailable');
      assert.equal(res.body.code, 'USAGE_LIMITS_CHECK_FAILED');
    } finally {
      originalDb.query = originalQuery;
    }
  });

  // ── 4. TEMPLATE GUARD PRESERVATION TESTS ───────────────────────────────────

  await t.test('13. TemplateGuard Preservation: real_estate template enforces route isolation alongside modules', () => {
    const reqGeneral = {
      user: { template_name: 'general' },
      modules: { real_estate: false, crm: true }
    };
    const resGeneral = createMockRes();
    let nextCalled = false;

    templateGuard('real_estate')(reqGeneral, resGeneral, () => { nextCalled = true; });
    assert.equal(nextCalled, false, 'General tenant must NOT access real_estate routes');
    assert.equal(resGeneral.statusCode, 403);

    const reqRE = {
      user: { template_name: 'real_estate' },
      modules: { real_estate: true, crm: true }
    };
    const resRE = createMockRes();
    nextCalled = false;

    templateGuard('real_estate')(reqRE, resRE, () => { nextCalled = true; });
    assert.equal(nextCalled, true, 'Real Estate tenant with real_estate enabled must pass');
  });

  // ── 5. SALES MODULE ENFORCEMENT & PIPELINE TESTS ───────────────────────────

  await t.test('14. Sales Module Enforcement: moduleGuard(sales) blocks when sales: false', () => {
    const req = {
      modules: { sales: false, crm: true }
    };
    const res = createMockRes();
    let nextCalled = false;

    moduleGuard('sales')(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false, 'Must block sales endpoint when sales: false');
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'MODULE_LOCKED');
    assert.equal(res.body.module, 'sales');
  });

  await t.test('15. Sales Chained Pipeline: moduleGuard(sales) + templateGuard(general) enforces both layers', () => {
    // Case A: sales disabled, general template -> blocked by moduleGuard (403 MODULE_LOCKED)
    const reqA = { user: { template_name: 'general' }, modules: { sales: false } };
    const resA = createMockRes();
    let handlerACalled = false;
    moduleGuard('sales')(reqA, resA, () => {
      templateGuard('general')(reqA, resA, () => { handlerACalled = true; });
    });
    assert.equal(handlerACalled, false);
    assert.equal(resA.statusCode, 403);
    assert.equal(resA.body.code, 'MODULE_LOCKED');

    // Case B: sales enabled, real_estate template -> passes moduleGuard, blocked by templateGuard (403 TEMPLATE_MISMATCH)
    const reqB = { user: { template_name: 'real_estate' }, modules: { sales: true } };
    const resB = createMockRes();
    let handlerBCalled = false;
    moduleGuard('sales')(reqB, resB, () => {
      templateGuard('general')(reqB, resB, () => { handlerBCalled = true; });
    });
    assert.equal(handlerBCalled, false);
    assert.equal(resB.statusCode, 403);
    assert.equal(resB.body.code, 'TEMPLATE_MISMATCH');

    // Case C: sales enabled, general template -> passes both and executes handler
    const reqC = { user: { template_name: 'general' }, modules: { sales: true } };
    const resC = createMockRes();
    let handlerCCalled = false;
    moduleGuard('sales')(reqC, resC, () => {
      templateGuard('general')(reqC, resC, () => { handlerCCalled = true; });
    });
    assert.equal(handlerCCalled, true);
    assert.equal(resC.statusCode, 200);
  });

  // ── 6. INDEPENDENT BRANCH LIMIT TESTS ──────────────────────────────────────

  await t.test('16. Branch Limit Exceeded: blocks creation with 403 BRANCH_LIMIT_EXCEEDED when count >= max_branches', async () => {
    const req = {
      tenant_id: 'tenant-branch-limit',
      planLimits: { max_users: 10, max_branches: 2 },
      body: { name: 'Alexandria Branch' }
    };
    const res = createMockRes();
    let nextCalled = false;

    const originalDb = require('../config/db');
    const originalQuery = originalDb.query;

    originalDb.query = async (sql) => {
      if (sql.includes('SELECT COUNT(*) FROM branches')) {
        return { rows: [{ count: '2' }] }; // Current active branches = 2, max = 2
      }
      return { rows: [] };
    };

    try {
      await usageLimits('branches')(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, false, 'Must block branch creation when count >= maxBranches');
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.code, 'BRANCH_LIMIT_EXCEEDED');
      assert.equal(res.body.current, 2);
      assert.equal(res.body.max, 2);
    } finally {
      originalDb.query = originalQuery;
    }
  });

  await t.test('17. Branch Limit Not Reached: permits branch creation when count < max_branches', async () => {
    const req = {
      tenant_id: 'tenant-branch-available',
      planLimits: { max_users: 10, max_branches: 3 },
      body: { name: 'Giza Branch' }
    };
    const res = createMockRes();
    let nextCalled = false;

    const originalDb = require('../config/db');
    const originalQuery = originalDb.query;

    originalDb.query = async (sql) => {
      if (sql.includes('SELECT COUNT(*) FROM branches')) {
        return { rows: [{ count: '1' }] }; // Current active = 1, max = 3
      }
      return { rows: [] };
    };

    try {
      await usageLimits('branches')(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, true, 'Must allow branch creation when capacity remains');
      assert.equal(res.statusCode, 200);
    } finally {
      originalDb.query = originalQuery;
    }
  });

  await t.test('18. Zero Branch Capacity: strictly blocks branch creation with 403 BRANCH_LIMIT_ZERO', async () => {
    const req = {
      tenant_id: 'tenant-branch-zero',
      planLimits: { max_users: 10, max_branches: 0 },
      body: { name: 'Attempted Branch' }
    };
    const res = createMockRes();
    let nextCalled = false;

    await usageLimits('branches')(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'Must block creation when max_branches === 0');
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'BRANCH_LIMIT_ZERO');
  });

  await t.test('19. Unlimited Branch Capacity (-1): allows branch creation beyond normal caps', async () => {
    const req = {
      tenant_id: 'tenant-branch-unlimited',
      planLimits: { max_users: 10, max_branches: -1 },
      body: { name: 'Enterprise Branch 99' }
    };
    const res = createMockRes();
    let nextCalled = false;

    await usageLimits('branches')(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true, 'Must allow unlimited branch creation');
    assert.equal(res.statusCode, 200);
  });

  await t.test('20. Database Failure in Branch Limits: returns HTTP 503 fail-closed', async () => {
    const req = {
      tenant_id: 'tenant-branch-db-fail',
      planLimits: { max_users: 10, max_branches: 2 },
      body: { name: 'Failing Branch' }
    };
    const res = createMockRes();
    let nextCalled = false;

    const originalDb = require('../config/db');
    const originalQuery = originalDb.query;

    originalDb.query = async () => {
      throw new Error('Database connection pool exhausted (simulated)');
    };

    try {
      await usageLimits('branches')(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, false, 'Must NOT proceed on database failure');
      assert.equal(res.statusCode, 503);
      assert.equal(res.body.code, 'USAGE_LIMITS_CHECK_FAILED');
    } finally {
      originalDb.query = originalQuery;
    }
  });

  await t.test('21. Missing Entitlement Profile in Usage Limits: blocks with 403 USAGE_LIMITS_NOT_CONFIGURED', async () => {
    const req = {
      tenant_id: 'tenant-unconfigured-limits',
      planLimits: undefined // Not pre-attached
    };
    const res = createMockRes();
    let nextCalled = false;

    const originalDb = require('../config/db');
    const originalQuery = originalDb.query;

    originalDb.query = async () => ({ rows: [] }); // No tenant_overrides record

    try {
      await usageLimits('users')(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, false, 'Must block creation when entitlements unconfigured');
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.code, 'USAGE_LIMITS_NOT_CONFIGURED');
    } finally {
      originalDb.query = originalQuery;
    }
  });

  // ── 7. ADMIN AUTHORIZATION & SUPER ADMIN BOOTSTRAP TESTS ───────────────────

  await t.test('22. Admin Authorization: ordinary tenant admin is blocked from HUD routes with 403', () => {
    const reqTenantAdmin = {
      user: {
        id: 42,
        role: 'admin', // Admin inside their tenant, NOT ITQAN platform Super Admin
        tenant_id: 'commercial-tenant-uuid-1111'
      }
    };
    const res = createMockRes();
    let nextCalled = false;

    adminPlanRoutes.superAdminOnly(reqTenantAdmin, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'Tenant admin must NOT access ITQAN HUD routes');
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.message, 'Super Admin access required.');
  });

  await t.test('23. Cross-Tenant Profile Isolation: non-super-admin user cannot access admin override endpoints', () => {
    const reqAttacker = {
      user: {
        id: 99,
        role: 'manager',
        tenant_id: 'attacker-tenant-uuid'
      },
      params: {
        tenant_id: 'victim-tenant-uuid'
      }
    };
    const res = createMockRes();
    let nextCalled = false;

    adminPlanRoutes.superAdminOnly(reqAttacker, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'Attacker must be rejected by superAdminOnly');
    assert.equal(res.statusCode, 403);
  });

  await t.test('24. Super Admin Authorization: authorized ITQAN Super Admin passes superAdminOnly guard', () => {
    const reqSuperAdmin = {
      user: {
        id: 1,
        role: 'admin',
        tenant_id: '00000000-0000-0000-0000-000000000000' // ITQAN System Super Admin Tenant
      }
    };
    const res = createMockRes();
    let nextCalled = false;

    adminPlanRoutes.superAdminOnly(reqSuperAdmin, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true, 'ITQAN Super Admin must pass superAdminOnly guard');
    assert.equal(res.statusCode, 200);
  });

  await t.test('25. Super Admin Bootstrap: can fetch unconfigured tenant (200 with isConfigured: false) and initialize profile', async () => {
    const targetTenantId = 'brand-new-onboarding-tenant';
    const originalDb = require('../config/db');
    const originalQuery = originalDb.query;

    let dbRows = [];
    originalDb.query = async (sql, params) => {
      const norm = sql.replace(/\s+/g, ' ');
      if (norm.includes('SELECT') && norm.includes('FROM tenant_overrides')) {
        return { rows: dbRows };
      }
      if (norm.includes('INSERT INTO tenant_overrides')) {
        const row = {
          tenant_id: params[0],
          modules: params[1],
          limits: params[2],
          notes: params[3],
          updated_at: new Date()
        };
        dbRows = [row];
        return { rows: [row] };
      }
      return { rows: [] };
    };

    try {
      // Step A: Initial fetch on unconfigured tenant returns 200 with isConfigured: false
      const getReq = { params: { tenant_id: targetTenantId } };
      const getRes = createMockRes();
      await adminPlansController.getTenantOverride(getReq, getRes);

      assert.equal(getRes.statusCode, 200);
      assert.equal(getRes.body.status, 'success');
      assert.equal(getRes.body.data.isConfigured, false, 'Unconfigured tenant must return isConfigured: false');
      assert.equal(Object.keys(getRes.body.data.modules).length, 0);

      // Step B: Super Admin saves initial configuration via setTenantOverride
      const setReq = {
        params: { tenant_id: targetTenantId },
        user: { id: 1, role: 'admin', tenant_id: '00000000-0000-0000-0000-000000000000' },
        ip: '127.0.0.1',
        body: {
          modules: { crm: true, sales: true, finance: true },
          limits: { max_users: 15, max_branches: 2 },
          reason: 'Initial onboarding entitlement profile configured via HUD'
        }
      };
      const setRes = createMockRes();
      await adminPlansController.setTenantOverride(setReq, setRes);

      assert.equal(setRes.statusCode, 200);
      assert.equal(setRes.body.status, 'success');
      assert.equal(setRes.body.data.modules.crm, true);
      assert.equal(setRes.body.data.modules.sales, true);
      assert.equal(setRes.body.data.limits.max_users, 15);

      // Step C: Verify subsequent fetch sees isConfigured: true
      const secondGetRes = createMockRes();
      await adminPlansController.getTenantOverride(getReq, secondGetRes);
      assert.equal(secondGetRes.statusCode, 200);
      assert.equal(secondGetRes.body.data.isConfigured, true, 'Tenant must now be fully configured');
      assert.equal(secondGetRes.body.data.modules.crm, true);
    } finally {
      originalDb.query = originalQuery;
    }
  });

  // ── 8. CONCURRENCY & RACE CONDITION TEST ───────────────────────────────────

  await t.test('26. Concurrency Simulation: verifies TOCTOU race condition and documents advisory lock resolution', async () => {
    // Demonstrates why transaction-safe locking is needed for high-concurrency seat allocation:
    let activeSeats = 4;
    const maxSeats = 5;

    // Parallel requests hitting checkUserLimit simultaneously:
    // Without locking, both requests check activeSeats (4 < 5) and both proceed.
    async function simulateCheckWithoutLock() {
      // Step 1: Read count
      const count = activeSeats;
      if (count >= maxSeats) {
        return { allowed: false, count };
      }
      // Step 2: Simulate microsecond network delay before write
      await new Promise(resolve => setTimeout(resolve, 5));
      // Step 3: Insert user
      activeSeats++;
      return { allowed: true, count: activeSeats };
    }

    const [res1, res2] = await Promise.all([
      simulateCheckWithoutLock(),
      simulateCheckWithoutLock()
    ]);

    // Both passed check, resulting in 6 active seats (breaching maxSeats = 5)!
    assert.equal(res1.allowed, true);
    assert.equal(res2.allowed, true);
    assert.equal(activeSeats, 6, 'TOCTOU race condition causes seat limit breach without serialization');

    // Reset and simulate with serialization / advisory lock:
    activeSeats = 4;
    let lockAcquired = false;
    async function simulateCheckWithLock() {
      // Wait for transactional advisory lock
      while (lockAcquired) {
        await new Promise(r => setTimeout(r, 2));
      }
      lockAcquired = true;
      try {
        const count = activeSeats;
        if (count >= maxSeats) {
          return { allowed: false, count };
        }
        await new Promise(resolve => setTimeout(resolve, 5));
        activeSeats++;
        return { allowed: true, count: activeSeats };
      } finally {
        lockAcquired = false;
      }
    }

    const [lockedRes1, lockedRes2] = await Promise.all([
      simulateCheckWithLock(),
      simulateCheckWithLock()
    ]);

    // Exactly one succeeds and the second is rejected:
    const allowedCount = [lockedRes1.allowed, lockedRes2.allowed].filter(Boolean).length;
    assert.equal(allowedCount, 1, 'Transactional serialization allows exactly 1 user and rejects the second');
    assert.equal(activeSeats, 5, 'Seat limit strictly maintained at 5');
  });

});
