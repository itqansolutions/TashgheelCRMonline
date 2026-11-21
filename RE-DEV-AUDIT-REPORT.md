# Tashgheel CRM Online — Real Estate Module
# Developer Technical Audit & Root Cause Analysis Report

**Document Reference:** `RE-DEV-AUDIT-REPORT.md`  
**Date:** November 21, 2026  
**Auditor / Engineering Lead:** Real Estate Engineering & Platform Core Team  
**Review Target:** Post-Functional-Audit Defect Investigation & Controlled Remediation  
**Branch:** `fix/real-estate-lifecycle-audit`  
**Target Environment:** Development / Staging Verification (Pre-Approval Gate)  

---

## 1. Executive Summary

On November 21, 2026, the QA team conducted a UI-based Real Estate lifecycle functional audit. While baseline entity creation succeeded across developers, projects, phases, buildings, units, leads, deals, reservations, contracts, commissions, and handover records, critical lifecycle transitions experienced database locking failures, ownership leaks, metric divergence, and contract date ambiguities.

This report documents the exhaustive technical investigation, SQL AST/planner execution traces, root-cause analyses, concurrency mechanics, and defect classifications.

### Classification Overview

| Item ID | Classification | Severity | Component | Finding Summary |
| :--- | :--- | :--- | :--- | :--- |
| **DEF-RE-01** | **Confirmed Defect** | **P0 (Blocker)** | Installments & Handovers | PostgreSQL Error `42P10`: `FOR UPDATE cannot be applied to the nullable side of an outer join` in `generateSchedule` and `updateHandoverStatus`. |
| **OBS-RE-02** | **Confirmed Defect + Rule Gap** | **P1 (High)** | Deals / Unit Reservation | Deal 2023 displayed Deal 2022's active reservation badge, timer, and extension controls due to unit-centric query leakage. |
| **OBS-RE-03** | **Business Rule Clarification** | **P1 (High)** | Deals / Contract Flow | Deal stage state machine permits direct transition to `Closed Won` without contract prerequisites or automatic unit status cascade. |
| **OBS-RE-06** | **Confirmed Defect** | **P1 (High)** | Dashboards / Pipeline Metrics | Metric mismatch: Main RE Dashboard reported 2 Active Deals (3M EGP); RE Sales Management reported 3 Active Deals (4M EGP) due to asymmetric stage normalization for `Closed Won`. |
| **OBS-RE-01** | **Architecture / Rule Gap** | **P2 (Medium)** | Contracts Management | 12-month contract saved with `start_date` and `end_date` as `null` and displayed "No term", because UI disabled manual end-date calculation when start-date was missing. |
| **OBS-RE-07** | **Confirmed Defect** | **P2 (Medium)** | Finance / Invoices | Finance module unconditionally called `/api/products` (guarded by `inventory` entitlement), throwing HTTP 403 error toast on non-inventory tenants. |
| **OBS-RE-04** | **Confirmed Expected Behavior** | **Info** | Unit State Machine | Contracted unit status remains locked even if related deal changes pipeline stage (governed by contract integrity rules). |
| **OBS-RE-05** | **Business Rule Clarification** | **Info** | Commissions Lifecycle | Commission entitlement generation upon contract signing vs deal winning. |
| **OBS-RE-08** | **Confirmed Expected Behavior** | **Info** | Handover Scheduling | Multi-stage handover sequence (Scheduled -> Inspection -> Snagging -> Handed Over). |

---

## 2. Deep Dive: DEF-RE-01 (Priority P0) — PostgreSQL Locking Syntax Error 42P10

### 2.1 Phenomenon & Symptoms
1. **Trigger A (Installments Generation):**
   - User navigates to Contract `REC-2026-00001` (value: 1,000,000 EGP, Down Payment: 200,000 EGP).
   - Generates 4 quarterly installments (start: 2026-12-01).
   - Backend throws unhandled database error:
     ```text
     error: FOR UPDATE cannot be applied to the nullable side of an outer join
         at Parser.parseErrorMessage (.../pg-protocol/...)
         at ... code: '42P10'
     ```
2. **Trigger B (Handover Start Inspection):**
   - User transitions Handover status from `Scheduled` to `Inspection`.
   - Backend throws identical PostgreSQL `42P10` error and status transition aborts.

### 2.2 Root Cause Analysis & Query Traces

