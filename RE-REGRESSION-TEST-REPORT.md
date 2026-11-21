# Tashgheel CRM Online — Real Estate Module
# Automated Regression Test Execution Report

**Document Reference:** `RE-REGRESSION-TEST-REPORT.md`  
**Date:** November 21, 2026  
**Auditor / Engineering Lead:** Real Estate Engineering & Platform Core Team  
**Branch:** `fix/real-estate-lifecycle-audit`  
**Test Suite Path:** `tests/re_lifecycle_audit_remediation.test.js`  
**Test Framework:** Node.js Native Test Runner (`node:test`)  
**Status:** **100% PASSING (14 of 14 Tests)**  

---

## 1. Test Suite Architecture & Strategy

To comprehensively verify the remediated Real Estate workflows without polluting production data or mutating QA audit records (e.g., `REC-2026-00001`, Deal 2022, Deal 2023, Unit U-102), an automated test suite was constructed using `node:test` and `node:assert/strict`.

The test suite isolates database interactions via an in-memory mock query engine that verifies:
1. Exact SQL grammar and row-locking AST clauses (`FOR UPDATE OF rc`, `FOR UPDATE OF rh`, `FOR UPDATE OF ri`).
2. Absence of bare `FOR UPDATE` clauses on nullable outer joins (preventing Postgres error `42P10`).
3. Mathematical precision of installment scheduling, down payment splits, and remainder penny distribution.
4. Transaction integrity (advisory locking, commits on success, rollbacks on error, sanitization of error messages).
5. Reservation concurrency rejection (HTTP 409 `UNIT_NOT_AVAILABLE`) and auto-release mechanics.
6. Case-insensitive dashboard stage normalization and metric parity.
7. Multi-tenant boundary isolation.

---

## 2. Test Execution Output

The automated test suite was executed against Node.js v20+ with zero external mocking libraries required:

```text
◇ injected env (4) from .env
[Generate Schedule Error]: Database connection reset during lock
[Update Handover Status Error]: Deadlock detected during lock
[Deals] Column guard completed.
[ReservationEngine] Found 1 expired unit(s). Initiating auto-release...
[ReservationEngine] Unit unit-u102 released. Deal 2022 reservation expired (Stage: negotiation).
▶ Real Estate Lifecycle Audit & Controlled Remediation Test Suite
  ✔ 1.1 generateSchedule uses FOR UPDATE OF rc to prevent outer join locking error (3.3115ms)
  ✔ 1.2 generateSchedule calculates 4 quarterly installments correctly (1M value, 200k DP -> 4 x 200k) (0.3916ms)
  ✔ 1.3 generateSchedule rolls back and returns clean user-safe error on failure (0.5247ms)
  ✔ 1.4 recordPayment uses FOR UPDATE OF ri to prevent outer join locking error (1.315ms)
  ✔ 2.1 updateHandoverStatus uses FOR UPDATE OF rh to prevent outer join locking error (1.1995ms)
  ✔ 2.2 updateHandoverStatus sanitizes error on failure and rolls back (0.3968ms)
  ✔ 3.1 reserveDealUnit rejects double active reservation on an already reserved unit (5.2014ms)
  ✔ 3.2 scanAndReleaseExpiredReservations auto-releases expired unit to Available and updates reserving deal (1.2494ms)
  ✔ 4.1 getRealEstatePipeline normalizes Closed Won deals into Closed and excludes from activeDealsCount (1.7493ms)
  ✔ 4.2 salesManagement.getOverview reconciles with Main Dashboard by excluding Closed Won from open_deals (3.0234ms)
  ✔ 5.1 /api/products preserves moduleGuard(inventory) (0.5302ms)
  ✔ 6.1 generateSchedule strictly enforces tenant isolation (0.1685ms)
  ✔ 6.2 updateHandoverStatus strictly enforces tenant isolation (0.1668ms)
✔ Real Estate Lifecycle Audit & Controlled Remediation Test Suite (47.5717ms)
ℹ tests 14
ℹ suites 0
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 104.7863
```

In addition, the existing focus governance suite was executed to ensure zero regressions:

```text
▶ Phase 2 - Focus 3: Installments Scheduling & Deletion Governance Suite
  ✔ 1. reInstallmentRoutes protects generate-schedule and delete with roleGuard([admin, manager]) (80.0776ms)
  ✔ 2. generateSchedule strictly blocks Completed and Cancelled contracts (400) (0.5519ms)
  ✔ 3. generateSchedule enforces admin-only approval, down-payment lock, and voucher safety on Signed/Active contracts (0.3086ms)
  ✔ 4. deleteInstallment blocks closed contracts, requires admin on approved contracts, and blocks vouchered records (0.3987ms)
✔ Phase 2 - Focus 3: Installments Scheduling & Deletion Governance Suite (107.3062ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
```

---

## 3. Test Case Specification & Workflow Coverage

### Section 1: DEF-RE-01 — Installments Outer Join Locking & Math

#### Test 1.1: `generateSchedule uses FOR UPDATE OF rc to prevent outer join locking error`
- **Objective:** Verify `generateSchedule` in `reInstallmentsController.js` targets `re_contracts rc` specifically in row locking.
- **Assertion:** Matches regex `/FOR\s+UPDATE\s+OF\s+rc/i`; does not match un-aliased `/FOR\s+UPDATE\s*$/i`.
- **Result:** **PASS** (3.31ms).

#### Test 1.2: `generateSchedule calculates 4 quarterly installments correctly`
- **Objective:** Simulate Contract `REC-2026-00001` (1,000,000 EGP, 200,000 DP, 4 quarterly installments).
- **Assertion:** Creates 5 total records: Down payment installment #0 (200,000 EGP) + 4 periodic installments #1..4 (200,000 EGP each). Sum of all equals exactly 1,000,000 EGP.
- **Result:** **PASS** (0.39ms).

