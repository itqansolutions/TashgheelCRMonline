# Consolidated functional repair, Nov23 2026

Authority: user instruction06:20:51 to continue remaining tests, then fix and push main. No schema/migration/manual SQL/history/configuration/default/customer-data changes. This batch follows local lifecycle tests, not a claim that all project acceptance is complete.

## Code-only corrections and actual local verification

- GL Balance Sheet filters posted/as-of entries before summing lines. Undated Income Statement excludes draft entries. Trial Balance/Income/Balance Sheet exclude cross-tenant journal/account references. Temporary SQL baseline100asof,125all-posted, draft50/future25 excluded as appropriate.
- COA Add Account modal now renders, Arabic/English labels, matching group-parent selector, saving lock. Actual browser open/cancel/save/refetch and same-tick double submit pass on360/1440; inspected phone/desktop pixels. No live COA visit or seed action.
- ERP supplier creation uses existing active payable posting account. Missing config returns a clear error, no COA seed/settings mutation.
- ERP GRN draft and approval check tenant/branch/order/status/warehouse/item/product/positive finite quantity/cost/remaining quantity. Approval rechecks under order/item locks; two draft GRNs competing for2ordered commit one2 only. Repeated approval, wrong tenant/branch, wrong warehouse, mismatch/empty/zero and accumulated duplicate-line overreceipt reject. Receiver-aware SoD at service and middleware blocks creator approval.
- HR reversed/missing/impossible leave dates reject before insert, valid range remains inclusive. Explicit zero grace preserved and negative grace rejected. Shift/assignment, attendance and draft payroll baseline rerun on isolated SQL.
- Operating payment cancellation safely blocked409 before any changes, because the current schema lacks an explicit audit-safe expense linkage. This is mitigation, NOT completed cancellation functionality. Vendor settlement and receipt cancellation unchanged. No fuzzy historical matching/backfill/deletion.

## Regression boundary

Fresh temporary PostgreSQL, actual current controllers/services and synthetic fixtures, never the live database. Related finance date/balance/cancellation/authorization tests34/34 after updating the operating-cancellation expectation and explicit vendor party fixture. Previous financial-entry SQL suite and customer/sales/delivery lifecycles rerun. Production build passes with existing large-bundle warning.

## Remaining gate

Exact production activation and designated QA live acceptance are still required. No live financial, stock or cancellation writes resumed during this batch. Historical treasury gap/immutable incident untouched. Full cancellation needs a separately approved explicit linkage/status schema strategy. Other business routes/roles/integration effects, all populated states and physical devices are not exhaustively accepted. Overall PARTIAL/NOT READY for unrestricted handover.

## Sales returns follow-up, 06:35 Cairo

Further actual temporary PostgreSQL acceptance exposed two stock-integrity gaps outside the earlier purchasing GRN fix: same-tenant other-branch delivery-note return creation, and duplicate return lines each validated against the same remaining quantity. Local reproducer delivered2/previously returned1 then confirmed two return1 lines, producing returned3/net delivered-1. No live stock was touched and no affected live data claim is made.

Code-only fix validates branch and source warehouse at create/confirm, rejects duplicate/nonfinite/nonpositive items, checks confirmation item source/product and delivered source status, and scopes final update to tenant. Existing invalid drafts fail closed on confirmation without changing their records. No schema, historical matching or manual DB change.

`tests/acceptance_sales_returns.integration.cjs` runs actual temporary SQL baseline quote/order/delivery/return lifecycle, imported invalid draft checks, changed warehouse, source/product mismatch, and concurrent final1 return attempts. Exactly one concurrent return confirms; other rolls back; returned2/net0/current_qty10 with two Stock IN rows total. Existing related invoice/return/delivery suites28/28 pass after mock branch/source metadata refresh. This does not establish live role/stock acceptance. Deployment remains a separate check.

## Caller-owned invoice transaction follow-up, 06:37 Cairo

Actual temporary SQL confirmed existing-invoice lookup in convertSalesOrderToInvoice committed a caller-owned transaction. An inserted test marker survived caller ROLLBACK. A transaction ownership guard fixes this single early-return branch. Durable SQL finance regression verifies marker rollback, concurrent confirmed order→invoice60 idempotence and one payment/voucher settlement to paid. Mock regression also asserts no BEGIN/COMMIT/ROLLBACK on an injected client. No live writes or historical changes. Draft-order invoice conversion is existing UI/backend behavior and remains unchanged pending policy requirements.

## Supplier-invoice validation follow-up, 06:52 Cairo

