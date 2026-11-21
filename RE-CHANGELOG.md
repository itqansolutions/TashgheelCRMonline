# Tashgheel CRM Online — Real Estate Module
# Technical Changelog

**Document Reference:** `RE-CHANGELOG.md`  
**Date:** November 21, 2026  
**Auditor / Engineering Lead:** Real Estate Engineering & Platform Core Team  
**Branch:** `fix/real-estate-lifecycle-audit`  
**Review Target:** Controlled Post-Audit Remediation  

---

## 1. Overview of Modified Files

```
Modified Backend Files:
  - controllers/reInstallmentsController.js
  - controllers/reHandoversController.js
  - controllers/salesManagementController.js
  - services/dashboardService.js

Modified Frontend Files:
  - frontend/src/pages/Deals.jsx
  - frontend/src/context/DataContext.jsx
  - frontend/src/pages/Finance/Invoices.jsx

New Automated Test Files:
  - tests/re_lifecycle_audit_remediation.test.js
```

---

## 2. File-by-File Technical Changes & Rationale

### 1. `controllers/reInstallmentsController.js`

#### Lines Modified:
- **Line 162:** Modified `SELECT ... FROM re_contracts rc LEFT JOIN deals d ... FOR UPDATE` to `FOR UPDATE OF rc`.
- **Line 223 & 247:** Added safe property access with optional chaining: `paidCheck.rows[0]?.count || 0` and `voucherCheck.rows[0]?.count || 0`.
- **Line 336:** Sanitized `generateSchedule` error handling in the catch block: returns `{ status: 'error', message: 'Failed to generate installment schedule. Please try again or contact support.' }` while logging detailed error to server console.
- **Line 365:** In `recordPayment`, modified `SELECT ... FROM re_installments ri LEFT JOIN deals d ... LEFT JOIN re_contracts rc ... FOR UPDATE` to `FOR UPDATE OF ri`.
- **Line 507:** Sanitized `recordPayment` error response in the catch block.

#### Technical Rationale:
- PostgreSQL error `42P10` forbids row-locking tuples on the nullable side of an outer join. When `LEFT JOIN deals` is present, a bare `FOR UPDATE` attempts to lock the outer-joined `deals` table, which causes the query planner to throw an error. Qualifying the lock target explicitly with `FOR UPDATE OF rc` and `FOR UPDATE OF ri` locks only the non-nullable target table.
- Raw database error messages leaking to API responses represent an information disclosure security risk and cause degraded UI presentation. Catch blocks now sanitize user-facing errors.

---

### 2. `controllers/reHandoversController.js`

#### Lines Modified:
- **Line 204:** Modified `SELECT ... FROM re_handovers rh LEFT JOIN deals d ... FOR UPDATE` to `FOR UPDATE OF rh`.
- **Line 285:** Sanitized `updateHandoverStatus` catch block to return `{ message: 'Failed to update handover status. Please try again or contact support.' }` while maintaining technical server logs.

#### Technical Rationale:
- Handover status transitions (e.g. `Scheduled` -> `Inspection`) crashed with PostgreSQL `42P10` because `deals` was joined via `LEFT JOIN` and an un-aliased `FOR UPDATE` was used. Qualifying with `FOR UPDATE OF rh` resolves the crash and guarantees atomic row locking during status changes.

---

### 3. `controllers/salesManagementController.js`

#### Lines Modified:
- **Lines 200-201:** Standardized open deals stage filtering:
  ```javascript
  const CLOSED_STAGES = [
      'won', 'lost', 'cancelled', 'closed',
      'closed won', 'closed lost', 'closed_won',
      'closed_lost', 'contracted'
  ];
  const openDeals = allDeals.filter(s => {
      const stage = String(s.pipeline_stage || '').trim().toLowerCase();
      return !CLOSED_STAGES.includes(stage);
  });
  ```

#### Technical Rationale:
- Previously, `getOverview` filtered open deals with `!['won', 'lost', 'cancelled'].includes(s.pipeline_stage)`.
- Deals saved with stage `'Closed Won'` (with a space) were excluded from the won/closed array and falsely treated as open deals, inflating active deals count from 2 to 3 and active pipeline value from 3M to 4M EGP.

---

### 4. `services/dashboardService.js`

#### Lines Modified:
- **Line 404:** Expanded stage normalization inside `getRealEstatePipeline`:
  ```javascript
  if (['closed', 'won', 'closed won', 'closed_won', 'contracted'].includes(raw)) {
      stageKey = 'Closed';
  }
  ```

#### Technical Rationale:
- Previously, `getRealEstatePipeline` only matched `raw === 'closed' || raw === 'won'`.
- Deals in stage `'Closed Won'` fell into an unmapped bucket and were excluded from dashboard closed metrics. Standardizing the stage mapper aligns the Main Real Estate Dashboard with the Sales Management Cockpit.

---

### 5. `frontend/src/pages/Deals.jsx`

#### Lines Modified:
- **Lines 758-780:** Updated Kanban card badge logic:
  - Defined `isReservingDeal = deal.custom_fields?.is_unit_reservation === true || ['reserved', 'reservation', 'حجز'].includes(dealStageLower)`.
  - If `deal.unit_status === 'Reserved'` and `!isReservingDeal`, rendered an informational amber badge: `Unit Reserved by Another Deal` / `الوحدة محجوزة لصفقة أخرى` without rendering the countdown timer.
- **Lines 1744 & 1750-1785:** In the deal editing modal:
  - Checked `isCurrentReservingDeal`.
  - Hid countdown timer and extension button when viewing a competing inquiry deal.
  - Displayed a banner informing the agent that the unit is currently reserved by another deal.

#### Technical Rationale:
- Fixed reservation leakage where Deal 2023 displayed Deal 2022's countdown and extension actions. Ensures ownership integrity without modifying unit status.

---

### 6. `frontend/src/context/DataContext.jsx`

#### Lines Modified:
- **Lines 70-76:** In `fetchProducts()`, added HTTP 403 inspection:
  ```javascript
  if (err.response?.status === 403) {
      // Tenant does not have inventory module entitlement; suppress toast error
      return;
  }
  toast.error('Failed to load products');
  ```

#### Technical Rationale:
- Calling `/api/products` on tenants without the Inventory entitlement returns HTTP 403 by design. Suppressing the error toast prevents alarming users with misleading failure notifications on standard page loads.

---

### 7. `frontend/src/pages/Finance/Invoices.jsx`

#### Lines Modified:
- **Line 18:** Imported `useModule` hook from `../../context/ModuleContext`.
- **Line 45:** Wrapped `fetchProducts()` in an entitlement check:
  ```javascript
  const { can } = useModule();
  useEffect(() => {
      if (can('inventory')) {
          fetchProducts();
      }
  }, [can]);
  ```

#### Technical Rationale:
- Proactively prevents non-entitled network requests from firing when visiting the Finance/Invoices page, adhering to module boundaries and reducing unnecessary 403 network responses.

---

### 8. `tests/re_lifecycle_audit_remediation.test.js`

#### Lines Created:
- 662 lines of automated regression test code covering 14 test cases across DEF-RE-01, OBS-RE-02, OBS-RE-06, OBS-RE-07, and multi-tenant security boundaries.

#### Technical Rationale:
- Provides automated verification and CI/CD protection to ensure outer-join locking errors and metric discrepancies cannot recur.
