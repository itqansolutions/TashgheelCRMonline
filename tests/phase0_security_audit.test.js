const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// Ensure JWT_SECRET is set for testing
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-12345';

// Mock DB helper
function createMockDb(queryHandler) {
  return {
    query: async (text, params) => {
      return queryHandler(text, params);
    }
  };
}

// -----------------------------------------------------------------------------
// TEST SUITE 1: Role Middleware Authorization Hardening
// -----------------------------------------------------------------------------
test('Role Middleware: authorize enforces strict role matching and eliminates user_access bypass', async (t) => {
  const roleMiddleware = require('../middleware/roleMiddleware');

  await t.test('allows admin unconditionally', async () => {
    let nextCalled = false;
    const req = { user: { id: 'u1', role: 'admin', tenant_id: 't1' } };
    const res = {
      status: (code) => {
        return { json: (data) => ({ code, data }) };
      }
    };
    const next = () => { nextCalled = true; };

    const middleware = roleMiddleware.authorize(['manager']);
    await middleware(req, res, next);
    assert.equal(nextCalled, true, 'Admin should be permitted access');
  });

  await t.test('allows matching role', async () => {
    let nextCalled = false;
    const req = { user: { id: 'u2', role: 'manager', tenant_id: 't1' } };
    const res = {};
    const next = () => { nextCalled = true; };

    const middleware = roleMiddleware.authorize(['manager', 'supervisor']);
    await middleware(req, res, next);
    assert.equal(nextCalled, true, 'Manager should match authorized roles');
  });

  await t.test('rejects non-matching role even if user has rows in user_access', async () => {
    let responseStatus = null;
    let responseJson = null;
    let nextCalled = false;

    const req = { user: { id: 'u3', role: 'employee', tenant_id: 't1' } };
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => {
            responseJson = data;
          }
        };
      }
    };
    const next = () => { nextCalled = true; };

    const middleware = roleMiddleware.authorize(['admin']);
    await middleware(req, res, next);

    assert.equal(nextCalled, false, 'Next must NOT be called for unauthorized role');
    assert.equal(responseStatus, 403, 'Must return 403 Forbidden');
    assert.match(responseJson.message, /not authorized/, 'Must return unauthorized message');
  });

  await t.test('returns 401 when req.user is missing', async () => {
    let responseStatus = null;
    const req = {};
    const res = {
      status: (code) => {
        responseStatus = code;
        return { json: () => {} };
      }
    };
    const next = () => {};

    const middleware = roleMiddleware.authorize(['admin']);
    await middleware(req, res, next);
    assert.equal(responseStatus, 401, 'Missing user context must return 401');
  });
});

