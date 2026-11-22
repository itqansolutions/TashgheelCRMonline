# Combined corrections, local verification

This is one patch against source commit `2b101d8`. It replaces the earlier correction patches. It is not a production readiness certificate: no live or staging app, database, account, or deployment was changed or tested.

## Included changes

### Installment history and payment integrity
- Confirmed schedule replacement saves the old schedule in a history table in the same transaction. A missing history table prevents replacement without deleting the old rows.
- The UI shows schedule history and asks for confirmation before replacement. Confirmation tokens prevent replacing a schedule that changed after review.
- Collection on a Cancelled contract is refused. Cancellation and collection use consistent locks; installment deletion cannot win after collection has created a voucher.
- Existing commission deletion checks remain, with transactional locking and best-effort delete logging.

### Delete permissions across the project
- A server-side ceiling after authentication allows only `admin` and `manager` to reach protected HTTP DELETE routes, including chained routes and plugin routes. Screen permissions and explicit financial grants cannot bypass this ceiling for other roles.
- The POST voucher-cancellation alias has the same ceiling. Its existing `voucher.cancel` check remains.
- This is a restriction, not a grant. Existing narrower route, tenant, branch, financial, status, and dependency checks still run. For example, a manager does not gain the default admin-only voucher cancellation permission. Early system-admin plan routes retain their existing admin + system-tenant guard.
- Project phases have the same explicit admin/manager delete guard as developers, projects, buildings, units, and handovers.
- This also restricts deletes previously available to supervisors or other roles elsewhere in the project, such as target and team-member deletion. It does not change user accounts or saved role assignments.

### Linked-record deletion protection
- Unit deletion locks the unit and checks same-tenant deals, contracts, cancellations, handovers, and, when their unit-link columns exist, payment tracking, invoices, and quotations. A linked unit is kept even if its visible status is Available.
- Developer, project, phase, and building deletion locks the node and its units. Nodes containing units or child nodes are kept. Linked business records are not cascaded away and no archive feature is introduced.
- Handover deletion locks the handover. A deal or contract reference, or an indirect contract/cancellation link through its unit, prevents deletion even in Draft status and even for admin/manager. Finalized handovers keep their existing status restriction.
- Important consequence: the source schema requires a deal reference on normal handovers. Those handovers are therefore not deletable under the linked-record rule. The permission to request deletion does not override that rule.
- New dependency counts and child queries are tenant-scoped. Foreign-tenant access is rejected without returning linked counts. Source unit and hierarchy IDs are global primary keys, not per-tenant composite IDs.
- Required schema errors fail closed: a missing hierarchy column returns an error with the target unchanged. There is no graceful fallback. Optional link tables are skipped only when their unit-link column does not exist.

### Matching and missing-input warnings
- Scores use only the criteria actually stated by the customer. Missing criteria no longer add free points. Budget, area, location, and rooms affect ranking in both directions.
- No hard max-budget/location exclusion or default numeric cutoff is added. Existing eligibility, tenant, branch, blacklist, type, and active-customer filters remain.
- With no stated preferences, eligible results remain visible but the UI shows a dash and a no-preferences label instead of a misleading match percentage. The API marks the customer with `has_requirements: false`; its numerical score is zero.
- After requesting matches, missing max budget or preferred location produces an advisory warning. No-preference customers are included in that warning. Completing these inputs does not become a new save requirement.

## Verification on the combined source

All database checks used new, temporary local PostgreSQL clusters and synthetic records. They did not read the application's database configuration.

