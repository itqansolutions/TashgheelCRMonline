const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const templateGuard = require('../middleware/templateGuard');

test('Phase 2: Navigation & Screen Specialization', async (t) => {

  await t.test('templateGuard allows matching template', () => {
    let nextCalled = false;
    const req = { user: { id: 'u1', template_name: 'real_estate' } };
    const res = {};
    const next = () => { nextCalled = true; };

    const guard = templateGuard('real_estate');
    guard(req, res, next);
    assert.equal(nextCalled, true, 'User with matching template should proceed');
  });

  await t.test('templateGuard rejects mismatched template with 403 and TEMPLATE_MISMATCH', () => {
    let responseStatus = null;
    let responseJson = null;
    let nextCalled = false;

    const req = { user: { id: 'u2', template_name: 'general' } };
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => {
            responseJson = data;
          }
        };
      }
    };
    const next = () => { nextCalled = true; };

    const guard = templateGuard('real_estate');
    guard(req, res, next);

    assert.equal(nextCalled, false, 'Mismatched user should not proceed');
    assert.equal(responseStatus, 403, 'Must return 403 Forbidden');
    assert.equal(responseJson.code, 'TEMPLATE_MISMATCH');
  });

  await t.test('templateGuard protects General routes from Real Estate users', () => {
    let responseStatus = null;
    let responseJson = null;
    let nextCalled = false;

    const req = { user: { id: 'u3', template_name: 'real_estate' } };
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => {
            responseJson = data;
          }
        };
      }
    };
    const next = () => { nextCalled = true; };

    const guard = templateGuard('general');
    guard(req, res, next);

    assert.equal(nextCalled, false);
    assert.equal(responseStatus, 403);
    assert.equal(responseJson.code, 'TEMPLATE_MISMATCH');
  });

  await t.test('server.js applies templateGuard to RE and General modules', () => {
    const serverContent = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

    assert.match(serverContent, /app\.use\('\/api\/re-units',\s*templateGuard\('real_estate'\)/);
    assert.match(serverContent, /app\.use\('\/api\/re-contracts',\s*templateGuard\('real_estate'\)/);
    assert.match(serverContent, /app\.use\('\/api\/products',\s*templateGuard\('general'\)/);
    assert.match(serverContent, /app\.use\('\/api\/inventory',\s*templateGuard\('general'\)/);
  });

  await t.test('Sidebar.jsx cleanly isolates Real Estate vs General sections', () => {
    const sidebarContent = fs.readFileSync(path.join(__dirname, '../frontend/src/components/Layout/Sidebar.jsx'), 'utf8');

    assert.match(sidebarContent, /rePropertiesItems/);
    assert.match(sidebarContent, /reSalesItems/);
    assert.match(sidebarContent, /genInventoryItems/);
    assert.match(sidebarContent, /genPurchasingItems/);
    assert.match(sidebarContent, /!isRealEstate && inventoryItems\.length > 0/);
    assert.match(sidebarContent, /!isRealEstate && purchasingItems\.length > 0/);
  });
});
