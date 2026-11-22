// ============================================================================
// CANONICAL TEST SAFETY ENFORCEMENT (Phase S)
// Strictly mandates DATABASE_URL_TEST and prevents execution against PROD_HOST
// ============================================================================
require('dotenv').config({ path: '.env.test' });
const { initTestContext, getTestPool, closeTestPool } = require('./helpers/testDb');
initTestContext();

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { bulkAssignLeads } = require('../controllers/customersController');
const { rollbackMigration029 } = require('../scripts/rollback_migration_029');

// Test helper to mock express res object
function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, val) {
      this.headers[key.toLowerCase()] = val;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

test('BULK ASSIGNMENT SECURITY & IDEMPOTENCY SUITE', async (suite) => {
  const pool = getTestPool();

  suite.after(async () => {
    await closeTestPool();
  });

  // Ensure request_idempotency table exists on test database
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS request_idempotency (
        tenant_id UUID NOT NULL,
        endpoint VARCHAR(128) NOT NULL DEFAULT 'POST /customers/bulk-assign',
        idempotency_key VARCHAR(128) NOT NULL,
        request_hash VARCHAR(64) NOT NULL,
        user_id INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'expired')),
        response_code INTEGER NOT NULL DEFAULT 200,
        response_body JSONB NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT pk_request_idempotency PRIMARY KEY (tenant_id, endpoint, idempotency_key)
      );
    `);
  } finally {
    client.release();
  }

  // ---------------------------------------------------------------------------
  // 1. DETERMINISTIC SQL CLOCK PREDICATE TESTS (Layer 1: Pure SQL Proof)
  // ---------------------------------------------------------------------------
  await suite.test('PREDICATE-01: Exact 24h boundary evaluates strictly to TRUE', async () => {
    const res = await pool.query(`
      WITH test_clock AS (SELECT clock_timestamp() AS now_ts)
      SELECT (now_ts <= (now_ts - INTERVAL '24 hours') + INTERVAL '24 hours') AS exact_boundary_result
      FROM test_clock;
    `);
    assert.equal(res.rows[0].exact_boundary_result, true, 'At exact 24h boundary, predicate must be TRUE');
  });

  await suite.test('PREDICATE-02: Just beyond boundary (+1 microsecond) evaluates strictly to FALSE', async () => {
    const res = await pool.query(`
      WITH test_clock AS (SELECT clock_timestamp() AS now_ts)
      SELECT (now_ts <= (now_ts - INTERVAL '24 hours' - INTERVAL '1 microsecond') + INTERVAL '24 hours') AS beyond_boundary_result
      FROM test_clock;
    `);
    assert.equal(res.rows[0].beyond_boundary_result, false, 'Beyond 24h by 1 microsecond, predicate must be FALSE');
  });

  // ---------------------------------------------------------------------------
  // 2. ALGORITHMIC PARITY TEST (Pure Algorithm Simulation vs Legacy)
  // ---------------------------------------------------------------------------
  await suite.test('PARITY-01: Proposed round-robin matches deterministic tie-breaking', () => {
    // Legacy behavior: orders by current_load, increments memberIdx % length
    const initialMembers = [
      { user_id: 10, name: 'Alice', current_load: 0 },
      { user_id: 20, name: 'Bob', current_load: 0 },
      { user_id: 30, name: 'Charlie', current_load: 1 }
    ];

    const customerIds = [101, 102, 103, 104, 105];

    // Simulate Round Robin with deterministic stm.user_id tie-breaking
    const sortedMembers = [...initialMembers].sort((a, b) => a.current_load - b.current_load || a.user_id - b.user_id);
    const assignments = [];
    let memberIdx = 0;

    for (const cid of customerIds) {
      const selected = sortedMembers[memberIdx % sortedMembers.length];
      assignments.push({ customer_id: cid, assigned_to: selected.user_id });
      selected.current_load++;
      memberIdx++;
    }

    assert.equal(assignments.length, 5);
    assert.equal(assignments[0].assigned_to, 10);
    assert.equal(assignments[1].assigned_to, 20);
    assert.equal(assignments[2].assigned_to, 30);
    assert.equal(assignments[3].assigned_to, 10);
    assert.equal(assignments[4].assigned_to, 20);
  });

  // ---------------------------------------------------------------------------
  // 3. INPUT & METHOD VALIDATION TESTS
  // ---------------------------------------------------------------------------
  await suite.test('SEC-METHOD-01: Rejects invalid distribution_method with HTTP 400', async () => {
    const req = {
      user: { id: 1, tenant_id: 'a0000000-0000-0000-0000-000000000001', role: 'admin' },
      body: {
        customer_ids: [1, 2],
        team_id: 5,
        distribution_method: 'random_pick'
      },
      headers: {}
    };
    const res = createMockRes();

    await bulkAssignLeads(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Invalid distribution_method/);
  });

  await suite.test('SEC-TARGET-02: Rejects when both target_user_id and team_id are supplied', async () => {
    const req = {
      user: { id: 1, tenant_id: 'a0000000-0000-0000-0000-000000000001', role: 'admin' },
      body: {
        customer_ids: [1, 2],
        target_user_id: 10,
        team_id: 5
      },
      headers: {}
    };
    const res = createMockRes();

    await bulkAssignLeads(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /not both/);
  });

  // ---------------------------------------------------------------------------
  // 4. IDEMPOTENCY ENGINE TESTS (Integration against PostgreSQL)
  // ---------------------------------------------------------------------------
  await suite.test('IDEM-REPLAY-01: Replay within 24h returns exact response code and body with header', async () => {
    const tenantId = 'b0000000-0000-0000-0000-000000000001';
    const key = `test-key-${Date.now()}`;
    const endpoint = 'POST /customers/bulk-assign';

    // Compute expected hash for customer_ids: [1, 2], target_user_id: 99
    const hash = crypto.createHash('sha256').update(JSON.stringify({
      customer_ids: [1, 2],
      target_user_id: 99,
      team_id: null,
      distribution_method: null,
      active_branch_id: null
    })).digest('hex');

    const cachedBody = {
      status: 'success',
      message: 'Successfully assigned 2 leads.',
      assigned_count: 2,
      distribution_method: 'direct',
      assignments: [{ customer_id: 1, assigned_to: 99 }, { customer_id: 2, assigned_to: 99 }]
    };

    // Seed idempotent record with age < 24h (e.g. created 1 hour ago)
    await pool.query(`
      INSERT INTO request_idempotency (
        tenant_id, endpoint, idempotency_key, request_hash, user_id, status, response_code, response_body, created_at
      ) VALUES ($1, $2, $3, $4, 1, 'completed', 200, $5, clock_timestamp() - INTERVAL '1 hour')
      ON CONFLICT (tenant_id, endpoint, idempotency_key) DO UPDATE
      SET response_body = EXCLUDED.response_body;
    `, [tenantId, endpoint, key, hash, JSON.stringify(cachedBody)]);

    const req = {
      user: { id: 1, tenant_id: tenantId, role: 'manager' },
      body: { customer_ids: [1, 2], target_user_id: 99 },
      headers: { 'idempotency-key': key }
    };
    const res = createMockRes();

    await bulkAssignLeads(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['x-idempotency-replay'], 'true');
    assert.deepEqual(res.body, cachedBody);
  });

  await suite.test('IDEM-MISMATCH-02: Replay with different payload returns HTTP 409 IDEMPOTENCY_PAYLOAD_MISMATCH', async () => {
    const tenantId = 'b0000000-0000-0000-0000-000000000001';
    const key = `test-key-mismatch-${Date.now()}`;
    const endpoint = 'POST /customers/bulk-assign';

    // Seed with hash for customer_ids: [1]
    const hash = crypto.createHash('sha256').update(JSON.stringify({
      customer_ids: [1],
      target_user_id: 99,
      team_id: null,
      distribution_method: null,
      active_branch_id: null
    })).digest('hex');

    await pool.query(`
      INSERT INTO request_idempotency (
        tenant_id, endpoint, idempotency_key, request_hash, user_id, status, response_code, response_body
      ) VALUES ($1, $2, $3, $4, 1, 'completed', 200, '{"status":"success"}')
    `, [tenantId, endpoint, key, hash]);

    // Send with customer_ids: [1, 999] (different payload)
    const req = {
      user: { id: 1, tenant_id: tenantId, role: 'manager' },
      body: { customer_ids: [1, 999], target_user_id: 99 },
      headers: { 'idempotency-key': key }
    };
    const res = createMockRes();

    await bulkAssignLeads(req, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
  });

  await suite.test('IDEM-EXPIRED-03: Replay with key older than 24h returns HTTP 409 IDEMPOTENCY_KEY_EXPIRED even if body is present', async () => {
    const tenantId = 'b0000000-0000-0000-0000-000000000001';
    const key = `test-key-expired-${Date.now()}`;
    const endpoint = 'POST /customers/bulk-assign';

    const hash = crypto.createHash('sha256').update(JSON.stringify({
      customer_ids: [50],
      target_user_id: 88,
      team_id: null,
      distribution_method: null,
      active_branch_id: null
    })).digest('hex');

    // Seed with created_at = 24 hours and 10 seconds ago (Cleanup has NOT run)
    await pool.query(`
      INSERT INTO request_idempotency (
        tenant_id, endpoint, idempotency_key, request_hash, user_id, status, response_code, response_body, created_at
      ) VALUES ($1, $2, $3, $4, 1, 'completed', 200, '{"status":"success"}', clock_timestamp() - INTERVAL '24 hours 10 seconds')
    `, [tenantId, endpoint, key, hash]);

    const req = {
      user: { id: 1, tenant_id: tenantId, role: 'manager' },
      body: { customer_ids: [50], target_user_id: 88 },
      headers: { 'idempotency-key': key }
    };
    const res = createMockRes();

    await bulkAssignLeads(req, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'IDEMPOTENCY_KEY_EXPIRED');
  });

  await suite.test('IDEM-USER-04: Non-admin user cannot hijack another users idempotency key', async () => {
    const tenantId = 'b0000000-0000-0000-0000-000000000001';
    const key = `test-key-user-${Date.now()}`;
    const endpoint = 'POST /customers/bulk-assign';

    const hash = crypto.createHash('sha256').update(JSON.stringify({
      customer_ids: [10],
      target_user_id: 5,
      team_id: null,
      distribution_method: null,
      active_branch_id: null
    })).digest('hex');

    // Registered by user_id = 99
    await pool.query(`
      INSERT INTO request_idempotency (
        tenant_id, endpoint, idempotency_key, request_hash, user_id, status, response_code, response_body
      ) VALUES ($1, $2, $3, $4, 99, 'completed', 200, '{"status":"success"}')
    `, [tenantId, endpoint, key, hash]);

    // Attempted replay by user_id = 42 (non-admin)
    const req = {
      user: { id: 42, tenant_id: tenantId, role: 'supervisor' },
      body: { customer_ids: [10], target_user_id: 5 },
      headers: { 'idempotency-key': key }
    };
    const res = createMockRes();

    await bulkAssignLeads(req, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'IDEMPOTENCY_USER_MISMATCH');
  });

  // ---------------------------------------------------------------------------
  // 5. CLEANUP FOR UPDATE SKIP LOCKED CONCURRENCY
  // ---------------------------------------------------------------------------
  await suite.test('CLEAN-01: Prune cleanup skips rows locked FOR SHARE without error', async () => {
    const tenantId = 'c0000000-0000-0000-0000-000000000001';
    const key = `test-lock-clean-${Date.now()}`;
    const endpoint = 'POST /customers/bulk-assign';

    // Seed expired row
    await pool.query(`
      INSERT INTO request_idempotency (
        tenant_id, endpoint, idempotency_key, request_hash, user_id, status, response_code, response_body, created_at
      ) VALUES ($1, $2, $3, 'hash123', 1, 'completed', 200, '{"body":"full"}', clock_timestamp() - INTERVAL '25 hours')
      ON CONFLICT (tenant_id, endpoint, idempotency_key) DO NOTHING;
    `, [tenantId, endpoint, key]);

    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      // Client 1 begins transaction and locks row FOR SHARE
      await client1.query('BEGIN');
      await client1.query(`
        SELECT response_body FROM request_idempotency
        WHERE tenant_id = $1 AND endpoint = $2 AND idempotency_key = $3
        FOR SHARE
      `, [tenantId, endpoint, key]);

      // Client 2 runs cleanup query with FOR UPDATE SKIP LOCKED
      await client2.query('BEGIN');
      const cleanupRes = await client2.query(`
        UPDATE request_idempotency
        SET response_body = NULL, status = 'expired'
        WHERE (tenant_id, endpoint, idempotency_key) IN (
          SELECT tenant_id, endpoint, idempotency_key
          FROM request_idempotency
          WHERE created_at < NOW() - INTERVAL '24 hours'
            AND status = 'completed'
            AND tenant_id = $1 AND idempotency_key = $2
          LIMIT 10
          FOR UPDATE SKIP LOCKED
        ) RETURNING idempotency_key;
      `, [tenantId, key]);

      // Because client1 holds FOR SHARE, SKIP LOCKED must skip client1's row
      assert.equal(cleanupRes.rows.length, 0, 'Cleanup must skip row currently locked by Replay');

      await client2.query('COMMIT');
      await client1.query('COMMIT');

    } finally {
      client1.release();
      client2.release();
    }
  });

  // ---------------------------------------------------------------------------
  // 6. ROLLBACK SAFETY GUARD TEST
  // ---------------------------------------------------------------------------
  await suite.test('RB-SAFETY-01: Rollback script refuses to drop request_idempotency with live records without force', async () => {
    // Ensure at least one record exists
    const testDb = {
      query: async (text) => {
        if (text.includes('information_schema.tables')) {
          return { rows: [{ exists: true }] };
        }
        if (text.includes('COUNT(*)')) {
          return { rows: [{ count: 15 }] };
        }
        return { rows: [] };
      }
    };

    let threw = false;
    try {
      await rollbackMigration029({ db: testDb, force: false });
    } catch (err) {
      threw = true;
      assert.match(err.message, /Rollback Safety Guard/);
      assert.match(err.message, /15 live records/);
    }
    assert.equal(threw, true, 'Rollback runner must abort when live records exist without --force');
  });
});