| Check | Observed result |
| --- | --- |
| Built-in offline tests | 14 passed: installment-history cases, role ceiling, HTTP boundary behavior, and the real financial permission middleware with a stub database |
| Linked unit deletion | Each of deal, contract, cancellation, handover, payment, invoice, and quotation links refused deletion with 409; both records remained |
| Hierarchy deletion | Empty developer/project/phase/building deletion succeeded; populated hierarchy nodes were kept |
| Linked Draft handover | Deal-linked and contract-linked cases refused for both admin and manager; indirect unit-to-contract case also refused |
| Tenant / branch checks | Foreign access to units, hierarchy nodes, and handovers returned 404 without linked counts; handover wrong-branch access returned 404; foreign link/child fixtures did not enter same-tenant counts |
| Concurrent unit / hierarchy operations | A unit delete waiting for a deal writer saw the committed link and refused; a building delete waiting on its unit also saw the committed deal and refused; a waiting unit delete rechecked a newly committed reservation; concurrent unit deletes returned one success and one 404 |
| Missing hierarchy prerequisite | 500, target row unchanged, tested explicitly |
| Cancelled contract collection | 409, no voucher, paid total unchanged |
| Cancellation vs collection | 150 rounds, zero inconsistent refund/payment snapshots observed |
| Collection vs installment delete | 30 rounds, zero deleted installments with a voucher observed |
| Cancellation vs status-to-Cancelled | 150 rounds, zero deadlocks and zero other handler errors observed |
| Schedule history integration | Confirmation, snapshot preservation, stale tokens, concurrent confirmations, missing migration, rollback refusal while history exists, and best-effort logging cases passed |
| Matching database checks | UUID and SERIAL unit-ID fixtures passed; no-preference results and zero-score mismatches remained visible; branch/type/active filters remained effective |
| Real RE middleware probe | Sales received 403 on all 10 tested RE DELETE paths. Privileged requests passed the role ceiling, but incomplete fixture schemas mean that probe is not a privileged workflow acceptance test |
| Frontend | Production build passed, with the existing large-chunk warning. English/Arabic warning panels, no-preference results, and complete-input/no-warning state were inspected visually using a mock API. Fixture scores were generated with the patched calculation function |
| Patch / syntax | Clean apply-check against `2b101d8`, changed JavaScript syntax checks, and whitespace checks passed |

Delete audit logging is asynchronous and best effort. It must not be described as guaranteed. The installment history row inside the replacement transaction is the durable schedule record. A refused handover deletion does not create a successful-delete audit entry.

## Remaining limits

- No live/staging verification, real-data acceptance test, or deployed-build identification was performed. The baseline above is a source commit, not proof of the deployed version or today's remote main.
- No fully connected browser workflow against the patched backend was run. Visual evidence uses mock API responses; database and middleware checks are separate.
- The concurrency tests cover the named local cases, not every possible writer or interleaving. The deal-writer deletion tests use explicit local transactions following the source unit-lock pattern, not full deal-creation HTTP requests.
- Commission pay-vs-delete concurrency was not separately exercised.
- The contract status endpoint can still set Cancelled without the cancellation flow's refund calculation. That pre-existing gap is not fixed here.
- Runtime DDL remains. Payment column checks run once before payment transactions when requested, and contract request-time column checks remain. This is not startup-only DDL.
- Required hierarchy and tenant columns must already exist. Missing required columns/tables can return 500 with no deletion. The patch does not add a compatibility migration for every older schema.
- The new role ceiling is not a redesign of every module's business dependency rules. Existing financial deletion/cancellation policies remain, alongside the new inventory/hierarchy/handover link checks described above.

## Apply order

1. Back up the target database and keep a copy of the current source. Check that the intended baseline is `2b101d8`. If the source differs or apply-check fails, stop rather than force it.
2. Save `real-estate-corrections.patch.txt`. From the source repository, run `git apply --check real-estate-corrections.patch.txt`, then `git apply real-estate-corrections.patch.txt`. Do not apply earlier patches as well. Do not start the updated backend yet.
3. Using the normal database migration process, apply `migrations/027_create_re_installment_schedule_history.sql` to the backed-up target database before starting/deploying the updated backend. The rollback script intentionally refuses while history exists.
4. Run `node --test tests/delete_role_boundary.test.js tests/re_installment_schedule_history.unit.test.js`. Build the frontend with its normal build command. Review the remaining limits above.
5. Deploy through the normal process, then perform controlled acceptance tests for the relevant roles and linked/unlinked records before announcing completion.

The separate `deletion-regression.js.txt` is the isolated database reproducer, not an application migration. It requires `embedded-postgres` and `pg` in a local test environment. Rename to `.js` and run from the repository root, or provide the source path in `REPO`. It creates its own temporary database with synthetic data and does not use `DATABASE_URL`. Do not run application migration/seed scripts as a substitute.
