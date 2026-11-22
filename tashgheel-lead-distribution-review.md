# Tashgheel: lead distribution and usability review

22 November 2026 | Findings and proposed corrections, not an implementation packet

## Answer

**The reviewed lead-distribution paths are not ready to rely on.** The product exposes team methods, receiving status and quotas, but different entry points do not apply them consistently. Isolated tests reproduced failed automatic selection, incorrect unassigned-queue behavior, invalid assignees, incomplete batch updates and inaccurate success counts. The interface can hide a queue failure behind a reassuring empty state. Fix correctness and trustworthy feedback before making broad design changes.

This is a bounded review of assignment and the adjacent sales/team screens, not a whole-product usability sign-off. No real assignments or connected-system changes were made. No fixes were added during this review.

## What exists today

| Entry point | Reviewed behavior | Evidence |
|---|---|---|
| Property Finder automatic intake | Chooses a relevant active team, then attempts least-loaded selection using active deals and today's PF deals. Fallback order is leader, supervising manager, integration default, unassigned. The stored Round Robin/Manual choice does not change the resolver's path. | Source S1; isolated execution E1 |
| Bulk assignment to a representative | Updates selected customer owners directly. The tested path accepted an inactive user. | S2; E2 |
| Bulk assignment to a team | Counts all assigned customers as load. `least_loaded` rebalances within the batch. Other method values take a request-local rotation; there is no persisted turn between requests. The UI always submits `least_loaded`, irrespective of the team's saved method. | S2, S4; E2 for eligibility/results, source-only for fairness behavior |
| Meta intake | Uses the form's assignee, or the initiating user if available, rather than the PF team resolver. | S6, source only |
| Manual customer creation | A blank assignee defaults to the initiating user, despite the form offering a system-decides/me label. | S7, source only |
| Automation `assign_lead` action | Separately selects an `employee` with the fewest open deals, without using the team method. | S6, source only |

There is no single verified distribution policy spanning these entry points. PF's branch-based team selection takes the first matching team by ID; this is not rotation across multiple teams. Whether that selection is desired is a business-policy decision, not something this review assumes.

## Ranked corrections

| Priority | Finding | Concrete correction to propose |
|---|---|---|
| P0 | Bulk assignment did not enforce the tested same-company branch restriction. An inactive direct assignee and an inactive team/member with zero quota were accepted. Foreign-tenant customer UPDATE was prevented in the tested case. | Apply the approved scope and eligibility rules to the batch before any write. Do not infer a new role matrix. Affected bypass testing remains stopped. |
| P0 | PF candidate SQL combines aggregation with `FOR UPDATE`, rejected by PostgreSQL. In a real transaction, later queries fail because the transaction is already aborted. | Replace the invalid selection/locking pattern and make database errors distinct from genuine exhaustion. Prove it on real isolated PostgreSQL, not only SQL-shaped mocks. |
| P0 | The unassigned queue filters `manager_id`, not `assigned_to`. With the source schema's integer type, its empty-string comparison returns HTTP 500. A diagnostic text-column variant selected an assigned customer and omitted an unassigned one. | Define the queue by actual ownership, using a type-correct predicate. Test assigned/unassigned customers independently of manager overrides. |
| P0 | The screen swallows queue/team fetch errors. A failed queue load renders the message that all leads are assigned. | Separate loading, empty and failed states. Show a retry action after failure; never claim the queue is clear without a successful response. |
| P1 | PF returns a configured default even when validation finds no valid user. Nonexistent and inactive defaults were reproduced. | Only accept a validated assignee. Preserve the existing unassigned/manual path when no valid fallback exists, subject to the approved fallback policy. |
| P1 | A team batch reported three assignments when only one customer changed. A forced second-write failure left the first assignment committed. Activity calls used the wrong argument shape and created no activity rows in the test. | Count actual changed rows, define atomic versus explicit partial-success behavior, and record assignment history with the correct logger contract. Never report an unqualified success after a failed batch. |
| P1 | Team settings, the bulk screen and PF disagree about the chosen method. Manual/unknown method values fall into rotation in the bulk controller. | Make the visible choice and executed behavior agree. Validate allowed values and define Manual explicitly. Do not silently choose cross-channel policy during a code fix. |
| P2 | Sales representatives opens on hard-coded October 2026, labelled Current, while Sales Management uses the current month. Supervisors still see archive/remove controls that the approved DELETE ceiling denies. A sales-role operational team leader can have member-update permission in the controller but lack the UI management entry point. | Derive period choices from the actual date and align visible controls with existing server permissions. Do not loosen the server ceiling or invent new grants. |

P0 and P1 are release blockers for the reviewed distribution work. They are not evidence that real customer data has been misassigned.

## Simplify the existing workflow

