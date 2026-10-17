const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Stage 3: Deal Workflow, SLA, and Next Action Integrity Suite', async (t) => {
  const rootDir = path.resolve(__dirname, '..');

  await t.test('1. dealsController.js SLA and overdue queries support both deal and deals parent_type', () => {
    const dealsControllerJs = fs.readFileSync(path.join(rootDir, 'controllers', 'dealsController.js'), 'utf8');

    // Both lines in dealsController must support IN ('deal', 'deals')
    const matches = [...dealsControllerJs.matchAll(/t\.parent_type/gi)];
    assert.ok(matches.length >= 2, 'Must have at least 2 checks for t.parent_type in dealsController.js');

    assert.match(dealsControllerJs, /t\.parent_type\s+IN\s+\('deal',\s*'deals'\)/i, 'Overdue filter must match deal and deals');
    assert.match(dealsControllerJs, /LOWER\(t\.parent_type\)\s+IN\s+\('deal',\s*'deals'\)/i, 'SLA calculation must match LOWER(t.parent_type) IN ("deal", "deals")');
  });

  await t.test('2. activityController.js synchronizes Site Visit activity with deal stage change consistently', () => {
    const activityJs = fs.readFileSync(path.join(rootDir, 'controllers', 'activityController.js'), 'utf8');

    // Logging 'visited' must update deal pipeline_stage and custom_fields
    assert.match(activityJs, /if\s*\(action\s*===\s*'visited'\)/, 'Must detect visited action');
    assert.match(activityJs, /UPDATE deals[\s\S]*?SET pipeline_stage = \$1/, 'Must transition deal pipeline stage on Site Visit');
    assert.match(activityJs, /logActivity\(tenant_id,\s*req\.user,\s*'deal',\s*targetDeal\.id,\s*'stage_changed'/, 'Must log stage_changed when transitioning deal stage');
  });

  await t.test('3. Deals.jsx URL navigation effect protects user edits and does not re-open deals redundantly', () => {
    const dealsJsx = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'pages', 'Deals.jsx'), 'utf8');

    // Must check openedByQueryParamRef before running
    assert.match(
      dealsJsx,
      /if\s*\(openedByQueryParamRef\.current\s*===\s*String\(dealIdParam\)\)\s*\{\s*return;\s*\}/,
      'Must return early if deal was already opened by query param'
    );

    // Dependencies must not include isModalOpen or editingDeal
    const effectMatch = dealsJsx.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?openedByQueryParamRef[\s\S]*?\},\s*\[(.*?)\]\);/);
    assert.ok(effectMatch, 'Must find URL navigation useEffect');
    const deps = effectMatch[1];
    assert.doesNotMatch(deps, /isModalOpen/, 'Dependencies must not include isModalOpen');
    assert.doesNotMatch(deps, /editingDeal/, 'Dependencies must not include editingDeal');
  });

  await t.test('4. dealsController.js updateDeal persists next_action field', () => {
    const dealsControllerJs = fs.readFileSync(path.join(rootDir, 'controllers', 'dealsController.js'), 'utf8');

    // next_action must be accepted in body and persisted in UPDATE
    assert.match(dealsControllerJs, /const\s*\{[^}]*next_action[^}]*\}\s*=\s*req\.body;/, 'updateDeal must destructure next_action');
    assert.match(dealsControllerJs, /next_action\s*=\s*\$11/, 'UPDATE statement must set next_action = $11');
    assert.match(dealsControllerJs, /next_action\s*!==\s*undefined\s*\?\s*next_action/, 'updateDeal must pass next_action parameter');
  });
});
