/**
 * test-phase2-5-cancellations.js
 * Verification test suite for Phase 2.5: Real Estate Cancellation & Refund
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const reCancellationsController = require('../controllers/reCancellationsController');

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
  console.log('🚀 RUNNING PHASE 2.5 REAL ESTATE CANCELLATIONS & REFUND TEST SUITE');
  console.log('=================================================================\n');

  const tenantA = '00000000-0000-0000-0000-000000000001';
  const tenantB = '00000000-0000-0000-0000-000000000099';

  let customerId, unitId, dealId, contractId, cancelId;

  try {
    // 1. Setup DB records: customer, unit (Reserved), deal, contract, paid installment
    const custRes = await pool.query(
      `INSERT INTO customers (name, email, phone, tenant_id) VALUES ('Cancel Buyer', 'cancel@re.test', '01000000004', $1) RETURNING id`,
      [tenantA]
    );
    customerId = custRes.rows[0].id;

    const unitRes = await pool.query(
      `INSERT INTO re_units (name, unit_number, project_name, price, status, reservation_expires_at, tenant_id)
       VALUES ('Unit Cancel-1', 'CN-101', 'Cancel Tower', 1500000.00, 'Reserved', NOW() + INTERVAL '2 days', $1) RETURNING id`,
      [tenantA]
    );
    unitId = unitRes.rows[0].id;

    const dealRes = await pool.query(
      `INSERT INTO deals (title, value, pipeline_stage, client_id, unit_id, tenant_id)
       VALUES ('Deal To Cancel', 1500000.00, 'Reserved', $1, $2, $3) RETURNING id`,
      [customerId, unitId, tenantA]
    );
    dealId = dealRes.rows[0].id;

    const contractRes = await pool.query(
      `INSERT INTO re_contracts (contract_number, deal_id, customer_id, unit_id, contract_value, down_payment, remaining_amount, status, tenant_id)
       VALUES ('REC-TEST-CANCEL-1', $1, $2, $3, 1500000.00, 150000.00, 1350000.00, 'Signed', $4) RETURNING id`,
      [dealId, customerId, unitId, tenantA]
    );
    contractId = contractRes.rows[0].id;

    // Add installment with 150,000 paid
    await pool.query(
      `INSERT INTO re_installments (contract_id, deal_id, installment_number, installment_type, due_date, amount, paid_amount, status, tenant_id)
       VALUES ($1, $2, 0, 'down_payment', CURRENT_DATE, 150000.00, 150000.00, 'Paid', $3)`,
      [contractId, dealId, tenantA]
    );

    const userA = { tenant_id: tenantA, role: 'admin', username: 'admin_a' };
    const userB = { tenant_id: tenantB, role: 'admin', username: 'admin_b' };

    console.log('--- 1. Validation & Cancellation Execution ---');
    // Test 1: Missing deal_id fails
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        body: { cancellation_reason: 'Buyer backing out' }
      });
      await reCancellationsController.processCancellation(req, res);
      assert(getStatus() === 400, 'Rejects cancellation without deal_id (400)');
    }

    // Test 2: Missing reason fails
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        body: { deal_id: dealId }
      });
      await reCancellationsController.processCancellation(req, res);
      assert(getStatus() === 400, 'Rejects cancellation without reason (400)');
    }

    // Test 3: Process cancellation with 30,000 deduction penalty
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        body: {
          deal_id: dealId,
          cancellation_reason: 'Buyer relocated abroad',
          deduction_amount: 30000.00,
          unit_action: 'release'
        }
      });
      await reCancellationsController.processCancellation(req, res);
      const data = getData()?.data;
      cancelId = data?.id;
      assert(getStatus() === 201, 'Processes cancellation successfully (201)');
      assert(parseFloat(data?.total_paid_amount) === 150000.00, 'Accurately detected total paid amount = 150,000.00');
      assert(parseFloat(data?.deduction_amount) === 30000.00, 'Recorded penalty deduction = 30,000.00');
      assert(parseFloat(data?.refundable_amount) === 120000.00, 'Calculated refundable amount = 120,000.00');
      assert(data?.refund_status === 'Pending', 'Initial refund status is Pending');
    }

    console.log('\n--- 2. Cascade Status Updates & Unit Release ---');
    // Test 4: Deal stage updated to Lost
    {
      const dCheck = await pool.query(`SELECT pipeline_stage FROM deals WHERE id = $1`, [dealId]);
      assert(dCheck.rows[0].pipeline_stage === 'Lost', 'Deal pipeline_stage changed to Lost');
    }

    // Test 5: Contract status updated to Cancelled
    {
      const cCheck = await pool.query(`SELECT status FROM re_contracts WHERE id = $1`, [contractId]);
      assert(cCheck.rows[0].status === 'Cancelled', 'Contract status changed to Cancelled');
    }

    // Test 6: Unit released to Available and dates cleared
    {
      const uCheck = await pool.query(`SELECT status, reservation_expires_at FROM re_units WHERE id = $1`, [unitId]);
      assert(uCheck.rows[0].status === 'Available', 'Unit status transitioned back to Available');
      assert(uCheck.rows[0].reservation_expires_at === null, 'Unit reservation timestamp cleared');
    }

    // Test 7: Duplicate cancellation prevention (409)
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        body: { deal_id: dealId, cancellation_reason: 'Duplicate attempt' }
      });
      await reCancellationsController.processCancellation(req, res);
      assert(getStatus() === 409, 'Rejects duplicate cancellation with 409 Conflict');
    }

    console.log('\n--- 3. Refund Workflow ---');
    // Test 8: Update refund status to Processed
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        params: { id: cancelId },
        body: { refund_status: 'Processed' }
      });
      await reCancellationsController.updateRefundStatus(req, res);
      assert(getStatus() === 200, 'Updates refund status to Processed (200)');
      assert(getData()?.data?.refund_status === 'Processed', 'Refund status verified as Processed');
      assert(getData()?.data?.refund_date !== null, 'Refund date recorded');
    }

    console.log('\n--- 4. Multi-Tenant Isolation ---');
    // Test 9: Tenant B sees 0 cancellations
    {
      const { req, res, getData } = createMockReqRes({
        user: userB,
        query: { deal_id: dealId }
      });
      await reCancellationsController.getCancellations(req, res);
      assert(getData()?.data?.length === 0, 'Tenant B sees 0 cancellations (tenant isolation)');
    }

    // Test 10: Tenant B cannot update refund status
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userB,
        params: { id: cancelId },
        body: { refund_status: 'Processed' }
      });
      await reCancellationsController.updateRefundStatus(req, res);
      assert(getStatus() === 404, 'Tenant B receives 404 attempting to modify Tenant A refund');
    }

    console.log('\n=================================================================');
    console.log(`TOTAL PASSED: ${passedTests}`);
    console.log(`TOTAL FAILED: ${failedTests}`);
    console.log('=================================================================');

    // Clean up test data
    if (cancelId) {
      await pool.query(`DELETE FROM re_cancellations WHERE id = $1`, [cancelId]);
    }
    await pool.query(`DELETE FROM re_installments WHERE contract_id = $1`, [contractId]);
    await pool.query(`DELETE FROM re_contracts WHERE id = $1`, [contractId]);
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