1. **One clear path, existing screens.** Team setup stays in Sales Teams; assignment stays in Bulk Lead Distribution. Link the two directly and show the selected team's effective method and eligibility summary beside the assignment action. A separate new dashboard is not needed.
2. **Explain the action before it counts.** Show the selected lead count, destination representative/team and effective method together. Report the actual changed count afterward, preserving selections on failure so the user can recover deliberately.
3. **Use honest, consistent labels.** A creator fallback should say so. A failed load should say so. The current period should really be current. A disabled or hidden control should reflect existing permission rules rather than letting the user discover them through a rejection.
4. **Clarify the existing customer entry points.** `/customers` and `/contacts/customers` lead to different views of customer work. Review their labels and role entry points before consolidating anything. No removal or whole-navigation redesign is proposed from this limited review.

Arabic RTL and English desktop captures of the reviewed sections were readable at the tested size. That is a layout observation only. It does not establish backend correctness, mobile usability or ease of use for real staff.

## Decisions needed before policy changes

Keep these separate from mechanical bug fixes:

- Which sources must follow a team's saved method, and whether an explicit form/user assignee overrides it.
- What load and daily quota mean: customers/leads versus active deals, which sources count, and whether leader/manager fallback may exceed ordinary limits.
- What Manual means, whether Round Robin must continue between batches, and how multiple eligible teams are selected.
- Whether reassignment moves the customer only or also its linked deal. The bulk code currently changes the customer only.

Recommendation: agree one short policy table covering those choices, then correct the existing paths to match it. No new policy is approved by this report.

## Evidence and limits

**Inspected source:** commit `17b813b`, based on `2b101d8` plus the final correction patch, SHA256 `03482ac58e3e8a19eb47da116224b60c4432f841b69aebd9b54b9e3f8d867ed3`. The locally retained patch and delivered attachment were checked as the same bytes. No tracked changes during this review. This identifies the reviewed source, not the deployed build.

- **E1, isolated PostgreSQL:** actual PF resolver with an eligible representative; rejected aggregate/lock query; transaction-aborted follow-on queries; nonexistent and inactive default-user cases. The real ingestion function wraps assignment in a transaction, confirmed in source. A complete PF webhook ingestion was not executed.
- **E2, isolated PostgreSQL:** actual bulk controller with synthetic users, teams and customers; inactive assignment, scope, count, partial-failure and activity-row results. Affected scope-bypass tests were stopped after confirmation and were not repeated.
- **E3, isolated PostgreSQL:** actual customer-list handler; integer-schema queue failure, then a text-column diagnostic to distinguish wrong-field logic from the type error. The text variant is not a claim about the deployed schema.
- **E4, local mock rendering:** actual sales/team React components, synthetic data, writes rejected. Inspected Arabic and English distribution views, failed-load empty state, Round Robin setting, stale period and supervisor controls. Captures are illustrative, not live customer data.

Source-only follow-up: PF joins today's deals and active deals in the same aggregate without distinct counts. That can multiply counts and distort quota/load checks. This was not separately executed after the blocking SQL error, so it is a latent query risk rather than another confirmed runtime result.

Not verified: deployed build/schema, real source settings, real workloads, concurrent intake, quota boundary stress, mobile layouts, full keyboard/accessibility behavior, real operator task completion or whole-product journeys. Existing PF tests check mocked SQL, including the presence of a lock clause; that does not prove SQL validity or concurrency correctness.

## Source notes

Paths and line numbers refer to the inspected repository, not an external documentation claim.

- **S1:** `services/propertyFinderSyncService.js:907-1090`, team selection, candidate query and fallbacks; `1110`, transaction start; `1331`, assignment inside ingestion.
- **S2:** `controllers/customersController.js:1105-1203`, bulk assignment, eligibility lookup, load calculation, writes and counts; `utils/activityLogger.js:15-43`, logger contract and error handling.
- **S3:** `controllers/customersController.js:198-206`, queue predicate; `database/schema.sql:79-80`, owner and manager integer fields.
- **S4:** `frontend/src/pages/Sales/SalesManagement.jsx:167-176`, swallowed fetch failures; `195-220`, fixed method and generic success; `595-690`, distribution controls and empty state.
- **S5:** `frontend/src/pages/Sales/Salesmen.jsx:16-35`, period and management role check; `183-195`, period labels; `1105-1118`, supervisor-visible archive control. `controllers/salesTeamController.js:680-744`, operational-leader member-update permission.
- **S6:** `services/metaService.js:197`, form/initiator assignment; `services/ruleEngine.js:129-160`, separate automation assignment.
- **S7:** `frontend/src/pages/Customers.jsx:697-704`, assignee label; `controllers/customersController.js:285`, creation fallback.
- **S8:** `migrations/024_sales_teams_management.sql`, team methods, quotas and member receiving status; `tests/batch_d_property_finder_smart_lead_distribution.test.js:84,154-163`, mocked lock assertions.

Supporting images: `distribution-error-ar.png`, `team-method-en.png`, `representatives-period-en.png`. All show synthetic local data.
