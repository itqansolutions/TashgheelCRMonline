const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');

// Save original methods
const originalDbQuery = db.query;

test('Real Estate Unit Lifecycle State Machine & Guardrails Test Suite', async (t) => {
  t.beforeEach(() => {
    db.query = async () => ({ rows: [] });
  });

  t.afterEach(() => {
    db.query = originalDbQuery;
  });

  // 1. Check Allowed Status Transitions in reUnitsController
  await t.test('reUnitsController prevents invalid transitions and allows valid lifecycle transitions', async () => {
    const reUnitsController = require('../controllers/reUnitsController');

    // Case A: Prohibited jump Available -> Handed Over
    const resA = {
      statusCode: null,
      data: null,
      status(c) { this.statusCode = c; return this; },
      json(d) { this.data = d; return this; }
    };
    db.query = async (sql, params) => {
      if (sql.includes('SELECT status FROM re_units')) {
        return { rows: [{ status: 'Available' }] };
      }
      return { rows: [] };
    };
    await reUnitsController.updateUnit(
      { params: { id: '00000000-0000-0000-0000-000000000001' }, body: { status: 'Handed Over' }, user: { tenant_id: 't1' } },
      resA
    );
    assert.equal(resA.statusCode, 400);
    assert.match(resA.data.message, /Invalid transition from 'Available' to 'Handed Over'/);

    // Case B: Prohibited jump Available -> Contracted directly
    const resB = {
      statusCode: null,
      data: null,
      status(c) { this.statusCode = c; return this; },
      json(d) { this.data = d; return this; }
    };
    await reUnitsController.updateUnit(
      { params: { id: '00000000-0000-0000-0000-000000000001' }, body: { status: 'Contracted' }, user: { tenant_id: 't1' } },
      resB
    );
    assert.equal(resB.statusCode, 400);
    assert.match(resB.data.message, /Invalid transition from 'Available' to 'Contracted'/);

    // Case C: Valid transition Available -> Reserved
    const resC = {
      statusCode: 200,
      data: null,
      status(c) { this.statusCode = c; return this; },
      json(d) { this.data = d; return this; }
    };
    db.query = async (sql, params) => {
      if (sql.includes('SELECT status FROM re_units')) {
        return { rows: [{ status: 'Available' }] };
      }
      if (sql.includes('UPDATE re_units')) {
        return { rows: [{ id: '00000000-0000-0000-0000-000000000001', status: 'Reserved' }] };
      }
      return { rows: [] };
    };
    await reUnitsController.updateUnit(
      { params: { id: '00000000-0000-0000-0000-000000000001' }, body: { status: 'Reserved' }, user: { tenant_id: 't1' } },
      resC
    );
    assert.equal(resC.statusCode, 200);
    assert.equal(resC.data.data.status, 'Reserved');

    // Case D: Prohibited jump Under Dispute -> Handed Over
    const resD = {
      statusCode: null,
      data: null,
      status(c) { this.statusCode = c; return this; },
      json(d) { this.data = d; return this; }
    };
    db.query = async (sql) => {
      if (sql.includes('SELECT status FROM re_units')) {
        return { rows: [{ status: 'Under Dispute' }] };
      }
      return { rows: [] };
    };
    await reUnitsController.updateUnit(
      { params: { id: '00000000-0000-0000-0000-000000000001' }, body: { status: 'Handed Over' }, user: { tenant_id: 't1' } },
      resD
    );
    assert.equal(resD.statusCode, 400);
    assert.match(resD.data.message, /Invalid transition from 'Under Dispute' to 'Handed Over'/);

    // Case E: Valid resolution Under Dispute -> Available
    const resE = {
      statusCode: 200,
      data: null,
      status(c) { this.statusCode = c; return this; },
      json(d) { this.data = d; return this; }
    };
    db.query = async (sql) => {
      if (sql.includes('SELECT status FROM re_units')) {
        return { rows: [{ status: 'Under Dispute' }] };
      }
      if (sql.includes('UPDATE re_units')) {
        return { rows: [{ id: '00000000-0000-0000-0000-000000000001', status: 'Available' }] };
      }
      return { rows: [] };
    };
    await reUnitsController.updateUnit(
      { params: { id: '00000000-0000-0000-0000-000000000001' }, body: { status: 'Available' }, user: { tenant_id: 't1' } },
      resE
    );
    assert.equal(resE.statusCode, 200);
    assert.equal(resE.data.data.status, 'Available');
  });

  // 2. DealsController won/closed stage does NOT write 'Sold'
  await t.test('dealsController updateStage does NOT write Sold on re_units', async () => {
    const dealsController = require('../controllers/dealsController');
    const recordedQueries = [];

    const mockClient = {
      query: async (sql, params) => {
        recordedQueries.push({ sql, params });
        if (sql.includes('SELECT id, title, pipeline_stage, assigned_to FROM deals')) {
          return { rows: [{ id: 10, title: 'Test Deal', pipeline_stage: 'negotiation', assigned_to: 'user-1' }] };
        }
        if (sql.includes('SELECT unit_id FROM deals')) {
          return { rows: [{ unit_id: '00000000-0000-0000-0000-000000000001' }] };
        }
        if (sql.includes('UPDATE deals SET pipeline_stage')) {
          return { rows: [{ id: 10, pipeline_stage: 'closed' }] };
        }
        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;

    const res = {
      statusCode: 200,
      data: null,
      status(c) { this.statusCode = c; return this; },
      json(d) { this.data = d; return this; }
    };

    await dealsController.updateDealStatus(
      { params: { id: 10 }, body: { pipeline_stage: 'closed' }, user: { id: 'user-1', tenant_id: 't1' } },
      res
    );

    // Verify none of the executed queries attempted to set status = 'Sold'
    const soldUpdates = recordedQueries.filter(q => q.sql.includes("status = 'Sold'"));
    assert.equal(soldUpdates.length, 0, 'No query should update status to Sold');
  });

  // 3. Database Check Constraint Verification (Real DB query)
  await t.test('re_units chk_re_units_status rejects Sold and accepts allowed statuses in real DB', async () => {
    // Restore real db for this test
    db.query = originalDbQuery;

    // A: Attempt to insert or update with invalid status 'Sold'
    let rejected = false;
    try {
      await db.query(`
        INSERT INTO re_units (tenant_id, name, unit_number, type, price, status)
        VALUES ('3a7103aa-ca78-4478-8fdf-4036fe132ecc', 'Illegal Unit', 'ILL-01', 'Apartment', 100000, 'Sold')
      `);
    } catch (err) {
      if (err.message.includes('chk_re_units_status')) {
        rejected = true;
      }
    }
    assert.equal(rejected, true, 'DB constraint must reject Sold status');

    // B: Allowed statuses check
    const allowed = ['Available', 'Reserved', 'Contracted', 'Handed Over', 'Under Dispute'];
    for (const st of allowed) {
      const testName = `Reg Test Unit ${st}`;
      const insRes = await db.query(`
        INSERT INTO re_units (tenant_id, name, unit_number, type, price, status)
        VALUES ('3a7103aa-ca78-4478-8fdf-4036fe132ecc', $1, 'TEST-REG', 'Apartment', 500000, $2)
        RETURNING id, status
      `, [testName, st]);
      assert.equal(insRes.rows[0].status, st, `Status ${st} must be accepted by constraint`);

      // Clean up test unit
      await db.query(`DELETE FROM re_units WHERE id = $1`, [insRes.rows[0].id]);
    }
  });
});
