# Attendance location, staged release proposal. Not authorized for execution.

Current candidate starts from65e2f9b and includes location only. Leave balances and payroll remain unchanged. Do not deploy old mixed HR preparation.

## First decision, install without enforcement
After recovery preflight and review, approve applying only hr_branch_geofence.sql and shipping location-only code. This creates one empty policy table, no policy rows, updates no historical attendance, adds no leave mapping. Enforcement defaults OFF. Existing manual attendance is unchanged unless admin deliberately enables a branch.

Preflight: inspect actual DB server/catalog in a read-only session for tenant/branch/user key compatibility, existing table/name conflicts, permissions, disk/locks and migration runner behavior. Use fresh verified backup; existing archive readback is not a tested restore. Perform isolated restore verification only with separate authority for handling restored private data. Estimate/approve any paid resources first. Migration SQL is transactional and not in startup. Use bounded lock/statement timeouts. If preflight fails, stop before code release. Apply schema first, verify empty table/constraints, then exact reviewed source deployment. No location code without schema. Read-only live smoke first. Table creation is not policy activation.

## Second decision, one branch pilot
Owner/admin supplies exact branch center/radius. Proposed60second fix age/5second future skew need explicit approval. Full reported accuracy circle must fit the radius, so weak indoor GPS may reject people physically inside. Browser location/mobile user agent are spoofable, not trusted device attestation. No continuous tracking; fixes not persisted. Map loading discloses branch geography to OSM only after admin action, not employee fixes. Provider review remains needed before activation.

Configure OFF first and inspect actual map/branch. Verify branch-switch isolation. Pilot on explicitly authorized test identity/records: inside checkin+checkout, outside, boundary/accuracy, denied/timeout/desktop, stale/future timestamp, network/server failure, refresh/double click, unauthorized role and other branch/tenant. No real payroll or historical record cleanup. Agree on employee exception process before enabling. Activation and location policy save require separate approved scope.

## Recovery
Before schema commits, failed transaction rolls back. After schema commits, leave the table intact on application failure. Restore previous application commit65e2f9b only under approved rollback scope, without dropping policies or attendance. Do not restore the full database or delete new data as an automatic rollback. If an enabled pilot blocks attendance, agree with owner whether to disable that branch enforcement; never silently change attendance policy. Preserve policy rows for review.

## Current verification
Fresh8synthetic validator/policy/controller checks,7actual-client synthetic scenarios, disposable PostgreSQL migration/current policy get+save/off/inside/outside/missing/tenant+branch tests and production build pass. No live schema/configuration/HR writes. Branch-switch stale form/client risk found and corrected using branch-keyed mounts; needs dedicated branch-switch automated regression before release approval. Actual current-candidate mobile pixels show policy text/controls fit, but form inputs need inherited form styling and map/navigation integrated verification. Not execution-ready until those checks finish. Old branch evidence must not replace current-candidate evidence.
