const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Stage 4: Assignment Policy & User Clarity Suite', async (t) => {
  const rootDir = path.resolve(__dirname, '..');

  await t.test('1. Deals.jsx removes confusing Me (Default) and pre-selects current user explicitly', () => {
    const dealsJsx = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'pages', 'Deals.jsx'), 'utf8');

    // Must NOT have the old confusing Me (Default) with empty string
    assert.doesNotMatch(dealsJsx, /<option value="">\{t\('deals\.meDefault',\s*'Me \(Default\)'\)\}<\/option>/, 'Must not label value="" as Me (Default)');

    // Must have explicit Unassigned option for value=""
    assert.match(dealsJsx, /<option value="">\{t\('deals\.unassignedOption',\s*'-- Unassigned --'\)\}<\/option>/, 'value="" must be explicitly Unassigned');

    // New deal modal initialization must preselect user.id
    assert.match(dealsJsx, /assigned_to:\s*user\?\.id\s*\|\|\s*'',/, 'New deal creation must initialize assigned_to to user.id');

    // Current user in dropdown must have explicit badge
    assert.match(dealsJsx, /Current User \/ Me/, 'Current user option must show Current User / Me badge');
  });

  await t.test('2. dealsController.js createDeal handles user assignment flexibly and safely', () => {
    const dealsControllerJs = fs.readFileSync(path.join(rootDir, 'controllers', 'dealsController.js'), 'utf8');

    // cleanAssignedTo must accept valid user id and fallback to req.user.id
    assert.match(
      dealsControllerJs,
      /const cleanAssignedTo = \(assigned_to !== undefined && assigned_to !== null && String\(assigned_to\)\.trim\(\) !== ''\)\s*\?\s*assigned_to\s*:\s*\(req\.user\?\.id \|\| null\);/,
      'cleanAssignedTo must accept string or numeric assigned_to'
    );
  });
});
