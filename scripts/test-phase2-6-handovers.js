/**
 * test-phase2-6-handovers.js
 * Verification test suite for Phase 2.6: Real Estate Handover Milestone
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const reHandoversController = require('../controllers/reHandoversController');

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
  console.log('🚀 RUNNING PHASE 2.6 REAL ESTATE HANDOVER TEST SUITE');
  console.log('=================================================================\n');

  const tenantA = '00000000-0000-0000-0000-000000000001';
  const tenantB = '00000000-0000-0000-0000-000000000099';

  let customerId, unitId, dealId, contractId, handoverId;

  try {
    // 1. Setup DB records
    const custRes = await pool.query(
      `INSERT INTO customers (name, email, phone, tenant_id) VALUES ('Handover Buyer', 'ho@re.test', '01000000005', $1) RETURNING id`,
      [tenantA]
    );
    customerId = custRes.rows[0].id;

    const unitRes = await pool.query(
      `INSERT INTO re_units (name, unit_number, project_name, price, status, tenant_id)
       VALUES ('Unit Handover-1', 'HO-101', 'Delivery Park', 3000000.00, 'Reserved', $1) RETURNING id`,
      [tenantA]
    );
    unitId = unitRes.rows[0].id;

    const dealRes = await pool.query(
      `INSERT INTO deals (title, value, pipeline_stage, client_id, unit_id, tenant_id)
       VALUES ('Deal Handover Unit', 3000000.00, 'Won', $1, $2, $3) RETURNING id`,
      [customerId, unitId, tenantA]
    );
    dealId = dealRes.rows[0].id;

    const contractRes = await pool.query(
      `INSERT INTO re_contracts (contract_number, deal_id, customer_id, unit_id, contract_value, down_payment, remaining_amount, status, tenant_id)
       VALUES ('REC-TEST-HO-1', $1, $2, $3, 3000000.00, 3000000.00, 0, 'Active', $4) RETURNING id`,
      [dealId, customerId, unitId, tenantA]
    );
    contractId = contractRes.rows[0].id;

    const userA = { tenant_id: tenantA, role: 'admin', username: 'admin_a', name: 'Agent H' };
    const userB = { tenant_id: tenantB, role: 'admin', username: 'admin_b', name: 'Agent B' };

    console.log('--- 1. Handover Creation & Validation ---');
    // Test 1: Missing deal_id fails
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        body: { scheduled_date: '2026-11-01' }
      });
      await reHandoversController.createHandover(req, res);
      assert(getStatus() === 400, 'Rejects creation without deal_id (400)');
    }

    // Test 2: Create handover successfully
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        body: {
          deal_id: dealId,
          scheduled_date: '2026-11-15',
          snagging_notes: 'Wall paint touchup in master bedroom'
        }
      });
      await reHandoversController.createHandover(req, res);
      const data = getData()?.data;
      handoverId = data?.id;
      assert(getStatus() === 201, 'Creates handover milestone with 201');
      assert(data?.status === 'Scheduled', 'Initial status is Scheduled');
      assert(data?.unit_id === unitId, 'Linked to unit');
    }

    // Test 3: Duplicate handover prevention
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        body: { deal_id: dealId }
      });
      await reHandoversController.createHandover(req, res);
      assert(getStatus() === 409, 'Rejects duplicate handover for same deal with 409 Conflict');
    }

    console.log('\n--- 2. Lifecycle Transitions & Delivery Finalization ---');
    // Test 4: Advance to Inspection
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        params: { id: handoverId },
        body: { status: 'Inspection' }
      });
      await reHandoversController.updateHandoverStatus(req, res);
      assert(getStatus() === 200 && getData()?.data?.status === 'Inspection', 'Transitions Scheduled -> Inspection (200)');
    }

    // Test 5: Advance to Ready for Delivery
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        params: { id: handoverId },
        body: { status: 'Ready for Delivery' }
      });
      await reHandoversController.updateHandoverStatus(req, res);
      assert(getStatus() === 200 && getData()?.data?.status === 'Ready for Delivery', 'Transitions Inspection -> Ready for Delivery (200)');
    }

    // Test 6: Finalize as Handed Over
    {
      const { req, res, getStatus, getData } = createMockReqRes({
        user: userA,
        params: { id: handoverId },
        body: { status: 'Handed Over' }
      });
      await reHandoversController.updateHandoverStatus(req, res);
      const data = getData()?.data;
      assert(getStatus() === 200 && data?.status === 'Handed Over', 'Transitions Ready for Delivery -> Handed Over (200)');
      assert(data?.keys_handed_over === true, 'keys_handed_over flagged as true');
      assert(data?.clearance_certificate === true, 'clearance_certificate flagged as true');
      assert(data?.actual_handover_date !== null, 'actual_handover_date recorded');
    }

    // Test 7: Cascade updates: Unit is now 'Sold'
    {
      const uCheck = await pool.query(`SELECT status FROM re_units WHERE id = $1`, [unitId]);
      assert(uCheck.rows[0].status === 'Sold', 'Unit status finalized as Sold');
    }

    // Test 8: Cascade updates: Contract is now 'Completed'
    {
      const cCheck = await pool.query(`SELECT status FROM re_contracts WHERE id = $1`, [contractId]);
      assert(cCheck.rows[0].status === 'Completed', 'Contract status finalized as Completed');
    }

    // Test 9: Cannot delete finalized handover
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userA,
        params: { id: handoverId }
      });
      await reHandoversController.deleteHandover(req, res);
      assert(getStatus() === 400, 'Rejects deletion of finalized handover (400)');
    }

    console.log('\n--- 3. Multi-Tenant Isolation ---');
    // Test 10: Tenant B cannot view Tenant A handovers
    {
      const { req, res, getData } = createMockReqRes({
        user: userB,
        query: { deal_id: dealId }
      });
      await reHandoversController.getHandovers(req, res);
      assert(getData()?.data?.length === 0, 'Tenant B sees 0 handovers (tenant isolation)');
    }

    // Test 11: Tenant B cannot update Tenant A handover
    {
      const { req, res, getStatus } = createMockReqRes({
        user: userB,
        params: { id: handoverId },
        body: { status: 'Postponed' }
      });
      await reHandoversController.updateHandoverStatus(req, res);
      assert(getStatus() === 404, 'Tenant B receives 404 attempting to modify Tenant A handover');
    }

    console.log('\n=================================================================');
    console.log(`TOTAL PASSED: ${passedTests}`);
    console.log(`TOTAL FAILED: ${failedTests}`);
    console.log('=================================================================');

    // Clean up test data
    if (handoverId) {
      await pool.query(`DELETE FROM re_handovers WHERE id = $1`, [handoverId]);
    }
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
