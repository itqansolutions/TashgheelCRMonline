const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');
const dealsController = require('../controllers/dealsController');
const reUnitsController = require('../controllers/reUnitsController');
const reContractsController = require('../controllers/reContractsController');

const TENANT = '11111111-1111-4111-8111-111111111111';
const BRANCH = '22222222-2222-4222-8222-222222222222';
const UNIT_ID = '33333333-3333-4333-8333-333333333333';

test('Condition 1: Multiple deals can link to the same Available unit in early stages without reserving it', async () => {
  const origConnect = db.connect;
  const origQuery = db.query;

  let unitStatus = 'Available';
  const unitRow = {
    id: UNIT_ID,
    tenant_id: TENANT,
    branch_id: BRANCH,
    status: 'Available',
    price: 3500000,
    project_name: 'Palm Vista',
    unit_number: 'PV-101'
  };

  const createdDeals = [];

  const handleQuery = async (sql, params) => {
    const norm = sql.replace(/\s+/g, ' ').trim();

    if (norm === 'BEGIN' || norm === 'COMMIT' || norm === 'ROLLBACK') return { rows: [] };
    if (norm.startsWith('ALTER TABLE deals')) return { rows: [] };
    if (norm.includes('FROM re_units') && (norm.includes('WHERE id::text = $1::text') || norm.includes('ru.id = $1::uuid'))) {
      return { rows: [{ ...unitRow, status: unitStatus }] };
    }
    if (norm.startsWith('INSERT INTO deals')) {
      const dealId = createdDeals.length + 101;
      // INSERT INTO deals (title, value, pipeline_stage, client_id, product_id, project_id, assigned_to, tenant_id, branch_id, custom_fields, unit_id, probability, expected_close_date, next_action, source_type, source_id)
      const newDeal = {
        id: dealId,
        title: params[0],
        value: params[1],
        pipeline_stage: params[2],
        client_id: params[3],
        assigned_to: params[6],
        tenant_id: params[7],
        branch_id: params[8],
        custom_fields: params[9] && typeof params[9] === 'object' ? params[9] : (params[9] ? JSON.parse(params[9]) : {}),
        unit_id: params[10], // $11 is unit_id (0-indexed: 10)
      };
      createdDeals.push(newDeal);
      return { rows: [newDeal] };
    }
    if (norm.startsWith('UPDATE re_units SET status')) {
      unitStatus = params[0];
      return { rows: [] };
    }
    if (norm.includes('INSERT INTO activities') || norm.includes('INSERT INTO system_logs')) {
      return { rows: [] };
    }
    return { rows: [] };
  };

  db.query = handleQuery;
  db.connect = async () => ({
    query: handleQuery,
    release() {}
  });

  try {
    // 1. Rep A creates Deal 1 for Customer 10 in stage "Lead"
    let status1 = 200;
    let body1 = null;
    await dealsController.createDeal(
      {
        body: {
          title: 'Prospect A Deal',
          unit_id: UNIT_ID,
          client_id: 10,
          pipeline_stage: 'Lead',
          assigned_to: 1
        },
        user: { id: 1, tenant_id: TENANT, branch_id: BRANCH, role: 'user', permissions: ['deal.edit_details'] },
        ip: '127.0.0.1'
      },
      {
        status(c) { status1 = c; return this; },
        json(b) { body1 = b; return this; }
      }
    );

    assert.equal(status1, 201);
    assert.equal(body1.data.unit_id, UNIT_ID);
    assert.equal(unitStatus, 'Available', 'Unit MUST remain Available on early-stage Deal 1 creation');

    // 2. Rep B creates Deal 2 for Customer 20 in stage "Site Visit" on the same unit
    let status2 = 200;
    let body2 = null;
    await dealsController.createDeal(
      {
        body: {
          title: 'Prospect B Deal',
          unit_id: UNIT_ID,
          client_id: 20,
          pipeline_stage: 'Site Visit',
          assigned_to: 2
        },
        user: { id: 2, tenant_id: TENANT, branch_id: BRANCH, role: 'user', permissions: ['deal.edit_details'] },
        ip: '127.0.0.1'
      },
      {
        status(c) { status2 = c; return this; },
        json(b) { body2 = b; return this; }
      }
    );

    assert.equal(status2, 201);
    assert.equal(body2.data.unit_id, UNIT_ID);
    assert.equal(unitStatus, 'Available', 'Unit MUST remain Available on early-stage Deal 2 creation');
    assert.equal(createdDeals.length, 2, 'Both deals coexist on the same unit');
  } finally {
    db.query = origQuery;
    db.connect = origConnect;
  }
});

