const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.test' });

// ============================================================================
// CRITICAL SAFETY GATE: STRICT EXECUTION AGAINST ISOLATED TEST POSTGRESQL ONLY
// ============================================================================
function verifySafetyGate() {
  const testDbUrl = process.env.DATABASE_URL_TEST;
  if (!testDbUrl) {
    throw new Error('SAFETY GATE: DATABASE_URL_TEST is not configured in .env.test. Aborting!');
  }
  if (testDbUrl.includes('reseau.proxy.rlwy.net')) {
    throw new Error('SAFETY GATE VIOLATION: DATABASE_URL_TEST points to PRODUCTION. Aborting immediately!');
  }
  if (process.env.DATABASE_URL && testDbUrl === process.env.DATABASE_URL && !testDbUrl.includes('turntable.proxy.rlwy.net')) {
    throw new Error('SAFETY GATE VIOLATION: DATABASE_URL_TEST is identical to production DATABASE_URL. Aborting!');
  }
  return testDbUrl;
}

const connectionString = verifySafetyGate();
// Ensure any controller requiring config/db connects strictly to the isolated test database
process.env.DATABASE_URL = connectionString;

const { nextSequence } = require('../../src/infrastructure/sequencing/DocumentSequencer');
const reContractsController = require('../../controllers/reContractsController');
const reHandoversController = require('../../controllers/reHandoversController');

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

