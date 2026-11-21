# Phase 4.2.6-A — Commercial Contracts: Value & Duration Ledger
**Architecture Proposal & Design Specification (READ-ONLY)**
*Date: November 9, 2026*  
*Platform: ITQAN Platform HUD (`itqan-crm-hud` / `SecretPortalHUD.jsx`)*  
*Status: PENDING ITQAN REVIEW & APPROVAL (NO CODE MODIFIED / NO MIGRATION RUN)*  

---

## 1. Executive Summary & Objective

In accordance with ITQAN's operational model, Tashgheel CRM does not sell fixed SaaS subscription tiers (Basic / Pro / Enterprise) and does not bind system access to billing cycles or payment automation. Every client agreement is a custom commercial contract negotiated directly by ITQAN.

The objective of **Phase 4.2.6** is to introduce a **lightweight, administrative Commercial Contract Ledger** inside the ITQAN Super Admin Platform HUD. 

This registry functions strictly as an **administrative reference ledger** for ITQAN leadership and operations to record:
1. **Contract Total Value** (e.g., `45,000.00`).
2. **Currency** (Default: `EGP`).
3. **Contract Start Date** (e.g., `2026-01-01`).
4. **Contract End Date** (e.g., `2026-12-31`).
5. **Internal Administrative Notes** (e.g., Agreement ID, discount remarks).

### Strict Business Rule: Complete Architectural Separation
This commercial ledger is **100% decoupled** from the runtime technical entitlement engine. Contract start and end dates **never** dictate or alter system access, active modules, or user/branch quotas. An expired contract is purely an informational visual indicator in HUD for ITQAN staff and will **never** suspend a tenant or lock features.

---

## 2. Existing Architecture Findings

