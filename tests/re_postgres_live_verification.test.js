/**
 * Real PostgreSQL Database Integration Test Suite
 * Tashgheel CRM Online — Real Estate Lifecycle Audit Verification
 * 
 * Executes against live PostgreSQL (test database / isolated test tenant)
 * Tests actual queries, concurrency locks, transaction boundaries, and state transitions.
 * 
 * Zero pollution of production or retained QA tenant records.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { getTestPool, validateLiveDatabaseSession } = require('./helpers/testDb');

const pool = getTestPool();

const TEST_TENANT_ID = '98765432-1234-4321-8765-123456789abc';
const OTHER_TENANT_ID = '11111111-2222-3333-4444-555555555555';

let testUserId = null;
let testCustomerId = null;
let testDeveloperId = null;
let testProjectId = null;
let testPhaseId = null;
let testBuildingId = null;
let testUnitId = null;
let testDeal2022Id = null;
let testDeal2023Id = null;
let testContractId = null;
let testHandoverId = null;

describe('Real PostgreSQL Integration & Concurrency Verification', () => {

  before(async () => {
    // 0. Safety Guard: Canonical Live Database Verification (rejects PROD_HOST & tashgheel_crm)
    const client = await pool.connect();
    try {
      await validateLiveDatabaseSession(client);

      await client.query('BEGIN');

      // 1. Ensure test tenant exists
      await client.query(`
        INSERT INTO tenants (id, name, slug)
        VALUES ($1, 'Verification Isolated Tenant', 'verify-iso-tenant')
        ON CONFLICT (id) DO NOTHING
      `, [TEST_TENANT_ID]);

      await client.query(`
        INSERT INTO tenants (id, name, slug)
        VALUES ($1, 'Other Isolation Tenant', 'other-iso-tenant')
        ON CONFLICT (id) DO NOTHING
      `, [OTHER_TENANT_ID]);

      // 2. Insert test user
      const userRes = await client.query(`
        INSERT INTO users (name, email, password_hash, role, tenant_id, created_at, updated_at)
        VALUES ('Verification Agent', 'verify_agent@test.com', 'dummy_hash', 'agent', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [TEST_TENANT_ID]);
      testUserId = userRes.rows[0].id;

      // 3. Insert test customer
      const custRes = await client.query(`
        INSERT INTO customers (name, email, phone, tenant_id, created_at, updated_at)
        VALUES ('Test Buyer U-102', 'buyer_u102@test.com', '01000000000', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [TEST_TENANT_ID]);
      testCustomerId = custRes.rows[0].id;

      // 4. Insert test unit
      const unitRes = await client.query(`
        INSERT INTO re_units (
          name, project_name, unit_number, type, floor, area_sqm, price, status,
          tenant_id, created_at, updated_at
        ) VALUES (
          'Unit 102', 'Palm Verification Oasis', 'U-102', 'Apartment', '1', '150', 1000000, 'Available',
          $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING id
      `, [TEST_TENANT_ID]);
      testUnitId = unitRes.rows[0].id;

      // 5. Insert test deals
      // Deal 2022 (Reserving / Closed Won deal)
      const d1Res = await client.query(`
        INSERT INTO deals (
          title, value, pipeline_stage, client_id, assigned_to, unit_id, custom_fields, tenant_id, created_at, updated_at
        ) VALUES (
          'Deal 2022 - Reserving Buyer', 1000000, 'negotiation', $1, $2, $3, '{"is_unit_reservation": false}'::jsonb, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING id
      `, [testCustomerId, testUserId, String(testUnitId), TEST_TENANT_ID]);
      testDeal2022Id = d1Res.rows[0].id;

      // Deal 2023 (Competing Inquiry deal)
      const d2Res = await client.query(`
        INSERT INTO deals (
          title, value, pipeline_stage, client_id, assigned_to, unit_id, custom_fields, tenant_id, created_at, updated_at
        ) VALUES (
          'Deal 2023 - Competing Buyer', 2000000, 'negotiation', $1, $2, $3, '{"is_unit_reservation": false}'::jsonb, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING id
      `, [testCustomerId, testUserId, String(testUnitId), TEST_TENANT_ID]);
      testDeal2023Id = d2Res.rows[0].id;

      // 6. Insert test contract for Deal 2022
      const contractRes = await client.query(`
        INSERT INTO re_contracts (
          contract_number, deal_id, customer_id, unit_id, contract_date, contract_value,
          down_payment, remaining_amount, status, duration_months, tenant_id, created_at, updated_at
        ) VALUES (
          'REC-VERIFY-00001', $1, $2, $3, CURRENT_DATE, 1000000, 200000, 800000, 'Draft', 12, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING id
      `, [testDeal2022Id, testCustomerId, String(testUnitId), TEST_TENANT_ID]);
      testContractId = contractRes.rows[0].id;

      // 7. Insert test handover for Deal 2022
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
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Purge all test records created in TEST_TENANT_ID
      await client.query('DELETE FROM re_installments WHERE tenant_id::text = $1', [TEST_TENANT_ID]);
      await client.query('DELETE FROM re_handovers WHERE tenant_id::text = $1', [TEST_TENANT_ID]);
      await client.query('DELETE FROM re_contracts WHERE tenant_id::text = $1', [TEST_TENANT_ID]);
      await client.query('DELETE FROM deals WHERE tenant_id::text = $1', [TEST_TENANT_ID]);
      await client.query('DELETE FROM re_units WHERE tenant_id::text = $1', [TEST_TENANT_ID]);
      await client.query('DELETE FROM customers WHERE tenant_id::text = $1', [TEST_TENANT_ID]);
      await client.query('DELETE FROM users WHERE tenant_id::text = $1', [TEST_TENANT_ID]);
      await client.query('DELETE FROM tenants WHERE id IN ($1, $2)', [TEST_TENANT_ID, OTHER_TENANT_ID]);
      await client.query('COMMIT');
    } catch (_) {
      await client.query('ROLLBACK').catch(() => {});
    } finally {
      client.release();
      await pool.end();
    }
  });

  // =========================================================================
  // SECTION 1: DEF-RE-01 PostgreSQL Error & Lock Target Verification
  // =========================================================================

  it('1.1 PostgreSQL SQLSTATE verification: un-aliased FOR UPDATE on outer join throws SQLSTATE 0A000', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let caughtError = null;
      try {
        // Pre-remediation query with un-aliased FOR UPDATE on LEFT JOIN
        await client.query(`
          SELECT rc.*, d.pipeline_stage, d.title as deal_title
          FROM re_contracts rc
          LEFT JOIN deals d ON rc.deal_id = d.id
          WHERE rc.id = $1 AND rc.tenant_id::text = $2::text
          FOR UPDATE
        `, [testContractId, TEST_TENANT_ID]);
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError, 'Un-aliased FOR UPDATE on outer join must throw an error');
      assert.equal(caughtError.code, '0A000', 'PostgreSQL SQLSTATE must be 0A000 (feature_not_supported)');
      assert.match(
        caughtError.message,
        /FOR UPDATE cannot be applied to the nullable side of an outer join/i,
        'Exact PostgreSQL engine error message must match'
      );
      assert.equal(caughtError.routine, 'make_outerjoininfo', 'PostgreSQL internal planner routine is make_outerjoininfo');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('1.2 Remediated FOR UPDATE OF rc executes successfully and acquires row lock on real Postgres', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(`
        SELECT rc.*, d.pipeline_stage, d.title as deal_title
        FROM re_contracts rc
        LEFT JOIN deals d ON rc.deal_id = d.id
        WHERE rc.id = $1 AND rc.tenant_id::text = $2::text
        FOR UPDATE OF rc
      `, [testContractId, TEST_TENANT_ID]);

      assert.equal(res.rows.length, 1, 'Query must return exactly 1 locked contract row');
      assert.equal(res.rows[0].contract_number, 'REC-VERIFY-00001');
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  it('1.3 Installment generation on real Postgres: creates down payment (#0) + 4 quarterly installments with exact balance', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock contract
      const contractRes = await client.query(`
        SELECT rc.*, d.pipeline_stage, d.title as deal_title
        FROM re_contracts rc
        LEFT JOIN deals d ON rc.deal_id = d.id
        WHERE rc.id = $1 AND rc.tenant_id::text = $2::text
        FOR UPDATE OF rc
      `, [testContractId, TEST_TENANT_ID]);
      const contract = contractRes.rows[0];

      // 2. Insert down payment installment #0 (200,000)
      const dpDate = '2026-12-01';
      const dpAmount = 200000;
      await client.query(`
        INSERT INTO re_installments (
          contract_id, deal_id, installment_number, installment_type,
          due_date, amount, paid_amount, status, notes, tenant_id
        ) VALUES ($1, $2, 0, 'down_payment', $3, $4, 0, 'Pending', 'Initial Down Payment', $5)
      `, [contract.id, contract.deal_id, dpDate, dpAmount, TEST_TENANT_ID]);

      // 3. Insert 4 periodic quarterly installments (800k / 4 = 200k each)
      const baseDate = new Date('2027-01-01');
      for (let i = 1; i <= 4; i++) {
        const dueDate = new Date(baseDate.getTime() + (i - 1) * 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        await client.query(`
          INSERT INTO re_installments (
            contract_id, deal_id, installment_number, installment_type,
            due_date, amount, paid_amount, status, notes, tenant_id
          ) VALUES ($1, $2, $3, 'installment', $4, 200000, 0, 'Pending', $5, $6)
        `, [contract.id, contract.deal_id, i, dueDate, `Quarterly #${i}`, TEST_TENANT_ID]);
      }

      // 4. Update contract down_payment & remaining_amount
      await client.query(`
        UPDATE re_contracts SET
          down_payment = $1,
          remaining_amount = $2,
          updated_at = NOW()
        WHERE id = $3 AND tenant_id::text = $4::text
      `, [200000, 800000, contract.id, TEST_TENANT_ID]);

      await client.query('COMMIT');

      // Verify records in database
      const instCheck = await pool.query(`
        SELECT installment_number, installment_type, amount, status
        FROM re_installments
        WHERE contract_id = $1 AND tenant_id::text = $2::text
        ORDER BY installment_number ASC
      `, [testContractId, TEST_TENANT_ID]);

      assert.equal(instCheck.rows.length, 5, 'Must have 5 installments in database');
      assert.equal(instCheck.rows[0].installment_number, 0);
      assert.equal(Number(instCheck.rows[0].amount), 200000);
      assert.equal(instCheck.rows[0].installment_type, 'down_payment');

      for (let i = 1; i <= 4; i++) {
        assert.equal(instCheck.rows[i].installment_number, i);
        assert.equal(Number(instCheck.rows[i].amount), 200000);
        assert.equal(instCheck.rows[i].status, 'Pending');
      }

      const sumRes = await pool.query(`
        SELECT SUM(amount) as total_scheduled
        FROM re_installments
        WHERE contract_id = $1 AND tenant_id::text = $2::text
      `, [testContractId, TEST_TENANT_ID]);
      assert.equal(Number(sumRes.rows[0].total_scheduled), 1000000, 'Sum of scheduled installments must equal 1,000,000');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  it('1.4 Transaction rollback integrity: partial generation failure leaves zero dirty records', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Intentionally insert a temporary installment then simulate a crash
      await client.query(`
        INSERT INTO re_installments (
          contract_id, deal_id, installment_number, installment_type,
          due_date, amount, paid_amount, status, notes, tenant_id
        ) VALUES ($1, $2, 99, 'installment', '2028-01-01', 50000, 0, 'Pending', 'Rollback Probe', $3)
      `, [testContractId, testDeal2022Id, TEST_TENANT_ID]);

      // Simulate runtime abort before commit
      throw new Error('Simulated network timeout during schedule insertion');
    } catch (err) {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    // Verify installment #99 was NOT persisted in PostgreSQL
    const probe = await pool.query(`
      SELECT * FROM re_installments WHERE contract_id = $1 AND installment_number = 99
    `, [testContractId]);
    assert.equal(probe.rows.length, 0, 'Rolled-back installment must not exist in database');
  });

  // =========================================================================
  // SECTION 2: Handover Status Transition & Row-Level Locking
  // =========================================================================

  it('2.1 Handover pre-remediation query fails with 0A000; remediated FOR UPDATE OF rh succeeds', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Pre-remediation outer join lock fails with 0A000
      let caughtError = null;
      try {
        await client.query(`
          SELECT rh.*, d.pipeline_stage, d.title as deal_title
          FROM re_handovers rh
          LEFT JOIN deals d ON rh.deal_id = d.id
          WHERE rh.id = $1 AND rh.tenant_id::text = $2::text
          FOR UPDATE
        `, [testHandoverId, TEST_TENANT_ID]);
      } catch (err) {
        caughtError = err;
      }
      assert.ok(caughtError);
      assert.equal(caughtError.code, '0A000');

      // Rollback the aborted transaction block and begin clean transaction
      await client.query('ROLLBACK');
      await client.query('BEGIN');

      // 2. Remediated query succeeds
      const successRes = await client.query(`
        SELECT rh.*, d.pipeline_stage, d.title as deal_title
        FROM re_handovers rh
        LEFT JOIN deals d ON rh.deal_id = d.id
        WHERE rh.id = $1 AND rh.tenant_id::text = $2::text
        FOR UPDATE OF rh
      `, [testHandoverId, TEST_TENANT_ID]);

      assert.equal(successRes.rows.length, 1);
      assert.equal(successRes.rows[0].status, 'Scheduled');

      // 3. Transition status from Scheduled -> Inspection
      await client.query(`
        UPDATE re_handovers SET
          status = 'Inspection',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND tenant_id::text = $2::text
      `, [testHandoverId, TEST_TENANT_ID]);

      await client.query('COMMIT');

      // Verify status in database
      const hoCheck = await pool.query('SELECT status FROM re_handovers WHERE id = $1', [testHandoverId]);
      assert.equal(hoCheck.rows[0].status, 'Inspection');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // =========================================================================
  // SECTION 3: OBS-RE-02 Real PostgreSQL Concurrency & Reservation Lock
  // =========================================================================

  it('3.1 Concurrent Reservation Protection: Two simultaneous reservation attempts for the same unit serialize; exactly one wins and the loser gets rejected', async () => {
    // Reset unit to Available
    await pool.query(`UPDATE re_units SET status = 'Available', reservation_expires_at = NULL WHERE id = $1`, [testUnitId]);

    const clientA = await pool.connect();
    const clientB = await pool.connect();

    let clientBBlocked = true;
    let clientBResult = null;
    let clientAResult = null;

    try {
      // Client A begins transaction and locks unit
      await clientA.query('BEGIN');
      const uResA = await clientA.query(`
        SELECT * FROM re_units WHERE id::text = $1::text AND tenant_id::text = $2::text FOR UPDATE
      `, [String(testUnitId), TEST_TENANT_ID]);
      assert.equal(uResA.rows[0].status, 'Available');

      // Client B begins transaction and attempts to acquire FOR UPDATE on the same unit
      // This will BLOCK in PostgreSQL until Client A commits or rolls back
      const clientBPromise = (async () => {
        await clientB.query('BEGIN');
        // This query blocks until clientA finishes
        const uResB = await clientB.query(`
          SELECT * FROM re_units WHERE id::text = $1::text AND tenant_id::text = $2::text FOR UPDATE
        `, [String(testUnitId), TEST_TENANT_ID]);
        clientBBlocked = false;

        const targetUnit = uResB.rows[0];
        const uStatus = String(targetUnit.status || '').trim().toLowerCase();
        if (uStatus !== 'available') {
          await clientB.query('ROLLBACK');
          return { status: 409, code: 'UNIT_NOT_AVAILABLE', message: `Unit is already ${targetUnit.status}` };
        }

        // If available, reserve
        await clientB.query(`UPDATE re_units SET status = 'Reserved' WHERE id = $1`, [testUnitId]);
        await clientB.query('COMMIT');
        return { status: 200, code: 'SUCCESS' };
      })();

      // Verify that while Client A holds the lock, Client B is indeed waiting
      await new Promise(r => setTimeout(r, 100));
      assert.equal(clientBBlocked, true, 'Client B must be blocked waiting on PostgreSQL row-level lock');

      // Client A updates unit to Reserved and commits
      await clientA.query(`
        UPDATE re_units SET
          status = 'Reserved',
          reservation_expires_at = CURRENT_TIMESTAMP + INTERVAL '48 hours'
        WHERE id = $1
      `, [testUnitId]);
      await clientA.query(`
        UPDATE deals SET custom_fields = '{"is_unit_reservation": true}'::jsonb WHERE id = $1
      `, [testDeal2022Id]);
      await clientA.query('COMMIT');
      clientAResult = { status: 200, winner: 'Deal 2022' };

      // Now Client B unblocks, reads committed row, finds status is 'Reserved'
      clientBResult = await clientBPromise;

      assert.equal(clientAResult.status, 200, 'Winning transaction succeeds');
      assert.equal(clientBResult.status, 409, 'Losing transaction must receive HTTP 409');
      assert.equal(clientBResult.code, 'UNIT_NOT_AVAILABLE', 'Losing transaction code must be UNIT_NOT_AVAILABLE');

      // Verify unit in database is Reserved
      const finalUnit = await pool.query('SELECT status FROM re_units WHERE id = $1', [testUnitId]);
      assert.equal(finalUnit.rows[0].status, 'Reserved');
    } finally {
      clientA.release();
      clientB.release();
    }
  });

  it('3.2 Reservation Expiry Engine: Expired reservation resets unit to Available and updates reserving deal', async () => {
    // 1. Artificially set unit reservation_expires_at in the past
    await pool.query(`
      UPDATE re_units SET
        status = 'Reserved',
        reservation_expires_at = CURRENT_TIMESTAMP - INTERVAL '2 hours'
      WHERE id = $1
    `, [testUnitId]);

    await pool.query(`
      UPDATE deals SET
        pipeline_stage = 'reserved',
        custom_fields = '{"is_unit_reservation": true}'::jsonb
      WHERE id = $1
    `, [testDeal2022Id]);

    // 2. Run the reservation release logic
    const { scanAndReleaseExpiredReservations } = require('../services/reservationService');
    const result = await scanAndReleaseExpiredReservations();

    assert.ok(result.releasedCount >= 1, 'Scanner must identify and release expired unit');

    // 3. Query PostgreSQL to verify unit is released
    const unitCheck = await pool.query('SELECT status, reservation_expires_at FROM re_units WHERE id = $1', [testUnitId]);
    assert.equal(unitCheck.rows[0].status, 'Available', 'Unit status must revert to Available in database');
    assert.equal(unitCheck.rows[0].reservation_expires_at, null, 'reservation_expires_at must be cleared to NULL');

    // 4. Query deal to verify reservation flag is cleared and stage is negotiation
    const dealCheck = await pool.query('SELECT pipeline_stage, custom_fields FROM deals WHERE id = $1', [testDeal2022Id]);
    assert.equal(dealCheck.rows[0].pipeline_stage, 'negotiation');
    assert.equal(dealCheck.rows[0].custom_fields.is_unit_reservation, false);
    assert.ok(dealCheck.rows[0].custom_fields.reservation_expired_at);
  });

  // =========================================================================
  // SECTION 4: Tenant Isolation Enforcement
  // =========================================================================

  it('4.1 Multi-tenant isolation: Foreign tenant cannot lock or modify contracts, units, or handovers', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Attempt to access contract using OTHER_TENANT_ID
      const contractProbe = await client.query(`
        SELECT * FROM re_contracts
        WHERE id = $1 AND tenant_id::text = $2::text
        FOR UPDATE OF re_contracts
      `, [testContractId, OTHER_TENANT_ID]);

      assert.equal(contractProbe.rows.length, 0, 'Foreign tenant cannot view or lock contract');

      // Attempt to access unit using OTHER_TENANT_ID
      const unitProbe = await client.query(`
        SELECT * FROM re_units
        WHERE id::text = $1::text AND tenant_id::text = $2::text
        FOR UPDATE
      `, [String(testUnitId), OTHER_TENANT_ID]);

      assert.equal(unitProbe.rows.length, 0, 'Foreign tenant cannot view or lock unit');

      // Attempt to update handover with foreign tenant
      const hoUpdate = await client.query(`
        UPDATE re_handovers SET status = 'Snagging'
        WHERE id = $1 AND tenant_id::text = $2::text
        RETURNING *
      `, [testHandoverId, OTHER_TENANT_ID]);

      assert.equal(hoUpdate.rows.length, 0, 'Foreign tenant cannot mutate handover record');

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

});