// -----------------------------------------------------------------------------
// TEST SUITE 2: Branch Scope Middleware Hardening
// -----------------------------------------------------------------------------
test('Branch Scope Middleware: strictly validates x-branch-id and retains fallback', async (t) => {
  const branchScope = require('../middleware/branchScope');
  const db = require('../config/db');

  // Save original db.query
  const originalQuery = db.query;

  t.afterEach(() => {
    db.query = originalQuery;
  });

  await t.test('rejects non-admin attempting to access branch they are not assigned to', async () => {
    db.query = async (sql, params) => {
      // 1. Branch exists and belongs to tenant 't1'
      if (sql.includes('FROM branches WHERE id::text')) {
        return { rows: [{ tenant_id: 't1' }] };
      }
      // 2. user_branches check: user 'u1' is NOT assigned to 'branch-999'
      if (sql.includes('FROM user_branches WHERE user_id::text')) {
        return { rows: [] };
      }
      return { rows: [] };
    };

    let responseStatus = null;
    let responseJson = null;
    let nextCalled = false;

    const req = {
      headers: { 'x-branch-id': 'branch-999' },
      user: { id: 'u1', role: 'employee', tenant_id: 't1' }
    };
    const res = {
      status: (code) => {
        responseStatus = code;
        return { json: (data) => { responseJson = data; } };
      }
    };
    const next = () => { nextCalled = true; };

    await branchScope(req, res, next);

    assert.equal(nextCalled, false, 'Next should not be called');
    assert.equal(responseStatus, 403, 'Must return 403 Forbidden');
    assert.equal(responseJson.code, 'UNAUTHORIZED_BRANCH_ACCESS');
  });

  await t.test('allows non-admin when user is assigned in user_branches', async () => {
    db.query = async (sql, params) => {
      if (sql.includes('FROM branches WHERE id::text')) {
        return { rows: [{ tenant_id: 't1' }] };
      }
      if (sql.includes('FROM user_branches WHERE user_id::text')) {
        return { rows: [{ 1: 1 }] };
      }
      return { rows: [] };
    };

    let nextCalled = false;
    const req = {
      headers: { 'x-branch-id': 'branch-valid-1' },
      user: { id: 'u1', role: 'employee', tenant_id: 't1' }
    };
    const res = {};
    const next = () => { nextCalled = true; };

    await branchScope(req, res, next);

    assert.equal(nextCalled, true, 'Authorized user should pass');
    assert.equal(req.branchId, 'branch-valid-1');
  });

  await t.test('allows tenant admin to access any branch in their tenant', async () => {
    db.query = async (sql, params) => {
      if (sql.includes('FROM branches WHERE id::text')) {
        return { rows: [{ tenant_id: 't1' }] };
      }
      return { rows: [] };
    };

    let nextCalled = false;
    const req = {
      headers: { 'x-branch-id': 'branch-admin-accessible' },
      user: { id: 'admin1', role: 'admin', tenant_id: 't1' }
    };
    const res = {};
    const next = () => { nextCalled = true; };

    await branchScope(req, res, next);

    assert.equal(nextCalled, true, 'Tenant admin should pass without user_branches check');
    assert.equal(req.branchId, 'branch-admin-accessible');
  });

  await t.test('rejects even admin if branch belongs to a foreign tenant', async () => {
    db.query = async (sql, params) => {
      if (sql.includes('FROM branches WHERE id::text')) {
        return { rows: [{ tenant_id: 'foreign-tenant-99' }] };
      }
      return { rows: [] };
    };

    let responseStatus = null;
    let nextCalled = false;
    const req = {
      headers: { 'x-branch-id': 'branch-foreign' },
      user: { id: 'admin1', role: 'admin', tenant_id: 't1' }
    };
    const res = {
      status: (code) => {
        responseStatus = code;
        return { json: () => {} };
      }
    };
    const next = () => { nextCalled = true; };

    await branchScope(req, res, next);

    assert.equal(nextCalled, false);
    assert.equal(responseStatus, 403, 'Cross-tenant branch access must be blocked for all roles');
  });

  await t.test('preserves fallback when x-branch-id header is absent', async () => {
    db.query = async (sql, params) => {
      // User's default branch in user_branches
      if (sql.includes('FROM user_branches WHERE user_id::text = $1::text LIMIT 1')) {
        return { rows: [{ branch_id: 'user-default-branch' }] };
      }
      if (sql.includes('FROM branches WHERE id::text')) {
        return { rows: [{ tenant_id: 't1' }] };
      }
      return { rows: [] };
    };

    let nextCalled = false;
    const req = {
      headers: {},
      user: { id: 'u1', role: 'employee', tenant_id: 't1' }
    };
    const res = {};
    const next = () => { nextCalled = true; };

    await branchScope(req, res, next);

    assert.equal(nextCalled, true);
    assert.equal(req.branchId, 'user-default-branch');
  });
});

