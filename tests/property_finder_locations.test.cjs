const test = require('node:test');
const assert = require('node:assert');
const { namesFromLocation, resolveListingLocation, locationIdOf } = require('../services/propertyFinderLocations');

const rayhanah = { id: 40722, name: 'Rayhanah Plaza', type: 'SUBDISTRICT', tree: [
  { id: 2254, name: 'Cairo', type: 'GOVERNORATE' }, { id: 4779, name: 'Hay El Maadi', type: 'TOWN' },
  { id: 5119, name: 'Zahraa El Maadi', type: 'DISTRICT' }, { id: 40722, name: 'Rayhanah Plaza', type: 'SUBDISTRICT' } ] };

test('names come from the leaf and the full tree, leaf first', () => {
  assert.deepStrictEqual(namesFromLocation(rayhanah), { projectName: 'Rayhanah Plaza', locationText: 'Rayhanah Plaza, Zahraa El Maadi, Hay El Maadi, Cairo' });
});
test('empty or nameless location resolves to null', () => {
  assert.strictEqual(namesFromLocation(null), null);
  assert.strictEqual(namesFromLocation({ tree: [] }), null);
});
test('location id is read from listing.location.id only', () => {
  assert.strictEqual(locationIdOf({ location: { id: 5 } }), '5');
  assert.strictEqual(locationIdOf({ location: {} }), null);
  assert.strictEqual(locationIdOf({}), null);
});
test('resolves via client.getLocation and caches per id', async () => {
  let calls = 0;
  const client = { getLocation: async () => { calls++; return rayhanah; } };
  const cache = new Map();
  const a = await resolveListingLocation(client, { location: { id: 40722 } }, cache);
  const b = await resolveListingLocation(client, { location: { id: 40722 } }, cache);
  assert.strictEqual(a.projectName, 'Rayhanah Plaza');
  assert.deepStrictEqual(a, b);
  assert.strictEqual(calls, 1);
});
test('lookup failure or missing id falls back to null, never throws', async () => {
  const bad = { getLocation: async () => { throw new Error('boom'); } };
  assert.strictEqual(await resolveListingLocation(bad, { location: { id: 1 } }, new Map()), null);
  assert.strictEqual(await resolveListingLocation(bad, {}, new Map()), null);
  assert.strictEqual(await resolveListingLocation(null, { location: { id: 1 } }, new Map()), null);
});