Actual isolated SQL accepted a nonexistent supplier with negative total and nonexistent linked PO/GRN/items by silently skipping match. No live ERP invoice/stock effects tested. Scoped no-schema fix validates finite typed total/tax and quantities/costs, supplier tenant/branch, PO supplier/tenant/branch/status, received GRN/source relationships and individual PO/GRN/product lines. Rejects duplicate invoice source lines. Valid standalone operational invoice remains allowed, no GL journal posting. Existing price-variance escalation/persistence policy remains unchanged and is not certified as approval enforcement.

Durable purchasing SQL suite passes valid linked invoice60 and standalone10; negative/nonfinite/missing/bool totals, invalid tax/supplier/PO/GRN/line/product/quantity/duplicates/tenant/branch, draft GRN and mismatched received source all reject with no extra invoice rows. Purchasing existing20/20 and full finance effects SQL regression green. No schema/history/settings changes. Exact deployment and live effects are separate gates.

## Journal reversal and authorization boundary, 06:53 Cairo

Actual isolated SQL posting100, idempotent repeat, group/inactive/other-tenant account, imbalance and closed-period rejection passed. Reversal preserved original lines and posted a mirror, but GL reports excluded original reversed status and counted only mirror, yielding raw cash0 versus reported cash-100. Code-only report predicates now include posted and reversed originals, still excluding draft and respecting report dates. Reversal-day Cash/Revenue net0, prior-day100, repeated reversal rejected and audit rows retained. Durable journal SQL test plus prior draft/asof/tenant GL tests pass. No live journal or reversal executed. This is not the separate operating voucher cancellation, which remains safely unavailable409.

Durable isolated authorization SQL test passes active-user template hydration, inactive user/suspended tenant/bad token rejection, assigned branch and fallback, cross-tenant/unassigned branch rejection, financial role defaults/explicit grants/denies/tenant scope/DB-error fail-closed, sales-return creator SoD and other-tenant loader protection. No live permission changes. Full every-route/every-role and end-to-end UI authorization remain unestablished.

## Payroll boundary follow-up, 06:54 Cairo

Actual isolated SQL found month13 accepted, cross-month Dec31-Jan2 unpaid leave omitted from January deductions, and other-branch finalization allowed. Code-only fix validates month/year, locks scoped employee and uses one dedicated transaction for generation/header/trace, scopes attendance/leave by tenant/branch, computes inclusive leave overlap with each month, and scopes finalization to active branch. No salary-rate policy change (160-hour/22-day divisors retained), no live payroll/finalization/funds or historical modifications.

Actual SQL baseline1517.27 remains; January2 unpaid days deduct145.45; invalid month/year/wrong branch rejected; concurrent generation creates one draft; trace-insert failure rolls back header. Workflow8/workspace17 rerun green. This is bounded local proof, not full payroll policy/finalization acceptance.


## Nonfinancial reminder authorization follow-up, 07:03 Cairo

Stable23e deployment checkpoint completed separately before this batch. Actual isolated SQL found a same-tenant user explicitly denied deal.view and deal.log_activity could not open timeline403, but could dismiss that deal reminder200 by activity ID. No live reminder or notification was changed. updateReminder now checks existing deal.log_activity permission and existing deal record scope before any reminder change. Nondeal/customer policy remains unchanged, no new schema or permission configuration.

Durable tests/acceptance_activity.integration.cjs verifies deny403/no change, permission-but-unassigned404, authorized assigned-user dismiss/reschedule200, wrong tenant404, unchanged customer lifecycle and invalid inputs. Attachment unit/re_unit aliases, base64 fallback, tenant/branch filtering and nonowner delete denial pass with all synthetic rows retained. Scanner failed dispatch leaves unsent; retry marks sent; next scan skips. Dispatcher is stubbed, so this does not certify actual WhatsApp or external delivery, concurrent scanners, every-entity attachment permissions or a complete notification-outbox lifecycle. Existing related activity mock suites10/10 pass. All data synthetic in temporary PostgreSQL, no live effects or historical edits.


## Reminder scanner concurrency follow-up, 07:06 Cairo

Actual isolated SQL with two simultaneous scans and real in-app dispatcher reproduced two alerts for one due activity. Code-only scanner serialization now uses a dedicated PostgreSQL session advisory lock, nonblocking when another scan is active; selection, dispatch and sent marking remain inside the lock lifetime. Unlock always attempted in finally, bad connection discarded if unlock fails. No schema/migration/permission/channel policy change.

Durable tests/acceptance_reminder_concurrency.integration.cjs verifies simultaneous scanners produce one in-app row, subsequent scan skips, lock is released, actual dispatcher SQL failure leaves unsent and retry succeeds. Synthetic users have no phone, zero gateway calls. This reduces concurrent overlap only: crash between in-app insert and sent marking can still replay, external-channel enqueue failure after in-app success is not retried by this scanner, and UI reschedule versus dispatch race remains outside acceptance. No exactly-once delivery guarantee or live notification test claimed.