#### The AST & Engine Lock Semantics
In PostgreSQL, `SELECT ... FOR UPDATE` acquires an exclusive row-level lock on tuples selected by the query. When a query contains a `LEFT OUTER JOIN`, the rows from the right-hand table can evaluate to `NULL` if no match exists.

The PostgreSQL engine specification explicitly forbids applying `FOR UPDATE` to the nullable side of an outer join:
> *PostgreSQL Error Code 42P10 (feature_not_supported):* `FOR UPDATE cannot be applied to the nullable side of an outer join`.

When `FOR UPDATE` is written without a target table alias (`FOR UPDATE`), the query planner interprets the lock request as applying to **all tables** in the `FROM` list.

#### Faulty Code Trace in `reInstallmentsController.js` (Line 162)
```javascript
// ORIGINAL DEFECTIVE QUERY
const contractRes = await client.query(`
    SELECT rc.*, d.pipeline_stage, d.title as deal_title
    FROM re_contracts rc
    LEFT JOIN deals d ON rc.deal_id = d.id
    WHERE rc.id = $1 AND rc.tenant_id::text = $2::text
    FOR UPDATE
`, [contract_id, tenant_id]);
```
- In this query, `deals d` is on the **nullable side** of the `LEFT JOIN`.
- PostgreSQL attempts to evaluate row-level locks on `deals d`. Because `d` can yield a `NULL` tuple, the planner aborts with error code `42P10`.

#### Faulty Code Trace in `reHandoversController.js` (Line 204)
```javascript
// ORIGINAL DEFECTIVE QUERY
const currentRes = await client.query(`
    SELECT rh.*, d.pipeline_stage, d.title as deal_title
    FROM re_handovers rh
    LEFT JOIN deals d ON rh.deal_id = d.id
    WHERE rh.id = $1 AND rh.tenant_id::text = $2::text
    FOR UPDATE
`, [id, tenant_id]);
```
- `deals d` is on the nullable side of the outer join. The un-aliased `FOR UPDATE` fails identically with `42P10`.

#### Faulty Code Trace in `reInstallmentsController.js` (Line 365)
```javascript
// ORIGINAL DEFECTIVE QUERY
const instRes = await client.query(`
    SELECT ri.*, d.pipeline_stage, rc.status as contract_status
    FROM re_installments ri
    LEFT JOIN deals d ON ri.deal_id = d.id
    LEFT JOIN re_contracts rc ON ri.contract_id = rc.id
    WHERE ri.id = $1 AND ri.tenant_id::text = $2::text
    FOR UPDATE
`, [id, tenant_id]);
```
- Both `deals d` and `re_contracts rc` are outer-joined. An un-aliased `FOR UPDATE` crashes with `42P10`.

### 2.3 Concurrency, Locking Order, and Isolation Mechanics
1. **Targeted Row Locking:**
   To safely lock the primary record without locking nullable joined rows, PostgreSQL supports the syntax `FOR UPDATE OF <table_alias>`.
   - In `generateSchedule`: `FOR UPDATE OF rc` tells PostgreSQL to acquire exclusive row locks strictly on the `re_contracts` tuple.
   - In `updateHandoverStatus`: `FOR UPDATE OF rh` locks only the `re_handovers` tuple.
   - In `recordPayment`: `FOR UPDATE OF ri` locks only the `re_installments` tuple.
2. **Transaction Serialization & Deadlock Prevention:**
   - Both controllers open an explicit `BEGIN` transaction on a dedicated pool client.
   - An advisory transaction-level lock `pg_advisory_xact_lock(hashtext('generate_schedule_' || $1))` is acquired prior to reading the contract, preventing concurrent installment generation runs from interleaving between read and insert.
   - Clean `COMMIT` and `ROLLBACK` guarantees ensure connection pool clients are released to prevent pool exhaustion.
3. **Error Leakage Remediation:**
   - Previously, unhandled `catch (err)` blocks returned `res.status(500).json({ error: err.message })`, leaking raw database syntax to frontend toasts.
   - Remediated catch blocks log the exact error internally with `console.error` and return sanitized, user-safe error messages.

---

## 3. Deep Dive: OBS-RE-02 (Priority P1) — Reservation Integrity & Ownership Leakage

### 3.1 Phenomenon & Symptoms
- QA created Deal 2022 and reserved Unit `U-102` (48-hour expiration window).
- QA created Deal 2023 as a separate lead inquiring about the same property.
- When viewing Deal 2023 in the Kanban board or Detail View:
  - Deal 2023 displayed an active amber badge: `Reserved (Expires in 47h 58m)`.
  - Deal 2023 showed the countdown timer and "Extend Reservation" button.
  - This created the dangerous impression that Deal 2023 held the reservation for Unit `U-102`.

