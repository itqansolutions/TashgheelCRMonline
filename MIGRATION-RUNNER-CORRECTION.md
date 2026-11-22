# Migration-runner integration correction

22 November 2026. Local correction against source commit `d7952b891785e72427430ba302d2fcbe6a891e7b`.

## What was missed

The previous correction package placed both the forward 027 migration and its manual rollback in the application's automatically scanned migrations directory. Startup selects every SQL file in that directory. On the known empty-history path, it can create the archive table and then drop it again, recording both filenames as applied. That can leave schedule replacement blocked on a missing prerequisite. This integration error was missed in the package validation.

The same scan also includes the older 026 rollback. That rollback concerns the SaaS tenant commercial-contract value/duration ledger (`tenant_contracts` and its audit table), not property-sale contracts (`re_contracts`). It predates the correction package. It must not run automatically either. This correction does not reconstruct that unrelated ledger or claim its data was changed.

The mechanism was reproduced using the actual unmodified migrationRunner and real PostgreSQL, with synthetic base tables and older migration records. There has been no inspection or change of the deployed database, no live rollback, and no proof that a live table was dropped.

## Changes in this incremental correction

- Startup selects numbered forward SQL files and excludes rollback/down filename conventions. Existing forward filenames, including `011_manual_entitlements_and_audit_schema.sql`, remain selected. A normal name containing `down_payment` is not treated as a rollback.
- When a rollback is already recorded for a version but its forward marker is absent, that forward migration is held for operator review. This prevents silent recreation of the separately rolled-back 026 commercial ledger.
- SQL files execute on a dedicated connection. A failed transaction is rolled back on that same connection before release. No migration marker is deleted.
- New forward migration `028_verify_re_installment_schedule_history.sql` handles only the history prerequisite and the state table below.
- History-prerequisite failures are returned as migration-runner errors. Existing unrelated migration-error behavior is not redesigned.
- The incorrect automatic-execution comment in 027 is corrected. The original correction notes now explicitly distinguish stored schedule archives from payment-history UI.

## Gate for 028

| Observed state when 028 runs | Behavior |
| --- | --- |
| 027 forward recorded, compatible history table exists | Validate structure, required defaults, primary key and JSON shapes. Preserve every existing row. |
| 027 forward and 027 rollback both recorded, history table missing | Create empty history storage, then validate it. Preserve both existing markers. This repairs storage, not missing historical data. |
| 027 forward recorded, history missing, no 027 rollback marker | Refuse automatic repair. Operator review required. |
| 027 forward marker missing | Refuse automatic repair. On a normal fresh upgrade, the forward runner applies 027 first. A recorded rollback prevents silent reapplication. |
| Existing relation is not a table, columns/defaults/key are incompatible, unsupported required extra column exists, or history JSON has the wrong shape | Refuse without altering the existing relation or its rows. Do not record 028 as successful. |
| 028 already recorded | Normal migration tracking skips it. This is not a continuous schema monitor or permission to clear its marker and rerun it. |

The validation checks structural compatibility, not the business correctness of past archive contents or their reconciliation to contracts. It does not export, recover, rewrite or discard old data.

## Isolated verification

`tests/migration_runner_history.integration.js` ran against temporary PostgreSQL with the actual runner and the actual Finance/Purchases schema helpers, not mocked SQL execution.

Ten checks passed:

1. Unmodified `d7952b8` reproduces the 027 create-then-rollback outcome and records both names.
2. Current forward names remain included; rollback/down names are excluded; `down_payment` stays forward.
3. A fresh history prerequisite survives the corrected runner; neither rollback marker is newly written.
4. The known recorded bug state is repaired; a second run leaves rows and markers unchanged.
5. Existing compatible archive rows are preserved exactly as returned before the run.
6. Incompatible columns are refused, preserving rows and markers.
7. Incompatible JSON is refused, preserving rows and markers.
8. A missing table without the known rollback marker is refused.
9. An absent forward marker with a recorded rollback is refused rather than guessed.
10. A previously recorded 026 rollback does not cause automatic reconstruction of its commercial ledger.

Sentinel commercial-ledger rows were also preserved where those tables existed. No 026 rollback was executed in this diagnostic. The fixtures mark earlier migrations as already applied; this is an upgrade/startup-runner test, not a fresh installation test of every historical migration or a full server startup with background workers.

The diagnostic requires `embedded-postgres` and `pg` in a local test environment. Run from the corrected repository with:

```text
node tests/migration_runner_history.integration.js /absolute/path/to/unmodified-d7952b8
```

Omit the baseline argument to run the corrected-path checks only. The test creates and removes its own temporary PostgreSQL cluster. It replaces the application's database module before loading the runner and never reads application database credentials. Do not run it as an application migration or point it at an existing database.

## Application and acceptance limits

This is one incremental patch for `d7952b891785e72427430ba302d2fcbe6a891e7b`, not a replacement full patch against `2b101d8`. Do not apply the earlier correction patch again. The previous delivered file remains unchanged as a historical artifact.

Before any application/deployment, the owner must review a backup and restore route, the actual migration markers and history-table state, and the intended test environment. Unknown states require review, not migration-record deletion or a manual rollback. This packet has not been applied, pushed, merged or deployed by the reviewer.

Applying the corrected startup code can run the forward migration and the narrowly gated repair. That is a schema change requiring the owner's deployment approval. A successful deployment badge or HTTP health response is not proof that it succeeded: the existing server opens its listener before startup migrations. That architecture is unchanged. Inspect the migration outcome and prerequisite before schedule-replacement acceptance.

The UI currently displays payment-voucher history, not archived prior schedules. Archived schedules are stored in the backend but have no archive-reader endpoint/UI in this source. No archive-view feature is added here.

The newer lead-distribution, Finance-summary and clutter findings remain separate and unfixed. No receipt, collection, cancellation, deletion, permissions probe, actual lead assignment, settings change or other account operation was performed in this correction work.

## Bounded retest after prerequisite review

- Identify the intended RE test tenant/account/branch and the served build without loading data-changing pages first.
- Verify the current database prerequisite and migration outcome through a separately approved non-mutating check, accounting for application GET handlers that can run schema guards.
- Only then agree a synthetic-record test scope for schedule confirmation/preservation and stale tokens. Do not reuse the stopped incident contract or immutable original records.
- Keep collection, refund/cancellation, real financial posting, actual customer data, role changes and security-bypass testing outside that scope unless separately agreed.
- Finance's current empty-state cause and app-side behavior remain unverified. No whole-product readiness verdict follows from this packet.