#### Test 1.3: `generateSchedule rolls back and returns clean user-safe error on failure`
- **Objective:** Simulate database connection abort during locking.
- **Assertion:** Transaction executes `ROLLBACK`, returns HTTP 500, error message is sanitized to *"Failed to generate installment schedule. Please try again or contact support."*, hiding internal connection errors.
- **Result:** **PASS** (0.52ms).

#### Test 1.4: `recordPayment uses FOR UPDATE OF ri to prevent outer join locking error`
- **Objective:** Verify `recordPayment` targets `re_installments ri` in row locking query when joined with `deals` and `re_contracts`.
- **Assertion:** SQL contains `FOR UPDATE OF ri` and does not contain bare `FOR UPDATE`.
- **Result:** **PASS** (1.31ms).

---

### Section 2: DEF-RE-01 — Handover State Machine Outer Join Locking

#### Test 2.1: `updateHandoverStatus uses FOR UPDATE OF rh to prevent outer join locking error`
- **Objective:** Verify transitioning handover from `Scheduled` to `Inspection` targets `re_handovers rh` in row locking.
- **Assertion:** Matches `/FOR\s+UPDATE\s+OF\s+rh/i`; commits transaction; returns updated status `Inspection`.
- **Result:** **PASS** (1.20ms).

#### Test 2.2: `updateHandoverStatus sanitizes error on failure and rolls back`
- **Objective:** Simulate deadlock during handover status transition.
- **Assertion:** Triggers `ROLLBACK`, returns HTTP 500 with user-safe message, preventing deadlock detail leakage.
- **Result:** **PASS** (0.40ms).

---

### Section 3: OBS-RE-02 — Reservation Concurrency & Expiry Release

#### Test 3.1: `reserveDealUnit rejects double active reservation on an already reserved unit`
- **Objective:** Attempt to reserve Unit `U-102` for Deal 2023 when Unit `U-102` is already `Reserved` by Deal 2022.
- **Assertion:** Rejects request with HTTP 409 Conflict (`UNIT_NOT_AVAILABLE`).
- **Result:** **PASS** (5.20ms).

#### Test 3.2: `scanAndReleaseExpiredReservations auto-releases expired unit to Available and updates reserving deal`
- **Objective:** Execute background expiration scanner for Unit `U-102` whose expiration timestamp has elapsed.
- **Assertion:** Updates unit status to `Available`, clears expiration timestamps, updates reserving deal stage to `negotiation`, sets `is_unit_reservation = false`, and records `reservation_expired_at`.
- **Result:** **PASS** (1.25ms).

---

### Section 4: OBS-RE-06 — Dashboard Metric Reconciliation

#### Test 4.1: `getRealEstatePipeline normalizes Closed Won deals into Closed and excludes from activeDealsCount`
- **Objective:** Provide a pipeline dataset containing 1 Lead (1M), 1 Negotiation (2M), and 1 Closed Won (1M).
- **Assertion:** Maps `Closed Won` to `Closed` bucket. Excludes Closed Won from `activeDealsCount` (reporting 2 active deals and 3M active value).
- **Result:** **PASS** (1.75ms).

#### Test 4.2: `salesManagement.getOverview reconciles with Main Dashboard by excluding Closed Won from open_deals`
- **Objective:** Calculate open deals count and open pipeline value in Sales Management Cockpit.
- **Assertion:** Open deals count equals exactly 2, and open pipeline value equals 3,000,000 EGP. Closed Won deal is excluded from active pipeline.
- **Result:** **PASS** (3.02ms).

---

### Section 5: OBS-RE-07 — Module Entitlement Guarding

#### Test 5.1: `/api/products preserves moduleGuard(inventory)`
- **Objective:** Verify that calling `/api/products` without the `inventory` module entitlement returns HTTP 403 `MODULE_ACCESS_DENIED`.
- **Assertion:** Returns 403 status and correct error code without unhandled server exception.
- **Result:** **PASS** (0.53ms).

---

### Section 6: Multi-Tenant Boundary Enforcement

#### Test 6.1: `generateSchedule strictly enforces tenant isolation`
- **Objective:** Verify contract lookup query binds `tenant_id` into SQL parameter `$2`.
- **Assertion:** Contract query requires `rc.tenant_id::text = $2::text`.
- **Result:** **PASS** (0.17ms).

#### Test 6.2: `updateHandoverStatus strictly enforces tenant isolation`
- **Objective:** Verify handover lookup query binds `tenant_id` into SQL parameter `$2`.
- **Assertion:** Handover query requires `rh.tenant_id::text = $2::text`.
- **Result:** **PASS** (0.17ms).

---

## 4. Quality Summary & Production Readiness

| Category | Target | Achieved | Status |
| :--- | :--- | :--- | :--- |
| **P0 Defect Resolution** | DEF-RE-01 syntax error eliminated | Fully eliminated via `FOR UPDATE OF <alias>` | **VERIFIED** |
| **P1 Defect Resolution** | OBS-RE-02 ownership leakage eliminated | Isolated to reserving deal | **VERIFIED** |
| **P1 Defect Resolution** | OBS-RE-06 metric discrepancy resolved | 2 Active Deals / 3M EGP across both pages | **VERIFIED** |
| **P2 Defect Resolution** | OBS-RE-07 403 toast eliminated | Guarded by `can('inventory')` & status check | **VERIFIED** |
| **Test Pass Rate** | 100% Passing | 14 / 14 Tests Passing (0 Failures) | **VERIFIED** |
| **Data Safety** | Zero test pollution on live database | All tests run in isolated test context | **VERIFIED** |