### 3.2 Root Cause Analysis
In `frontend/src/pages/Deals.jsx`:
- Deals are fetched with linked unit metadata via `LEFT JOIN re_units ru ON d.unit_id = ru.id`.
- The returned deal object contains `unit_status: ru.status` and `reservation_expires_at: ru.reservation_expires_at`.
- The Kanban rendering logic evaluated:
  ```javascript
  // DEFECTIVE LOGIC
  {deal.unit_status === 'Reserved' && (
      <Badge color="amber">Reserved ({countdown})</Badge>
  )}
  ```
- The UI evaluated the **unit's status**, not whether the **deal was the holder** of the reservation.
- Deal 2023 was in stage `negotiation` with `custom_fields.is_unit_reservation = false`, yet rendered the countdown and extension triggers belonging to Deal 2022.

### 3.3 Concurrency & Multi-Deal State Mechanics
1. **Ownership Separation:**
   A unit reservation belongs strictly to one deal at a time. Other deals linked to the same unit are competing inquiries.
2. **Double-Reservation Prevention:**
   `dealsController.reserveDealUnit` enforces an atomic transaction:
   ```sql
   SELECT * FROM re_units WHERE id = $1 FOR UPDATE;
   ```
   If `status === 'Reserved'` or `'Contracted'`, the API returns `HTTP 409 Conflict` (`UNIT_NOT_AVAILABLE`), preventing race conditions.
3. **Auto-Expiry Engine (`reservationService.js`):**
   When `scanAndReleaseExpiredReservations` executes:
   - Expired units transition from `Reserved` to `Available`.
   - The reserving deal's flag `is_unit_reservation` is set to `false`, `reservation_expired_at` is timestamped, and stage reverts to `negotiation`.
   - Inquiring non-reserving deals remain unaffected in their current stage.

---

## 4. Deep Dive: OBS-RE-06 (Priority P1) — Dashboard Metric Reconciliation

### 4.1 Phenomenon & Symptoms
During audit execution:
- **Main Real Estate Dashboard (`/real-estate`):**
  - Active Deals: `2`
  - Active Pipeline Value: `3,000,000 EGP`
- **Real Estate Sales Management Cockpit (`/real-estate/sales`):**
  - Active Deals: `3`
  - Active Pipeline Value: `4,000,000 EGP`

### 4.2 Root Cause Analysis
The two pages query backend metrics through different services with divergent stage-filtering semantics:

#### Main Real Estate Dashboard (`services/dashboardService.js`)
- `getRealEstatePipeline` maps raw stages into 5 canonical buckets: `Lead`, `Interested`, `Site Visit`, `Negotiation`, `Closed`.
- Defective normalization code:
  ```javascript
  if (raw === 'closed' || raw === 'won') stageKey = 'Closed';
  ```
- Deal 2022 was saved with `pipeline_stage = 'Closed Won'` (with a space).
- `Closed Won` did not match `raw === 'closed' || raw === 'won'`.
- Consequently, Deal 2022 fell through into `Other` and was completely omitted from both active pipeline and closed totals, leaving Active Deals = 2 (Deal 101 @ 1M + Deal 2023 @ 2M = 3M EGP).

#### Sales Management Cockpit (`controllers/salesManagementController.js`)
- `getOverview` fetched deals and calculated:
  ```javascript
  const openDeals = allDeals.filter(s => !['won', 'lost', 'cancelled'].includes(s.pipeline_stage));
  ```
- Because Deal 2022 had `pipeline_stage = 'Closed Won'` (case-sensitive and not in `['won', 'lost', 'cancelled']`), it was counted as an **open deal**!
- This added Deal 2022's 1,000,000 EGP to open deals, resulting in Active Deals = 3 and Active Value = 4M EGP.

### 4.3 Technical Fix
Both endpoints now share a unified, canonical, case-insensitive definition of closed stages:
```javascript
const CLOSED_STAGES = [
    'won', 'lost', 'cancelled', 'closed',
    'closed won', 'closed lost',
    'closed_won', 'closed_lost', 'contracted'
];
```
- In `dashboardService.js`: `['closed', 'won', 'closed won', 'closed_won', 'contracted'].includes(raw)` maps to `'Closed'` and is excluded from `activeDealsCount`.
- In `salesManagementController.js`: Deal stage is trimmed, lowercased, and tested against `CLOSED_STAGES`.
- **Result:** Both surfaces report exactly **2 Active Deals** with an active pipeline value of **3,000,000 EGP**, while Deal 2022 (1,000,000 EGP) is classified as Won/Closed across all reports.

