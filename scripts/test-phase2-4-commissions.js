/**
 * test-phase2-4-commissions.js
 * Verification test suite for Phase 2.4: Real Estate Agent / Broker Commissions
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const reCommissionsController = require('../controllers/reCommissionsController');

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
  console.log('🚀 RUNNING PHASE 2.4 REAL ESTATE COMMISSIONS TEST SUITE');
  console.log('=================================================================\n');

  const tenantA = '00000000-0000-0000-0000-000000000001';
  const tenantB = '00000000-0000-0000-0000-000000000099';

  let customerId, unitId, dealId;

  try {
    // 1. Setup DB records
    const custRes = await pool.query(
      `INSERT INTO customers (name, email, phone, tenant_id) VALUES ('Comm Buyer', 'comm@re.test', '01000000003', $1) RETURNING id`,
      [tenantA]
    );
    customerId = custRes.rows[0].id;

    const unitRes = await pool.query(
      `INSERT INTO re_units (name, unit_number, project_name, price, status, tenant_id)
       VALUES ('Unit Comm-1', 'CM-101', 'Commission Heights', 2000000.00, 'Available', $1) RETURNING id`,
      [tenantA]
    );
    unitId = unitRes.rows[0].id;

    const dealRes = await pool.query(
      `INSERT INTO deals (title, value, pipeline_stage, client_id, unit_id, tenant_id)
       VALUES ('Deal Commission Unit', 2000000.00, 'Won', $1, $2, $3) RETURNING id`,
      [customerId, unitId, tenantA]
    );
    dealId = dealRes.rows[0].id;

    const userA = { tenant_id: tenantA, role: 'admin', username: 'admin_a', name: 'Agent Ahmed' };
    const userB = { tenant_id: tenantB, role: 'admin', username: 'admin_b', name: 'Agent B' };

    console.log('--- 1. Commission Validation & Creation ---');
    // Test 1: Missing deal_id fails
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        body: { beneficiary_name: 'Broker XYZ' }
      });
      await reCommissionsController.createCommission(req, res);
      assert(getStatus() === 400, 'Rejects creation without deal_id (400)');
    }

    // Test 2: Percentage commission calculation (2.5% of 2,000,000 = 50,000)
    let commId1 = null;
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        body: {
          deal_id: dealId,
          beneficiary_type: 'internal_agent',
          beneficiary_name: 'Agent Ahmed',
          commission_type: 'percentage',
          rate: 2.5000,
          base_amount: 2000000.00
        }
      });
      await reCommissionsController.createCommission(req, res);
      const data = getData()?.data;
      commId1 = data?.id;
      assert(getStatus() === 201, 'Creates percentage commission (201)');
      assert(parseFloat(data?.calculated_amount) === 50000.00, 'Calculates 2.5% of 2,000,000 = 50,000.00 EGP');
      assert(data?.status === 'Pending', 'Initial status is Pending');
    }

    // Test 3: Fixed commission creation
    let commId2 = null;
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        body: {
          deal_id: dealId,
          beneficiary_type: 'broker',
          beneficiary_name: 'External Broker Y',
          commission_type: 'fixed',
          calculated_amount: 15000.00
        }
      });
      await reCommissionsController.createCommission(req, res);
      const data = getData()?.data;
      commId2 = data?.id;
      assert(getStatus() === 201, 'Creates fixed commission (201)');
      assert(parseFloat(data?.calculated_amount) === 15000.00, 'Calculated amount matches fixed value 15,000.00');
    }

    // Test 4: Query commissions list & summary
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        query: { deal_id: dealId }
      });
      await reCommissionsController.getCommissions(req, res);
      const summary = getData()?.summary;
      assert(getStatus() === 200, 'Fetches commissions for deal (200)');
      assert(summary?.total_commissions === 65000.00, 'Total commissions sum is 65,000.00 (50k + 15k)');
      assert(summary?.total_pending === 65000.00, 'Total pending sum is 65,000.00');
    }

    console.log('\n--- 2. Commission Approval & Payout Lifecycle ---');
    // Test 5: Cannot pay while still Pending
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        params: { id: commId1 },
        body: { amount: 25000.00 }
      });
      await reCommissionsController.payCommission(req, res);
      assert(getStatus() === 400, 'Rejects payment for unapproved (Pending) commission (400)');
    }

    // Test 6: Approve commission
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        params: { id: commId1 },
        body: { status: 'Approved' }
      });
      await reCommissionsController.updateCommissionStatus(req, res);
      assert(getStatus() === 200, 'Approves commission (200)');
      assert(getData()?.data?.status === 'Approved', 'Status updated to Approved');
      assert(getData()?.data?.approval_date !== null, 'approval_date recorded');
    }

    // Test 7: Overpaying commission fails
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        params: { id: commId1 },
        body: { amount: 60000.00 }
      });
      await reCommissionsController.payCommission(req, res);
      assert(getStatus() === 400, 'Rejects payout exceeding commission total (400)');
    }

    // Test 8: Partial payout
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        params: { id: commId1 },
        body: { amount: 20000.00 }
      });
      await reCommissionsController.payCommission(req, res);
      assert(getStatus() === 200, 'Records partial payout of 20,000 (200)');
      assert(getData()?.data?.status === 'Partially Paid', 'Status is Partially Paid');
      assert(parseFloat(getData()?.data?.paid_amount) === 20000.00, 'paid_amount is 20,000');
    }

    // Test 9: Complete payout
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        params: { id: commId1 },
        body: { amount: 30000.00 }
      });
      await reCommissionsController.payCommission(req, res);
      assert(getStatus() === 200, 'Records final payout of 30,000 (200)');
      assert(getData()?.data?.status === 'Paid', 'Status is Paid');
      assert(parseFloat(getData()?.data?.paid_amount) === 50000.00, 'paid_amount reaches 50,000');
      assert(getData()?.data?.payment_date !== null, 'payment_date recorded');
    }

    // Test 10: Cannot modify a fully paid commission
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        params: { id: commId1 },
        body: { status: 'Cancelled' }
      });
      await reCommissionsController.updateCommissionStatus(req, res);
      assert(getStatus() === 400, 'Rejects status modification of fully paid commission (400)');
    }

    // Test 11: Cancellation on second commission
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        params: { id: commId2 },
        body: { status: 'Cancelled' }
      });
      await reCommissionsController.updateCommissionStatus(req, res);
      assert(getStatus() === 200 && getData()?.data?.status === 'Cancelled', 'Transitions Pending -> Cancelled (200)');
    }

    console.log('\n--- 3. Multi-Tenant Isolation ---');
    // Test 12: Tenant B cannot view Tenant A commissions
    {
      const { req, res, getData } = createMockReqRes({
        user: userB,
        query: { deal_id: dealId }
      });
      await reCommissionsController.getCommissions(req, res);
      assert(getData()?.data?.length === 0, 'Tenant B sees 0 commissions (tenant isolation)');
    }

    // Test 13: Tenant B cannot pay Tenant A commission
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userB,
        params: { id: commId1 },
        body: { amount: 1000 }
      });
      await reCommissionsController.payCommission(req, res);
      assert(getStatus() === 404, 'Tenant B receives 404 attempting to pay Tenant A commission');
    }

    console.log('\n=================================================================');
    console.log(`TOTAL PASSED: ${passedTests}`);
    console.log(`TOTAL FAILED: ${failedTests}`);
    console.log('=================================================================');

    // Clean up test data
    await pool.query(`DELETE FROM re_commissions WHERE id IN ($1, $2)`, [commId1, commId2]);
    await pool.query(`DELETE FROM deals WHERE id = $1`, [dealId]);
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