### A. Database Layer
1. **Tenants:** Stored in `tenants` (Primary Key: `id UUID`).
2. **Legacy Subscriptions:** A legacy table `subscriptions` (linking `tenant_id` to `plans.id`) was created during early SaaS experiments. Currently, existing test tenants either have no active subscriptions or legacy trial records.
3. **Technical Entitlements:** As implemented and verified in Phase 4.2.4 through 4.2.5, runtime permissions are governed exclusively by `tenant_overrides` via [services/tenantEntitlementService.js](file:///d:/Tashgheel%20CRM%20Online/services/tenantEntitlementService.js).
4. **Runtime Guards:** [middleware/subscriptionGuard.js](file:///d:/Tashgheel%20CRM%20Online/middleware/subscriptionGuard.js) and [middleware/moduleGuard.js](file:///d:/Tashgheel%20CRM%20Online/middleware/moduleGuard.js) read only from `tenant_overrides` and `tenants.status`. They do not check contract dates or billing status.

### B. HUD Presentation Layer
1. **Tenant List:** In [SecretPortalHUD.jsx](file:///d:/Tashgheel%20CRM%20Online/frontend/src/pages/SuperAdmin/SecretPortalHUD.jsx), tenants are retrieved via `GET /api/admin/tenants`.
2. **Slide-out Company Dossier:** Currently features an outdated "Subscription & Limits" card showing `price_monthly` and `plan_name`, alongside a legacy "Change Plan" button.
3. **Decoupling Opportunity:** In Phase 4.2.6, this outdated card can be cleanly replaced with the authoritative **"Commercial Contract Ledger"**, and the "Change Plan" button retired in favor of **"Manage Contracts"**.

---

## 3. Proposed Database Schema: `tenant_contracts`

We propose creating a dedicated, isolated table: `tenant_contracts`.

```sql
-- Migration 012 (Proposed): Tenant Commercial Contracts Ledger
CREATE TABLE IF NOT EXISTS tenant_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contract_value NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_contract_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_contract_value CHECK (contract_value >= 0)
);

-- Indices for rapid tenant contract retrieval and date sorting
CREATE INDEX IF NOT EXISTS idx_tenant_contracts_tenant_dates 
ON tenant_contracts (tenant_id, start_date DESC);
```

### Schema Attributes & Rationale

| Column | Type | Nullable | Rationale |
| :--- | :--- | :---: | :--- |
| `id` | `UUID` | No | UUID primary key ensures cross-environment uniqueness. |
| `tenant_id` | `UUID` | No | Foreign Key to `tenants(id)`. Cascades on tenant deletion. |
| `contract_value` | `NUMERIC(14, 2)` | No | Contract agreed total value. Checked `>= 0`. |
| `currency` | `VARCHAR(10)` | No | Default `'EGP'`. Supports foreign currency contracts if negotiated (e.g. `'USD'`). |
| `start_date` | `DATE` | No | Formal agreement start date (`YYYY-MM-DD`). |
| `end_date` | `DATE` | No | Formal agreement end date (`YYYY-MM-DD`). Checked `>= start_date`. |
| `notes` | `TEXT` | Yes | Administrative notes (contract reference number, payment milestone notes, etc.). |
| `created_by` | `INTEGER` | Yes | ITQAN Super Admin user ID who created the record. |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | No | Audit timestamps. |

---

## 4. Historical Contract Handling

### Multi-Contract Support
A business organization typically signs consecutive annual contracts or contract extensions with ITQAN:
- **Contract 1 (Year 1):** 2025-01-01 to 2025-12-31 — 35,000 EGP
- **Contract 2 (Year 2):** 2026-01-01 to 2026-12-31 — 45,000 EGP

Supporting historical contracts is essential so ITQAN administrators can track agreement longevity and renewal history.

### Determining the "Active / Current" Contract
The active contract is resolved dynamically via SQL without requiring state-mutation flags:
1. **Current Active:** A contract record where `CURRENT_DATE BETWEEN start_date AND end_date`.
2. **If multiple active or for historical listing:** `ORDER BY start_date DESC, created_at DESC`.
3. **If no contract covers today:**
   - If latest `start_date > CURRENT_DATE`: Status is **`Upcoming / Pending Start`**.
   - If latest `end_date < CURRENT_DATE`: Status is **`Expired`** (Administrative Alert).
   - If no contracts exist: Status is **`No Contract Recorded`**.

### Purely Informational Status
The computed contract status is strictly for HUD UI visualization:
- `Active` (Emerald Badge)
- `Expiring Soon` (within 30 days — Amber Badge)
- `Expired` (Slate/Red Badge)
- `Upcoming` (Indigo Badge)

> [!IMPORTANT]
> Contract status is computed on-the-fly and is **never** written back to `tenants.status`. An `Expired` contract has **zero effect** on tenant API requests, active user limits, or module locks.

---

## 5. Backend API Endpoints Design

All endpoints are registered under [routes/adminPlanRoutes.js](file:///d:/Tashgheel%20CRM%20Online/routes/adminPlanRoutes.js) and protected by `superAdminOnly`:

### 1. `GET /api/admin/tenants/:tenant_id/contracts`
- **Purpose:** Fetches contract history and current contract summary for a tenant.
- **Authorization:** ITQAN Super Admin only (`superAdminOnly`).
- **Response Structure:**
  ```json
  {
    "status": "success",
    "data": {
      "active_contract": {
        "id": "e3b0c442-...",
        "contract_value": 45000.00,
        "currency": "EGP",
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "status": "active",
        "days_remaining": 52,
        "notes": "Contract #2026-ITQ-081"
      },
      "contracts": [
        {
          "id": "e3b0c442-...",
          "contract_value": 45000.00,
          "currency": "EGP",
          "start_date": "2026-01-01",
          "end_date": "2026-12-31",
          "notes": "Contract #2026-ITQ-081",
          "created_at": "2026-01-02T10:00:00Z",
          "created_by_name": "ITQAN Admin"
        }
      ]
    }
  }
  ```
- **Graceful Fallback:** If the table has not yet been migrated, returns `{ status: "success", data: { active_contract: null, contracts: [] }, notice: "Contracts table pending migration" }`.

### 2. `POST /api/admin/tenants/:tenant_id/contracts`
- **Purpose:** Records a new contract for a tenant.
- **Payload:**
  ```json
  {
    "contract_value": 45000,
    "currency": "EGP",
    "start_date": "2026-01-01",
    "end_date": "2026-12-31",
    "notes": "Annual Agreement with CEO approval"
  }
  ```
- **Server Validation:**
  - `tenant_id` must exist in `tenants`.
  - `contract_value` must be a valid non-negative number.
  - `start_date` and `end_date` must be valid ISO date strings.
  - `end_date >= start_date`.
- **Response:** HTTP 201 Created with the saved contract record.

### 3. `PUT /api/admin/tenants/:tenant_id/contracts/:contract_id`
- **Purpose:** Updates an existing contract record.
- **Payload:** `{ contract_value, currency, start_date, end_date, notes }`.
- **Validation:** Same rules as POST.

### 4. `DELETE /api/admin/tenants/:tenant_id/contracts/:contract_id`
- **Purpose:** Deletes an erroneous contract record (Super Admin only).
- **Response:** HTTP 200 with deletion confirmation.

---

## 6. HUD Frontend Integration Design

### A. Tenant Overview Table ([SecretPortalHUD.jsx](file:///d:/Tashgheel%20CRM%20Online/frontend/src/pages/SuperAdmin/SecretPortalHUD.jsx))
- In the main tenant table, add a clean **"Commercial Contract"** column:
  - Displays: `45,000 EGP` with an `Active` (Emerald) or `No Contract` (Slate) badge.
  - Keeps ITQAN leadership informed at a glance without navigating elsewhere.

### B. Slide-out Company Dossier
- Replace the legacy "Subscription & Limits" card with the authoritative **"Commercial Contract Agreement"** card:
  - **Contract Value:** Formatted currency (e.g. `45,000.00 EGP`).
  - **Duration:** `2026-01-01` → `2026-12-31` (`X days remaining`).
  - **Contract Status Badge:** Clearly tagged with `(Commercial Reference Only)`.
  - **Action Button:** **"Manage Contracts"** opening the contract drawer/modal.
  - Retirement of the obsolete "Change Plan" modal trigger.

### C. Dedicated Component: `TenantContractManagementModal.jsx`
A clean modal providing:
1. **Current Agreement Summary:** Active contract details, days remaining, total value, and duration.
2. **Contract History Timeline:** Chronological list of past and upcoming agreements.
3. **Record / Edit Contract Form:**
   - Contract Total Value (numeric input with currency prefix).
   - Currency selection (default `EGP`, customizable).
   - Start Date & End Date pickers.
   - Internal Notes textarea.
4. **Permanent Prominent Disclaimer:**
   > *"Notice: Commercial contracts are recorded for ITQAN administrative reference and revenue tracking. Contract dates do not affect tenant system access, enabled modules, or user limits."*

---

## 7. Explicit Proof of Zero Coupling with Technical Entitlements

| Technical Layer | Evaluates Contracts? | Code Verification |
| :--- | :---: | :--- |
| **`middleware/subscriptionGuard.js`** | **NO** | Reads only `tenant_overrides` and `tenants.status`. Has zero SQL queries referencing `tenant_contracts`. |
| **`middleware/moduleGuard.js`** | **NO** | Inspects `req.modules` populated by `tenant_overrides`. |
| **`middleware/usageLimits.js`** | **NO** | Inspects `req.planLimits` populated by `tenant_overrides`. |
| **`services/tenantEntitlementService.js`** | **NO** | Connects solely to `tenant_overrides`. |
| **Login & Authentication (`authMiddleware.js`)** | **NO** | Evaluates JWT signature and `users.tenant_id`. |

### Architectural Guarantee
Even if a tenant's contract end date is `2024-01-01` (2 years expired):
- Users can still log in normally.
- All technical modules explicitly granted in `tenant_overrides` remain active.
- User and branch limits remain unchanged.
- System access is modified **only** if an ITQAN administrator explicitly changes entitlements via the Tenant Access Management modal (Phase 4.2.5).

---

## 8. Validation & Security Matrix

| Action | Allowed Roles | Enforcement Mechanism |
| :--- | :--- | :--- |
| **View Contracts** | ITQAN Super Admin only | `superAdminOnly` in `routes/adminPlanRoutes.js` |
| **Create Contract** | ITQAN Super Admin only | `superAdminOnly` + Server-side validation |
| **Edit Contract** | ITQAN Super Admin only | `superAdminOnly` + Server-side validation |
| **Delete Contract** | ITQAN Super Admin only | `superAdminOnly` + Existence validation |
| **Tenant Admin Access** | **BLOCKED (HTTP 403)** | Tenant admins cannot access `/api/admin/*` |
| **Tenant Isolation** | Verified | Super Admin must supply a valid `tenant_id` from `tenants` |

---

## 9. Risks, Mitigations & Open Decisions

### A. Overlapping Contract Dates
- **Risk:** An administrator might inadvertently enter two contracts with overlapping date intervals.
- **Mitigation:** The system resolves the "Active" contract by taking the one with the latest `start_date` and `created_at`. In the UI, a soft advisory warning can inform the admin if an overlap exists, without blocking the save (since commercial amendments may overlap).

### B. Database Migration Safety
- **Constraint:** Migration 012 will **NOT** be executed remotely against Railway.
- **Handling:** Just like Migration 011 in Phase 4.2.5, the controller will feature a `try/catch` graceful fallback returning `{ contracts: [], notice: 'Contracts table pending migration' }`. This ensures zero breakage in unmigrated environments.

### C. Open Decision for ITQAN Leadership
1. **Legacy Plan Removal in HUD:**  
   Do you approve retiring the old "Change Plan" modal in `SecretPortalHUD.jsx` and replacing its position in the dossier with the new "Commercial Contracts" ledger? *(Recommended: Yes, to eliminate any lingering SaaS plan confusion).*

---

## 10. Recommendation & Next Steps

This architecture proposal is complete, fully aligned with all business rules, and ready for ITQAN review.

**Antigravity will stop here and await formal approval of Phase 4.2.6-A before generating any migration file or writing implementation code.**
