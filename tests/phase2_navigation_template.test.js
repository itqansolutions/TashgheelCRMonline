const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const templateGuard = require('../middleware/templateGuard');
const moduleGuard = require('../middleware/moduleGuard');

test('Phase 2: Tenant Module Entitlement & Navigation Architecture', async (t) => {

  await t.test('templateGuard enforces core template boundaries (RE core routes)', () => {
    let nextCalled = false;
    const req = { user: { id: 'u1', template_name: 'real_estate' } };
    const res = {};
    const next = () => { nextCalled = true; };

    const guard = templateGuard('real_estate');
    guard(req, res, next);
    assert.equal(nextCalled, true, 'User with real_estate template can access RE core');

    // Reject general user from RE core
    let rejectedStatus = null;
    let rejectedBody = null;
    const generalReq = { user: { id: 'u2', template_name: 'general' } };
    const mockRes = {
      status: (code) => {
        rejectedStatus = code;
        return { json: (data) => { rejectedBody = data; } };
      }
    };
    let genNextCalled = false;
    guard(generalReq, mockRes, () => { genNextCalled = true; });

    assert.equal(genNextCalled, false, 'General user must be blocked from RE core');
    assert.equal(rejectedStatus, 403);
    assert.equal(rejectedBody.code, 'TEMPLATE_MISMATCH');
  });

  await t.test('Tenant A: Real Estate tenant with inventory=true and purchasing=true is allowed access', () => {
    const req = {
      user: { id: 're_user_1', template_name: 'real_estate' },
      modules: { crm: true, finance: true, inventory: true, purchasing: true }
    };
    const res = {};

    let invAllowed = false;
    moduleGuard('inventory')(req, res, () => { invAllowed = true; });
    assert.equal(invAllowed, true, 'Real Estate tenant with inventory enabled must access inventory API');

    let purchAllowed = false;
    moduleGuard('purchasing', 'inventory')(req, res, () => { purchAllowed = true; });
    assert.equal(purchAllowed, true, 'Real Estate tenant with purchasing enabled must access purchasing API');
  });

  await t.test('Tenant B: Real Estate tenant with inventory=false and purchasing=false is blocked by module entitlement', () => {
    const req = {
      user: { id: 're_user_2', template_name: 'real_estate' },
      modules: { crm: true, finance: true, inventory: false, purchasing: false }
    };
    let responseCode = null;
    let responseJson = null;
    const res = {
      status: (code) => {
        responseCode = code;
        return { json: (data) => { responseJson = data; } };
      }
    };

    let nextCalled = false;
    moduleGuard('inventory')(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'Tenant without inventory must not proceed');
    assert.equal(responseCode, 403);
    assert.equal(responseJson.status, 'module_locked');
    assert.equal(responseJson.module, 'inventory');
  });

  await t.test('Tenant C: General tenant with inventory=true is allowed access', () => {
    const req = {
      user: { id: 'gen_user_1', template_name: 'general' },
      modules: { crm: true, finance: true, inventory: true }
    };
    const res = {};

    let invAllowed = false;
    moduleGuard('inventory')(req, res, () => { invAllowed = true; });
    assert.equal(invAllowed, true, 'General tenant with inventory enabled must access inventory API');
  });

  await t.test('Purchasing module falls back to inventory module entitlement when purchasing key is unbundled', () => {
    const req = {
      user: { id: 'user_bundled', template_name: 'real_estate' },
      modules: { crm: true, finance: true, inventory: true }
    };
    let nextCalled = false;
    moduleGuard('purchasing', 'inventory')(req, {}, () => { nextCalled = true; });
    assert.equal(nextCalled, true, 'Purchasing should allow access when inventory entitlement is true');
  });

  await t.test('server.js applies moduleGuard to optional modules and templateGuard to core modules', () => {
    const serverContent = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

    // RE core protected by templateGuard
    assert.match(serverContent, /app\.use\('\/api\/re-units',\s*templateGuard\('real_estate'\)/);
    assert.match(serverContent, /app\.use\('\/api\/re-contracts',\s*templateGuard\('real_estate'\)/);

    // Optional modules protected by moduleGuard (NOT templateGuard)
    assert.match(serverContent, /app\.use\('\/api\/products',\s*moduleGuard\('inventory'\)/);
    assert.match(serverContent, /app\.use\('\/api\/inventory',\s*moduleGuard\('inventory'\)/);
    assert.match(serverContent, /app\.use\('\/api\/purchases',\s*moduleGuard\('purchasing',\s*'inventory'\)/);

    // Must NOT block inventory or products with templateGuard
    assert.doesNotMatch(serverContent, /app\.use\('\/api\/inventory',\s*templateGuard\('general'\)/);
    assert.doesNotMatch(serverContent, /app\.use\('\/api\/products',\s*templateGuard\('general'\)/);
  });

  await t.test('Sidebar.jsx uses canonical finance entry and entitlement-filtered sections', () => {
    const sidebarContent = fs.readFileSync(path.join(__dirname, '../frontend/src/components/Layout/Sidebar.jsx'), 'utf8');

    // All 8 operational tabs must be present
    assert.match(sidebarContent, /\/finance\?tab=Overview/);
    assert.match(sidebarContent, /\/finance\?tab=Invoices/);
    assert.match(sidebarContent, /\/finance\?tab=Receipts/);
    assert.match(sidebarContent, /\/finance\?tab=Expenses/);
    assert.match(sidebarContent, /\/finance\?tab=Customers/);
    assert.match(sidebarContent, /\/finance\?tab=Vendors/);
    assert.match(sidebarContent, /\/finance\?tab=Treasury/);
    assert.match(sidebarContent, /\/finance\?tab=Reports/);

    // No broken non-existent tabs in Finance sidebar
    assert.doesNotMatch(sidebarContent, /\/finance\?tab=Receivables/);
    assert.doesNotMatch(sidebarContent, /\/finance\?tab=Collections/);

    // Inventory and Purchasing must be governed by module entitlement, NOT !isRealEstate
    assert.match(sidebarContent, /const inventoryItems = hasInventory \?/);
    assert.match(sidebarContent, /const purchasesItems = hasPurchasing \?/);
    assert.doesNotMatch(sidebarContent, /!isRealEstate && inventoryItems/);
    assert.doesNotMatch(sidebarContent, /!isRealEstate && purchasingItems/);
  });

  await t.test('ProtectedRoute.jsx gates optional modules by module entitlement, not template name', () => {
    const protectedContent = fs.readFileSync(path.join(__dirname, '../frontend/src/components/ProtectedRoute.jsx'), 'utf8');

    assert.match(protectedContent, /can\('inventory'\)/);
    assert.match(protectedContent, /can\('purchasing'\)/);
    assert.doesNotMatch(protectedContent, /isGeneralOnly = \[\s*['"]\/inventory/);
  });

  await t.test('Runtime Module Resolution: manual canonical flags, not commercial defaults', () => {
    const service=require('../services/tenantEntitlementService');
    const modules=service.validateModules({crm:true,finance:true,hr:true});
    assert.equal(modules.sales,false);assert.equal(modules.crm,true);assert.equal(modules.hr,true);
  });
});

