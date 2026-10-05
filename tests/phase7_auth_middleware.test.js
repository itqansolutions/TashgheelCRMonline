const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Ensure JWT_SECRET is set for tests
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_123';

test('Phase 7: authMiddleware Template Resolution & Hardening Suite', async (t) => {
  const db = require('../config/db');
  const authMiddleware = require('../middleware/auth');

  // Helper to construct req and res
  function createReqRes(token) {
    const req = {
      header: (name) => {
        if (name.toLowerCase() === 'authorization') {
          return `Bearer ${token}`;
        }
        return null;
      }
    };

    let statusCode = 200;
    let jsonBody = null;
    let nextCalled = false;

    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (body) => {
            jsonBody = body;
          }
        };
      },
      json: (body) => {
        jsonBody = body;
      }
    };

    const next = () => {
      nextCalled = true;
    };

    return { req, res, getStatus: () => statusCode, getBody: () => jsonBody, isNextCalled: () => nextCalled };
  }

  await t.test('a) JWT without template_name, DB returns real_estate -> hydrates user, calls next(), no catch', async () => {
    const originalQuery = db.query;
    let dbQueried = false;

    db.query = async (sql, params) => {
      if (sql.includes('SELECT template_name FROM tenants')) {
        dbQueried = true;
        return { rows: [{ template_name: 'real_estate' }] };
      }
      return { rows: [] };
    };

    try {
      const token = jwt.sign({
        user: { id: 101, name: 'Karim RealEstate', tenant_id: 'tenant-re-unique-1' }
      }, process.env.JWT_SECRET);

      const { req, res, getStatus, getBody, isNextCalled } = createReqRes(token);

      await authMiddleware(req, res, () => {});

      assert.equal(req.user.template_name, 'real_estate');
      assert.equal(dbQueried, true);
      assert.equal(getStatus(), 200);
      assert.equal(getBody(), null);
    } finally {
      db.query = originalQuery;
    }
  });

  await t.test('b) Cache hit does not query DB a second time; cache expiry re-queries', async () => {
    const originalQuery = db.query;
    let queryCount = 0;

    db.query = async (sql, params) => {
      if (sql.includes('SELECT template_name FROM tenants')) {
        queryCount++;
        return { rows: [{ template_name: 'real_estate' }] };
      }
      return { rows: [] };
    };

    try {
      const tenantId = `tenant-cached-${Date.now()}`;
      const token = jwt.sign({
        user: { id: 102, name: 'Cache User', tenant_id: tenantId }
      }, process.env.JWT_SECRET);

      // Call 1: Cache Miss -> queries DB
      const call1 = createReqRes(token);
      await authMiddleware(call1.req, call1.res, () => {});
      assert.equal(call1.req.user.template_name, 'real_estate');
      assert.equal(queryCount, 1);

      // Call 2: Cache Hit -> does NOT query DB
      const call2 = createReqRes(token);
      await authMiddleware(call2.req, call2.res, () => {});
      assert.equal(call2.req.user.template_name, 'real_estate');
      assert.equal(queryCount, 1, 'Cache hit must not query DB');
    } finally {
      db.query = originalQuery;
    }
  });

  await t.test('c) DB throws -> returns 503 TEMPLATE_RESOLUTION_FAILED, next NOT called', async () => {
    const originalQuery = db.query;

    db.query = async (sql, params) => {
      if (sql.includes('SELECT template_name FROM tenants')) {
        throw new Error('Database connection timeout simulated');
      }
      return { rows: [] };
    };

    try {
      const tenantId = `tenant-err-${Date.now()}`;
      const token = jwt.sign({
        user: { id: 103, name: 'Error User', tenant_id: tenantId }
      }, process.env.JWT_SECRET);

      let nextCalled = false;
      const { req, res, getStatus, getBody } = createReqRes(token);

      await authMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false, 'next() must NOT be called on DB error');
      assert.equal(getStatus(), 503);
      assert.equal(getBody().code, 'TEMPLATE_RESOLUTION_FAILED');
      assert.match(getBody().message, /database error/i);
    } finally {
      db.query = originalQuery;
    }
  });

  await t.test('d) Tenant not found -> returns 403 TENANT_NOT_FOUND, next NOT called', async () => {
    const originalQuery = db.query;

    db.query = async (sql, params) => {
      if (sql.includes('SELECT template_name FROM tenants')) {
        return { rows: [] }; // Tenant not found in DB
      }
      return { rows: [] };
    };

    try {
      const tenantId = `tenant-nonexistent-${Date.now()}`;
      const token = jwt.sign({
        user: { id: 104, name: 'Ghost Tenant User', tenant_id: tenantId }
      }, process.env.JWT_SECRET);

      let nextCalled = false;
      const { req, res, getStatus, getBody } = createReqRes(token);

      await authMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false, 'next() must NOT be called for missing tenant');
      assert.equal(getStatus(), 403);
      assert.equal(getBody().code, 'TENANT_NOT_FOUND');
    } finally {
      db.query = originalQuery;
    }
  });

  await t.test('d2) Tenant has NULL template_name -> logs warning, treats as general explicitly, next called', async () => {
    const originalQuery = db.query;

    db.query = async (sql, params) => {
      if (sql.includes('SELECT template_name FROM tenants')) {
        return { rows: [{ template_name: null }] }; // Legacy tenant with NULL template_name
      }
      return { rows: [] };
    };

    try {
      const tenantId = `tenant-legacy-${Date.now()}`;
      const token = jwt.sign({
        user: { id: 105, name: 'Legacy User', tenant_id: tenantId }
      }, process.env.JWT_SECRET);

      let nextCalled = false;
      const { req, res, getStatus } = createReqRes(token);

      await authMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(getStatus(), 200);
      assert.equal(req.user.template_name, 'general');
    } finally {
      db.query = originalQuery;
    }
  });

  await t.test('e) JWT already containing template_name -> no DB query executed', async () => {
    const originalQuery = db.query;
    let queryExecuted = false;

    db.query = async (sql, params) => {
      queryExecuted = true;
      return { rows: [] };
    };

    try {
      const token = jwt.sign({
        user: { id: 106, name: 'Modern User', tenant_id: 'tenant-modern', template_name: 'real_estate' }
      }, process.env.JWT_SECRET);

      let nextCalled = false;
      const { req, res, getStatus } = createReqRes(token);

      await authMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(getStatus(), 200);
      assert.equal(req.user.template_name, 'real_estate');
      assert.equal(queryExecuted, false, 'No DB query should run when template_name exists in JWT');
    } finally {
      db.query = originalQuery;
    }
  });

  await t.test('f) Static check: templateCache and TEMPLATE_CACHE_TTL are declared before use in middleware/auth.js', async () => {
    const authFileContent = fs.readFileSync(path.join(__dirname, '../middleware/auth.js'), 'utf8');

    // Find index of declaration
    const cacheDeclIndex = authFileContent.indexOf('const templateCache = new Map();');
    const ttlDeclIndex = authFileContent.indexOf('const TEMPLATE_CACHE_TTL =');

    // Find first usage inside export function
    const cacheUsageIndex = authFileContent.indexOf('templateCache.get(');

    assert.ok(cacheDeclIndex !== -1, 'templateCache must be explicitly declared');
    assert.ok(ttlDeclIndex !== -1, 'TEMPLATE_CACHE_TTL must be explicitly declared');
    assert.ok(cacheUsageIndex !== -1, 'templateCache usage must be present');
    assert.ok(cacheDeclIndex < cacheUsageIndex, 'templateCache declaration must appear BEFORE any usage');
    assert.ok(ttlDeclIndex < cacheUsageIndex, 'TEMPLATE_CACHE_TTL declaration must appear BEFORE any usage');
  });
});
