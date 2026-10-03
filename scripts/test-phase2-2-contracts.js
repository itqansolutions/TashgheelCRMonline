/**
 * test-phase2-2-contracts.js
 * Verification test suite for Phase 2.2: Real Estate Sales Contract Lifecycle.
 *
 * Tests:
 * 1. Contract creation with automatic number generation and remaining calculation.
 * 2. Financial calculation precision (contract_value - down_payment = remaining_amount).
 * 3. Enforces 1:1 Deal-Contract relationship (rejects duplicate contract for same deal).
 * 4. Contract lifecycle state machine:
 *    - Draft -> Generated -> Signed -> Active -> Completed
 *    - Rejects invalid state transitions (e.g., Draft -> Active directly).
 *    - Allows transition to Cancelled from non-terminal states.
 *    - Enforces terminal states (Completed and Cancelled cannot transition).
 * 5. Multi-tenant isolation (Tenant B cannot access or update Tenant A contracts).
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const reContractsController = require('../controllers/reContractsController');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedTests++;
  }
}

// Mock Express req/res
function createMockReqRes({ user, body = {}, params = {}, query = {} }) {
  const req = { user, body, params, query };
  let responseData = null;
  let statusCode = 200;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };

  return { req, res, getStatus: () => statusCode, getData: () => responseData };
}

async function runTests() {
  console.log('=================================================================');
  console.log('🚀 RUNNING PHASE 2.2 REAL ESTATE CONTRACT TEST SUITE');
  console.log('=================================================================\n');

  const tenantA = '00000000-0000-0000-0000-000000000001';
  const tenantB = '00000000-0000-0000-0000-000000000099';

  try {
    // Setup test customer, unit, and deals in DB
    const custRes = await pool.query(
      `INSERT INTO customers (name, email, phone, tenant_id) VALUES ('Contract Buyer Test', 'buyer-test@re.test', '01000000001', $1) RETURNING id`,
      [tenantA]
    );
    const customerId = custRes.rows[0].id;

    const unitRes = await pool.query(
      `INSERT INTO re_units (name, unit_number, project_name, price, status, tenant_id)
       VALUES ('Unit C-101', 'C-101', 'Contract Tower', 2500000.50, 'Available', $1) RETURNING id`,
      [tenantA]
    );
    const unitId = unitRes.rows[0].id;

    const dealRes1 = await pool.query(
      `INSERT INTO deals (title, value, pipeline_stage, client_id, unit_id, tenant_id)
       VALUES ('Deal Unit C-101', 2500000.50, 'Reserved', $1, $2, $3) RETURNING id`,
      [customerId, unitId, tenantA]
    );
    const dealId1 = dealRes1.rows[0].id;

    const dealRes2 = await pool.query(
      `INSERT INTO deals (title, value, pipeline_stage, client_id, unit_id, tenant_id)
       VALUES ('Deal Unit C-101 Second', 2500000.50, 'Reserved', $1, $2, $3) RETURNING id`,
      [customerId, unitId, tenantA]
    );
    const dealId2 = dealRes2.rows[0].id;

    const userA = { tenant_id: tenantA, role: 'admin', username: 'admin_a' };
    const userB = { tenant_id: tenantB, role: 'admin', username: 'admin_b' };

    console.log('--- 1. Validation & Contract Creation ---');
    // Test 1: Missing deal_id should fail
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        body: { customer_id: customerId, contract_value: 2500000.50 }
      });
      await reContractsController.createContract(req, res);
      assert(getStatus() === 400, 'Fails with 400 if deal_id is missing');
    }

    // Test 2: Successful creation
    let contractId1 = null;
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        body: {
          deal_id: dealId1,
          customer_id: customerId,
          unit_id: unitId,
          contract_value: 2500000.50,
          down_payment: 500000.25,
          notes: 'Test sales contract 1'
        }
      });
      await reContractsController.createContract(req, res);
      const data = getData()?.data;
      contractId1 = data?.id;
      assert(getStatus() === 201, 'Creates contract with status 201');
      assert(data?.contract_number?.startsWith('REC-'), `Generates contract number (${data?.contract_number})`);
      assert(data?.status === 'Draft', 'Initial contract status is Draft');
      assert(parseFloat(data?.remaining_amount) === 2000000.25, 'Calculates remaining_amount with decimal precision (2000000.25)');
    }

    console.log('\n--- 2. Deal-Contract Uniqueness (1:1 Relationship) ---');
    // Test 3: Creating duplicate contract for the same deal should return 409
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        body: {
          deal_id: dealId1,
          customer_id: customerId,
          unit_id: unitId,
          contract_value: 2500000.50
        }
      });
      await reContractsController.createContract(req, res);
      assert(getStatus() === 409, 'Returns 409 Conflict when contract already exists for this deal');
    }

    console.log('\n--- 3. Contract State Machine & Lifecycle ---');
    // Test 4: Invalid jump: Draft -> Active directly should fail
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        params: { id: contractId1 },
        body: { status: 'Active' }
      });
      await reContractsController.updateContractStatus(req, res);
      assert(getStatus() === 400, 'Rejects invalid status jump Draft -> Active directly');
    }

    // Test 5: Valid transition: Draft -> Generated
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        params: { id: contractId1 },
        body: { status: 'Generated' }
      });
      await reContractsController.updateContractStatus(req, res);
      assert(getStatus() === 200 && getData()?.data?.status === 'Generated', 'Transitions Draft -> Generated');
    }

    // Test 6: Valid transition: Generated -> Signed
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        params: { id: contractId1 },
        body: { status: 'Signed' }
      });
      await reContractsController.updateContractStatus(req, res);
      assert(getStatus() === 200 && getData()?.data?.status === 'Signed', 'Transitions Generated -> Signed');
    }

    // Test 7: Valid transition: Signed -> Active
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        params: { id: contractId1 },
        body: { status: 'Active' }
      });
      await reContractsController.updateContractStatus(req, res);
      assert(getStatus() === 200 && getData()?.data?.status === 'Active', 'Transitions Signed -> Active');
    }

    // Test 8: Valid transition: Active -> Completed
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        params: { id: contractId1 },
        body: { status: 'Completed' }
      });
      await reContractsController.updateContractStatus(req, res);
      assert(getStatus() === 200 && getData()?.data?.status === 'Completed', 'Transitions Active -> Completed');
    }

    // Test 9: Terminal state check: Completed cannot transition to anything
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        params: { id: contractId1 },
        body: { status: 'Cancelled' }
      });
      await reContractsController.updateContractStatus(req, res);
      assert(getStatus() === 400, 'Rejects transition from terminal state Completed');
    }

    // Test 10: Cancellation lifecycle on second contract
    let contractId2 = null;
    {
      const { req, res, getData } = createMockReqRes({
        user: userA,
        body: {
          deal_id: dealId2,
          customer_id: customerId,
          unit_id: unitId,
          contract_value: 1800000,
          down_payment: 180000
        }
      });
      await reContractsController.createContract(req, res);
      contractId2 = getData()?.data?.id;

      const cancelReq = createMockReqRes({
        user: userA,
        params: { id: contractId2 },
        body: { status: 'Cancelled' }
      });
      await reContractsController.updateContractStatus(cancelReq.req, cancelReq.res);
      assert(cancelReq.getStatus() === 200 && cancelReq.getData()?.data?.status === 'Cancelled', 'Transitions Draft -> Cancelled successfully');

      // Terminal check for Cancelled
      const postCancelReq = createMockReqRes({
        user: userA,
        params: { id: contractId2 },
        body: { status: 'Draft' }
      });
      await reContractsController.updateContractStatus(postCancelReq.req, postCancelReq.res);
      assert(postCancelReq.getStatus() === 400, 'Rejects transition from terminal state Cancelled');
    }

    console.log('\n--- 4. Multi-Tenant Isolation ---');
    // Test 11: Tenant B cannot view Tenant A contracts
    {
      const { req, res, getData } = createMockReqRes({
        user: userB,
        query: {}
      });
      await reContractsController.getContracts(req, res);
      assert(getData()?.data?.length === 0, 'Tenant B sees 0 contracts (tenant isolation)');
    }

    // Test 12: Tenant B cannot update Tenant A contract status
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userB,
        params: { id: contractId1 },
        body: { status: 'Draft' }
      });
      await reContractsController.updateContractStatus(req, res);
      assert(getStatus() === 404, 'Tenant B receives 404 attempting to access Tenant A contract');
    }

    console.log('\n=================================================================');
    console.log(`TOTAL PASSED: ${passedTests}`);
    console.log(`TOTAL FAILED: ${failedTests}`);
    console.log('=================================================================');

    // Clean up test data safely by specific ID
    if (contractId1 || contractId2) {
      await pool.query(`DELETE FROM re_contracts WHERE id IN ($1, $2)`, [contractId1, contractId2]);
    }
    await pool.query(`DELETE FROM deals WHERE id IN ($1, $2)`, [dealId1, dealId2]);
    await pool.query(`DELETE FROM re_units WHERE id = $1`, [unitId]);
    await pool.query(`DELETE FROM customers WHERE id = $1`, [customerId]);

    if (failedTests > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Test suite error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTests();