---

## 5. Deep Dive: OBS-RE-01 (Priority P2) — Contract Duration & Dates Handling

### 5.1 Phenomenon & Symptoms
- QA generated a contract for Deal 2022 specifying a 12-month duration.
- The saved contract persisted with `start_date: null`, `end_date: null`, and `duration_months: 12`.
- In the contracts list, the contract displayed an amber badge: `No term` / `بدون مدة`.

### 5.2 Root Cause Analysis
In `frontend/src/pages/RealEstate/Contracts.jsx`:
1. The form provided three fields: `start_date`, `end_date`, and `duration_months`.
2. When the user entered `duration_months = 12`, the UI disabled the `end_date` input, intending to derive it automatically: `end_date = start_date + duration_months`.
3. However, `start_date` was optional and left blank by the user.
4. Without a `start_date`, the client could not compute `end_date`. Both date fields were submitted as `null`.
5. Upon retrieval, `decorateContract` executes:
   ```javascript
   function resolveTerm(contract) {
       if (!contract.start_date && !contract.end_date) return 'no_term';
       ...
   }
   ```
   yielding `"no_term"`.

### 5.3 Classification: Defect vs Business Rule
- This is an **Architectural & Business Rule Gap**: Should contracts permit open-ended terms, or should `start_date` be mandatory when duration is specified?
- Detailed resolution options and recommendations are outlined in `RE-BUSINESS-RULES-MATRIX.md`.

---

## 6. Deep Dive: OBS-RE-07 (Priority P2) — Finance Module Product Loading Error

### 6.1 Phenomenon & Symptoms
- QA logged into a tenant without the `inventory` module entitlement.
- Navigating to the Finance / Invoices page triggered an immediate red toast:
  `Failed to load products`.

### 6.2 Root Cause Analysis
1. `Invoices.jsx` called `fetchProducts()` unconditionally in a `useEffect` hook upon page mount.
2. In `DataContext.jsx`, `fetchProducts()` issues `GET /api/products`.
3. `/api/products` is guarded by `moduleGuard('inventory')`, which correctly returns `HTTP 403 Forbidden` (`MODULE_ACCESS_DENIED`) for tenants not subscribed to Inventory.
4. `DataContext.jsx` caught the 403 and indiscriminately triggered `toast.error('Failed to load products')`.

### 6.3 Technical Remediation
1. In `frontend/src/context/DataContext.jsx`: Suppressed error toasts when error status is `403` (entitlement exclusion is expected behavior).
2. In `frontend/src/pages/Finance/Invoices.jsx`: Imported `useModule` and guarded the call:
   ```javascript
   const { can } = useModule();
   useEffect(() => {
       if (can('inventory')) {
           fetchProducts();
       }
   }, [can]);
   ```

---

## 7. Tenant Isolation & Security Audit

Every query modified in this audit was subjected to strict multi-tenant review:

| Controller / Service | Query Operation | Tenant Isolation Clause | Status |
| :--- | :--- | :--- | :--- |
| `reInstallmentsController` | `generateSchedule` Contract Lock | `WHERE rc.id = $1 AND rc.tenant_id::text = $2::text` | **Verified** |
| `reInstallmentsController` | `generateSchedule` Down Payment Insert | `tenant_id` and `effectiveBranchId` bound from `req.user` | **Verified** |
| `reInstallmentsController` | `generateSchedule` Periodic Installment Insert | `tenant_id` and `effectiveBranchId` bound from `req.user` | **Verified** |
| `reInstallmentsController` | `recordPayment` Installment Lock | `WHERE ri.id = $1 AND ri.tenant_id::text = $2::text` | **Verified** |
| `reHandoversController` | `updateHandoverStatus` Handover Lock | `WHERE rh.id = $1 AND rh.tenant_id::text = $2::text` | **Verified** |
| `salesManagementController`| `getOverview` Deals Fetch | `WHERE tenant_id::text = $1::text` | **Verified** |
| `services/dashboardService`| `getRealEstatePipeline` | `WHERE tenant_id::text = $1::text` | **Verified** |
| `services/reservationService`| `scanAndReleaseExpiredReservations` | Scope bounded per unit and deal tenant_id | **Verified** |

Cross-tenant access remains completely barred across all remediated endpoints.
