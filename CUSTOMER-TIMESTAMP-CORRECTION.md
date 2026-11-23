# Customer timestamp guard correction

Status: prepared and verified locally. Not applied to the live app or database.

## Scope

One application file changes: `controllers/customersController.js`.

- Remove the page-entry update that replaced every missing customer date with the current time, including customers belonging to other companies.
- When the timestamp column is missing, add it without a default first. Existing rows keep an unknown (`NULL`) date.
- Keep the separate default for future inserts. Known dates and explicit nulls remain unchanged.

No historical backfill, data cleanup, migrations, deployment, or unrelated feature changes are included. Other existing schema-compatibility statements remain unchanged. This is not a claim that every customer workflow or every tenant boundary has been audited.

## Local verification

The patch was applied to a separate clean copy of the current source. Six isolated PostgreSQL checks passed, using the actual customer-detail handler and synthetic data only:

1. Unmodified source reproduces the unwanted rewrite in both synthetic companies.
2. Corrected source preserves null and known dates in both companies.
3. Adding a missing timestamp column leaves legacy dates null.
4. Future inserts receive a default; explicit null and known dates are respected.
5. Repeated reads and a fresh controller preserve existing rows.
6. A request for the other company's customer returns 404 without rewriting either company's rows.

JavaScript syntax and patch-whitespace checks passed. No live customer page was opened and no live database was accessed for this correction. There is no UI change to preview.

## Patch

`customer-timestamp-guard-correction.patch.txt` contains the application change and its isolated regression test, `tests/customer_timestamp_guard.integration.cjs`.

Prepared against `ef5ae1345becf2ddceb88faf4c83f0f8886834c0`, rechecked on November 23, 2026, Cairo time.

SHA-256: `200238895c11c3233a2cba0d4a9f5e877c9d8f98b299ecde0bf309bad0ee2894`

For local review on the same source version:

```sh
git apply --check customer-timestamp-guard-correction.patch.txt
git apply customer-timestamp-guard-correction.patch.txt
node --check controllers/customersController.js
node tests/customer_timestamp_guard.integration.cjs
```

The regression test requires local development packages `pg` and `embedded-postgres`. It starts temporary PostgreSQL, never loads the application's database configuration, and stops the temporary server after testing. Installing these test packages on production is not required.

If the source has advanced, check the patch against that source before applying. Do not restore guessed dates to any rows that might already have been rewritten. This patch prevents the identified future rewrite; it cannot reconstruct unknown historical dates.

## Next step

Review this single correction for inclusion in your next controlled upload. Applying, deploying, and resuming the live customer journey remain separate steps, not completed by this packet.