test('Condition 1 (Reservation Lock): Explicit reservation locks unit and rejects concurrent reservation by another deal', async () => {
  const origConnect = db.connect;
  const origQuery = db.query;

  let unitStatus = 'Available';
  let unitResExpiresAt = null;

  const dealsInDb = [
    {
      id: 101,
      title: 'Deal 101',
      unit_id: UNIT_ID,
      client_id: 10,
      pipeline_stage: 'Site Visit',
      assigned_to: 1,
      tenant_id: TENANT,
      branch_id: BRANCH,
      custom_fields: {}
    },
    {
      id: 102,
      title: 'Deal 102',
      unit_id: UNIT_ID,
      client_id: 20,
      pipeline_stage: 'Negotiation',
      assigned_to: 2,
      tenant_id: TENANT,
      branch_id: BRANCH,
      custom_fields: {}
    }
  ];

  const handleQuery = async (sql, params) => {
    const norm = sql.replace(/\s+/g, ' ').trim();
    if (norm === 'BEGIN' || norm === 'COMMIT' || norm === 'ROLLBACK') return { rows: [] };

    if (norm.includes('FROM deals') && norm.includes('FOR UPDATE')) {
      const dealId = Number(params[0]);
      const d = dealsInDb.find(x => x.id === dealId && x.tenant_id === params[1]);
      return { rows: d ? [{ ...d }] : [] };
    }

    if (norm.includes('FROM re_units') && norm.includes('FOR UPDATE')) {
      return {
        rows: [{
          id: UNIT_ID,
          tenant_id: TENANT,
          branch_id: BRANCH,
          status: unitStatus,
          unit_number: 'PV-101',
          project_name: 'Palm Vista'
        }]
      };
    }

    if (norm.includes('FROM deals') && norm.includes('is_unit_reservation')) {
      const excludingDealId = Number(params[2]);
      const otherHolder = dealsInDb.find(x =>
        x.unit_id === params[0] &&
        x.tenant_id === params[1] &&
        x.id !== excludingDealId &&
        x.custom_fields?.is_unit_reservation === true &&
        !['lost', 'cancelled', 'canceled'].includes(String(x.pipeline_stage).toLowerCase())
      );
      return { rows: otherHolder ? [otherHolder] : [] };
    }

    if (norm.startsWith('UPDATE re_units SET status = \'Reserved\'')) {
      unitStatus = 'Reserved';
      unitResExpiresAt = new Date(Date.now() + 48 * 3600000).toISOString();
      return { rows: [{ id: UNIT_ID, status: 'Reserved', reservation_expires_at: unitResExpiresAt }] };
    }

    if (norm.startsWith('UPDATE deals SET custom_fields = $1')) {
      const nextCf = typeof params[0] === 'string' ? JSON.parse(params[0]) : params[0];
      const dealId = Number(params[1]);
      const d = dealsInDb.find(x => x.id === dealId);
      if (d) d.custom_fields = nextCf;
      return { rows: [{ ...d, custom_fields: nextCf }] };
    }

    if (norm.includes('INSERT INTO system_logs') || norm.includes('FROM settings')) return { rows: [] };
    return { rows: [] };
  };

  db.connect = async () => ({
    query: handleQuery,
    release() {}
  });
  db.query = handleQuery;

  try {
    // 1. Explicitly reserve Unit for Deal 101
    let res1Status = 200;
    let res1Body = null;
    await dealsController.reserveDealUnit(
      {
        params: { id: 101 },
        user: { id: 1, tenant_id: TENANT, branch_id: BRANCH, role: 'user', permissions: ['deal.edit_details'] },
        ip: '127.0.0.1'
      },
      {
        status(c) { res1Status = c; return this; },
        json(b) { res1Body = b; return this; }
      }
    );

    assert.equal(res1Status, 200);
    assert.equal(unitStatus, 'Reserved');
    assert.equal(dealsInDb[0].custom_fields.is_unit_reservation, true);

    // 2. Attempt explicit reservation for Deal 102 on same unit -> MUST return 409
    let res2Status = 200;
    let res2Body = null;
    await dealsController.reserveDealUnit(
      {
        params: { id: 102 },
        user: { id: 2, tenant_id: TENANT, branch_id: BRANCH, role: 'user', permissions: ['deal.edit_details'] },
        ip: '127.0.0.1'
      },
      {
        status(c) { res2Status = c; return this; },
        json(b) { res2Body = b; return this; }
      }
    );

    assert.equal(res2Status, 409, 'Concurrent reservation on already reserved unit must be rejected with 409');
    assert.ok(res2Body.code === 'UNIT_NOT_AVAILABLE' || res2Body.code === 'UNIT_ALREADY_RESERVED');
  } finally {
    db.connect = origConnect;
    db.query = origQuery;
  }
});

