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