## Notification worker claim follow-up, 07:07 Cairo

Two isolated concurrent dry-run worker calls both processed the same single pending job because the previous SELECT FOR UPDATE lock ended at its standalone autocommit query. Replaced selection plus later processing update with one UPDATE of locked pending candidates RETURNING claimed rows. No schema or channel change. Actual SQL concurrent regression now records one processed/succeeded job and one empty worker, final job completed/log sent. Stubbed send failure verifies future backoff, no early execution, then terminal failure at max attempts. No real sends, settings or credentials accessed. Crash recovery for jobs left processing, send-success/log-failure replay risk and external delivery receipt transitions remain outside acceptance. Full notification readiness is not claimed.


## Deal attachment read boundary, 07:10 Cairo

Isolated existing deal.view-denied employee could read deal-linked file bytes via entity and global lists. Synthetic local static image also served without authentication. Bounded fix applies existing deal permission and assigned-record scope to both list surfaces and static deal file delivery before reconstruction/base64/image exceptions. Explicit tenant branding remains readable. Nondeal image access policy, upload/delete policies and legacy unlinked assets intentionally unchanged pending grounding, so this is not all-file confidentiality acceptance.

Actual SQL/temp-file regression tests/acceptance_attachment_scope.integration.cjs passes denied403, unassigned hidden, assigned allowed, tenant/branch filtering, unit aliases, static unauthenticated401/other tenant403/denied403/unassigned404/assigned200 and explicit tenant branding. No real file/gateway/live data accessed. Existing workflow8/8 passes. Added isolated queue SQL test verifies rules/channels, dedup/concurrency, tenant key isolation and audit insert rollback on existing migration schema, never applied to live DB.


## Private static assets and fallback, 07:11 Cairo

Follow-up grounded public exception in existing secure-upload tests and invoice/settings UI: explicit tenant branding is anonymous; sensitive attachments require authentication. Static middleware now authenticates/checks tenant before any reconstruction/base64 delivery for other files, independent of extension. Only explicit tenant-linked branding is anonymous. Same-tenant nondeal permissions remain otherwise unchanged; existing deal guards remain. Fallback candidate must remain below uploads root before any filesystem write. Actual temporary SQL/file test covers private customer image unauthenticated401/no reconstruction, other tenant403, same tenant200, deal guards and tenant logo. Existing static security tests7/7 pass. No live file probe, schema, historical repair or policy/role configuration change.

Residuals: upload/delete/nondeal assigned-record policies need independent acceptance; legacy file-name lookup ambiguity and inactive-user token revalidation are not certified. No claim of full file-security review or live exploitation.


## Single navigation/attendance/dispatch candidate, 07:56 Cairo

User approved one sidebar without a workspace selector, collapsible canonical sections and unchanged account permissions, combined with HR and dispatch repairs. No migration, history cleanup, settings, environment or payroll-policy changes.

- Sidebar: canonical collapsible navigation, active-route expansion, path deduplication; retain module/page and role gates. Workspace context remains for compatibility, not navigation selection.
- Attendance: shared web/device engine, dedicated transaction and tenant/user/day advisory lock, branch-local date and late-minute calculations, existing assigned shift/grace and09:15 fallback. Web rows populate attendance_date. Device punches aggregate earliest/latest monotonically, preserving original source. Scoped checkout and single-session guards. One legacy NULL-date row can be used without backfill; multiple/other-branch rows fail unchanged. Missing/invalid branch timezone and ambiguous/nonexistent device wall times fail closed.
- UI: attendance uses server day/session metadata, load failure/retry, awaited refetch, synchronous duplicate-click guard and contained mobile timesheet scrolling. Existing Arabic attendance translations connected correctly.
- Dispatch: inventory items with remaining quantity only; remaining defaults/max and finite bounds; synchronous submit guard; saved draft reused after confirmation failure and close/reopen within the same page. Fields locked during that retry. Full selected warehouse name wraps beneath native select on mobile. No persistent recovery across page reload is claimed.

Verification:13 isolated PostgreSQL suites pass, including HR and new attendance concurrency/rollback/legacy/index/ADMS cases. Attendance suite passes with UTC and Cairo process timezones. Navigation17-case suite, four-workflow and static-deal suites pass.22 security assertions pass using an unreachable localhost test configuration; initial attempt safely refused absent test configuration before running assertions. Actual component synthetic API browser assertions pass12 AR/EN360/1440 variants, including same-draft reopen retry and long Arabic warehouse summary. Inspected sidebar, attendance and dispatch pixels. Production build passes, existing large-bundle warning remains.