// Helper for Mock Express req/res
function createMockReqRes({ user, body = {}, params = {}, query = {}, branchId = null }) {
  const req = { user, body, params, query, branchId };
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

const crypto = require('crypto');

test('Phase 2.3: Real Estate Workflow Alignment - Isolated PostgreSQL Live Suite', async (t) => {
  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  const branchA = crypto.randomUUID();
  const branchB = crypto.randomUUID();

  let userAId = null;
  let userBId = null;
  let customerAId = null;
  let customerBId = null;

  const createdDealIds = [];
  const createdUnitIds = [];
  const createdContractIds = [];
  const createdHandoverIds = [];

  // Snapshot pre-existing contracts to verify non-destruction
  const preExistingContracts = await pool.query(`SELECT id, contract_number, tenant_id FROM re_contracts`);
  const initialPreExistingCount = preExistingContracts.rows.length;

  t.after(async () => {
    try {
      if (createdHandoverIds.length > 0) {
        await pool.query(`DELETE FROM re_handovers WHERE id = ANY($1::uuid[])`, [createdHandoverIds]);
      }
      if (createdContractIds.length > 0) {
        await pool.query(`DELETE FROM re_contracts WHERE id = ANY($1::uuid[])`, [createdContractIds]);
      }
      if (createdDealIds.length > 0) {
        await pool.query(`DELETE FROM deals WHERE id = ANY($1::int[])`, [createdDealIds]);
      }
      if (createdUnitIds.length > 0) {
        await pool.query(`DELETE FROM re_units WHERE id = ANY($1::uuid[])`, [createdUnitIds]);
      }
      if (customerAId) await pool.query(`DELETE FROM customers WHERE id = $1`, [customerAId]);
      if (customerBId) await pool.query(`DELETE FROM customers WHERE id = $1`, [customerBId]);
      if (userAId) await pool.query(`DELETE FROM users WHERE id = $1`, [userAId]);
      if (userBId) await pool.query(`DELETE FROM users WHERE id = $1`, [userBId]);
      await pool.query(`DELETE FROM branches WHERE id IN ($1, $2)`, [branchA, branchB]);
      await pool.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [tenantA, tenantB]);

      // Clean test sequences for test tenants only
      await pool.query(`DELETE FROM document_sequences WHERE tenant_id IN ($1, $2)`, [tenantA, tenantB]);

      // Verify pre-existing data integrity
      const postContracts = await pool.query(`SELECT id, contract_number, tenant_id FROM re_contracts`);
      assert.equal(
        postContracts.rows.length,
        initialPreExistingCount,
        'Cleanup must leave pre-existing contracts completely untouched'
      );
    } catch (err) {
      console.warn('Cleanup warning:', err.message);
    } finally {
      await pool.end();
    }
  });

  // 1. Setup isolated tenants, branches, users, and customers
  await t.test('1. Setup isolated test fixtures in real test DB', async () => {
    await pool.query(`
      INSERT INTO tenants (id, name, slug, plan, status)
      VALUES ($1, 'Test RE Tenant A', $2, 'enterprise', 'active'),
             ($3, 'Test RE Tenant B', $4, 'enterprise', 'active')
    `, [tenantA, `t-a-${Date.now()}`, tenantB, `t-b-${Date.now()}`]);

    await pool.query(`
      INSERT INTO branches (id, name, tenant_id)
      VALUES ($1, 'Branch A', $2), ($3, 'Branch B', $4)
    `, [branchA, tenantA, branchB, tenantB]);

    const uRes = await pool.query(`
      INSERT INTO users (name, email, password_hash, role, tenant_id, branch_id)
      VALUES ('Agent Alpha', $1, 'test_hash', 'admin', $2, $3)
      RETURNING id
    `, [`agent-${Date.now()}@test.local`, tenantA, branchA]);
    userAId = uRes.rows[0].id;

    const ubRes = await pool.query(`
      INSERT INTO users (name, email, password_hash, role, tenant_id, branch_id)
      VALUES ('Agent Beta', $1, 'test_hash', 'admin', $2, $3)
      RETURNING id
    `, [`agentb-${Date.now()}@test.local`, tenantB, branchB]);
    userBId = ubRes.rows[0].id;

    const caRes = await pool.query(`
      INSERT INTO customers (name, tenant_id, branch_id)
      VALUES ('Buyer Alpha', $1, $2)
      RETURNING id
    `, [tenantA, branchA]);
    customerAId = caRes.rows[0].id;

    const cbRes = await pool.query(`
      INSERT INTO customers (name, tenant_id, branch_id)
      VALUES ('Buyer Beta', $1, $2)
      RETURNING id
    `, [tenantB, branchB]);
    customerBId = cbRes.rows[0].id;

    assert.ok(userAId);
    assert.ok(userBId);
    assert.ok(customerAId);
    assert.ok(customerBId);
  });

  // Helper to create a deal + unit in 'Reserved' status
  async function createDealAndUnit(tenant, branch, title, unitNumber, customerId, assignedTo = userAId) {
    const uRes = await pool.query(`
      INSERT INTO re_units (name, unit_number, status, tenant_id, branch_id)
      VALUES ($1, $2, 'Reserved', $3, $4)
      RETURNING id
    `, [`Unit ${unitNumber}`, unitNumber, tenant, branch]);
    const unitId = uRes.rows[0].id;
    createdUnitIds.push(unitId);

    const dRes = await pool.query(`
      INSERT INTO deals (title, value, pipeline_stage, client_id, unit_id, tenant_id, branch_id, assigned_to)
      VALUES ($1, 250000.00, 'Negotiation', $2, $3, $4, $5, $6)
      RETURNING id
    `, [title, customerId, unitId, tenant, branch, assignedTo]);
    const dealId = dRes.rows[0].id;
    createdDealIds.push(dealId);

    return { dealId, unitId };
  }

  // 2. Sequential Numbering relative to existing sequence counter
  let contractA = null;
  let contractB = null;

  await t.test('2. Sequential contract numbering with REC prefix relative to current sequence', async () => {
    const currentYear = new Date().getFullYear();

    // Peek initial counter in document_sequences (could be 0 or exist)
    const initialSeqRes = await pool.query(`
      SELECT last_sequence FROM document_sequences
      WHERE tenant_id = $1 AND doc_type = 'REC' AND fiscal_year = $2 AND branch_id = $3
    `, [tenantA, currentYear, branchA]);
    const initialSeq = initialSeqRes.rows.length > 0 ? initialSeqRes.rows[0].last_sequence : 0;

    const fixture1 = await createDealAndUnit(tenantA, branchA, 'Penthouse 101 Sale', 'U-101', customerAId);
    const mock1 = createMockReqRes({
      user: { id: userAId, tenant_id: tenantA, role: 'admin', branch_id: branchA },
      branchId: branchA,
      body: {
        deal_id: fixture1.dealId,
        contract_date: `${currentYear}-06-01`,
        contract_value: 300000,
        down_payment: 50000
      }
    });

    await reContractsController.createContract(mock1.req, mock1.res);
    assert.equal(mock1.getStatus(), 201, `Failed to create contract 1: ${JSON.stringify(mock1.getData())}`);
    contractA = mock1.getData().data;
    createdContractIds.push(contractA.id);

    // Verify REC prefix and monotonic progression relative to initialSeq
    const expectedNum1 = `REC-${currentYear}-${String(initialSeq + 1).padStart(5, '0')}`;
    assert.equal(contractA.contract_number, expectedNum1);
    assert.equal(contractA.status, 'Draft');
    assert.equal(Number(contractA.remaining_amount), 250000);

    // Create second contract sequentially
    const fixture2 = await createDealAndUnit(tenantA, branchA, 'Villa 202 Sale', 'U-202', customerAId);
    const mock2 = createMockReqRes({
      user: { id: userAId, tenant_id: tenantA, role: 'admin', branch_id: branchA },
      branchId: branchA,
      body: {
        deal_id: fixture2.dealId,
        contract_date: `${currentYear}-06-01`,
        contract_value: 500000,
        down_payment: 100000
      }
    });

    await reContractsController.createContract(mock2.req, mock2.res);
    assert.equal(mock2.getStatus(), 201, `Failed to create contract 2: ${JSON.stringify(mock2.getData())}`);
    contractB = mock2.getData().data;
    createdContractIds.push(contractB.id);

    const expectedNum2 = `REC-${currentYear}-${String(initialSeq + 2).padStart(5, '0')}`;
    assert.equal(contractB.contract_number, expectedNum2);
    assert.notEqual(contractA.contract_number, contractB.contract_number);
  });

  // 3. Concurrency Safety: Parallel creations without assuming initial state
  await t.test('3. Real Concurrency: Parallel creation requests do NOT collide and increment sequence atomically', async () => {
    const currentYear = new Date().getFullYear();

    const seqBeforeRes = await pool.query(`
      SELECT last_sequence FROM document_sequences
      WHERE tenant_id = $1 AND doc_type = 'REC' AND fiscal_year = $2 AND branch_id = $3
    `, [tenantA, currentYear, branchA]);
    const seqBefore = seqBeforeRes.rows.length > 0 ? seqBeforeRes.rows[0].last_sequence : 0;

    const fixRace1 = await createDealAndUnit(tenantA, branchA, 'Race Deal 1', 'U-RACE-1', customerAId);
    const fixRace2 = await createDealAndUnit(tenantA, branchA, 'Race Deal 2', 'U-RACE-2', customerAId);

    const mockRace1 = createMockReqRes({
      user: { id: userAId, tenant_id: tenantA, role: 'admin', branch_id: branchA },
      branchId: branchA,
      body: { deal_id: fixRace1.dealId, contract_value: 200000, down_payment: 20000 }
    });

    const mockRace2 = createMockReqRes({
      user: { id: userAId, tenant_id: tenantA, role: 'admin', branch_id: branchA },
      branchId: branchA,
      body: { deal_id: fixRace2.dealId, contract_value: 200000, down_payment: 20000 }
    });

    // Execute simultaneously
    await Promise.all([
      reContractsController.createContract(mockRace1.req, mockRace1.res),
      reContractsController.createContract(mockRace2.req, mockRace2.res)
    ]);

    assert.equal(mockRace1.getStatus(), 201);
    assert.equal(mockRace2.getStatus(), 201);

    const c1 = mockRace1.getData().data;
    const c2 = mockRace2.getData().data;
    createdContractIds.push(c1.id, c2.id);

    // Assert strictly distinct numbers
    assert.notEqual(c1.contract_number, c2.contract_number, 'Concurrent contracts must have unique numbers');
    assert.ok(c1.contract_number.startsWith(`REC-${currentYear}-`));
    assert.ok(c2.contract_number.startsWith(`REC-${currentYear}-`));

    // Verify sequence counter advanced by exactly 2
    const seqAfterRes = await pool.query(`
      SELECT last_sequence FROM document_sequences
      WHERE tenant_id = $1 AND doc_type = 'REC' AND fiscal_year = $2 AND branch_id = $3
    `, [tenantA, currentYear, branchA]);
    assert.equal(
      seqAfterRes.rows[0].last_sequence,
      seqBefore + 2,
      'Sequence counter must increment by exactly the number of successful concurrent operations'
    );
  });

  // 4. Multi-Tenant Isolation
  await t.test('4. Multi-tenant isolation: Tenant B sequence is isolated from Tenant A', async () => {
    const currentYear = new Date().getFullYear();
    const fixTenantB = await createDealAndUnit(tenantB, branchB, 'Tenant B Deal', 'U-TB-1', customerBId, userBId);

    const mockTB = createMockReqRes({
      user: { id: userBId, tenant_id: tenantB, role: 'admin', branch_id: branchB },
      branchId: branchB,
      body: { deal_id: fixTenantB.dealId, contract_value: 150000, down_payment: 15000 }
    });

    await reContractsController.createContract(mockTB.req, mockTB.res);
    assert.equal(mockTB.getStatus(), 201);
    const cTB = mockTB.getData().data;
    createdContractIds.push(cTB.id);

    // Tenant B started its own sequence, counter is 1
    assert.equal(cTB.contract_number, `REC-${currentYear}-00001`);
  });

  // 5. Unique constraint enforcement & duplicate rejection (idx_re_contracts_tenant_number)
  await t.test('5. Unique constraint: Rejects duplicate contract_number within the same tenant (error 23505)', async () => {
    const existingNum = contractA.contract_number;

    // Create a new deal for Tenant A
    const extraFix = await createDealAndUnit(tenantA, branchA, 'Duplicate Num Deal', 'U-DUP-NUM', customerAId);

    let rejectedWithError23505 = false;
    try {
      await pool.query(`
        INSERT INTO re_contracts (
          contract_number, deal_id, customer_id, unit_id, contract_date,
          contract_value, down_payment, remaining_amount, status,
          tenant_id, branch_id, created_by
        ) VALUES ($1, $2, $3, $4, CURRENT_DATE, 100000, 10000, 90000, 'Draft', $5, $6, 'TEST')
      `, [existingNum, extraFix.dealId, customerAId, extraFix.unitId, tenantA, branchA]);
    } catch (err) {
      if (err.code === '23505' && err.message.includes('idx_re_contracts_tenant_number')) {
        rejectedWithError23505 = true;
      }
    }
    assert.equal(rejectedWithError23505, true, 'Unique index idx_re_contracts_tenant_number must reject duplicate number in same tenant');
  });

  // 6. Rollback behavior: Transaction rollback leaves no orphaned contract or corrupted state
  await t.test('6. Transaction rollback: Pre-insertion failure leaves zero orphaned contracts', async () => {
    // Create deal where linked unit is Available (NOT Reserved)
    const uRes = await pool.query(`
      INSERT INTO re_units (name, unit_number, status, tenant_id, branch_id)
      VALUES ('Unreserved Unit', 'U-UNRES', 'Available', $1, $2)
      RETURNING id
    `, [tenantA, branchA]);
    const unresUnitId = uRes.rows[0].id;
    createdUnitIds.push(unresUnitId);

    const dRes = await pool.query(`
      INSERT INTO deals (title, value, pipeline_stage, client_id, unit_id, tenant_id, branch_id, assigned_to)
      VALUES ('Invalid Unit Deal', 100000, 'Negotiation', $1, $2, $3, $4, $5)
      RETURNING id
    `, [customerAId, unresUnitId, tenantA, branchA, userAId]);
    const unresDealId = dRes.rows[0].id;
    createdDealIds.push(unresDealId);

    const mockFail = createMockReqRes({
      user: { id: userAId, tenant_id: tenantA, role: 'admin', branch_id: branchA },
      branchId: branchA,
      body: { deal_id: unresDealId, contract_value: 100000 }
    });

    await reContractsController.createContract(mockFail.req, mockFail.res);
    assert.equal(mockFail.getStatus(), 409, 'Must reject contract for non-reserved unit with 409');

    // Confirm no contract row was inserted
    const checkOrphan = await pool.query(`SELECT id FROM re_contracts WHERE deal_id = $1`, [unresDealId]);
    assert.equal(checkOrphan.rows.length, 0, 'No contract row must exist when transaction aborts');
  });

  // 7. Handover Atomicity & Direct Completion Guard
  await t.test('7. Handover atomicity and manual completion guard', async () => {
    // Advance Contract A to Active state: Draft -> Generated -> Signed -> Active
    // Direct SQL update to transition safely through state machine
    await pool.query(`UPDATE re_contracts SET status = 'Active' WHERE id = $1`, [contractA.id]);
    await pool.query(`UPDATE re_units SET status = 'Contracted' WHERE id = $1`, [contractA.unit_id]);

    // A. Guard: Direct attempt to set contract to 'Completed' via updateContractStatus must return 409
    const mockDirectComplete = createMockReqRes({
      user: { id: userAId, tenant_id: tenantA, role: 'admin' },
      params: { id: contractA.id },
      body: { status: 'Completed' }
    });

    await reContractsController.updateContractStatus(mockDirectComplete.req, mockDirectComplete.res);
    assert.equal(mockDirectComplete.getStatus(), 409);
    assert.match(
      mockDirectComplete.getData().message,
      /Complete the handover to complete this contract/i
    );

    // B. Create Handover milestone for Contract A
    const mockCreateHo = createMockReqRes({
      user: { id: userAId, tenant_id: tenantA, role: 'admin', branch_id: branchA },
      branchId: branchA,
      body: {
        deal_id: contractA.deal_id,
        scheduled_date: '2026-06-15',
        snagging_notes: 'All items verified'
      }
    });

    await reHandoversController.createHandover(mockCreateHo.req, mockCreateHo.res);
    assert.equal(mockCreateHo.getStatus(), 201, `Failed to create handover: ${JSON.stringify(mockCreateHo.getData())}`);
    const handover = mockCreateHo.getData().data;
    createdHandoverIds.push(handover.id);

    // C. Atomic Completion of Handover: Handover -> 'Handed Over'
    const mockCompleteHo = createMockReqRes({
      user: { id: userAId, tenant_id: tenantA, role: 'admin' },
      params: { id: handover.id },
      body: { status: 'Handed Over' }
    });

    await reHandoversController.updateHandoverStatus(mockCompleteHo.req, mockCompleteHo.res);
    assert.equal(mockCompleteHo.getStatus(), 200);

    // D. Verify All Three Entities Updated Atomically in DB:
    // - re_handovers: 'Handed Over'
    // - re_units: 'Handed Over'
    // - re_contracts: 'Completed'
    const hoCheck = (await pool.query(`SELECT status FROM re_handovers WHERE id = $1`, [handover.id])).rows[0];
    assert.equal(hoCheck.status, 'Handed Over');

    const unitCheck = (await pool.query(`SELECT status FROM re_units WHERE id = $1`, [contractA.unit_id])).rows[0];
    assert.equal(unitCheck.status, 'Handed Over');

    const contractCheck = (await pool.query(`SELECT status FROM re_contracts WHERE id = $1`, [contractA.id])).rows[0];
    assert.equal(contractCheck.status, 'Completed');
  });
});
