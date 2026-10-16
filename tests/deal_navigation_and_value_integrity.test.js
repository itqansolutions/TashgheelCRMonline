const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

test('CRM Deal Navigation, Value Integrity, and Linking Test Suite', async (t) => {
  const rootDir = path.resolve(__dirname, '..');

  await t.test('1. App routing and ProtectedRoute support direct deal navigation without redirecting to home', () => {
    const appJsx = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'App.jsx'), 'utf8');
    const protectedRouteJsx = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'components', 'ProtectedRoute.jsx'), 'utf8');

    // App.jsx must have deals and deals/:id routes
    assert.match(appJsx, /<Route\s+path="deals"\s+element={<Deals\s*\/>}\s*\/>/, 'App.jsx must register /deals route');
    assert.match(appJsx, /<Route\s+path="deals\/:id"\s+element={<Deals\s*\/>}\s*\/>/, 'App.jsx must register /deals/:id route');

    // ProtectedRoute.jsx must allow subpaths like /deals/:id when /deals is allowed
    assert.match(protectedRouteJsx, /basePath\s*=\s*'\/'.*split\('\/'\)\.filter\(Boolean\)\[0\]/, 'ProtectedRoute must extract basePath to allow /deals/:id');
    assert.match(protectedRouteJsx, /allowed\.includes\(basePath\)/, 'ProtectedRoute must check allowed.includes(basePath)');
  });

  await t.test('2. Deals page supports route params, search params, and unlocked commercial value', () => {
    const dealsJsx = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'pages', 'Deals.jsx'), 'utf8');

    // Must import useParams
    assert.match(dealsJsx, /useParams/, 'Deals.jsx must import useParams');
    assert.match(dealsJsx, /routeParams\s*=\s*useParams\(\)/, 'Deals.jsx must extract routeParams');
    assert.match(dealsJsx, /searchParams\.get\('deal_id'\)\s*\|\|\s*routeParams\?\.id/, 'Deals.jsx must support both deal_id search param and :id route param');

    // Value input must NOT be disabled just because a unit is linked
    assert.doesNotMatch(dealsJsx, /disabled=\{!!formData\.unit_id/, 'Deal value input must not be disabled when unit_id is present');

    // handleUnitChange must preserve existing non-zero deal values
    assert.match(dealsJsx, /Number\(formData\.value\)\s*===\s*0/, 'handleUnitChange must only set unit price if current value is empty or 0');
  });

  await t.test('3. UnitsRegistry links to deals and customer 360 using React Router Link without page reload', () => {
    const unitsRegistryJsx = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'pages', 'RealEstate', 'UnitsRegistry.jsx'), 'utf8');

    // Must import Link from react-router-dom
    assert.match(unitsRegistryJsx, /import\s*\{[^}]*Link[^}]*\}\s*from\s*['"]react-router-dom['"]/, 'UnitsRegistry must import Link from react-router-dom');

    // Internal app routes to /deals and /customers must use <Link to=...>, not raw <a href=...>
    assert.doesNotMatch(unitsRegistryJsx, /<a\s+href=\{`\/deals\?deal_id=/, 'UnitsRegistry must not use raw <a> for /deals?deal_id=');
    assert.doesNotMatch(unitsRegistryJsx, /<a\s+href=\{`\/customers\?customer360=/, 'UnitsRegistry must not use raw <a> for /customers?customer360=');
    assert.match(unitsRegistryJsx, /<Link\s+to=\{`\/deals\?deal_id=/, 'UnitsRegistry must use <Link to="..."> for deal links');
    assert.match(unitsRegistryJsx, /<Link\s+to=\{`\/customers\?customer360=/, 'UnitsRegistry must use <Link to="..."> for customer links');
  });

  await t.test('4. DealsController getDealById query joins customers, users, and re_units to return full metadata', async () => {
    const dealsControllerJs = fs.readFileSync(path.join(rootDir, 'controllers', 'dealsController.js'), 'utf8');

    // Query must select client_name, client_phone, assigned_to_name, unit_number, unit_price
    assert.match(dealsControllerJs, /c\.name\s+as\s+client_name/i, 'getDealById must join and select client_name');
    assert.match(dealsControllerJs, /c\.phone\s+as\s+client_phone/i, 'getDealById must join and select client_phone');
    assert.match(dealsControllerJs, /u\.name\s+as\s+assigned_to_name/i, 'getDealById must join and select assigned_to_name');
    assert.match(dealsControllerJs, /ru\.unit_number/i, 'getDealById must join and select ru.unit_number');
    assert.match(dealsControllerJs, /ru\.price\s+as\s+unit_price/i, 'getDealById must join and select ru.price as unit_price');

    // Execute query syntax test on local database
    const testDealRes = await db.query('SELECT id, tenant_id FROM deals LIMIT 1');
    if (testDealRes.rows.length > 0) {
      const deal = testDealRes.rows[0];
      const query = `
        SELECT 
          d.*,
          c.name as client_name,
          c.phone as client_phone,
          c.company_name as client_company,
          u.name as assigned_to_name,
          u.email as assigned_to_email,
          ru.unit_number,
          ru.name as unit_name,
          ru.price as unit_price,
          ru.status as unit_status
        FROM deals d
        LEFT JOIN customers c ON d.client_id = c.id
        LEFT JOIN users u ON d.assigned_to = u.id
        LEFT JOIN re_units ru ON d.unit_id::text = ru.id::text
        WHERE d.id = $1 AND d.tenant_id = $2
      `;
      const result = await db.query(query, [deal.id, deal.tenant_id]);
      assert.equal(result.rows.length, 1, 'Query must return exactly one record');
      const row = result.rows[0];
      assert.ok('client_name' in row, 'Row must include client_name');
      assert.ok('assigned_to_name' in row, 'Row must include assigned_to_name');
      assert.ok('unit_price' in row, 'Row must include unit_price');
    }
  });

  await t.test('5. PropertyFinderSyncService preserves non-zero commercial values during repair/backfill', () => {
    const pfSyncJs = fs.readFileSync(path.join(rootDir, 'services', 'propertyFinderSyncService.js'), 'utf8');

    // All deals UPDATE statements in propertyFinderSyncService must preserve existing value
    const updateMatches = [...pfSyncJs.matchAll(/UPDATE deals[\s\S]*?WHERE/g)];
    assert.ok(updateMatches.length >= 3, 'Must have at least 3 UPDATE deals queries in propertyFinderSyncService');

    for (const match of updateMatches) {
      const queryText = match[0];
      assert.match(
        queryText,
        /value\s*=\s*CASE\s+WHEN\s+\(.*?value\s+IS\s+NULL\s+OR\s+.*?value\s*=\s*0\)\s+THEN\s+COALESCE\(\$.*?::numeric,\s*0\)\s+ELSE\s+.*?value\s+END/i,
        'Each UPDATE deals query must preserve commercial value and only populate from unit_price if null or 0'
      );
    }
  });
});
