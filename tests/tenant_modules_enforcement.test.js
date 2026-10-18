const test = require('node:test');
const assert = require('node:assert/strict');
const moduleGuard = require('../middleware/moduleGuard');
const templateGuard = require('../middleware/templateGuard');

test('🔒 Comprehensive Tenant Module Entitlement & Enforcement Suite', async (t) => {

  await t.test('1. Explicit Module Disables in Overrides: moduleGuard blocks even when fallback is true', () => {
    // When purchasing is explicitly false, but inventory is true
    const modulesWithPurchasingDisabled = { inventory: true, purchasing: false };
    let blockStatus = null;
    let blockBody = null;
    const mockRes = {
      status: (c) => { blockStatus = c; return { json: (b) => { blockBody = b; } }; }
    };
    let nextCalled = false;

    moduleGuard('purchasing', 'inventory')({ modules: modulesWithPurchasingDisabled }, mockRes, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'Route must NOT proceed when purchasing is explicitly disabled');
    assert.equal(blockStatus, 403, 'Must return 403 HTTP status');
    assert.equal(blockBody.status, 'module_locked');
    assert.equal(blockBody.module, 'purchasing');
  });

  await t.test('2. Disabling CRM blocks deals, tasks, quotations, and customers', () => {
    const modulesWithCrmDisabled = { crm: false, finance: true };
    let blockStatus = null;
    let blockBody = null;
    const mockRes = {
      status: (c) => { blockStatus = c; return { json: (b) => { blockBody = b; } }; }
    };
    let nextCalled = false;

    moduleGuard('crm')({ modules: modulesWithCrmDisabled }, mockRes, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'Must block CRM endpoints when crm: false');
    assert.equal(blockStatus, 403);
    assert.equal(blockBody.status, 'module_locked');
    assert.equal(blockBody.module, 'crm');
  });

  await t.test('3. Disabling Real Estate in Overrides blocks real estate routes via templateGuard', () => {
    const req = {
      user: { template_name: 'real_estate' },
      modules: { real_estate: false, crm: true }
    };
    let blockStatus = null;
    let blockBody = null;
    const mockRes = {
      status: (c) => { blockStatus = c; return { json: (b) => { blockBody = b; } }; }
    };
    let nextCalled = false;

    templateGuard('real_estate')(req, mockRes, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'Must block real estate routes when real_estate: false');
    assert.equal(blockStatus, 403);
    assert.equal(blockBody.status, 'module_locked');
    assert.equal(blockBody.module, 'real_estate');
  });

  await t.test('4. Enabling Real Estate module unlocks real estate routes for general organizations', () => {
    const req = {
      user: { template_name: 'general' },
      modules: { real_estate: true, crm: true }
    };
    let nextCalled = false;

    templateGuard('real_estate')(req, {}, () => { nextCalled = true; });

    assert.equal(nextCalled, true, 'General organization granted real_estate module must be allowed access');
  });

  await t.test('5. Disabling Marketing explicitly blocks marketing endpoints', () => {
    const modulesWithMarketingDisabled = { crm: true, marketing: false };
    let blockStatus = null;
    let blockBody = null;
    const mockRes = {
      status: (c) => { blockStatus = c; return { json: (b) => { blockBody = b; } }; }
    };
    let nextCalled = false;

    moduleGuard('marketing', 'crm')({ modules: modulesWithMarketingDisabled }, mockRes, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'Must block marketing routes when marketing: false');
    assert.equal(blockStatus, 403);
    assert.equal(blockBody.status, 'module_locked');
    assert.equal(blockBody.module, 'marketing');
  });

  await t.test('6. Normal Plan Inheritance: Legacy unbundled purchasing falls back to inventory when not explicitly disabled', () => {
    const modulesLegacy = { inventory: true };
    let nextCalled = false;

    moduleGuard('purchasing', 'inventory')({ modules: modulesLegacy }, {}, () => { nextCalled = true; });

    assert.equal(nextCalled, true, 'When purchasing is not explicitly disabled, inventory: true allows access');
  });

});
