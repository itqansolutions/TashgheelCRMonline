/**
 * Tests for Real Estate Reservation Expiry Integrity
 * Verifies that expiring a 48h unit reservation:
 * 1. Releases the unit back to 'Available' (clears reservation fields).
 * 2. Does NOT silently mark the associated deal as 'lost'.
 * 3. Keeps unit as 'Contracted' if protected by an active/signed contract.
 * 4. Keeps unit as 'Contracted' if protected by a won/closed deal.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');
const reservationService = require('../services/reservationService');

const originalDbQuery = db.query;

test('Reservation Expiry Integrity Tests', async (t) => {
  t.afterEach(() => {
    db.query = originalDbQuery;
  });

  await t.test('Expiring reservation releases unit but preserves deal stage (NOT marked as lost)', async () => {
    const executedQueries = [];
    const unitId = 'unit-123';
    const tenantId = 'tenant-1';
    const dealId = 42;

    db.query = async (sql, params = []) => {
      executedQueries.push({ sql: sql.trim(), params });

      // 1. SELECT expired units
      if (sql.includes('FROM re_units') && sql.includes("LOWER(status) = 'reserved'")) {
        return {
          rows: [{ id: unitId, tenant_id: tenantId, branch_id: 'branch-1' }]
        };
      }

      // 2. Check finalized deals
      if (sql.includes('FROM deals') && sql.includes("'closed', 'won'")) {
        return { rows: [] };
      }

      // 3. Check active contracts
      if (sql.includes('FROM re_contracts') && sql.includes("'Signed', 'Active'")) {
        return { rows: [] };
      }

      // 4. Find active deals associated with unit
      if (sql.includes('FROM deals') && sql.includes('unit_id::text = $1::text')) {
        return {
          rows: [{
            id: dealId,
            title: 'Interested Buyer',
            pipeline_stage: 'proposal',
            custom_fields: { is_unit_reservation: true, budget: 5000000 }
          }]
        };
      }

      // 5. UPDATE re_units
      if (sql.includes('UPDATE re_units') && sql.includes("SET status = 'Available'")) {
        return { rowCount: 1 };
      }

      // 6. UPDATE deals
      if (sql.includes('UPDATE deals') && sql.includes('SET pipeline_stage = $2')) {
        return { rowCount: 1 };
      }

      // 7. System logs
      if (sql.includes('INSERT INTO system_logs')) {
        return { rowCount: 1 };
      }

      return { rows: [] };
    };

    const result = await reservationService.scanAndReleaseExpiredReservations();
    assert.equal(result.releasedCount, 1, 'Should have released 1 expired reservation');

    // Verify unit update
    const unitUpdate = executedQueries.find(q => q.sql.includes('UPDATE re_units') && q.sql.includes("SET status = 'Available'"));
    assert.ok(unitUpdate, 'Unit must be updated to Available');
    assert.equal(unitUpdate.params[0], unitId);

    // Verify deal update
    const dealUpdate = executedQueries.find(q => q.sql.includes('UPDATE deals') && q.sql.includes('SET pipeline_stage = $2'));
    assert.ok(dealUpdate, 'Deal must be updated');
    assert.equal(dealUpdate.params[0], dealId);
    assert.equal(dealUpdate.params[1], 'proposal', 'Deal stage MUST NOT be changed to lost! It should remain proposal');
    
    const parsedCustomFields = JSON.parse(dealUpdate.params[2]);
    assert.equal(parsedCustomFields.is_unit_reservation, false, 'is_unit_reservation must be cleared');
    assert.ok(parsedCustomFields.reservation_expired_at, 'reservation_expired_at timestamp should be recorded');
  });

  await t.test('If deal stage was "reserved", rolls back to active negotiation instead of lost', async () => {
    const executedQueries = [];
    const unitId = 'unit-456';
    const tenantId = 'tenant-1';
    const dealId = 99;

    db.query = async (sql, params = []) => {
      executedQueries.push({ sql: sql.trim(), params });

      if (sql.includes('FROM re_units') && sql.includes("LOWER(status) = 'reserved'")) {
        return { rows: [{ id: unitId, tenant_id: tenantId, branch_id: null }] };
      }
      if (sql.includes('FROM deals') && sql.includes("'closed', 'won'")) return { rows: [] };
      if (sql.includes('FROM re_contracts') && sql.includes("'Signed', 'Active'")) return { rows: [] };
      if (sql.includes('FROM deals') && sql.includes('unit_id::text = $1::text')) {
        return {
          rows: [{
            id: dealId,
            title: 'Direct Reservation',
            pipeline_stage: 'reserved',
            custom_fields: { is_unit_reservation: true }
          }]
        };
      }
      return { rows: [] };
    };

    await reservationService.scanAndReleaseExpiredReservations();

    const dealUpdate = executedQueries.find(q => q.sql.includes('UPDATE deals') && q.sql.includes('SET pipeline_stage = $2'));
    assert.ok(dealUpdate);
    assert.equal(dealUpdate.params[1], 'negotiation', 'Reserved stage should roll back to negotiation, NOT lost');
  });

  await t.test('Unit is NOT released if active signed contract exists', async () => {
    const executedQueries = [];
    const unitId = 'unit-789';
    const tenantId = 'tenant-1';

    db.query = async (sql, params = []) => {
      executedQueries.push({ sql: sql.trim(), params });

      if (sql.includes('FROM re_units') && sql.includes("LOWER(status) = 'reserved'")) {
        return { rows: [{ id: unitId, tenant_id: tenantId, branch_id: null }] };
      }
      if (sql.includes('FROM deals') && sql.includes("'closed', 'won'")) return { rows: [] };
      if (sql.includes('FROM re_contracts') && sql.includes("'Signed', 'Active'")) {
        return { rows: [{ id: 'contract-1', contract_number: 'REC-2026-001', status: 'Active' }] };
      }
      return { rows: [] };
    };

    const result = await reservationService.scanAndReleaseExpiredReservations();
    assert.equal(result.releasedCount, 0, 'Should not release unit when active contract exists');

    const unitContractedUpdate = executedQueries.find(q => q.sql.includes('UPDATE re_units') && q.sql.includes("SET status = 'Contracted'"));
    assert.ok(unitContractedUpdate, 'Unit must be marked as Contracted');

    const unitAvailableUpdate = executedQueries.find(q => q.sql.includes('UPDATE re_units') && q.sql.includes("SET status = 'Available'"));
    assert.equal(unitAvailableUpdate, undefined, 'Unit must NOT be set to Available');
  });
});
