'use strict';
/**
 * Resolve Property Finder location ids (listing.location.id) into readable
 * project/area names. Read-only: uses GET /locations?filter[id]=<id> only.
 * Never throws; callers fall back to the previous defaults.
 */

const DEFAULT_PROJECT = 'Imported Property';
const DEFAULT_LOCATION = 'Egypt';

function locationIdOf(listing) {
  const raw = listing && listing.location && listing.location.id;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  return String(raw).trim();
}

/** Turn a PF location record ({name, tree:[{name,type}]}) into unit fields. */
function namesFromLocation(loc) {
  if (!loc) return null;
  const tree = Array.isArray(loc.tree) ? loc.tree : [];
  const names = tree.map((n) => String(n && n.name || '').trim()).filter(Boolean);
  const leaf = String(loc.name || '').trim() || names[names.length - 1] || '';
  if (!leaf) return null;
  const chain = names.length ? names.slice().reverse() : [leaf];
  if (chain[0] !== leaf) chain.unshift(leaf);
  const unique = chain.filter((n, i) => chain.indexOf(n) === i);
  return { projectName: leaf, locationText: unique.join(', ') };
}

/**
 * @param {object} client PropertyFinderClient (needs getLocation)
 * @param {object} listing PF listing payload
 * @param {Map} cache id -> resolved fields | null
 */
async function resolveListingLocation(client, listing, cache = new Map()) {
  const id = locationIdOf(listing);
  if (!id || !client || typeof client.getLocation !== 'function') return null;
  if (cache.has(id)) return cache.get(id);
  let resolved = null;
  try {
    resolved = namesFromLocation(await client.getLocation(id));
  } catch (_) {
    resolved = null; // do not cache failures permanently across runs; cache per call only
  }
  cache.set(id, resolved);
  return resolved;
}

module.exports = { DEFAULT_PROJECT, DEFAULT_LOCATION, locationIdOf, namesFromLocation, resolveListingLocation };
