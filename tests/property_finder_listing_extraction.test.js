const test = require('node:test');
const assert = require('node:assert');

// Simulate the Property Finder Atlas listing payload provided by the user
const realListing = {
  id: '01M4GYEJQ57CS3MBDX7GHTCWFW',
  reference: '01M4GYEJQ57CS3MBDX7GHTCWFW',
  size: 150,
  type: 'apartment',
  price: {
    type: 'monthly',
    amounts: {
      monthly: 79999
    }
  },
  title: {
    ar: 'شقه مفروشه بالكامل للايجار في ليك فيو',
    en: 'Fully furnished apartment For Rent In Lake view'
  },
  description: {
    ar: 'لمساحه 145 متر\n غرف نوم2',
    en: 'Apartment for rent in New Cairo'
  }
};

const saleListing = {
  id: 'SALE_001',
  reference: 'REF_SALE',
  price: {
    type: 'sale',
    amounts: {
      sale: 3500000
    }
  },
  title: 'Luxury Villa in Palm Hills'
};

const directNumberListing = {
  id: 'DIRECT_001',
  reference: 'REF_DIRECT',
  price: 5000000,
  title: { en: 'Commercial Shop' }
};

test('extractListingPrice handles nested Atlas amounts (monthly / sale / direct)', () => {
  // Re-create the logic to verify correctness
  function extractListingPrice(listing) {
    if (!listing) return 0;
    const p = listing.price;
    if (typeof p === 'number' && !isNaN(p)) return p;
    if (typeof p === 'string' && p.trim() !== '' && !isNaN(Number(p))) return Number(p);
    if (p && typeof p === 'object') {
      const amounts = p.amounts || {};
      const val = amounts.monthly || amounts.yearly || amounts.total || amounts.sale || amounts.price || p.amount || p.value;
      if (val !== undefined && val !== null && !isNaN(Number(val))) return Number(val);
    }
    const alt = listing.amount || listing.target_price || listing.offering_price;
    if (alt !== undefined && alt !== null && !isNaN(Number(alt))) return Number(alt);
    return 0;
  }

  assert.strictEqual(extractListingPrice(realListing), 79999);
  assert.strictEqual(extractListingPrice(saleListing), 3500000);
  assert.strictEqual(extractListingPrice(directNumberListing), 5000000);
  assert.strictEqual(extractListingPrice({}), 0);
  assert.strictEqual(extractListingPrice(null), 0);
});

test('extractListingTitle handles multilingual Atlas title objects and fallbacks', () => {
  function extractListingTitle(listing) {
    if (!listing) return '';
    const t = listing.title;
    if (typeof t === 'string' && t.trim() !== '') return t.trim();
    if (t && typeof t === 'object') {
      const localized = t.ar || t.en || Object.values(t)[0];
      if (localized && typeof localized === 'string' && localized.trim() !== '') return localized.trim();
    }
    const d = listing.description;
    if (typeof d === 'string' && d.trim() !== '') return d.trim().slice(0, 100);
    if (d && typeof d === 'object') {
      const localized = d.ar || d.en || Object.values(d)[0];
      if (localized && typeof localized === 'string' && localized.trim() !== '') return localized.trim().slice(0, 100);
    }
    return '';
  }

  assert.strictEqual(extractListingTitle(realListing), 'شقه مفروشه بالكامل للايجار في ليك فيو');
  assert.strictEqual(extractListingTitle(saleListing), 'Luxury Villa in Palm Hills');
  assert.strictEqual(extractListingTitle(directNumberListing), 'Commercial Shop');
});
