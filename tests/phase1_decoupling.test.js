const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Phase 1: Architecture & Accounting Decoupling', async (t) => {

  await t.test('DeliveryNoteService is decoupled from JournalEngine and GL accounts', () => {
    const content = fs.readFileSync(path.join(__dirname, '../src/domains/sales/DeliveryNoteService.js'), 'utf8');
    
    assert.doesNotMatch(content, /require\(['"].*accounting\/JournalEngine['"]\)/, 'DeliveryNoteService must not import JournalEngine');
    assert.doesNotMatch(content, /JournalEngine\.postJournal/, 'DeliveryNoteService must not call JournalEngine.postJournal');
    assert.match(content, /accounting_status = 'not_applicable'/, 'DeliveryNoteService must mark accounting_status as not_applicable');
  });

  await t.test('PurchasingService is decoupled from JournalEngine and GL accounts', () => {
    const content = fs.readFileSync(path.join(__dirname, '../src/domains/purchasing/PurchasingService.js'), 'utf8');

    assert.doesNotMatch(content, /require\(['"].*accounting\/JournalEngine['"]\)/, 'PurchasingService must not import JournalEngine');
    assert.doesNotMatch(content, /JournalEngine\.postJournal/, 'PurchasingService must not call JournalEngine.postJournal');
    assert.match(content, /accounting_status = 'not_applicable'/, 'PurchasingService must mark accounting_status as not_applicable');
  });

  await t.test('Finance does not mutate Real Estate unit status', () => {
    const content = fs.readFileSync(path.join(__dirname, '../controllers/financeController.js'), 'utf8');

    assert.doesNotMatch(content, /UPDATE re_units SET status = 'Sold'/, 'financeController must not mutate re_units status');
  });

  await t.test('ERP accounting routes are parked and isolated in server.js', () => {
    const content = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

    assert.match(content, /ERP_ACCOUNTING_DISABLED/, 'server.js must isolate ERP accounting routes');
    assert.match(content, /ENABLE_ERP_ACCOUNTING === 'true'/, 'server.js must only mount ERP accounting when explicitly enabled');
  });
});
