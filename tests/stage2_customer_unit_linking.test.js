const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Stage 2: Customer & Unit Linking Verification Suite', async (t) => {
  const rootDir = path.resolve(__dirname, '..');

  await t.test('1. customersController does not return empty set on missing branch context and applies accessScopeService', () => {
    const customersJs = fs.readFileSync(path.join(rootDir, 'controllers', 'customersController.js'), 'utf8');

    // Must NOT have the old premature return
    assert.doesNotMatch(
      customersJs,
      /if\s*\(!branch_id\)\s*\{\s*console\.warn\('.*Branch context missing, returning empty set\.'\);\s*return res\.json\(\{\s*status:\s*'success',\s*data:\s*\[\]\s*\}\);\s*\}/,
      'Must NOT return empty array when branch_id is missing'
    );

    // Must attempt safe resolution for non-admins from user_branches or main branch
    assert.match(customersJs, /SELECT branch_id FROM user_branches/, 'Must lookup branch from user_branches');
    assert.match(customersJs, /SELECT id FROM branches WHERE tenant_id::text = \$1::text AND is_main = true/, 'Must fallback to main branch');

    // WHERE clause must support null branch_id
    assert.match(customersJs, /\(\$2::text IS NULL OR c\.branch_id::text = \$2::text/, 'WHERE clause must allow $2::text IS NULL');

    // accessScopeService must be invoked
    assert.match(customersJs, /accessScopeService\.buildScopePredicate/, 'accessScopeService must enforce row-level permissions');
  });

  await t.test('2. Deals.jsx performs case-insensitive unit status comparison and supports fallback options', () => {
    const dealsJsx = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'pages', 'Deals.jsx'), 'utf8');

    // Unit status filter must be case-insensitive
    assert.match(
      dealsJsx,
      /String\(u\.status\s*\|\|\s*''\)\.toLowerCase\(\)\s*===\s*'available'/,
      'Unit filter must compare status case-insensitively'
    );

    // Fallback option for unit when not present in reUnits array
    assert.match(
      dealsJsx,
      /formData\.unit_id\s*&&\s*!\(reUnits\s*\|\|\s*\[\]\)\.some\(u\s*=>\s*String\(u\.id\)\s*===\s*String\(formData\.unit_id\)\)/,
      'Must provide fallback option if linked unit is not in reUnits array'
    );

    // Displays verified linked unit preview card
    assert.match(dealsJsx, /editingDeal\?\.unit_id\s*&&/, 'Must display linked unit card when editingDeal.unit_id is set');
    assert.match(dealsJsx, /editingDeal\.unit_project\s*\?\s*`\$\{editingDeal\.unit_project\}\s*•\s*`/, 'Must display unit_project in preview card');
  });

  await t.test('3. Deals.jsx displays linked customer information and provides fallback option', () => {
    const dealsJsx = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'pages', 'Deals.jsx'), 'utf8');

    // Displays verified linked customer banner
    assert.match(
      dealsJsx,
      /editingDeal\?\.client_id\s*&&\s*editingDeal\?\.client_name/,
      'Must display linked customer banner when editingDeal has customer metadata'
    );

    // Fallback option for customer when not present in customers array
    assert.match(
      dealsJsx,
      /formData\.client_id\s*&&\s*!\(customers\s*\|\|\s*\[\]\)\.some\(c\s*=>\s*String\(c\.id\)\s*===\s*String\(formData\.client_id\)\)/,
      'Must provide fallback option if linked customer is not in customers array'
    );
  });
});
