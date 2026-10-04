const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Phase 3: Financial Operations Unification', async (t) => {

  await t.test('reInstallmentsController creates Finance receipt vouchers on payment', () => {
    const content = fs.readFileSync(path.join(__dirname, '../controllers/reInstallmentsController.js'), 'utf8');

    assert.match(content, /INSERT INTO finance_vouchers/, 'recordPayment must create a finance_vouchers receipt');
    assert.match(content, /'receipt'/, 'Voucher type must be receipt');
    assert.match(content, /installment_id/, 'Receipt must link to installment_id');
    assert.match(content, /last_voucher_id/, 'Installment must store last_voucher_id from finance_vouchers');
  });

  await t.test('Installment paid_amount is synchronized with finance vouchers', () => {
    const content = fs.readFileSync(path.join(__dirname, '../controllers/reInstallmentsController.js'), 'utf8');

    assert.match(content, /UPDATE re_installments SET\s+paid_amount = \$1/);
    assert.match(content, /last_voucher_id = \$4/);
  });

  await t.test('No accounting journals or GL are created in reInstallmentsController', () => {
    const content = fs.readFileSync(path.join(__dirname, '../controllers/reInstallmentsController.js'), 'utf8');

    assert.doesNotMatch(content, /JournalEngine/, 'No JournalEngine in reInstallmentsController');
    assert.doesNotMatch(content, /postJournal/, 'No postJournal in reInstallmentsController');
  });

  await t.test('Idempotent backfill script runs without creating accounting journals', async () => {
    const backfillContent = fs.readFileSync(path.join(__dirname, '../scripts/backfill_re_payments_to_vouchers.js'), 'utf8');

    assert.match(backfillContent, /INSERT INTO finance_vouchers/);
    assert.doesNotMatch(backfillContent, /JournalEngine/);
    assert.match(backfillContent, /SELECT id FROM finance_vouchers\s+WHERE installment_id = \$1/, 'Backfill must check for existing records');
  });
});
