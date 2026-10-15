const test = require('node:test');
const assert = require('node:assert');
const { normalizeLead } = require('../services/propertyFinderSyncService');

// Real Atlas payload shape (values anonymised)
const realLead = {
  id: 'message_lead_1', tags: null,
  sender: { name: 'Frhaan', contacts: [{ type: 'phone', value: '+201000000000' }] },
  status: 'replied', channel: 'whatsapp',
  listing: { id: 'LST123', reference: 'LST123' },
  createdAt: '2026-10-14T16:09:29Z', entityType: 'listing',
  responseLink: 'https://example.test/lead', publicProfile: { id: 73971 }
};

test('normalizeLead reads phone from sender.contacts[] (real Atlas shape)', () => {
  const n = normalizeLead(realLead);
  assert.strictEqual(n.phone, '+201000000000');
  assert.strictEqual(n.name, 'Frhaan');
  assert.strictEqual(n.channel, 'whatsapp');
  assert.strictEqual(n.externalListingId, 'LST123');
  assert.strictEqual(n.email, '');
});

test('normalizeLead reads email from contacts[] and ignores unrelated types', () => {
  const n = normalizeLead({ ...realLead, sender: { name: 'A', contacts: [{ type: 'email', value: 'A@X.com' }, { type: 'phone', value: '+2011' }] } });
  assert.strictEqual(n.email, 'a@x.com');
  assert.strictEqual(n.phone, '+2011');
});