// -----------------------------------------------------------------------------
// TEST SUITE 3: Secure Uploads Middleware
// -----------------------------------------------------------------------------
test('Secure Uploads Middleware: enforces auth, path traversal protection & tenant isolation', async (t) => {
  const secureUploads = require('../middleware/secureUploads');
  const db = require('../config/db');

  const testUploadsDir = path.join(__dirname, 'scratch_uploads');
  if (!fs.existsSync(testUploadsDir)) fs.mkdirSync(testUploadsDir, { recursive: true });

  // Create test files
  const sampleTenantAFile = path.join(testUploadsDir, 'tenantA_file.pdf');
  fs.writeFileSync(sampleTenantAFile, 'sample content tenant A');

  const sampleLogoFile = path.join(testUploadsDir, 'company_logo.png');
  fs.writeFileSync(sampleLogoFile, 'logo image binary data');

  const whatsappDir = path.join(testUploadsDir, 'whatsapp', 'tenant-100');
  fs.mkdirSync(whatsappDir, { recursive: true });
  const whatsappFile = path.join(whatsappDir, 'chat_voice.ogg');
  fs.writeFileSync(whatsappFile, 'voice audio data');

  const middleware = secureUploads(testUploadsDir);

  const originalQuery = db.query;
  t.after(() => {
    db.query = originalQuery;
    // Cleanup scratch files
    try {
      fs.rmSync(testUploadsDir, { recursive: true, force: true });
    } catch (e) {}
  });

  await t.test('detects and blocks path traversal attempts', async () => {
    let responseStatus = null;
    let responseJson = null;

    const req = {
      path: '/../../package.json',
      headers: {},
      query: {}
    };
    const res = {
      status: (code) => {
        responseStatus = code;
        return { json: (data) => { responseJson = data; } };
      }
    };

    await middleware(req, res, () => {});
    assert.equal(responseStatus, 403, 'Path traversal must be blocked with 403');
    assert.match(responseJson.message, /Path traversal detected/);
  });

  await t.test('rejects unauthenticated request for sensitive attachment', async () => {
    db.query = async () => ({ rows: [{ tenant_id: 'tenant-100', linked_type: 'Contract' }] });

    let responseStatus = null;
    const req = {
      path: '/tenantA_file.pdf',
      headers: {},
      query: {}
    };
    const res = {
      status: (code) => {
        responseStatus = code;
        return { json: () => {} };
      }
    };

    await middleware(req, res, () => {});
    assert.equal(responseStatus, 401, 'Unauthenticated request must return 401');
  });

  await t.test('allows unauthenticated request for public tenant logo', async () => {
    db.query = async () => ({ rows: [{ tenant_id: 'tenant-100', linked_type: 'Tenant' }] });

    let sentFile = null;
    const req = {
      path: '/company_logo.png',
      headers: {},
      query: {}
    };
    const res = {
      sendFile: (filePath) => { sentFile = filePath; }
    };

    await middleware(req, res, () => {});
    assert.equal(sentFile, sampleLogoFile, 'Public tenant logo should be served');
  });

  await t.test('blocks cross-tenant access to WhatsApp media', async () => {
    const foreignUserToken = jwt.sign(
      { user: { id: 'u99', role: 'admin', tenant_id: 'tenant-999' } },
      process.env.JWT_SECRET
    );

    let responseStatus = null;
    const req = {
      path: '/whatsapp/tenant-100/chat_voice.ogg',
      headers: { authorization: `Bearer ${foreignUserToken}` },
      query: {}
    };
    const res = {
      status: (code) => {
        responseStatus = code;
        return { json: () => {} };
      }
    };

    await middleware(req, res, () => {});
    assert.equal(responseStatus, 403, 'Cross-tenant WhatsApp media access must be blocked with 403');
  });

  await t.test('allows authenticated same-tenant access via ?token= query parameter', async () => {
    const validUserToken = jwt.sign(
      { user: { id: 'u1', role: 'employee', tenant_id: 'tenant-100' } },
      process.env.JWT_SECRET
    );

    let sentFile = null;
    const req = {
      path: '/whatsapp/tenant-100/chat_voice.ogg',
      headers: {},
      query: { token: validUserToken }
    };
    const res = {
      sendFile: (filePath) => { sentFile = filePath; }
    };

    await middleware(req, res, () => {});
    assert.equal(sentFile, whatsappFile, 'File must be served with valid token query parameter');
  });

  await t.test('blocks cross-tenant access to general attachments', async () => {
    db.query = async () => ({ rows: [{ tenant_id: 'tenant-100', linked_type: 'Deal' }] });

    const foreignUserToken = jwt.sign(
      { user: { id: 'u99', role: 'employee', tenant_id: 'tenant-200' } },
      process.env.JWT_SECRET
    );

    let responseStatus = null;
    const req = {
      path: '/tenantA_file.pdf',
      headers: { authorization: `Bearer ${foreignUserToken}` },
      query: {}
    };
    const res = {
      status: (code) => {
        responseStatus = code;
        return { json: () => {} };
      }
    };

    await middleware(req, res, () => {});
    assert.equal(responseStatus, 403, 'Foreign tenant cannot access deal attachment');
  });
});

// -----------------------------------------------------------------------------
// TEST SUITE 4: Meta Lead Tenant-Scoped Deduplication
// -----------------------------------------------------------------------------
test('Meta Lead Deduplication: verifies tenant scoping and immutable tenant_id', async () => {
  const fs = require('fs');
  const metaServiceContent = fs.readFileSync(path.join(__dirname, '../services/metaService.js'), 'utf8');

  // Verify meta_lead_id query includes tenant_id
  assert.match(
    metaServiceContent,
    /SELECT .* FROM customers WHERE meta_lead_id = \$1 AND tenant_id::text = \$2::text LIMIT 1/,
    'meta_lead_id check must be scoped strictly by tenant_id'
  );

  // Verify UPDATE customers does NOT reassign tenant_id
  assert.doesNotMatch(
    metaServiceContent,
    /tenant_id = COALESCE\(NULLIF\(.*tenant_id\)/,
    'UPDATE query must not allow re-homing customer tenant_id'
  );

  // Verify UPDATE customers WHERE clause checks tenant_id
  assert.match(
    metaServiceContent,
    /WHERE id = \$\d+ AND tenant_id::text = \$\d+::text/,
    'UPDATE query must enforce tenant_id in WHERE clause'
  );
});
