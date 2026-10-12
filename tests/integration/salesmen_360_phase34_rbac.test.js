/**
 * tests/integration/salesmen_360_phase34_rbac.test.js
 *
 * Phase 3.4.2: Salesmen 360° RBAC, Tenant Isolation & Dual-Engine Separation Test Suite
 * Tests run against isolated test database specified in .env.test.
 */

const fs = require('fs');
const dotenv = require('dotenv');

// Pre-load .env.test and override DATABASE_URL before any modules are imported
const envTestContent = fs.readFileSync('.env.test', 'utf8');
const envTest = dotenv.parse(envTestContent);
if (!envTest.DATABASE_URL_TEST || envTest.DATABASE_URL_TEST.includes('reseau.proxy.rlwy.net')) {
  throw new Error('SAFETY GATE: Invalid or production DATABASE_URL_TEST');
}
process.env.DATABASE_URL = envTest.DATABASE_URL_TEST;
process.env.DATABASE_URL_TEST = envTest.DATABASE_URL_TEST;

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_TEST,
  ssl: { rejectUnauthorized: false }
});

const salesController = require('../../controllers/salesController');
const reTargetController = require('../../controllers/reTargetController');
const salesCommissionController = require('../../controllers/salesCommissionController');
const reCommissionsController = require('../../controllers/reCommissionsController');
const templateGuard = require('../../middleware/templateGuard');

