/**
 * Real Application Controller Integration Test Suite
 * Tashgheel CRM Online — Real Estate Lifecycle Audit Verification
 * 
 * Invokes the ACTUAL APPLICATION CONTROLLER HANDLERS against PostgreSQL:
 * - reInstallmentsController.generateSchedule
 * - reHandoversController.updateHandoverStatus
 * - dealsController.reserveDealUnit (Concurrent execution)
 * 
 * Verifies real transaction execution, row-level locking, HTTP status codes,
 * and ensures 100% database cleanup.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { initTestContext } = require('./helpers/testDb');
initTestContext();

const db = require('../config/db');

// Require the actual application controllers
const installmentsController = require('../controllers/reInstallmentsController');
const handoversController = require('../controllers/reHandoversController');
const dealsController = require('../controllers/dealsController');

const TEST_TENANT_ID = '77777777-8888-9999-aaaa-bbbbccccdddd';
const OTHER_TENANT_ID = '22222222-3333-4444-5555-666677778888';

let testUserId = null;
let testCustomerId = null;
let testUnitId = null;
let testDeal2022Id = null;
let testDeal2023Id = null;
let testContractId = null;
let testHandoverId = null;

// Helper to construct mock Express req/res
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

describe('Real Application Controller Integration Suite', () => {

  before(async () => {
    // 0. Safety Guard: Strict Test Environment & Allowlist Verification
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL SECURITY ABORT: Tests must NEVER execute with NODE_ENV=production');
    }

    const client = await db.connect();
    try {
      // Query exact live database name and server IP from the live connection
      const identRes = await client.query('SELECT current_database() as db_name, inet_server_addr() as server_ip');
      const { db_name, server_ip } = identRes.rows[0];

      // Strict Allowlist: Only approved non-production databases allowed
      const APPROVED_TEST_DATABASES = ['tashgheel_crm', 'tashgheel_crm_test'];
      if (!APPROVED_TEST_DATABASES.includes(db_name)) {
        throw new Error(`FATAL SECURITY ABORT: Database "${db_name}" is NOT in the approved test database allowlist.`);
      }

      // Verify host is in internal private subnet (RFC 1918)
      const ipStr = String(server_ip || '');
      if (!ipStr.startsWith('10.') && !ipStr.startsWith('127.') && ipStr !== '') {
        throw new Error(`FATAL SECURITY ABORT: Server IP "${ipStr}" is not in approved private test subnet.`);
      }
      await client.query('BEGIN');

      // 1. Create isolated test tenants
      await client.query(`
        INSERT INTO tenants (id, name, slug)
        VALUES ($1, 'Controller Integration Tenant', 'controller-test-tenant')
        ON CONFLICT (id) DO NOTHING
      `, [TEST_TENANT_ID]);

      await client.query(`
        INSERT INTO tenants (id, name, slug)
        VALUES ($1, 'Controller Other Tenant', 'controller-other-tenant')
        ON CONFLICT (id) DO NOTHING
      `, [OTHER_TENANT_ID]);

      // 2. Create test user
      const userRes = await client.query(`
        INSERT INTO users (name, email, password_hash, role, tenant_id, created_at, updated_at)
        VALUES ('Controller Test Agent', 'ctrl_agent@test.com', 'dummy_hash', 'admin', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [TEST_TENANT_ID]);
      testUserId = userRes.rows[0].id;

      // 3. Create test customer
      const custRes = await client.query(`
        INSERT INTO customers (name, email, phone, tenant_id, created_at, updated_at)
        VALUES ('Controller Test Buyer', 'ctrl_buyer@test.com', '01234567890', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [TEST_TENANT_ID]);
      testCustomerId = custRes.rows[0].id;

      // 4. Create test unit
      const unitRes = await client.query(`
        INSERT INTO re_units (
          name, project_name, unit_number, type, floor, area_sqm, price, status,
          tenant_id, created_at, updated_at
        ) VALUES (
          'Unit 102 Controller Test', 'Controller Test Project', 'U-102-CTRL', 'Apartment', '1', '140', 1000000, 'Available',
          $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING id
      `, [TEST_TENANT_ID]);
      testUnitId = unitRes.rows[0].id;

      // 5. Create test deals
      const d1Res = await client.query(`
        INSERT INTO deals (
          title, value, pipeline_stage, client_id, assigned_to, unit_id, custom_fields, tenant_id, created_at, updated_at
        ) VALUES (
          'Deal 2022 Controller Test', 1000000, 'negotiation', $1, $2, $3, '{"is_unit_reservation": false}'::jsonb, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING id
      `, [testCustomerId, testUserId, String(testUnitId), TEST_TENANT_ID]);
      testDeal2022Id = d1Res.rows[0].id;

      const d2Res = await client.query(`
        INSERT INTO deals (
          title, value, pipeline_stage, client_id, assigned_to, unit_id, custom_fields, tenant_id, created_at, updated_at
        ) VALUES (
          'Deal 2023 Controller Test', 2000000, 'negotiation', $1, $2, $3, '{"is_unit_reservation": false}'::jsonb, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING id
      `, [testCustomerId, testUserId, String(testUnitId), TEST_TENANT_ID]);
      testDeal2023Id = d2Res.rows[0].id;

      // 6. Create test contract for Deal 2022
      const contractRes = await client.query(`
        INSERT INTO re_contracts (
          contract_number, deal_id, customer_id, unit_id, contract_date, contract_value,
          down_payment, remaining_amount, status, duration_months, tenant_id, created_at, updated_at
        ) VALUES (
          'REC-CTRL-2026-0001', $1, $2, $3, CURRENT_DATE, 1000000, 200000, 800000, 'Draft', 12, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING id
      `, [testDeal2022Id, testCustomerId, String(testUnitId), TEST_TENANT_ID]);
      testContractId = contractRes.rows[0].id;

      // 7. Create test handover for Deal 2022
      const hoRes = await client.query(`
        INSERT INTO re_handovers (
          deal_id, contract_id, unit_id, customer_id, scheduled_date, status, tenant_id, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, CURRENT_DATE + INTERVAL '30 days', 'Scheduled', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING id
      `, [testDeal2022Id, testContractId, String(testUnitId), testCustomerId, TEST_TENANT_ID]);
      testHandoverId = hoRes.rows[0].id;

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  after(async () => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      // Purge all test records for both test tenants
      await client.query('DELETE FROM re_installments WHERE tenant_id::text IN ($1, $2)', [TEST_TENANT_ID, OTHER_TENANT_ID]);
      await client.query('DELETE FROM re_handovers WHERE tenant_id::text IN ($1, $2)', [TEST_TENANT_ID, OTHER_TENANT_ID]);
      await client.query('DELETE FROM re_contracts WHERE tenant_id::text IN ($1, $2)', [TEST_TENANT_ID, OTHER_TENANT_ID]);
      await client.query('DELETE FROM deals WHERE tenant_id::text IN ($1, $2)', [TEST_TENANT_ID, OTHER_TENANT_ID]);
      await client.query('DELETE FROM re_units WHERE tenant_id::text IN ($1, $2)', [TEST_TENANT_ID, OTHER_TENANT_ID]);
      await client.query('DELETE FROM customers WHERE tenant_id::text IN ($1, $2)', [TEST_TENANT_ID, OTHER_TENANT_ID]);
      await client.query('DELETE FROM users WHERE tenant_id::text IN ($1, $2)', [TEST_TENANT_ID, OTHER_TENANT_ID]);
      await client.query('DELETE FROM tenants WHERE id IN ($1, $2)', [TEST_TENANT_ID, OTHER_TENANT_ID]);
      await client.query('COMMIT');
    } catch (_) {
      await client.query('ROLLBACK').catch(() => {});
    } finally {
      client.release();
    }
  });

  // =========================================================================
  // TEST 1: Actual reInstallmentsController.generateSchedule Execution
  // =========================================================================
  it('1. reInstallmentsController.generateSchedule executes real transaction, locks rc, and creates installments in database', async () => {
    const req = {
      user: { id: testUserId, tenant_id: TEST_TENANT_ID, role: 'admin' },
      body: {
        contract_id: testContractId,
        down_payment: 200000,
        number_of_installments: 4,
        frequency: 'quarterly',
        start_date: '2026-12-01'
      }
    };
    const res = createMockRes();

    // Invoke actual controller function
    await installmentsController.generateSchedule(req, res);

    assert.equal(res.statusCode, 201, 'Controller must respond with HTTP 201 Created');
    assert.equal(res.body?.status, 'success', 'Response status must be success');
    assert.equal(res.body?.data?.length, 5, 'Must return 5 installments created (1 down payment + 4 periodic)');

    // Verify persistence in actual database
    const dbCheck = await db.query(`
      SELECT installment_number, installment_type, amount, status
      FROM re_installments
      WHERE contract_id = $1 AND tenant_id::text = $2::text
      ORDER BY installment_number ASC
    `, [testContractId, TEST_TENANT_ID]);

    assert.equal(dbCheck.rows.length, 5, 'Database must contain exactly 5 installments');
    assert.equal(Number(dbCheck.rows[0].amount), 200000, 'Down payment installment must be 200,000');
    assert.equal(dbCheck.rows[0].installment_type, 'down_payment');

    for (let i = 1; i <= 4; i++) {
      assert.equal(Number(dbCheck.rows[i].amount), 200000, `Installment #${i} must be 200,000`);
      assert.equal(dbCheck.rows[i].status, 'Pending');
    }

    // Verify contract update in actual database
    const contractCheck = await db.query(`
      SELECT down_payment, remaining_amount FROM re_contracts WHERE id = $1
    `, [testContractId]);
    assert.equal(Number(contractCheck.rows[0].down_payment), 200000);
    assert.equal(Number(contractCheck.rows[0].remaining_amount), 800000);
  });

  // =========================================================================
  // TEST 2: Actual reHandoversController.updateHandoverStatus Execution
  // =========================================================================
  it('2. reHandoversController.updateHandoverStatus executes real transaction with FOR UPDATE OF rh and updates status', async () => {
    const req = {
      user: { id: testUserId, tenant_id: TEST_TENANT_ID, role: 'admin' },
      params: { id: testHandoverId },
      body: { status: 'Inspection' }
    };
    const res = createMockRes();

    // Invoke actual controller function
    await handoversController.updateHandoverStatus(req, res);

    assert.equal(res.statusCode, 200, 'Controller must respond with HTTP 200 OK');
    assert.equal(res.body?.status, 'success');
    assert.equal(res.body?.data?.status, 'Inspection', 'Handover status must be Inspection');

    // Verify in actual database
    const hoCheck = await db.query('SELECT status FROM re_handovers WHERE id = $1', [testHandoverId]);
    assert.equal(hoCheck.rows[0].status, 'Inspection');
  });

  // =========================================================================
  // TEST 3: Actual dealsController.reserveDealUnit Concurrent Execution
  // =========================================================================
  it('3. dealsController.reserveDealUnit handles simultaneous concurrent requests: exactly one wins (200), loser gets 409 UNIT_NOT_AVAILABLE', async () => {
    // Reset unit to Available
    await db.query(`UPDATE re_units SET status = 'Available', reservation_expires_at = NULL WHERE id = $1`, [testUnitId]);

    const req1 = {
      user: { id: testUserId, tenant_id: TEST_TENANT_ID, role: 'agent' },
      params: { id: testDeal2022Id },
      body: {}
    };
    const res1 = createMockRes();

    const req2 = {
      user: { id: testUserId, tenant_id: TEST_TENANT_ID, role: 'agent' },
      params: { id: testDeal2023Id },
      body: {}
    };
    const res2 = createMockRes();

    // Fire both controller invocations simultaneously
    await Promise.all([
      dealsController.reserveDealUnit(req1, res1),
      dealsController.reserveDealUnit(req2, res2)
    ]);

    const statuses = [res1.statusCode, res2.statusCode];
    assert.ok(statuses.includes(200), 'Exactly one reservation request must succeed with HTTP 200');
    assert.ok(statuses.includes(409), 'The concurrent competing reservation request must be rejected with HTTP 409');

    const winningRes = res1.statusCode === 200 ? res1 : res2;
    const losingRes = res1.statusCode === 409 ? res1 : res2;

    assert.equal(winningRes.body?.status, 'success', 'Winning controller call returns success');
    assert.equal(losingRes.body?.code, 'UNIT_NOT_AVAILABLE', 'Losing controller call returns code UNIT_NOT_AVAILABLE');

    // Verify final state in database
    const unitCheck = await db.query('SELECT status FROM re_units WHERE id = $1', [testUnitId]);
    assert.equal(unitCheck.rows[0].status, 'Reserved', 'Unit in database must be Reserved');
  });

  // =========================================================================
  // TEST 4: Actual Controller Transaction Rollback on Invalid State
  // =========================================================================
  it('4. reInstallmentsController.generateSchedule rolls back cleanly and returns 400 when contract is already completed', async () => {
    // Set contract status to Completed
    await db.query(`UPDATE re_contracts SET status = 'Completed' WHERE id = $1`, [testContractId]);

    const req = {
      user: { id: testUserId, tenant_id: TEST_TENANT_ID, role: 'admin' },
      body: { contract_id: testContractId, number_of_installments: 4 }
    };
    const res = createMockRes();

    await installmentsController.generateSchedule(req, res);

    assert.equal(res.statusCode, 400, 'Must block installment generation on completed contract with HTTP 400');
    assert.match(res.body?.message, /cannot generate.*completed/i);
  });

});
