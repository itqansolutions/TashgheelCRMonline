const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');
const dealsController = require('../controllers/dealsController');
const customersController = require('../controllers/customersController');

// Save original db methods
const originalDbQuery = db.query;

test('Batch A: Customer 360 to Deal Navigation & Multi-Tenant Isolation', async (t) => {
  t.afterEach(() => {
    db.query = originalDbQuery;
  });

  // 1. Single Deal Query Scoping & Tenant Isolation
  await t.test('1. Security: getDealById enforces tenant isolation and branch context', async () => {
    let capturedQuery = null;
    let capturedParams = null;

    db.query = async (sql, params) => {
      if (!capturedParams && sql.includes('WHERE d.id = $1')) {
        capturedQuery = sql;
        capturedParams = params;
      }
      // Simulate deal belonging to tenant-A
      if (params[1] === 'tenant-A' && params[0] === '101') {
        return {
          rows: [{
            id: 101,
            title: 'Penthouse Deal',
            value: 5000000,
            pipeline_stage: 'Negotiation',
            client_id: 1,
            tenant_id: 'tenant-A',
            branch_id: 'branch-1'
          }]
        };
      }
      return { rows: [] };
    };

    // Case 1A: Authorized access by tenant-A
    const reqAuthorized = {
      user: { id: 'user-1', tenant_id: 'tenant-A', branch_id: 'branch-1' },
      branchId: 'branch-1',
      params: { id: '101' }
    };
    let statusCodeAuth = null;
    let jsonBodyAuth = null;
    const resAuth = {
      status: (code) => { statusCodeAuth = code; return resAuth; },
      json: (data) => { jsonBodyAuth = data; return resAuth; }
    };

    await dealsController.getDealById(reqAuthorized, resAuth);
    assert.equal(statusCodeAuth, null); // 200 default
    assert.equal(jsonBodyAuth.status, 'success');
    assert.equal(jsonBodyAuth.data.id, 101);
    assert.equal(jsonBodyAuth.data.title, 'Penthouse Deal');

    // Verify tenant_id parameter was strictly passed to SQL query
    assert.equal(capturedParams[0], '101');
    assert.equal(capturedParams[1], 'tenant-A');
    assert.equal(capturedParams[2], 'branch-1');

    // Case 1B: Cross-tenant unauthorized access attempt by tenant-B
    const reqCrossTenant = {
      user: { id: 'user-2', tenant_id: 'tenant-B', branch_id: 'branch-2' },
      branchId: 'branch-2',
      params: { id: '101' }
    };
    let statusCodeCross = null;
    let jsonBodyCross = null;
    const resCross = {
      status: (code) => { statusCodeCross = code; return resCross; },
      json: (data) => { jsonBodyCross = data; return resCross; }
    };

    await dealsController.getDealById(reqCrossTenant, resCross);
    assert.equal(statusCodeCross, 404);
    assert.equal(jsonBodyCross.status, 'error');
    assert.match(jsonBodyCross.message, /not found or unauthorized/i);
    // Ensure no data fields are leaked in 404 response
    assert.equal(jsonBodyCross.data, undefined);
  });

  // 2. Safe Fallback on Missing or Invalid Deal ID
  await t.test('2. Safety: getDealById returns 404 without crashing when deal does not exist', async () => {
    db.query = async () => ({ rows: [] });

    const req = {
      user: { id: 'user-1', tenant_id: 'tenant-A', branch_id: 'branch-1' },
      branchId: 'branch-1',
      params: { id: '9999999' }
    };
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };

    await dealsController.getDealById(req, res);
    assert.equal(statusCode, 404);
    assert.equal(jsonBody.status, 'error');
    assert.match(jsonBody.message, /not found or unauthorized/i);
    assert.equal(jsonBody.data, undefined);
  });

  // 3. Customer 360 deals payload integrity
  await t.test('3. Integrity: getCustomer360 includes all deal metadata needed for navigation and card display', async () => {
    db.query = async (sql, params) => {
      // Column guard check
      if (sql.includes('information_schema.columns')) {
        return { rows: [{ column_name: 'branch_id' }] };
      }
      // Customer record
      if (sql.includes('FROM customers c')) {
        return {
          rows: [{
            id: 'cust-1',
            name: 'Client Alpha',
            phone: '01000000000',
            tenant_id: 'tenant-100',
            branch_id: 'branch-1'
          }]
        };
      }
      // Deals query (sql includes FROM deals d)
      if (sql.includes('FROM deals d')) {
        return {
          rows: [{
            id: 42,
            title: 'Sky Tower Suite #502',
            value: '3500000.00',
            pipeline_stage: 'Site Visit Completed',
            assigned_to_name: 'Hassan Karim',
            product_name: null,
            unit_number: '502',
            unit_project_name: 'Sky Tower',
            unit_status: 'Reserved',
            created_at: new Date('2026-10-01T10:00:00Z')
          }]
        };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 'usr-1', tenant_id: 'tenant-100', branch_id: 'branch-1' },
      branchId: 'branch-1',
      params: { id: 'cust-1' }
    };
    let jsonBody = null;
    const res = {
      status: () => res,
      json: (data) => { jsonBody = data; return res; }
    };

    await customersController.getCustomer360(req, res);
    assert.equal(jsonBody.status, 'success');
    assert.ok(Array.isArray(jsonBody.data.deals));
    assert.equal(jsonBody.data.deals.length, 1);

    const deal = jsonBody.data.deals[0];
    assert.equal(deal.id, 42);
    assert.equal(deal.title, 'Sky Tower Suite #502');
    assert.equal(deal.pipeline_stage, 'Site Visit Completed');
    assert.equal(deal.unit_number, '502');
    assert.equal(deal.unit_project_name, 'Sky Tower');
    assert.equal(deal.assigned_to_name, 'Hassan Karim');
  });

  // 4. URL Navigation Simulation & Lifecycle State Machine
  await t.test('4. Frontend State Machine: URL query params, modal opening, closing, and browser history transitions', () => {
    const deals = [
      { id: 10, title: 'Commercial Office 101', value: 1200000 },
      { id: 20, title: 'Villa 5 Palm', value: 8500000 }
    ];

    // State container simulating Deals.jsx component state
    let state = {
      searchParams: new URLSearchParams(''),
      isModalOpen: false,
      editingDeal: null,
      openedByQueryParamRef: null
    };

    // Helper simulating the navigation effect in Deals.jsx
    const runNavigationEffect = (loading = false) => {
      const dealIdParam = state.searchParams.get('deal_id');

      if (!dealIdParam) {
        if (state.openedByQueryParamRef && state.isModalOpen) {
          state.openedByQueryParamRef = null;
          state.isModalOpen = false;
          state.editingDeal = null;
        }
        return;
      }

      if (state.editingDeal && String(state.editingDeal.id) === String(dealIdParam) && state.isModalOpen) {
        return;
      }

      const targetDeal = deals.find(d => String(d.id) === String(dealIdParam));
      if (targetDeal) {
        state.openedByQueryParamRef = String(dealIdParam);
        state.editingDeal = targetDeal;
        state.isModalOpen = true;
        return;
      }

      if (loading) return;

      // In real code, fallback API is called; here simulate invalid lookup
      state.searchParams.delete('deal_id');
    };

    // Helper simulating handleCloseModal in Deals.jsx
    const handleCloseModal = () => {
      state.isModalOpen = false;
      state.editingDeal = null;
      state.openedByQueryParamRef = null;
      if (state.searchParams.get('deal_id')) {
        state.searchParams.delete('deal_id');
      }
    };

    // --- Scenario A: Direct URL navigation to ?deal_id=10 ---
    state.searchParams = new URLSearchParams('deal_id=10&view=kanban');
    runNavigationEffect(false);
    assert.equal(state.isModalOpen, true, 'Modal should open for deal 10');
    assert.equal(state.editingDeal.id, 10, 'Editing deal must be deal 10');
    assert.equal(state.openedByQueryParamRef, '10', 'Ref must record query param origin');
    assert.equal(state.searchParams.get('view'), 'kanban', 'Unrelated query param view=kanban must be preserved');

    // --- Scenario B: Switch directly from deal_id=10 to deal_id=20 ---
    state.searchParams = new URLSearchParams('deal_id=20&view=kanban');
    runNavigationEffect(false);
    assert.equal(state.isModalOpen, true, 'Modal should remain open');
    assert.equal(state.editingDeal.id, 20, 'Editing deal must switch to deal 20');
    assert.equal(state.openedByQueryParamRef, '20');

    // --- Scenario C: Browser Back button pressed (deal_id removed from URL) ---
    state.searchParams = new URLSearchParams('view=kanban');
    runNavigationEffect(false);
    assert.equal(state.isModalOpen, false, 'Modal should close on browser back');
    assert.equal(state.editingDeal, null, 'Editing deal must be reset to null');
    assert.equal(state.openedByQueryParamRef, null, 'Ref must be cleared');
    assert.equal(state.searchParams.get('view'), 'kanban', 'View parameter must be intact');

    // --- Scenario D: Manual "+ New Deal" modal open (not triggered by query param) ---
    state.isModalOpen = true;
    state.editingDeal = null;
    state.openedByQueryParamRef = null;
    // Navigation effect runs with no deal_id in URL
    runNavigationEffect(false);
    assert.equal(state.isModalOpen, true, 'Manual modal must NOT be closed by navigation effect');

    // --- Scenario E: Closing modal cleans only deal_id and preserves other parameters ---
    state.searchParams = new URLSearchParams('deal_id=10&view=table&filter=hot');
    runNavigationEffect(false);
    assert.equal(state.isModalOpen, true);
    handleCloseModal();
    assert.equal(state.isModalOpen, false, 'Modal closed');
    assert.equal(state.searchParams.get('deal_id'), null, 'deal_id must be removed');
    assert.equal(state.searchParams.get('view'), 'table', 'view must remain table');
    assert.equal(state.searchParams.get('filter'), 'hot', 'filter must remain hot');

    // --- Scenario F: Coexistence with create-deal params ?new=1&client_id=X&unit_id=Y ---
    const createParams = new URLSearchParams('new=1&client_id=15&unit_id=99');
    assert.equal(createParams.get('new'), '1');
    assert.equal(createParams.get('client_id'), '15');
    assert.equal(createParams.get('unit_id'), '99');
    assert.equal(createParams.get('deal_id'), null, 'No collision with deal_id');
  });
});