test('Condition 2: Deal loss releases unit ONLY if unit was Reserved AND deal was reservation holder; never modifies Contracted/Dispute', async () => {
  const origQuery = db.query;
  const origConnect = db.connect;

  let unitStatus = 'Reserved';

  const deals = [
    {
      id: 201,
      title: 'Deal 201 Reserver',
      unit_id: UNIT_ID,
      pipeline_stage: 'Negotiation',
      tenant_id: TENANT,
      branch_id: BRANCH,
      assigned_to: 1,
      custom_fields: { is_unit_reservation: true }
    },
    {
      id: 202,
      title: 'Deal 202 Inquiry',
      unit_id: UNIT_ID,
      pipeline_stage: 'Site Visit',
      tenant_id: TENANT,
      branch_id: BRANCH,
      assigned_to: 2,
      custom_fields: { is_unit_reservation: false }
    }
  ];

  const handleQuery = async (sql, params) => {
    const norm = sql.replace(/\s+/g, ' ').trim();

    if (norm === 'BEGIN' || norm === 'COMMIT' || norm === 'ROLLBACK') return { rows: [] };
    if (norm.startsWith('ALTER TABLE deals')) return { rows: [] };

    // Fetch deal for updateDealStatus
    if (norm.includes('FROM deals') && (norm.includes('WHERE id = $1') || norm.includes('WHERE id::text = $1::text') || (norm.includes('FOR UPDATE') && !norm.includes('unit_id')))) {
      const d = deals.find(x => x.id === Number(params[0]));
      return { rows: d ? [{ ...d }] : [] };
    }
    if (norm.includes('FROM re_contracts WHERE deal_id')) return { rows: [] };
    if (norm.includes('FROM re_units') && (norm.includes('WHERE id::text = $1::text') || norm.includes('FOR UPDATE'))) {
      return { rows: [{ id: UNIT_ID, tenant_id: TENANT, status: unitStatus, branch_id: BRANCH }] };
    }
    if (norm.includes('FROM deals') && norm.includes('unit_id::text = $1::text') && norm.includes('id::text != $2::text')) {
      const excludeId = Number(params[1]);
      const otherHolder = deals.find(x =>
        x.unit_id === params[0] &&
        x.tenant_id === params[2] &&
        x.id !== excludeId &&
        x.custom_fields?.is_unit_reservation === true &&
        !['lost', 'cancelled', 'canceled'].includes(String(x.pipeline_stage).toLowerCase())
      );
      return { rows: otherHolder ? [otherHolder] : [] };
    }
    if (norm.includes('FROM deals') && norm.includes('is_unit_reservation') && norm.includes('id != $3')) {
      const excludeId = Number(params[2]);
      const otherHolder = deals.find(x =>
        x.unit_id === params[0] &&
        x.tenant_id === params[1] &&
        x.id !== excludeId &&
        x.custom_fields?.is_unit_reservation === true &&
        !['lost', 'cancelled', 'canceled'].includes(String(x.pipeline_stage).toLowerCase())
      );
      return { rows: otherHolder ? [otherHolder] : [] };
    }
    if (norm.includes('UPDATE re_units') && norm.includes('Available')) {
      unitStatus = 'Available';
      return { rows: [{ id: UNIT_ID, status: 'Available' }] };
    }
    if (norm.startsWith('UPDATE deals SET pipeline_stage = $1')) {
      const stage = params[0];
      const dId = Number(params[1]);
      const d = deals.find(x => x.id === dId);
      if (d) d.pipeline_stage = stage;
      return { rows: [d ? { ...d, pipeline_stage: stage, unit_id: UNIT_ID } : { id: dId, pipeline_stage: stage, unit_id: UNIT_ID }] };
    }
    if (norm.startsWith('UPDATE deals SET')) {
      return { rows: [{ ...deals[0], pipeline_stage: 'lost', unit_id: UNIT_ID }] };
    }
    return { rows: [] };
  };

  db.query = handleQuery;
  db.connect = async () => ({
    query: handleQuery,
    release() {}
  });

  try {
    // 1. Deal 202 (non-reserver) is closed as 'lost'
    await dealsController.updateDealStatus(
      {
        params: { id: 202 },
        body: { pipeline_stage: 'lost' },
        user: { id: 2, tenant_id: TENANT, role: 'admin', branch_id: BRANCH, permissions: ['deal.update_stage'] }
      },
      {
        status() { return this; },
        json() { return this; }
      }
    );

    assert.equal(unitStatus, 'Reserved', 'Closing non-reserving deal must NOT release unit while Deal 201 reservation is active');

    // 2. Deal 201 (reserver) is closed as 'lost'
    await dealsController.updateDealStatus(
      {
        params: { id: 201 },
        body: { pipeline_stage: 'lost' },
        user: { id: 1, tenant_id: TENANT, role: 'admin', branch_id: BRANCH, permissions: ['deal.update_stage'] }
      },
      {
        status() { return this; },
        json() { return this; }
      }
    );

    assert.equal(unitStatus, 'Available', 'Closing the reservation holder deal safely releases unit back to Available');

    // 3. Protection: If unit was Contracted, closing a deal must NEVER set it to Available!
    unitStatus = 'Contracted';
    deals[0].pipeline_stage = 'Negotiation';
    await dealsController.updateDealStatus(
      {
        params: { id: 201 },
        body: { pipeline_stage: 'lost' },
        user: { id: 1, tenant_id: TENANT, role: 'admin', branch_id: BRANCH, permissions: ['deal.update_stage'] }
      },
      {
        status() { return this; },
        json() { return this; }
      }
    );
    assert.equal(unitStatus, 'Contracted', 'Contracted unit status must NEVER be mutated on deal loss');

    // 4. Protection: If unit was Under Dispute, status must NEVER be mutated on deal loss!
    unitStatus = 'Under Dispute';
    await dealsController.updateDealStatus(
      {
        params: { id: 201 },
        body: { pipeline_stage: 'lost' },
        user: { id: 1, tenant_id: TENANT, role: 'admin', branch_id: BRANCH, permissions: ['deal.update_stage'] }
      },
      {
        status() { return this; },
        json() { return this; }
      }
    );
    assert.equal(unitStatus, 'Under Dispute', 'Under Dispute unit status must NEVER be mutated on deal loss');
  } finally {
    db.query = origQuery;
    db.connect = origConnect;
  }
});