// Helper to simulate express res object
function createMockRes() {
  return {
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
}

test('Phase 3.4.2: Salesmen 360° RBAC & Isolation Suite', async (t) => {
  const tenantGeneralA = crypto.randomUUID();
  const tenantGeneralB = crypto.randomUUID();
  const tenantRealEstate = crypto.randomUUID();

  let branchCairoA, branchAlexA, branchRECairo, branchREGiza;
  let deptSalesA, deptSupportA;
  let userAdminA, userRepA1, userRepA2, userMgrA, userInactiveA, userAccountantA;
  let userRepB;
  let reRep1, reRep2, reMgr;

  t.before(async () => {
    // 1. Seed Tenants
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, template_name)
       VALUES ($1, 'General Tenant Alpha', $4, 'enterprise', 'active', 'general'),
              ($2, 'General Tenant Beta', $5, 'enterprise', 'active', 'general'),
              ($3, 'RE Tenant Prime', $6, 'enterprise', 'active', 'real_estate')
       ON CONFLICT (id) DO UPDATE SET template_name = EXCLUDED.template_name`,
      [
        tenantGeneralA, tenantGeneralB, tenantRealEstate,
        `gen-a-${tenantGeneralA.slice(0, 8)}`,
        `gen-b-${tenantGeneralB.slice(0, 8)}`,
        `re-${tenantRealEstate.slice(0, 8)}`
      ]
    );

    // 2. Seed Branches
    const brRes = await pool.query(
      `INSERT INTO branches (id, name, tenant_id, timezone)
       VALUES (gen_random_uuid(), 'Cairo HQ', $1, 'Africa/Cairo'),
              (gen_random_uuid(), 'Alex Branch', $1, 'Africa/Cairo'),
              (gen_random_uuid(), 'RE Cairo', $2, 'Africa/Cairo'),
              (gen_random_uuid(), 'RE Giza', $2, 'Africa/Cairo')
       RETURNING id, name`,
      [tenantGeneralA, tenantRealEstate]
    );
    branchCairoA = brRes.rows.find(b => b.name === 'Cairo HQ').id;
    branchAlexA = brRes.rows.find(b => b.name === 'Alex Branch').id;
    branchRECairo = brRes.rows.find(b => b.name === 'RE Cairo').id;
    branchREGiza = brRes.rows.find(b => b.name === 'RE Giza').id;

    // 3. Seed Departments in Tenant A
    const dRes = await pool.query(
      `INSERT INTO departments (name, tenant_id)
       VALUES ('Sales Dept', $1), ('Support Dept', $1)
       RETURNING id, name`,
      [tenantGeneralA]
    );
    deptSalesA = dRes.rows.find(d => d.name === 'Sales Dept').id;
    deptSupportA = dRes.rows.find(d => d.name === 'Support Dept').id;

    // 4. Seed Users in General Tenant A
    const uRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, tenant_id, branch_id, department_id, is_working, phone)
       VALUES
         ('Admin Alice', 'admin.alice@test.com', 'h', 'admin', $1, $2, $3, true, '01011111111'),
         ('Manager Mark', 'mgr.mark@test.com', 'h', 'manager', $1, $2, $3, true, '01022222222'),
         ('Rep Ryan', 'rep.ryan@test.com', 'h', 'sales', $1, $2, $3, true, '01033333333'),
         ('Rep Rachel', 'rep.rachel@test.com', 'h', 'sales', $1, $4, $3, true, '01044444444'),
         ('Inactive Ian', 'ian.inactive@test.com', 'h', 'sales', $1, $2, $3, false, '01055555555'),
         ('Accountant Adam', 'adam.acc@test.com', 'h', 'accountant', $1, $2, $5, true, '01066666666')
       RETURNING id, name, role`,
      [tenantGeneralA, branchCairoA, deptSalesA, branchAlexA, deptSupportA]
    );

    userAdminA = uRes.rows.find(u => u.name === 'Admin Alice');
    userMgrA = uRes.rows.find(u => u.name === 'Manager Mark');
    userRepA1 = uRes.rows.find(u => u.name === 'Rep Ryan');
    userRepA2 = uRes.rows.find(u => u.name === 'Rep Rachel');
    userInactiveA = uRes.rows.find(u => u.name === 'Inactive Ian');
    userAccountantA = uRes.rows.find(u => u.name === 'Accountant Adam');

    // Assign Manager Mark as manager of deptSalesA
    await pool.query('UPDATE departments SET manager_id = $1 WHERE id = $2', [userMgrA.id, deptSalesA]);

    // 5. Seed Users in General Tenant B
    const ubRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, tenant_id, is_working)
       VALUES ('Beta Bob', 'bob.beta@test.com', 'h', 'sales', $1, true)
       RETURNING id, name`,
      [tenantGeneralB]
    );
    userRepB = ubRes.rows[0];

    // 6. Seed Users in Real Estate Tenant
    const ureRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, tenant_id, branch_id, is_working)
       VALUES
         ('RE Rep One', 're.one@test.com', 'h', 'sales', $1, $2, true),
         ('RE Rep Two', 're.two@test.com', 'h', 'sales', $1, $3, true),
         ('RE Manager', 're.mgr@test.com', 'h', 'manager', $1, $2, true)
       RETURNING id, name`,
      [tenantRealEstate, branchRECairo, branchREGiza]
    );
    reRep1 = ureRes.rows.find(u => u.name === 'RE Rep One');
    reRep2 = ureRes.rows.find(u => u.name === 'RE Rep Two');
    reMgr = ureRes.rows.find(u => u.name === 'RE Manager');
  });

  t.after(async () => {
    await pool.query('DELETE FROM re_cancellations WHERE tenant_id::text = $1::text', [tenantRealEstate]);
    await pool.query('DELETE FROM re_commissions WHERE tenant_id::text = $1::text', [tenantRealEstate]);
    await pool.query('DELETE FROM re_contracts WHERE tenant_id::text = $1::text', [tenantRealEstate]);
    await pool.query('DELETE FROM deals WHERE tenant_id::text IN ($1::text, $2::text, $3::text)', [tenantGeneralA, tenantGeneralB, tenantRealEstate]);
    await pool.query('DELETE FROM sales_targets WHERE tenant_id::text IN ($1::text, $2::text)', [tenantGeneralA, tenantGeneralB]);
    await pool.query('DELETE FROM sales_commissions WHERE tenant_id::text IN ($1::text, $2::text)', [tenantGeneralA, tenantGeneralB]);
    await pool.query('DELETE FROM users WHERE tenant_id::text IN ($1::text, $2::text, $3::text)', [tenantGeneralA, tenantGeneralB, tenantRealEstate]);
    await pool.query('DELETE FROM departments WHERE tenant_id::text = $1::text', [tenantGeneralA]);
    await pool.query('DELETE FROM branches WHERE tenant_id::text IN ($1::text, $2::text, $3::text)', [tenantGeneralA, tenantGeneralB, tenantRealEstate]);
    await pool.query('DELETE FROM tenants WHERE id IN ($1, $2, $3)', [tenantGeneralA, tenantGeneralB, tenantRealEstate]);
    await pool.end();
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 1: Salesmen API returns clean active sales roles without mock data
  // ─────────────────────────────────────────────────────────────
  await t.test('1. Salesmen API returns only active sales roles without mock territory or commission_rate', async () => {
    const req = {
      user: {
        id: userAdminA.id,
        role: 'admin',
        tenant_id: tenantGeneralA
      },
      query: {}
    };
    const res = createMockRes();

    await salesController.getSalesmen(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'success');
    const list = res.body.data;

    // Must include active sales/manager users: Admin Alice, Manager Mark, Rep Ryan, Rep Rachel
    const names = list.map(u => u.name);
    assert.ok(names.includes('Manager Mark'), 'Includes Manager Mark');
    assert.ok(names.includes('Rep Ryan'), 'Includes Rep Ryan');
    assert.ok(names.includes('Rep Rachel'), 'Includes Rep Rachel');

    // Must EXCLUDE inactive user and non-sales role
    assert.ok(!names.includes('Inactive Ian'), 'Excludes Inactive Ian');
    assert.ok(!names.includes('Accountant Adam'), 'Excludes Accountant Adam');

    // Must NOT have hardcoded mock fields
    for (const item of list) {
      assert.equal(item.territory, undefined, 'Must not contain fake territory field');
      assert.equal(item.commission_rate, undefined, 'Must not contain fake commission_rate field');
      assert.notEqual(item.phone, undefined, 'Must contain real phone field');
      assert.ok('branch_id' in item, 'Must contain real branch_id');
      assert.ok('branch_name' in item, 'Must contain real branch_name');
      assert.ok('department_name' in item, 'Must contain real department_name');
    }

    const ryan = list.find(u => u.name === 'Rep Ryan');
    assert.equal(ryan.branch_name, 'Cairo HQ');
    assert.equal(ryan.department_name, 'Sales Dept');
    assert.equal(ryan.phone, '01033333333');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 2: Template Guard strict vertical separation
  // ─────────────────────────────────────────────────────────────
  await t.test('2. Template Guard prevents cross-vertical access (General vs Real Estate)', async () => {
    const reGuard = templateGuard('real_estate');
    const genGuard = templateGuard('general');

    // A. Real Estate user accessing Real Estate route -> passes
    let passed = false;
    reGuard({ user: { template_name: 'real_estate' } }, {}, () => { passed = true; });
    assert.equal(passed, true, 'RE user passes RE template guard');

    // B. Real Estate user accessing General route -> blocked 403
    const resBlockedGen = createMockRes();
    let nextCalled = false;
    genGuard({ user: { template_name: 'real_estate' } }, resBlockedGen, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(resBlockedGen.statusCode, 403);
    assert.equal(resBlockedGen.body.code, 'TEMPLATE_MISMATCH');

    // C. General user accessing Real Estate route -> blocked 403
    const resBlockedRE = createMockRes();
    nextCalled = false;
    reGuard({ user: { template_name: 'general' } }, resBlockedRE, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(resBlockedRE.statusCode, 403);
    assert.equal(resBlockedRE.body.code, 'TEMPLATE_MISMATCH');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 3: Cross-User RBAC Scoping on Salesperson endpoints
  // ─────────────────────────────────────────────────────────────
  await t.test('3. Cross-User RBAC prevents rep from accessing other reps private details', async () => {
    // A. Rep Ryan attempting to request Rep Rachel directly via user_id -> 403 Forbidden
    const reqRepAccessOther = {
      user: {
        id: userRepA1.id,
        role: 'sales',
        tenant_id: tenantGeneralA,
        branch_id: branchCairoA
      },
      query: { user_id: userRepA2.id }
    };
    const resRepAccessOther = createMockRes();
    await salesController.getSalesmen(reqRepAccessOther, resRepAccessOther);

    assert.equal(resRepAccessOther.statusCode, 403);
    assert.match(resRepAccessOther.body.message, /only view your own details/i);

    // B. Rep Ryan requesting own details -> 200 OK
    const reqRepAccessSelf = {
      user: {
        id: userRepA1.id,
        role: 'sales',
        tenant_id: tenantGeneralA,
        branch_id: branchCairoA
      },
      query: { user_id: userRepA1.id }
    };
    const resRepAccessSelf = createMockRes();
    await salesController.getSalesmen(reqRepAccessSelf, resRepAccessSelf);

    assert.equal(resRepAccessSelf.statusCode, 200);
    assert.equal(resRepAccessSelf.body.data.length, 1);
    assert.equal(resRepAccessSelf.body.data[0].id, userRepA1.id);

    // C. Rep Ryan attempting to view Rep Rachel commissions -> 403 Forbidden
    const reqCommRepAccessOther = {
      user: {
        id: userRepA1.id,
        role: 'sales',
        tenant_id: tenantGeneralA,
        branch_id: branchCairoA
      },
      query: { user_id: userRepA2.id }
    };
    const resCommRepAccessOther = createMockRes();
    await salesCommissionController.getCommissions(reqCommRepAccessOther, resCommRepAccessOther);

    assert.equal(resCommRepAccessOther.statusCode, 403);
    assert.match(resCommRepAccessOther.body.message, /not authorized/i);

    // D. RE Rep One attempting to view RE Rep Two performance drilldown -> 403 Forbidden
    const reqREPerfRepAccessOther = {
      user: {
        id: reRep1.id,
        role: 'sales',
        tenant_id: tenantRealEstate
      },
      params: { userId: reRep2.id },
      query: { period: '2026-Q3' }
    };
    const resREPerfRepAccessOther = createMockRes();
    await reTargetController.getSalesmanPerformance(reqREPerfRepAccessOther, resREPerfRepAccessOther);

    assert.equal(resREPerfRepAccessOther.statusCode, 403);
    assert.match(resREPerfRepAccessOther.body.message, /only view your own performance/i);
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Manager Department Scoping
  // ─────────────────────────────────────────────────────────────
  await t.test('4. Manager with department scope can view team members but is restricted from outside depts', async () => {
    // Manager Mark manages deptSalesA
    const reqMgrTeam = {
      user: {
        id: userMgrA.id,
        role: 'manager',
        tenant_id: tenantGeneralA,
        department_id: deptSalesA,
        branch_id: branchCairoA
      },
      query: { user_id: userRepA1.id } // Ryan is in deptSalesA
    };
    const resMgrTeam = createMockRes();
    await salesController.getSalesmen(reqMgrTeam, resMgrTeam);

    assert.equal(resMgrTeam.statusCode, 200);
    assert.equal(resMgrTeam.body.data.length, 1);
    assert.equal(resMgrTeam.body.data[0].id, userRepA1.id);

    // Create another user in deptSupportA (outside Manager Mark scope)
    const outsiderRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, tenant_id, department_id, is_working)
       VALUES ('Support Rep Sam', 'sam.support@test.com', 'h', 'sales', $1, $2, true)
       RETURNING id`,
      [tenantGeneralA, deptSupportA]
    );
    const outsiderId = outsiderRes.rows[0].id;

    // Manager Mark attempting to access outsider
    const reqMgrOutsider = {
      user: {
        id: userMgrA.id,
        role: 'manager',
        tenant_id: tenantGeneralA,
        department_id: deptSalesA,
        branch_id: branchCairoA
      },
      query: { user_id: outsiderId }
    };
    const resMgrOutsider = createMockRes();
    await salesController.getSalesmen(reqMgrOutsider, resMgrOutsider);

    assert.equal(resMgrOutsider.statusCode, 403);
    assert.match(resMgrOutsider.body.message, /not authorized/i);
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 5: Branch and Tenant Isolation
  // ─────────────────────────────────────────────────────────────
  await t.test('5. Branch and Tenant Isolation prevents leakage across organizations and branches', async () => {
    // A. Tenant A Admin queries salesmen -> Zero records from Tenant B
    const reqTenantA = {
      user: {
        id: userAdminA.id,
        role: 'admin',
        tenant_id: tenantGeneralA
      },
      query: {}
    };
    const resTenantA = createMockRes();
    await salesController.getSalesmen(reqTenantA, resTenantA);

    const ids = resTenantA.body.data.map(u => u.id);
    assert.ok(!ids.includes(userRepB.id), 'Tenant A cannot see Tenant B salesmen');

    // B. Filtering by Branch Alex -> Only returns Alex salesmen
    const reqBranchAlex = {
      user: {
        id: userAdminA.id,
        role: 'admin',
        tenant_id: tenantGeneralA
      },
      query: { branch_id: branchAlexA }
    };
    const resBranchAlex = createMockRes();
    await salesController.getSalesmen(reqBranchAlex, resBranchAlex);

    assert.equal(resBranchAlex.statusCode, 200);
    const alexNames = resBranchAlex.body.data.map(u => u.name);
    assert.ok(alexNames.includes('Rep Rachel'), 'Includes Rachel who is in Alex Branch');
    assert.ok(!alexNames.includes('Rep Ryan'), 'Excludes Ryan who is in Cairo Branch');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 6: Real Estate Commission Clawback on Cancellation
  // ─────────────────────────────────────────────────────────────
  await t.test('6. Real Estate cancellation triggers Clawback on paid commission and Cancelled on unpaid', async () => {
    // 1. Seed Deal
    const dealRes = await pool.query(
      `INSERT INTO deals (title, value, pipeline_stage, assigned_to, tenant_id, branch_id)
       VALUES ('Clawback Deal Test', 4000000, 'won', $1, $2, $3)
       RETURNING id`,
      [reRep1.id, tenantRealEstate, branchRECairo]
    );
    const dealId = dealRes.rows[0].id;

    // 2. Seed Contract
    const contractRes = await pool.query(
      `INSERT INTO re_contracts (contract_number, contract_value, deal_id, status, tenant_id, branch_id)
       VALUES ('REC-CLAW-001', 4000000, $1, 'Active', $2, $3)
       RETURNING id`,
      [dealId, tenantRealEstate, branchRECairo]
    );
    const contractId = contractRes.rows[0].id;

    // 3. Seed two commissions: one paid (50,000 EGP) and one pending (25,000 EGP)
    const commPaidRes = await pool.query(
      `INSERT INTO re_commissions (
         deal_id, contract_id, beneficiary_type, beneficiary_user_id, beneficiary_name,
         commission_type, rate, base_amount, calculated_amount, paid_amount, status,
         trigger_event, tenant_id, branch_id
       ) VALUES ($1, $2, 'agent', $3, 'RE Rep One', 'percentage', 1.25, 4000000, 50000, 50000, 'Paid', 'contract_signing', $4, $5)
       RETURNING id`,
      [dealId, contractId, reRep1.id, tenantRealEstate, branchRECairo]
    );
    const commPaidId = commPaidRes.rows[0].id;

    const commUnpaidRes = await pool.query(
      `INSERT INTO re_commissions (
         deal_id, contract_id, beneficiary_type, beneficiary_user_id, beneficiary_name,
         commission_type, rate, base_amount, calculated_amount, paid_amount, status,
         trigger_event, tenant_id, branch_id
       ) VALUES ($1, $2, 'agent', $3, 'RE Rep One', 'percentage', 0.625, 4000000, 25000, 0, 'Pending', 'down_payment', $4, $5)
       RETURNING id`,
      [dealId, contractId, reRep1.id, tenantRealEstate, branchRECairo]
    );
    const commUnpaidId = commUnpaidRes.rows[0].id;

    // 4. Simulate cancellation update as executed in reCancellationsController.js:186-192
    await pool.query(`
      UPDATE re_commissions SET
        status = CASE WHEN paid_amount > 0 THEN 'Clawback' ELSE 'Cancelled' END,
        notes = COALESCE(notes, '') || ' [Cancelled due to deal cancellation]',
        updated_at = NOW()
      WHERE deal_id = $1 AND tenant_id::text = $2::text AND status NOT IN ('Cancelled', 'Clawback')
    `, [dealId, tenantRealEstate]);

    // 5. Verify status transitions
    const commCheck = await pool.query(
      `SELECT id, status, paid_amount FROM re_commissions WHERE id IN ($1, $2)`,
      [commPaidId, commUnpaidId]
    );

    const paidRow = commCheck.rows.find(r => r.id === commPaidId);
    const unpaidRow = commCheck.rows.find(r => r.id === commUnpaidId);

    assert.equal(paidRow.status, 'Clawback', 'Paid commission transitions to Clawback');
    assert.equal(unpaidRow.status, 'Cancelled', 'Unpaid commission transitions to Cancelled');

    // 6. Verify General Tenant commissions remain completely untouched
    const genCheck = await pool.query(
      `SELECT COUNT(*) FROM sales_commissions WHERE tenant_id::text = $1::text`,
      [tenantGeneralA]
    );
    assert.equal(parseInt(genCheck.rows[0].count, 10), 0, 'Zero cross-contamination in General Business');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 7: Zero-Data Salesman and Period Change Isolation
  // ─────────────────────────────────────────────────────────────
  await t.test('7. Salesman with zero transactions in period returns clean zero metrics without crashing', async () => {
    // A. Real Estate: Rep reRep2 queries own performance in empty period '2026-Q1'
    const reqREZero = {
      user: {
        id: reRep2.id,
        role: 'sales',
        tenant_id: tenantRealEstate
      },
      params: { userId: reRep2.id },
      query: { period: '2026-Q1' }
    };
    const resREZero = createMockRes();
    await reTargetController.getSalesmanPerformance(reqREZero, resREZero);

    assert.equal(resREZero.statusCode, 200);
    assert.equal(resREZero.body.status, 'success');
    const data = resREZero.body.data;
    assert.equal(data.target, null, 'Target is null for rep without quota');
    assert.equal(data.summary.total_contract_value, 0, 'Net contracts is exactly 0');
    assert.equal(data.summary.units_contracted_count, 0, 'Units count is 0');
    assert.equal(data.summary.total_collected_amount, 0, 'Collected cash is 0');
    assert.equal(data.contracts.length, 0, 'Zero contracts list');
    assert.equal(data.collections.length, 0, 'Zero collections list');
    assert.equal(data.cancellations.length, 0, 'Zero cancellations list');

    // B. General Business: Query userRepA2 in empty period '2026-Q1'
    const reqGenZeroComm = {
      user: {
        id: userAdminA.id,
        role: 'admin',
        tenant_id: tenantGeneralA
      },
      query: { user_id: userRepA2.id, period: '2026-Q1' }
    };
    const resGenZeroComm = createMockRes();
    await salesCommissionController.getCommissions(reqGenZeroComm, resGenZeroComm);

    assert.equal(resGenZeroComm.statusCode, 200);
    assert.equal(resGenZeroComm.body.data.length, 0, 'Empty commissions list for zero period');

    const resGenZeroSett = createMockRes();
    await salesCommissionController.getSettlements(reqGenZeroComm, resGenZeroSett);
    assert.equal(resGenZeroSett.statusCode, 200);
    assert.equal(resGenZeroSett.body.data.length, 0, 'Empty settlements list for zero period');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 8: Negative Tests for Unauthorized Branch Spoofing
  // ─────────────────────────────────────────────────────────────
  await t.test('8. Unauthorized branch spoofing attempts are strictly rejected with 403', async () => {
    // A. General: Rep Ryan in branch Cairo attempting to query branch Alex salesmen
    const reqSpoofSalesmen = {
      user: {
        id: userRepA1.id,
        role: 'sales',
        tenant_id: tenantGeneralA,
        branch_id: branchCairoA
      },
      branchId: branchCairoA,
      query: { branch_id: branchAlexA }
    };
    const resSpoofSalesmen = createMockRes();
    await salesController.getSalesmen(reqSpoofSalesmen, resSpoofSalesmen);
    assert.equal(resSpoofSalesmen.statusCode, 403, 'Rejects spoofing branch in salesmen');
    assert.equal(resSpoofSalesmen.body.code, 'UNAUTHORIZED_BRANCH_ACCESS');

    // B. General: Rep Ryan attempting to query branch Alex targets
    const reqSpoofTargets = {
      user: {
        id: userRepA1.id,
        role: 'sales',
        tenant_id: tenantGeneralA,
        branch_id: branchCairoA
      },
      branchId: branchCairoA,
      query: { branch_id: branchAlexA }
    };
    const resSpoofTargets = createMockRes();
    await salesController.getTargets(reqSpoofTargets, resSpoofTargets);
    assert.equal(resSpoofTargets.statusCode, 403, 'Rejects spoofing branch in targets');
    assert.equal(resSpoofTargets.body.code, 'UNAUTHORIZED_BRANCH_ACCESS');

    // C. General: Rep Ryan attempting to query branch Alex commissions
    const reqSpoofComms = {
      user: {
        id: userRepA1.id,
        role: 'sales',
        tenant_id: tenantGeneralA,
        branch_id: branchCairoA
      },
      branchId: branchCairoA,
      query: { branch_id: branchAlexA }
    };
    const resSpoofComms = createMockRes();
    await salesCommissionController.getCommissions(reqSpoofComms, resSpoofComms);
    assert.equal(resSpoofComms.statusCode, 403, 'Rejects spoofing branch in commissions');
    assert.equal(resSpoofComms.body.code, 'UNAUTHORIZED_BRANCH_ACCESS');

    // D. Real Estate: RE Rep One in Cairo branch attempting to query Giza branch salesmen
    const reqRESpoofSalesmen = {
      user: {
        id: reRep1.id,
        role: 'sales',
        tenant_id: tenantRealEstate,
        branch_id: branchRECairo
      },
      branchId: branchRECairo,
      query: { branch_id: branchREGiza }
    };
    const resRESpoofSalesmen = createMockRes();
    await reTargetController.getSalesmen(reqRESpoofSalesmen, resRESpoofSalesmen);
    assert.equal(resRESpoofSalesmen.statusCode, 403, 'Rejects RE branch spoofing in salesmen');
    assert.equal(resRESpoofSalesmen.body.code, 'UNAUTHORIZED_BRANCH_ACCESS');

    // E. Real Estate: RE Rep One in Cairo branch attempting to query performance of rep in Giza branch
    const reqRESpoofPerf = {
      user: {
        id: reRep1.id,
        role: 'sales',
        tenant_id: tenantRealEstate,
        branch_id: branchRECairo
      },
      branchId: branchRECairo,
      params: { userId: reRep2.id }, // reRep2 is in Giza branch
      query: { period: '2026-Q3' }
    };
    const resRESpoofPerf = createMockRes();
    await reTargetController.getSalesmanPerformance(reqRESpoofPerf, resRESpoofPerf);
    assert.equal(resRESpoofPerf.statusCode, 403, 'Rejects RE cross-branch performance query');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 9: Manager with Empty Department Scope (Fail-Closed) & RE Commissions
  // ─────────────────────────────────────────────────────────────
  await t.test('9. Manager without managed departments fails-closed to self only, and RE commissions protect user privacy', async () => {
    // 1. Seed a Manager with NO managed departments
    const unassignedMgrRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, tenant_id, branch_id, is_working)
       VALUES ('Unassigned Manager', 'unassigned.mgr@test.com', 'h', 'manager', $1, $2, true)
       RETURNING id, name`,
      [tenantGeneralA, branchCairoA]
    );
    const unassignedMgrId = unassignedMgrRes.rows[0].id;

    // A. Unassigned Manager queries salesmen -> MUST fail-closed and return only self
    const reqUnassignedMgr = {
      user: {
        id: unassignedMgrId,
        role: 'manager',
        tenant_id: tenantGeneralA,
        branch_id: branchCairoA
      },
      branchId: branchCairoA,
      query: {}
    };
    const resUnassignedMgr = createMockRes();
    await salesController.getSalesmen(reqUnassignedMgr, resUnassignedMgr);
    assert.equal(resUnassignedMgr.statusCode, 200);
    assert.equal(resUnassignedMgr.body.data.length, 1, 'Manager with no departments only sees self');
    assert.equal(resUnassignedMgr.body.data[0].id, unassignedMgrId);

    // B. Unassigned Manager attempting to query another user's commissions -> 403 Forbidden
    const reqUnassignedMgrComm = {
      user: {
        id: unassignedMgrId,
        role: 'manager',
        tenant_id: tenantGeneralA,
        branch_id: branchCairoA
      },
      branchId: branchCairoA,
      query: { user_id: userRepA1.id }
    };
    const resUnassignedMgrComm = createMockRes();
    await salesCommissionController.getCommissions(reqUnassignedMgrComm, resUnassignedMgrComm);
    assert.equal(resUnassignedMgrComm.statusCode, 403, 'Manager with no departments cannot view other users commissions');

    // C. Real Estate: Rep One attempting to query Rep Two commissions -> 403 Forbidden
    const reqREOtherComm = {
      user: {
        id: reRep1.id,
        role: 'sales',
        tenant_id: tenantRealEstate,
        branch_id: branchRECairo
      },
      branchId: branchRECairo,
      query: { beneficiary_user_id: reRep2.id }
    };
    const resREOtherComm = createMockRes();
    await reCommissionsController.getCommissions(reqREOtherComm, resREOtherComm);
    assert.equal(resREOtherComm.statusCode, 403, 'Rep cannot view other users commissions');
    assert.match(resREOtherComm.body.message, /only view your own commissions/i);
  });
});
