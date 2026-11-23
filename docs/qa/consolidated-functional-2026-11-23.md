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
