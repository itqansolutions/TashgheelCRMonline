const test = require('node:test');
const assert = require('node:assert/strict');
const activityController = require('../controllers/activityController');
const db = require('../config/db');

test('Batch E: Deal Activity Timeline & Call Logs', async (t) => {
  const TA = '11111111-1111-1111-1111-111111111111';
  const TB = '22222222-2222-2222-2222-222222222222';
  const originalQuery = db.query;

  t.afterEach(() => {
    db.query = originalQuery;
  });

  // ── 1. Deal View Authorization on getActivities ─────────────────────────
  await t.test('1. Authorization: getActivities enforces deal.view permission and tenant isolation', async () => {
    // 1A: User lacks deal.view permission -> 403 PERMISSION_DENIED
    let statusCode = null;
    let jsonBody = null;
    const reqNoPerm = {
      params: { entity_type: 'deal', entity_id: '100' },
      query: {},
      user: { id: 10, tenant_id: TA, role: 'sales_rep', custom_permissions: [] }
    };
    const resNoPerm = {
      status(c) { statusCode = c; return this; },
      json(b) { jsonBody = b; return this; }
    };

    db.query = async (sql, params) => {
      // Access check
      if (sql.includes('FROM user_access')) return { rows: [{ permissions: [] }] };
      if (sql.includes('FROM activities')) return { rows: [] };
      return { rows: [] };
    };

    // Mock checkDealPermission to return false for this test
    const dealPerm = require('../middleware/dealPermission');
    const origCheck = dealPerm.checkDealPermission;
    dealPerm.checkDealPermission = async (userId, tenantId, perm) => {
      if (perm === 'deal.view') return false;
      return true;
    };

    await activityController.getActivities(reqNoPerm, resNoPerm);
    dealPerm.checkDealPermission = origCheck;

    assert.equal(statusCode, 403);
    assert.equal(jsonBody.code, 'PERMISSION_DENIED');
    assert.match(jsonBody.message, /deal\.view/);

    // 1B: User has deal.view -> 200 with formatted activities
    let successCode = null;
    let successBody = null;
    const reqPerm = {
      params: { entity_type: 'deal', entity_id: '100' },
      query: { limit: 10, offset: 0 },
      user: { id: 1, tenant_id: TA, role: 'admin' }
    };
    const resPerm = {
      status(c) { successCode = c; return this; },
      json(b) { successBody = b; return this; }
    };

    db.query = async (sql, params) => {
      if (sql.includes('SELECT id FROM deals')) {
        // Enforce tenant match: if tenant matches TA and deal is 100, return deal
        if (params[0] === '100' && params[1] === TA) {
          return { rows: [{ id: 100 }] };
        }
        return { rows: [] };
      }
      if (sql.includes('FROM activities a')) {
        return {
          rows: [
            {
              id: 1,
              entity_type: 'deal',
              entity_id: '100',
              action: 'called',
              meta: JSON.stringify({ changes: { note: { to: 'Spoke with buyer regarding discount' } } }),
              created_at: new Date('2026-10-15T10:00:00Z'),
              user_name: 'Ahmed Rep'
            },
            {
              id: 2,
              entity_type: 'deal',
              entity_id: '100',
              action: 'stage_changed',
              meta: JSON.stringify({ changes: { pipeline_stage: { from: 'discovery', to: 'negotiation' } } }),
              created_at: new Date('2026-10-15T11:00:00Z'),
              user_name: 'Ahmed Rep'
            }
          ]
        };
      }
      return { rows: [] };
    };

    await activityController.getActivities(reqPerm, resPerm);
    assert.equal(successBody.status, 'success');
    assert.equal(successBody.data.length, 2);
    assert.match(successBody.data[0].formatted_message, /Called — "Spoke with buyer regarding discount"/);
    assert.match(successBody.data[1].formatted_message, /Moved from discovery → negotiation/);
    assert.equal(successBody.data[0].user_name, 'Ahmed Rep');
  });

  // ── 2. Activity Creation Permission & Validation ─────────────────────────
  await t.test('2. Permission: createActivity enforces deal.log_activity and action validation', async () => {
    // 2A: User lacks deal.log_activity -> 403
    let code403 = null;
    let body403 = null;
    const reqNoLog = {
      params: { entity_type: 'deal', entity_id: '100' },
      body: { action: 'called', note: 'Called client' },
      user: { id: 20, tenant_id: TA, role: 'sales_rep' }
    };
    const resNoLog = {
      status(c) { code403 = c; return this; },
      json(b) { body403 = b; return this; }
    };

    const dealPerm = require('../middleware/dealPermission');
    const origCheck = dealPerm.checkDealPermission;
    dealPerm.checkDealPermission = async (userId, tenantId, perm) => {
      if (perm === 'deal.log_activity') return false;
      return true;
    };

    await activityController.createActivity(reqNoLog, resNoLog);
    dealPerm.checkDealPermission = origCheck;

    assert.equal(code403, 403);
    assert.equal(body403.code, 'PERMISSION_DENIED');
    assert.match(body403.message, /deal\.log_activity/);

    // 2B: Invalid action -> 400
    let code400 = null;
    let body400 = null;
    const reqInvalid = {
      params: { entity_type: 'deal', entity_id: '100' },
      body: { action: 'unauthorized_action', note: 'test' },
      user: { id: 1, tenant_id: TA, role: 'admin' }
    };
    const resInvalid = {
      status(c) { code400 = c; return this; },
      json(b) { body400 = b; return this; }
    };
    await activityController.createActivity(reqInvalid, resInvalid);
    assert.equal(code400, 400);
    assert.match(body400.message, /Invalid action/);

    // 2C: Empty note -> 400
    let codeEmpty = null;
    let bodyEmpty = null;
    const reqEmpty = {
      params: { entity_type: 'deal', entity_id: '100' },
      body: { action: 'meeting', note: '   ' },
      user: { id: 1, tenant_id: TA, role: 'admin' }
    };
    const resEmpty = {
      status(c) { codeEmpty = c; return this; },
      json(b) { bodyEmpty = b; return this; }
    };
    await activityController.createActivity(reqEmpty, resEmpty);
    assert.equal(codeEmpty, 400);
    assert.match(bodyEmpty.message, /description\/note is required/);
  });

  // ── 3. Manual Interaction Types & Formatting for Deals ───────────────────
  await t.test('3. Interactions: Records and formats calls, whatsapp, meetings, tasks, and notes', async () => {
    const testCases = [
      { action: 'called', note: 'Follow up call on financing', expectedMsg: /Called — "Follow up call on financing"/ },
      { action: 'whatsapp', note: 'Sent brochure link', expectedMsg: /WhatsApp — "Sent brochure link"/ },
      { action: 'meeting', note: 'Office presentation with buyer and spouse', expectedMsg: /Meeting — "Office presentation with buyer and spouse"/ },
      { action: 'task', note: 'Collect signed reservation form by Thursday', expectedMsg: /Task — "Collect signed reservation form by Thursday"/ },
      { action: 'note', note: 'Customer pre-approved for mortgage', expectedMsg: /Note — "Customer pre-approved for mortgage"/ }
    ];

    for (const tc of testCases) {
      let createdRow = null;
      let insertedParams = [];

      db.query = async (sql, params) => {
        if (sql.includes('SELECT id FROM deals')) {
          return { rows: [{ id: 50 }] };
        }
        if (sql.includes('INSERT INTO activities')) {
          insertedParams = params;
          createdRow = {
            id: 101,
            tenant_id: params[0],
            user_id: params[1],
            entity_type: params[2],
            entity_id: params[3],
            action: params[4],
            meta: JSON.parse(params[5]),
            created_at: new Date()
          };
          return { rows: [createdRow] };
        }
        return { rows: [] };
      };

      let statusCode = null;
      let jsonBody = null;
      const req = {
        params: { entity_type: 'deal', entity_id: '50' },
        body: { action: tc.action, note: tc.note },
        user: { id: 42, name: 'Karim Seller', role: 'sales_rep', tenant_id: TA }
      };
      const res = {
        status(c) { statusCode = c; return this; },
        json(b) { jsonBody = b; return this; }
      };

      await activityController.createActivity(req, res);
      assert.equal(statusCode, 201);
      assert.equal(jsonBody.status, 'success');
      assert.equal(jsonBody.data.user_name, 'Karim Seller');
      assert.match(jsonBody.data.formatted_message, tc.expectedMsg);
      assert.equal(insertedParams[0], TA, 'Tenant ID must be saved');
      assert.equal(insertedParams[1], 42, 'User ID must be linked to activity');
      assert.equal(insertedParams[2], 'deal');
      assert.equal(insertedParams[3], '50');
      assert.equal(insertedParams[4], tc.action);
    }
  });

  // ── 4. Multi-Tenant Cross-Access Prevention ──────────────────────────────
  await t.test('4. Security: Cross-tenant deal activity access is strictly forbidden', async () => {
    let getStatusCode = null;
    let postStatusCode = null;

    db.query = async (sql, params) => {
      if (sql.includes('SELECT id FROM deals')) {
        // Deal 99 belongs to Tenant B
        if (params[0] === '99' && params[1] === TB) {
          return { rows: [{ id: 99 }] };
        }
        // Tenant A searching for Deal 99 yields nothing
        return { rows: [] };
      }
      return { rows: [] };
    };

    // Tenant A attempts to view Tenant B's deal activities
    const reqGet = {
      params: { entity_type: 'deal', entity_id: '99' },
      query: {},
      user: { id: 5, tenant_id: TA, role: 'admin' }
    };
    const resGet = {
      status(c) { getStatusCode = c; return this; },
      json() { return this; }
    };
    await activityController.getActivities(reqGet, resGet);
    assert.equal(getStatusCode, 404, 'Must return 404 for cross-tenant deal view');

    // Tenant A attempts to log activity on Tenant B's deal
    const reqPost = {
      params: { entity_type: 'deal', entity_id: '99' },
      body: { action: 'called', note: 'Malicious cross-tenant note' },
      user: { id: 5, tenant_id: TA, role: 'admin' }
    };
    const resPost = {
      status(c) { postStatusCode = c; return this; },
      json() { return this; }
    };
    await activityController.createActivity(reqPost, resPost);
    assert.equal(postStatusCode, 404, 'Must return 404 for cross-tenant activity creation');
  });
});
