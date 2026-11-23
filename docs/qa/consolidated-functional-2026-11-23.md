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
