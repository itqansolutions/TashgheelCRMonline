# Financial entry repair acceptance, 2026-11-23

Scope: new Expense, standalone receipt/payment vouchers and supplier payments only. No data repair, manual schema changes, settings or default-account edits. GL report filtering and Chart of Accounts Add Account remain separate known failures, not repaired here.

## Verified locally

- Actual controller integration against a fresh temporary PostgreSQL database, never the live database.
- Invalid finite/positive amount, missing default, invalid/inactive/wrong-type/wrong-branch treasury rejects with zero financial row changes.
- Party and supplier invoice tenant/branch/owner checks. Cancelled purchase invoice and overpayment rejected before insert.
- Concurrent supplier payments 60+60 against a 100 invoice commit one 60 only.
- Valid expense25, receipt12, operating payment8 reconcile selected treasury and summary once. Expense mirror deliberately has no treasury association because its voucher already counts the outflow.
- Invoice-linked standalone receipt retains one voucher and one payment; linked overpayment rolls back. Forced expense-mirror insert failure also rolls back voucher and numbering.
- Actual Finance and Vendor components in an isolated browser fixture, Arabic/English, 360/1440 widths: explicit account required, payment-method filtering and reset, exact25/account4 payload, same-tick double submit only one POST.
- Actual screenshots inspected for phone controls and scrollable payment footer, desktop supplier modal. This is synthetic browser evidence, not live acceptance.
- Production build and controller syntax checks pass. Existing large-bundle warning remains.

## Reproduction

`FINANCE_TEST_PG_MODULES=/path/to/ephemeral-pg/modules node tests/finance_collection_effects.integration.cjs`

`FINANCE_FORM_TEST=1 node tests/mobile_app_fixture.cjs`

`AUDIT_LANG=ar AUDIT_WIDTH=360 python tests/finance_entry_forms.browser.py`

Repeat browser cases for en/360, ar/1440 and en/1440. Fixture defaults to blocked writes unless FINANCE_FORM_TEST is explicitly enabled; allowed posts are captured in memory, never sent to a server.

## Still required

Exact production activation and designated QA-tenant acceptance. Do not present source/local evidence as deployed readiness. Historical receipt treasury gap is untouched. Whole-project functional acceptance remains partial; physical devices, role variants, populated business flows and excluded reports are not all accepted.
