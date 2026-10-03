/**
 * test-phase2-3-installments.js
 * Verification test suite for Phase 2.3: Payment Plan / Installments
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const reInstallmentsController = require('../controllers/reInstallmentsController');
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
  console.log('🚀 RUNNING PHASE 2.3 REAL ESTATE INSTALLMENTS TEST SUITE');
  console.log('=================================================================\n');

  const tenantA = '00000000-0000-0000-0000-000000000001';
  const tenantB = '00000000-0000-0000-0000-000000000099';

  let customerId, unitId, dealId, contractId;

  try {
    // 1. Setup DB records
    const custRes = await pool.query(
      `INSERT INTO customers (name, email, phone, tenant_id) VALUES ('Inst Buyer', 'inst@re.test', '01000000002', $1) RETURNING id`,
      [tenantA]
    );
    customerId = custRes.rows[0].id;

    const unitRes = await pool.query(
      `INSERT INTO re_units (name, unit_number, project_name, price, status, tenant_id)
       VALUES ('Unit Inst-1', 'I-101', 'Installment Plaza', 1000000.00, 'Available', $1) RETURNING id`,
      [tenantA]
    );
    unitId = unitRes.rows[0].id;

    const dealRes = await pool.query(
      `INSERT INTO deals (title, value, pipeline_stage, client_id, unit_id, tenant_id)
       VALUES ('Deal Inst', 1000000.00, 'Reserved', $1, $2, $3) RETURNING id`,
      [customerId, unitId, tenantA]
    );
    dealId = dealRes.rows[0].id;

    const contractRes = await pool.query(
      `INSERT INTO re_contracts (contract_number, deal_id, customer_id, unit_id, contract_value, down_payment, remaining_amount, status, tenant_id)
       VALUES ('REC-TEST-INST-1', $1, $2, $3, 1000000.00, 0, 1000000.00, 'Draft', $4) RETURNING id`,
      [dealId, customerId, unitId, tenantA]
    );
    contractId = contractRes.rows[0].id;

    const userA = { tenant_id: tenantA, role: 'admin', username: 'admin_a' };
    const userB = { tenant_id: tenantB, role: 'admin', username: 'admin_b' };

    console.log('--- 1. Schedule Generation Validation ---');
    // Test 1: Missing contract_id fails
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        body: { number_of_installments: 4 }
      });
      await reInstallmentsController.generateSchedule(req, res);
      assert(getStatus() === 400, 'Rejects schedule generation without contract_id (400)');
    }

    // Test 2: Down payment exceeding contract value fails
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        body: { contract_id: contractId, down_payment: 1500000, number_of_installments: 4 }
      });
      await reInstallmentsController.generateSchedule(req, res);
      assert(getStatus() === 400, 'Rejects down payment greater than contract value (400)');
    }

    console.log('\n--- 2. Schedule Generation & Financial Precision ---');
    // Test 3: Generate 4 quarterly installments with 200,000 down payment
    let createdInstallments = [];
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        body: {
          contract_id: contractId,
          down_payment: 200000.00,
          number_of_installments: 4,
          frequency: 'quarterly',
          start_date: '2026-10-01'
        }
      });
      await reInstallmentsController.generateSchedule(req, res);
      assert(getStatus() === 201, 'Generates installment schedule successfully (201)');
      createdInstallments = getData()?.data || [];
      // Expected: 1 down payment (200k) + 4 installments (200k each) = 5 items total
      assert(createdInstallments.length === 5, `Created 5 scheduled items (got ${createdInstallments.length})`);

      const totalScheduled = createdInstallments.reduce((sum, item) => sum + parseFloat(item.amount), 0);
      assert(Math.abs(totalScheduled - 1000000.00) < 0.01, `Total scheduled equals exactly contract value 1,000,000.00 (got ${totalScheduled})`);
    }

    // Test 4: Query installments endpoint with summary
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        query: { contract_id: contractId }
      });
      await reInstallmentsController.getInstallments(req, res);
      const summary = getData()?.summary;
      assert(getStatus() === 200, 'Fetches installments via GET (200)');
      assert(summary?.total_scheduled === 1000000.00, 'Summary total_scheduled matches 1,000,000');
      assert(summary?.total_paid === 0, 'Initial total_paid is 0');
      assert(summary?.total_remaining === 1000000.00, 'Initial total_remaining is 1,000,000');
    }

    console.log('\n--- 3. Recording Payments & Status Transitions ---');
    // Test 5: Overpaying installment fails
    const firstInst = createdInstallments.find(i => i.installment_number === 1);
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        params: { id: firstInst.id },
        body: { amount: 300000.00 }
      });
      await reInstallmentsController.recordPayment(req, res);
      assert(getStatus() === 400, 'Rejects payment exceeding installment due amount (400)');
    }

    // Test 6: Partial payment updates status to Partially Paid
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        params: { id: firstInst.id },
        body: { amount: 100000.00 }
      });
      await reInstallmentsController.recordPayment(req, res);
      assert(getStatus() === 200, 'Records partial payment (200)');
      assert(getData()?.data?.status === 'Partially Paid', 'Installment status transitions to Partially Paid');
      assert(parseFloat(getData()?.data?.paid_amount) === 100000.00, 'paid_amount updated to 100,000');
    }

    // Test 7: Completing installment payment updates to Paid
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        params: { id: firstInst.id },
        body: { amount: 100000.00 }
      });
      await reInstallmentsController.recordPayment(req, res);
      assert(getStatus() === 200, 'Records remaining payment (200)');
      assert(getData()?.data?.status === 'Paid', 'Installment status transitions to Paid');
      assert(parseFloat(getData()?.data?.paid_amount) === 200000.00, 'paid_amount reaches 200,000');
      assert(getData()?.data?.paid_at !== null, 'paid_at timestamp is populated');
    }

    console.log('\n--- 4. Schedule Protection & Immutability ---');
    // Test 8: Cannot regenerate schedule if paid installments exist
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        body: { contract_id: contractId, number_of_installments: 6 }
      });
      await reInstallmentsController.generateSchedule(req, res);
      assert(getStatus() === 400, 'Rejects schedule regeneration when payments exist (400)');
    }

    // Test 9: Cannot delete an installment with recorded payments
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        params: { id: firstInst.id }
      });
      await reInstallmentsController.deleteInstallment(req, res);
      assert(getStatus() === 400, 'Rejects deletion of paid installment (400)');
    }

    // Test 10: Can delete an unpaid installment
    const lastInst = createdInstallments[createdInstallments.length - 1];
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        params: { id: lastInst.id }
      });
      await reInstallmentsController.deleteInstallment(req, res);
      assert(getStatus() === 200, 'Successfully deletes unpaid installment (200)');
    }

    console.log('\n--- 5. Multi-Tenant Isolation ---');
    // Test 11: Tenant B cannot view Tenant A installments
    {
      const { req, res, getData } = createMockReqRes({
        user: userB,
        query: { contract_id: contractId }
      });
      await reInstallmentsController.getInstallments(req, res);
      assert(getData()?.data?.length === 0, 'Tenant B sees 0 installments for Tenant A contract (tenant isolation)');
    }

    // Test 12: Tenant B cannot pay Tenant A installment
    const secondInst = createdInstallments.find(i => i.installment_number === 2);
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userB,
        params: { id: secondInst.id },
        body: { amount: 50000 }
      });
      await reInstallmentsController.recordPayment(req, res);
      assert(getStatus() === 404, 'Tenant B receives 404 attempting to pay Tenant A installment');
    }

    console.log('\n=================================================================');
    console.log(`TOTAL PASSED: ${passedTests}`);
    console.log(`TOTAL FAILED: ${failedTests}`);
    console.log('=================================================================');

    // Clean up test data
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