Evidence boundary: fresh disposable local SQL and synthetic browser API fixtures are not live tenant workflow or physical hardware proof. Current QA device lists were empty. ADMS transport acknowledgements/authentication/retry delivery are unchanged and not certified. Real stock/journal/payroll/finalization/cancellation and external-effect gates remain held. Overnight/off-day and other undefined salary policies remain unresolved, not invented. Primary purchase-request conversion and supplier-statement/payment, all-role and full live track acceptance remain incomplete. Overall PARTIAL.


## Post-deploy entitlement coherence correction, 08:05 Cairo

After exact2a2ca0f CRM deployment succeeded07:58:58, read-only general362 and RE363 attendance responses returned Cairo/today/none and empty devices. Actual general Sales Orders UI then displayed create/empty prompts despite API403. Its subscription response reported sales:true while backend manual entitlement guard denied it.

Confirmed code inconsistency: subscription response merged commercial defaults/raw overrides; backend normalizes manual overrides and missing flags false. Corrective response now uses existing guard-resolved modules/limits, preserving commercial metadata, without enabling anything or changing database settings. CRM daily/management/quotations remain governed by CRM separately from explicit sales orders/docs/tiers and sales teams/targets. Sidebar/subnav/direct-route gating aligned. Failed/denied order loads show persistent error/retry, not false empty/create prompts.

Regressions:9 isolated response/guard cases across general/RE, subscribed/legacy, omitted/explicit-enabled sales and missing map;49 existing manual entitlement/security assertions;20 component navigation cases including legitimate CRM without sales and explicit sales control;10 updated phase2 checks;12 AR/EN360/1440 component variants including denied load and recovered retry; production build. Initial phase2 static patterns described old sidebar structure/commercial merge, updated to approved canonical/manual model. Pixels inspected Arabic360/English1440 denied state. No live writes. Follow-up source is not deployment until exact CRM record and two-account read-only checks pass.

## Whole-HR evidence check, 10:54 Cairo

Read-only general QA user362:14 HR GET endpoints200. UI loads for personal attendance/requests/slips/balance, admin attendance/approvals/payroll/activity types/balances/shifts/devices and employee/department/job-title tabs. Data empty except one QA admin, so this is access/render proof, not live HR lifecycle acceptance. No live writes, real hardware, payroll generation, finalization, funds or schema/data changes.

Fresh disposable SQL suites acceptance_hr.integration.cjs and acceptance_attendance.integration.cjs passed. Targeted disposable fixtures additionally reproduced missing leave-to-balance consumption and configured shift deduction bands ignored by payroll. Current source only deducts late minutes using salary/160hours and unpaid leave using salary/22days. These existing divisors are preserved pending user policy decisions, not certified as the correct policy. Activity definitions have arbitrary names and hours/days, while leave uses annual/sick/unpaid and no activity mapping. Whole-HR acceptance remains PARTIAL. Hardware transport, overnight/off-day rules, salary setup path, all-role live workflows and payroll/Finance effects remain unverified or unresolved.

Unambiguous code repairs: missing Arabic/English labels for configured shifts/device counts/year and unexpanded attendance hours token. HR shift/device/activity-type POST/PUT routes now enforce documented admin/manager management boundary, not any authenticated employee.45 synthetic route dispatch checks pass. Actual UI components with actual language provider render all four corrected labels in Arabic/English with synthetic API data; screenshots visually checked. Frontend production build succeeds with existing large-bundle warning. These checks do not establish full translation or HR readiness.

### Approved daily penalty correction, 10:58 Cairo

Owner10:56:28 explicitly selected per-day assigned-shift bands then summing deduction days at month end, answering10:53:08 question. Payroll now resolves the effective assigned shift for each attendance day using branch timezone and attendance_date, totals band deduction days and multiplies by the existing salary/22 divisor. No new salary divisor policy is asserted. Missing/invalid/overlapping/uncovered rules for late attendance block draft generation; duplicated day records require review rather than double deduction. Existing slips are never rewritten.

Disposable SQL updated baseline with0.5day configured band gives1600-36.36-72.73=1490.91, replacing the old per-minute1517.27 expectation. Two date-specific shifts0.25+1day give90.91 deduction. Cairo April1 attendance stored March31UTC counts in April. Missing matching band rolls back without header.15 isolated HR assertions,4 penalty unit tests and7 delete-boundary regressions pass. Management-role45 checks and actual label UI English/Arabic checks remain green. Still no live payroll, hardware or leave/balance acceptance. Explicit leave mapping/schema decision remains pending; code not deployed at this checkpoint.
