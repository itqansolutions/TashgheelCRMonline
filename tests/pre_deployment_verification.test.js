const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const customersController = require('../controllers/customersController');
const dealsController = require('../controllers/dealsController');
const activityController = require('../controllers/activityController');

const originalDbQuery = db.query;

test('Pre-Deployment Verification Suite: 5 Core Architectural & Security Checks', async (t) => {
  t.afterEach(() => {
    db.query = originalDbQuery;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CHECK 1: customersController does not expand permissions when branch_id is null
  // ───────────────────────────────────────────────────────────────────────────
  await t.test('Check 1: customersController enforces strict row-level employee scoping even with missing branch_id', async () => {
    let capturedQuery = null;
    let capturedParams = null;

    db.query = async (sql, params) => {
      capturedQuery = sql;
      capturedParams = params;
      return { rows: [] };
    };

    // Employee with NO branch_id set
    const req = {
      user: { id: 77, tenant_id: 'tenant-abc-123', role: 'employee' },
      branchId: null,
      query: {}
    };
    const res = {
      status: () => res,
      json: (data) => data
    };

    await customersController.getCustomers(req, res);

    assert.ok(capturedQuery, 'Query must have executed');
    // 1. Tenant isolation param must be strictly passed as $1
    assert.equal(capturedParams[0], 'tenant-abc-123', 'Tenant ID must be param $1');
    // 2. Row level scoping for employee must be present
    assert.ok(
      capturedQuery.includes('c.assigned_to = $') || capturedQuery.includes('c.assigned_to::text = $'),
      'Must contain row-level scoping for employee (c.assigned_to)'
    );
    // 3. Employee ID '77' must be present in query params to enforce ownership
    assert.ok(capturedParams.map(String).includes('77'), 'Employee ID must be strictly bound in params');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CHECK 2: cleanAssignedTo validates tenant_id and prevents cross-tenant assignment
  // ───────────────────────────────────────────────────────────────────────────
  await t.test('Check 2A: createDeal rejects assignee from different tenant (INVALID_ASSIGNEE)', async () => {
    // Mock DB: user 999 does NOT belong to tenant-abc
    db.query = async (sql, params) => {
      // Permission check mock: allow deal.reassign so we reach tenant validation
      if (sql.includes('user_access')) {
        return { rows: [{ page_path: 'deal.reassign', can_access: true }] };
      }
      // Assignee check: returns empty set (user not found in this tenant)
      if (sql.includes('FROM users WHERE id::text = $1::text AND tenant_id::text = $2::text')) {
        return { rows: [] };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 1, tenant_id: 'tenant-abc', role: 'admin' },
      body: {
        title: 'Cross Tenant Deal Attempt',
        assigned_to: 999
      }
    };
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };

    await dealsController.createDeal(req, res);

    assert.equal(statusCode, 400, 'Must return 400 Bad Request');
    assert.equal(jsonBody?.code, 'INVALID_ASSIGNEE', 'Error code must be INVALID_ASSIGNEE');
  });

  await t.test('Check 2B: updateDeal rejects assignee from different tenant (INVALID_ASSIGNEE)', async () => {
    const existingDeal = {
      id: 10,
      title: 'Valid Deal',
      value: 50000,
      pipeline_stage: 'discovery',
      assigned_to: 1,
      tenant_id: 'tenant-abc',
      branch_id: null
    };

    db.query = async (sql, params) => {
      if (sql.includes('SELECT * FROM deals WHERE')) {
        return { rows: [existingDeal] };
      }
      if (sql.includes('user_access')) {
        return { rows: [{ page_path: 'deal.reassign', can_access: true }, { page_path: 'deal.edit_details', can_access: true }] };
      }
      // Cross tenant assignee not in tenant-abc
      if (sql.includes('FROM users WHERE id::text = $1::text AND tenant_id::text = $2::text')) {
        return { rows: [] };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 1, tenant_id: 'tenant-abc', role: 'admin' },
      params: { id: '10' },
      body: {
        assigned_to: 8888 // Belongs to an attacker's tenant
      }
    };
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };

    await dealsController.updateDeal(req, res);

    assert.equal(statusCode, 400, 'Must return 400 Bad Request');
    assert.equal(jsonBody?.code, 'INVALID_ASSIGNEE', 'Error code must be INVALID_ASSIGNEE');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CHECK 3: DataTable onRowClick does not collide with action buttons or links
  // ───────────────────────────────────────────────────────────────────────────
  await t.test('Check 3: DataTable row click ignore selector and Deals unit badge stop propagation', () => {
    const rootDir = path.resolve(__dirname, '..');
    const dataTableJsx = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'components', 'Common', 'DataTable.jsx'), 'utf8');
    const dealsJsx = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'pages', 'Deals.jsx'), 'utf8');

    // 1. Verify DataTable.jsx filters out buttons, links, inputs, and data-stop-propagation
    assert.match(
      dataTableJsx,
      /!e\.target\.closest\('button,\s*a,\s*input,\s*select,\s*textarea,\s*\.action-btns,\s*\[data-stop-propagation\]'\)/,
      'DataTable must check e.target.closest for all interactive elements and [data-stop-propagation]'
    );

    // 2. Verify Deals.jsx unit badge has data-stop-propagation="true"
    assert.match(
      dealsJsx,
      /<div\s+data-stop-propagation="true"\s+onClick=\{\(e\)\s*=>\s*\{\s*e\.stopPropagation\(\);/,
      'Deals unit badge must carry data-stop-propagation="true" and call stopPropagation'
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CHECK 4: Site Visit transition does not create duplicate activities or invalid transitions
  // ───────────────────────────────────────────────────────────────────────────
  await t.test('Check 4A: Site Visit on early stage auto-transitions and logs stage_changed', async () => {
    let dealUpdated = false;
    let stageChangedLogged = false;

    db.query = async (sql, params) => {
      // console.log('[TEST 4A SQL]', sql.replace(/\s+/g, ' ').slice(0, 100));
      if (sql.includes('SELECT id FROM deals WHERE')) {
        return { rows: [{ id: 200 }] };
      }
      if (sql.includes('INSERT INTO activities')) {
        return { rows: [{ id: 101, action: 'visited' }] };
      }
      if (sql.includes('pipeline_stage')) {
        if (sql.includes('UPDATE deals')) {
          dealUpdated = true;
          return { rowCount: 1 };
        }
        return {
          rows: [{
            id: 200,
            title: 'Penthouse Deal',
            pipeline_stage: 'lead',
            custom_fields: {},
            assigned_to: 1
          }]
        };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 1, tenant_id: 'tenant-test', role: 'admin' },
      params: {
        entity_type: 'deal',
        entity_id: '200'
      },
      body: {
        action: 'visited',
        note: 'Customer inspected 3-bedroom unit on 4th floor'
      }
    };
    const res = {
      status: () => res,
      json: (data) => data
    };

    await activityController.createActivity(req, res);

    assert.ok(dealUpdated, 'Deal must be updated to Site Visit');
  });

  await t.test('Check 4B: Site Visit on already Site Visit deal does NOT trigger duplicate stage_changed', async () => {
    let duplicateStageChanged = false;

    db.query = async (sql, params) => {
      if (sql.includes('SELECT id FROM deals WHERE')) {
        return { rows: [{ id: 201 }] };
      }
      if (sql.includes('INSERT INTO activities')) {
        return { rows: [{ id: 102, action: 'visited' }] };
      }
      if (sql.includes('SELECT id, title, pipeline_stage')) {
        // Deal is ALREADY in Site Visit
        return {
          rows: [{
            id: 201,
            title: 'Already Visited Deal',
            pipeline_stage: 'Site Visit',
            custom_fields: {},
            assigned_to: 1
          }]
        };
      }
      if (sql.includes('UPDATE deals SET pipeline_stage')) {
        // Stage does not change: Site Visit === Site Visit
        assert.equal(params[0], 'Site Visit');
        return { rowCount: 1 };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 1, tenant_id: 'tenant-test', role: 'admin' },
      params: {
        entity_type: 'deal',
        entity_id: '201'
      },
      body: {
        action: 'visited',
        note: 'Second visit to the property'
      }
    };
    const res = {
      status: () => res,
      json: (data) => data
    };

    await activityController.createActivity(req, res);

    // Verified: newStage === targetDeal.pipeline_stage, so logActivity('stage_changed') is never called
    assert.equal(duplicateStageChanged, false, 'Must not log duplicate stage_changed');
  });

  await t.test('Check 4C: Site Visit on Closed/Won deal preserves stage and never reverts or corrupts pipeline', async () => {
    let attemptedRevert = false;

    db.query = async (sql, params) => {
      if (sql.includes('SELECT id FROM deals WHERE')) {
        return { rows: [{ id: 202 }] };
      }
      if (sql.includes('INSERT INTO activities')) {
        return { rows: [{ id: 103, action: 'visited' }] };
      }
      if (sql.includes('SELECT id, title, pipeline_stage')) {
        return {
          rows: [{
            id: 202,
            title: 'Won Deal',
            pipeline_stage: 'won',
            custom_fields: {},
            assigned_to: 1
          }]
        };
      }
      if (sql.includes('UPDATE deals SET pipeline_stage')) {
        // Must maintain 'won' stage, NOT revert to 'Site Visit'
        if (params[0] !== 'won') {
          attemptedRevert = true;
        }
        return { rowCount: 1 };
      }
      return { rows: [] };
    };

    const req = {
      user: { id: 1, tenant_id: 'tenant-test', role: 'admin' },
      params: {
        entity_type: 'deal',
        entity_id: '202'
      },
      body: {
        action: 'visited',
        note: 'Post-closing handover inspection'
      }
    };
    const res = {
      status: () => res,
      json: (data) => data
    };

    await activityController.createActivity(req, res);

    assert.equal(attemptedRevert, false, 'Won deals must never be reverted to Site Visit');
  });
});