test('Condition 3: GET /api/re-units/:id/overview returns 4 distinct KPIs and deal rows strictly filtered by RBAC scope', async () => {
  const origQuery = db.query;

  const mockUnit = {
    id: UNIT_ID,
    tenant_id: TENANT,
    branch_id: BRANCH,
    name: 'Unit 101',
    unit_number: 'U101',
    status: 'Available',
    price: 4500000,
    area_sqm: 160,
    type: 'Apartment'
  };

  const allDeals = [
    {
      deal_id: 1,
      deal_title: 'Rep A Deal 1',
      value: 4500000,
      pipeline_stage: 'Negotiation',
      customer_id: 10,
      customer_name: 'Customer 10',
      assigned_to: '100', // Rep A
      sales_rep_name: 'Rep A',
      branch_id: BRANCH,
      custom_fields: {}
    },
    {
      deal_id: 2,
      deal_title: 'Rep A Deal 2',
      value: 4500000,
      pipeline_stage: 'Site Visit',
      customer_id: 10, // Same Customer 10!
      assigned_to: '100', // Rep A
      sales_rep_name: 'Rep A',
      branch_id: BRANCH,
      custom_fields: {}
    },
    {
      deal_id: 3,
      deal_title: 'Rep B Deal 3',
      value: 4500000,
      pipeline_stage: 'Lead',
      customer_id: 20, // Customer 20
      assigned_to: '200', // Rep B
      sales_rep_name: 'Rep B',
      branch_id: BRANCH,
      custom_fields: {}
    }
  ];

  db.query = async (sql, params) => {
    const norm = sql.replace(/\s+/g, ' ').trim();

    if (norm.includes('FROM re_units ru') && norm.includes('ru.id = $1::uuid')) {
      return { rows: [mockUnit] };
    }
    if (norm.includes('FROM deals d') && norm.includes('d.unit_id::text = $1::text')) {
      // Check if RBAC scope for employee is present: (d.assigned_to::text = $4::text)
      if (norm.includes('(d.assigned_to::text = $4::text)')) {
        const userId = params[3];
        const scoped = allDeals.filter(d => String(d.assigned_to) === String(userId));
        return { rows: scoped };
      }
      // Otherwise admin sees all
      return { rows: allDeals };
    }
    if (norm.includes('FROM activities') || norm.includes('FROM tasks')) {
      return { rows: [] };
    }
    return { rows: [] };
  };

  try {
    // 1. Restricted Sales Rep A (id: '100', role: 'user')
    let repStatusCode = 200;
    let repBody = null;
    await reUnitsController.getUnitOverview(
      {
        params: { id: UNIT_ID },
        query: {},
        user: { id: 100, tenant_id: TENANT, role: 'user', branch_id: BRANCH }
      },
      {
        status(c) { repStatusCode = c; return this; },
        json(b) { repBody = b; return this; }
      }
    );

    assert.equal(repStatusCode, 200);
    const repData = repBody.data;

    // Rep A has 2 deals, but both are for the same Customer 10!
    assert.equal(repData.deals.length, 2, 'Sales Rep A sees only their 2 deals');
    assert.equal(repData.kpis.distinct_customers_count, 1, 'Distinct customers for Rep A is 1 (Customer 10)');
    assert.equal(repData.kpis.total_deals_count, 2, 'Total deals count for Rep A is 2');
    assert.equal(repData.kpis.active_deals_count, 2, 'Active deals count for Rep A is 2');
    assert.equal(repData.kpis.distinct_sales_reps_count, 1, 'Distinct sales reps count for Rep A is 1');

    // Rep B's data MUST NOT leak into Rep A's view
    const customerIdsSeen = repData.deals.map(d => d.customer_id);
    assert.ok(!customerIdsSeen.includes(20), 'Customer 20 from Rep B is NOT visible to Rep A');

    // 2. Admin (role: 'admin')
    let adminStatusCode = 200;
    let adminBody = null;
    await reUnitsController.getUnitOverview(
      {
        params: { id: UNIT_ID },
        query: {},
        user: { id: 999, tenant_id: TENANT, role: 'admin', branch_id: BRANCH }
      },
      {
        status(c) { adminStatusCode = c; return this; },
        json(b) { adminBody = b; return this; }
      }
    );

    assert.equal(adminStatusCode, 200);
    const adminData = adminBody.data;

    // Admin sees all 3 deals across 2 distinct customers (10 and 20) and 2 distinct reps (Rep A and Rep B)
    assert.equal(adminData.deals.length, 3, 'Admin sees all 3 deals');
    assert.equal(adminData.kpis.distinct_customers_count, 2, 'Admin distinct customers is 2');
    assert.equal(adminData.kpis.total_deals_count, 3, 'Admin total deals is 3');
    assert.equal(adminData.kpis.active_deals_count, 3, 'Admin active deals is 3');
    assert.equal(adminData.kpis.distinct_sales_reps_count, 2, 'Admin distinct reps is 2');
  } finally {
    db.query = origQuery;
  }
});

