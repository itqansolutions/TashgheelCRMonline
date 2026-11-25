const test = require('node:test');
const assert = require('node:assert');
const { mapListingDetails, FILL_SQL } = require('../services/propertyFinderDetails');

test('maps description ar/en, numeric-string bathrooms and furnishing', () => {
  assert.deepStrictEqual(mapListingDetails({ description: { ar: ' شقة ', en: 'Flat' }, bathrooms: '3', furnishingType: 'Semi-Furnished' }),
    { description_ar: 'شقة', description_en: 'Flat', bathrooms: 3, furnishing: 'semi-furnished' });
});
test('missing, blank or malformed values become null', () => {
  assert.deepStrictEqual(mapListingDetails({ description: { ar: '  ' }, bathrooms: 'none', furnishingType: '' }),
    { description_ar: null, description_en: null, bathrooms: null, furnishing: null });
  assert.deepStrictEqual(mapListingDetails(null), { description_ar: null, description_en: null, bathrooms: null, furnishing: null });
  assert.strictEqual(mapListingDetails({ bathrooms: 4 }).bathrooms, 4);
  assert.strictEqual(mapListingDetails({ bathrooms: '-2' }).bathrooms, null);
});
test('fill SQL only sets columns that are still NULL and is tenant scoped', () => {
  for (const c of ['description_ar', 'description_en', 'bathrooms', 'furnishing']) assert.ok(FILL_SQL.includes(`${c} = COALESCE(${c},`));
  assert.ok(/tenant_id::text = \$6::text/.test(FILL_SQL));
});