test('Contract creation on Reserved unit prevents non-reserving deal from hijacking another deal\'s reservation', async () => {
  const origConnect = db.connect;

  const dealReserving = { id: 301, title: 'Reserving Deal', unit_id: UNIT_ID, tenant_id: TENANT, branch_id: BRANCH, value: 5000000, custom_fields: { is_unit_reservation: true } };
  const dealInquiry = { id: 302, title: 'Inquiry Deal', unit_id: UNIT_ID, tenant_id: TENANT, branch_id: BRANCH, value: 5000000, custom_fields: {} };

  db.connect = async () => {
    return {
      query: async (sql, params) => {
        const norm = sql.replace(/\s+/g, ' ').trim();
        if (norm === 'BEGIN' || norm === 'COMMIT' || norm === 'ROLLBACK') return { rows: [] };

        if (norm.includes('FROM deals d') && norm.includes('d.id = $1')) {
          const id = Number(params[0]);
          return { rows: id === 302 ? [dealInquiry] : [dealReserving] };
        }
        if (norm.includes('FROM re_units') && norm.includes('FOR UPDATE')) {
          return { rows: [{ id: UNIT_ID, status: 'Reserved' }] };
        }
        if (norm.includes('FROM deals') && norm.includes('is_unit_reservation') && norm.includes('id != $3')) {
          return { rows: [{ id: 301, title: 'Reserving Deal' }] };
        }
        return { rows: [] };
      },
      release() {}
    };
  };

  try {
    let hijackStatus = 200;
    let hijackBody = null;
    await reContractsController.createContract(
      {
        body: { deal_id: 302 },
        user: { id: 1, tenant_id: TENANT, role: 'admin', branch_id: BRANCH }
      },
      {
        status(c) { hijackStatus = c; return this; },
        json(b) { hijackBody = b; return this; }
      }
    );

    assert.equal(hijackStatus, 409, 'Attempt by non-reserver to create contract on unit reserved by another deal must return 409');
    assert.equal(hijackBody.code, 'UNIT_RESERVED_BY_OTHER_DEAL');
  } finally {
    db.connect = origConnect;
  }
});
