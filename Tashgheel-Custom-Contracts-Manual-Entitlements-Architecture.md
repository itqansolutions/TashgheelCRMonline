# TASHGHEEL CRM ONLINE & ITQAN HUD
# CUSTOM CONTRACTS & MANUAL ENTITLEMENTS ARCHITECTURE (PHASE 4.2.2)

**Document Version:** 1.0.0 — Production Blueprint  
**Status:** ARCHITECTURAL DESIGN & READ-ONLY AUDIT (Zero Code / Schema / Data Modifications)  
**Target System:** `itqansolutions/TashgheelCRMonline.git`  
**Workspace Path:** `d:\Tashgheel CRM Online`  
**Core Strategic Mandate:** Elimination of Predefined Commercial Plans (Basic/Pro/Enterprise) in favor of Individual Commercial Contracts and Independent Manual Entitlements.

---

## 1. TARGET ARCHITECTURE & STRATEGIC PRINCIPLES

### 1.1 The Core Business Decision
ITQAN Solutions has established a definitive commercial model: **Tashgheel CRM Online does not sell fixed, off-the-shelf software packages (Basic, Pro, Enterprise).** As an enterprise B2B software vendor, ITQAN negotiates bespoke commercial agreements with each client based on their unique scale, industry template, required modules, and service-level agreements.

To support this business model, the application architecture must strictly decouple **Commercial Agreement Tracking** from **Technical Application Access**.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 STRATEGIC SEPARATION OF CONCERNS                       │
├────────────────────────────────────────┬───────────────────────────────────────────────┤
│ System 1: Commercial Contract Ledger   │ System 2: Technical Entitlement Engine        │
├────────────────────────────────────────┼───────────────────────────────────────────────┤
│ • Records financial & legal terms      │ • Controls application runtime execution      │
│ • Contract value, currency, dates      │ • Enabled modules (CRM, HR, Finance, etc.)   │
│ • Renewal terms, payment milestones    │ • Operational limits (seats, branches)        │
│ • Pure administrative / commercial log │ • Enforced by backend Express middleware      │
│ • NEVER automatically locks a tenant   │ • Managed manually by ITQAN Admins via HUD    │
└────────────────────────────────────────┴───────────────────────────────────────────────┘
```

### 1.2 Core Architectural Axioms
1. **Contracts Do Not Dictate Technical Access:** The expiration, modification, or absence of a commercial contract must **NEVER** automatically suspend a tenant, disable a module, or lock out users.
2. **Technical Access is Explicitly Managed:** Every tenant's technical privileges (modules and limits) are set directly by ITQAN Platform Super Administrators via the central ITQAN Platform HUD (`/itqan-crm-hud`).
3. **No Forced Plans:** Concepts of predefined tiers (`basic`, `pro`, `enterprise`) are removed from runtime authorization. A tenant with a 20,000 EGP agreement can have Real Estate and Finance enabled, while a tenant with an 80,000 EGP agreement can have CRM and HR enabled.
4. **Resilient Fail-Closed Behavior:** Transient database errors during entitlement verification must fail safely with HTTP `503 Service Unavailable` rather than bypassing security guards.
5. **Absolute Tenant Continuity:** Existing active tenants must continue operating uninterrupted without forcing arbitrary commercial plan assignments.

---

## 2. EXISTING TABLES & CODE DEPENDENCY MAP

A thorough inspection of the repository codebase and live PostgreSQL catalog was performed to map every existing dependency on licensing, plans, and overrides.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       EXISTING ENTITLEMENT ARTIFACTS MAP                                         │
├─────────────────────┬──────────────┬───────────────────┬─────────────────────────────────────────────────────────┤
│ Artifact Name       │ Type         │ Live Status       │ Current Code Usage / Role                               │
├─────────────────────┼──────────────┼───────────────────┼─────────────────────────────────────────────────────────┤
│ plans               │ DB Table     │ 3 Rows            │ Defines basic (1), pro (2), enterprise (3) templates.   │
│                     │              │ (Basic/Pro/Ent)   │ Used by adminPlansController to seed subscriptions.     │
├─────────────────────┼──────────────┼───────────────────┼─────────────────────────────────────────────────────────┤
│ subscriptions       │ DB Table     │ 0 Rows ([])       │ Intended to bind tenant_id to plan_id. Currently empty. │
│                     │              │                   │ subscriptionGuard queries this table first.             │
├─────────────────────┼──────────────┼───────────────────┼─────────────────────────────────────────────────────────┤
│ tenant_overrides    │ DB Table     │ 0 Rows ([])       │ Schema exists with (tenant_id, modules, limits, notes). │
│                     │              │                   │ Partially queried by subscriptionGuard & usageLimits.   │
├─────────────────────┼──────────────┼───────────────────┼─────────────────────────────────────────────────────────┤
│ tenants.plan        │ DB Column    │ 6 Tenants Active  │ Defaults to 'basic'. Stored as string on tenants table. │
├─────────────────────┼──────────────┼───────────────────┼─────────────────────────────────────────────────────────┤
│ subscriptionGuard.js│ Middleware   │ Active in Pipeline│ Queries subscriptions JOIN plans. If empty, falls       │
│                     │              │                   │ through to check tenant_overrides; calls next().        │
├─────────────────────┼──────────────┼───────────────────┼─────────────────────────────────────────────────────────┤
│ moduleGuard.js      │ Middleware   │ Active on Routes  │ Inspects req.modules[mod]. If !modules, bypasses.       │
├─────────────────────┼──────────────┼───────────────────┼─────────────────────────────────────────────────────────┤
│ usageLimits.js      │ Middleware   │ Active on Creates │ Checks user and branch counts against plan/override.    │
├─────────────────────┼──────────────┼───────────────────┼─────────────────────────────────────────────────────────┤
│ SecretPortalHUD.jsx │ Frontend Page│ Active in HUD     │ Has existing "Custom Overrides Modal" (Lines 1484-1663).│
└─────────────────────┴──────────────┴───────────────────┴─────────────────────────────────────────────────────────┘
```

### Detailed Code Dependencies
1. **`middleware/subscriptionGuard.js`:**
   - Lines 21–50 query `subscriptions` JOIN `plans` on `s.plan_id = p.id`.
   - Lines 52–71: If no subscription row exists, it queries `SELECT modules, limits FROM tenant_overrides WHERE tenant_id = $1`. If present, it attaches `req.modules` and `req.planLimits`.
   - Lines 128–134: When a subscription exists, it merges `plan_modules` with `override_modules`.
2. **`middleware/usageLimits.js`:**
   - Lines 39–47: If no subscription row exists, it falls back to `SELECT limits FROM tenant_overrides WHERE tenant_id = $1`.
3. **`controllers/adminPlansController.js`:**
   - Lines 207–235: Already implements `getTenantOverride` and `setTenantOverride` (`INSERT INTO tenant_overrides ... ON CONFLICT (tenant_id) DO UPDATE`).
4. **`frontend/src/pages/SuperAdmin/SecretPortalHUD.jsx`:**
   - Lines 1291–1296: Contains the UI trigger button `<Sliders size={14} /> Customize Modules & Limits`.
   - Lines 1484–1663: Implements a modal that reads and saves `modules` and `limits` via `api.put('/admin/tenants/:id/override')`.

**Key Architectural Finding:** The database schema and code **already possess the foundational table (`tenant_overrides`) and APIs needed for manual entitlement control**. The previous design treated manual controls as an "override" over a mandatory plan. Under the new architecture, **`tenant_overrides` becomes the primary, authoritative Tenant Access Profile**, eliminating the dependency on predefined plans.

---

## 3. COMMERCIAL CONTRACT MANAGEMENT SYSTEM (SYSTEM 1)

Commercial Contract Management is an administrative ledger residing inside the ITQAN HUD. It serves ITQAN sales, legal, and finance teams by tracking what was sold, at what price, and for what duration.

### 3.1 Data Model: `tenant_contracts`

```sql
CREATE TABLE IF NOT EXISTS tenant_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    contract_number VARCHAR(100) NOT NULL,
    contract_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    payment_terms TEXT,
    renewal_terms TEXT,
    scope_summary TEXT,
    internal_notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_contracts_tenant ON tenant_contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_contracts_status ON tenant_contracts(status);
```

### 3.2 Contract Lifecycle States
* **`draft`:** Contract being negotiated or drafted by ITQAN sales.
* **`active`:** Contract currently in effect.
* **`expiring_soon`:** Calculated state (e.g. within 30 days of `end_date`) displayed in HUD for renewal follow-up.
* **`expired`:** Past `end_date`. **Crucial:** Triggers administrative visual badges in HUD only; does NOT stop CRM access.
* **`renewed`:** Replaced by a successor contract row.
* **`cancelled`:** Terminated early by commercial agreement.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CONTRACT LIFECYCLE (COMMERCIAL ONLY)                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│   [ Draft ] ───> [ Active ] ───> [ Expiring Soon ] ───> [ Expired ] ───> [ Renewed ]   │
│                      │                                                                 │
│                      └──────────────────────> [ Cancelled ]                            │
│                                                                                        │
│   * At NO point in this lifecycle is tenant application access automatically cut off.  │
│   * Disabling access requires an explicit administrator action in Entitlement Engine.  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. MANUAL TENANT ACCESS MANAGEMENT SYSTEM (SYSTEM 2)

The Entitlement Engine governs what an authenticated user in a tenant can see, click, and execute across the 17 system modules and 466 endpoints.

### 4.1 Data Model: Formalizing `tenant_overrides` as the Access Profile
Rather than creating redundant tables, `tenant_overrides` is formalized as the **authoritative tenant access profile**, enhanced with audit and user attribution:

```sql
-- Schema evolution for tenant_overrides (backward-compatible)
ALTER TABLE tenant_overrides ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);
ALTER TABLE tenant_overrides ADD COLUMN IF NOT EXISTS last_audit_reason TEXT;
```

#### Module Flags Managed in `modules` (`JSONB`):
```json
{
  "crm": true,
  "sales": true,
  "finance": true,
  "real_estate": true,
  "hr": false,
  "inventory": false,
  "purchasing": false,
  "marketing": true,
  "reports": true,
  "automation": false
}
```

#### Operational Limits Managed in `limits` (`JSONB`):
```json
{
  "max_users": 20,
  "max_branches": 3,
  "storage_gb": 10,
  "custom_domains": 1
}
```
*Note: A value of `-1` denotes unlimited capacity.*

### 4.2 Entitlement Audit Trail: `tenant_access_audit_logs`
Every modification to a tenant's technical access must be immutably recorded for security and operational governance:

```sql
CREATE TABLE IF NOT EXISTS tenant_access_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    changed_by INTEGER NOT NULL REFERENCES users(id),
    previous_modules JSONB,
    new_modules JSONB,
    previous_limits JSONB,
    new_limits JSONB,
    reason TEXT NOT NULL,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_access_audit ON tenant_access_audit_logs(tenant_id, created_at DESC);
```

---

## 5. BACKEND ENFORCEMENT ARCHITECTURE

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              RUNTIME ENFORCEMENT PIPELINE                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│   Incoming API Request                                                                 │
│            │                                                                           │
│            ▼                                                                           │
│   [ auth.js Middleware ]                                                               │
│   • Verifies JWT token signature & active status                                       │
│   • Refreshes live role from users table                                               │
│   • Attaches req.user and req.tenant_id                                                │
│            │                                                                           │
│            ▼                                                                           │
│   [ tenantAccessGuard.js ] (Refactored subscriptionGuard)                              │
│   • Queries tenant_overrides for req.tenant_id                                         │
│   • If found: Attaches req.modules and req.planLimits directly                         │
│   • If not found: Applies Grandfathered Legacy Baseline (Zero Lockout)                 │
│   • On Database Failure: Halts with HTTP 503 Service Unavailable (Fail-Closed)         │
│            │                                                                           │
│            ▼                                                                           │
│   [ moduleGuard('hr') ]                                                                │
│   • Checks if req.modules['hr'] === true                                               │
│   • If true: Calls next()                                                              │
│   • If false: Halts with HTTP 403 Forbidden ("Module not included in access profile") │
│            │                                                                           │
│            ▼                                                                           │
│   [ usageLimits('users') ] (On Resource Creation Routes)                               │
│   • Compares active DB row count against req.planLimits.max_users                      │
│   • If currentCount >= maxUsers: Halts with HTTP 403 ("User seat limit reached")       │
│            │                                                                           │
│            ▼                                                                           │
│   [ Controller Execution ]                                                             │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Refactored Guard Logic (`tenantAccessGuard.js`)
```javascript
const db = require('../config/db');

module.exports = async (req, res, next) => {
    const tenant_id = req.tenant_id || req.user?.tenant_id;
    if (!tenant_id) return next();

    // System super-admin tenant always has complete access
    if (tenant_id === '00000000-0000-0000-0000-000000000000') {
        req.modules = { crm: true, sales: true, finance: true, hr: true, inventory: true, real_estate: true, purchasing: true, marketing: true, reports: true, automation: true };
        req.planLimits = { max_users: -1, max_branches: -1 };
        return next();
    }

    try {
        // 1. Fetch Authoritative Manual Access Profile
        const accessRes = await db.query(
            `SELECT modules, limits FROM tenant_overrides WHERE tenant_id::text = $1::text`,
            [tenant_id]
        );

        if (accessRes.rows.length > 0) {
            const row = accessRes.rows[0];
            const rawMods = typeof row.modules === 'string' ? JSON.parse(row.modules) : (row.modules || {});
            const rawLimits = typeof row.limits === 'string' ? JSON.parse(row.limits) : (row.limits || {});

            req.modules = {
                reports: true, // Baseline reporting always available
                ...rawMods
            };
            req.planLimits = {
                max_users: rawLimits.max_users !== undefined ? Number(rawLimits.max_users) : 10,
                max_branches: rawLimits.max_branches !== undefined ? Number(rawLimits.max_branches) : 1
            };
            return next();
        }

        // 2. Fallback for Existing Tenants Without Custom Profile
        const tenantRes = await db.query(
            `SELECT status, template_name FROM tenants WHERE id::text = $1::text`,
            [tenant_id]
        );

        if (tenantRes.rows.length === 0 || ['suspended', 'inactive', 'disabled'].includes(tenantRes.rows[0].status)) {
            return res.status(403).json({
                status: 'tenant_inactive',
                message: 'Your organization account is inactive. Please contact ITQAN support.',
                code: 'TENANT_INACTIVE'
            });
        }

        // Grandfathered Operational Access: Preserve existing customer workflow
        const isRealEstate = tenantRes.rows[0].template_name === 'real_estate';
        req.modules = {
            crm: true,
            sales: true,
            finance: true,
            reports: true,
            real_estate: isRealEstate,
            hr: true,
            inventory: true,
            purchasing: true,
            marketing: true,
            automation: false
        };
        req.planLimits = { max_users: -1, max_branches: -1 };
        req.isGrandfathered = true;
        next();

    } catch (err) {
        console.error('[tenantAccessGuard] Database error:', err.message);
        // Fail-Closed: Return HTTP 503 rather than opening unrestricted access
        return res.status(503).json({
            status: 'error',
            message: 'Service temporarily unavailable. Access verification failed.',
            code: 'ACCESS_CHECK_UNAVAILABLE'
        });
    }
};
```

---

## 6. HUD UX & USER WORKFLOW DESIGN

The ITQAN Platform HUD (`SecretPortalHUD.jsx`) will feature a redesigned **Tenant Dossier / Management Interface** with 5 distinct, decoupled sections:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          ITQAN HUD — TENANT MANAGEMENT DOSSIER                         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Tenant: Tashgheel Real Estate Group [Slug: tashgheel-re] [Status: Active]             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│  [ SECTION 1: COMMERCIAL CONTRACTS ]                             [ + New Contract ]   │
│  ────────────────────────────────────────────────────────────────────────────────────  │
│  Contract #       Value       Period                Status     Actions                 │
│  CNT-2026-081     60,000 EGP  01/01/2026 - 31/12/26 Active     [View] [Renew] [Edit]   │
│  CNT-2025-014     45,000 EGP  01/01/2025 - 31/12/25 Renewed    [Archive]               │
│                                                                                        │
│  [ SECTION 2: MODULE ENTITLEMENTS ]                               [ Save Changes ]     │
│  ────────────────────────────────────────────────────────────────────────────────────  │
│  [✓] CRM Core          [✓] Real Estate Units    [✓] Invoicing & Finance                │
│  [✓] Sales Pipeline    [ ] HR & Attendance      [ ] Inventory & Stock                  │
│  [✓] Operational Rep.  [✓] Marketing (WhatsApp) [ ] Workflow Automation                │
│                                                                                        │
│  [ SECTION 3: USAGE LIMITS ]                                                           │
│  ────────────────────────────────────────────────────────────────────────────────────  │
│  Max Active Users:   [ 20 ] seats (Currently active: 7)                                │
│  Max Branches:       [  3 ] branches (Currently active: 1)                             │
│  Storage Quota:      [ 25 ] GB                                                         │
│                                                                                        │
│  [ SECTION 4: ACCESS CHANGE AUDIT LOG ]                                                │
│  ────────────────────────────────────────────────────────────────────────────────────  │
│  2026-10-06 14:20  admin@itqan.com: Enabled 'real_estate' (Reason: Contract addendum) │
│  2026-01-01 09:00  admin@itqan.com: Initial access profile created (20 users, 3 br)    │
│                                                                                        │
│  [ SECTION 5: CURRENT EFFECTIVE RUNTIME ACCESS ]                                       │
│  ────────────────────────────────────────────────────────────────────────────────────  │
│  Effective Profile: Custom Bespoke Profile | Cache State: Synchronized                 │
│  Backend Route Protection: 8 Modules Active | 2 Modules Blocked                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Workflow Advantages
* ITQAN sales administrators can log a contract renewal or price change in **Section 1** without touching the technical checkboxes in **Section 2**.
* Technical support can enable a module for a 14-day trial in **Section 2** with an audit reason in **Section 4**, without altering the legal contract value in **Section 1**.

---

## 7. EXISTING TENANT COMPATIBILITY & MIGRATION PLAN

### 7.1 Verified Status of Existing Tenants
Inspection of the 6 active tenants in the live database:

| Tenant Name | Template | Active Users | Active Branches | Invoices | Recommended Initial Access Profile |
|---|---|---|---|---|---|
| **Tashgheel Real Estate Group** | `real_estate` | 2 | 1 | 0 | All Core + Real Estate, Finance, Reports (20 users, 3 branches) |
| **Itqan Demo Corp** | `real_estate` | 1 | 1 | 0 | All Core + Real Estate, Finance, Reports (10 users, 2 branches) |
| **Test Tenant 5B3** | `general` | 10 | 1 | 0 | CRM, Sales, Finance, HR, Inventory, Reports (15 users, 2 branches) |
| **Regression Tenant** | `general` | 4 | 1 | 0 | CRM, Sales, Finance, HR, Inventory, Reports (10 users, 2 branches) |
| **Phase A Tenant** | `general` | 2 | 2 | 0 | CRM, Sales, Finance, HR, Inventory, Reports (10 users, 3 branches) |
| **Other Tenant** | `general` | 1 | 1 | 0 | CRM, Sales, Finance, Reports (5 users, 1 branch) |

### 7.2 Non-Destructive Phased Migration
1. **Zero Database Alteration at Launch:** The refactored `tenantAccessGuard` automatically serves existing tenants via the grandfathered fallback without requiring an immediate database write.
2. **HUD-Assisted Baseline Review:** Once the new HUD Tenant Dossier is deployed, ITQAN administrators review each tenant's card and click **"Save Access Profile"**, writing the verified modules and limits into `tenant_overrides`.
3. **No Downtime:** At no point during migration is any tenant blocked, throttled, or subjected to downtime.

---

## 8. REQUIRED API CONTRACTS

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              NEW & REFACTORED API CONTRACTS                            │
├─────────┬───────────────────────────────────┬──────────────┬───────────────────────────┤
│ Method  │ Endpoint                          │ Access       │ Description               │
├─────────┼───────────────────────────────────┼──────────────┼───────────────────────────┤
│ GET     │ /api/admin/tenants/:id/contracts  │ Super Admin  │ List all contracts        │
│ POST    │ /api/admin/tenants/:id/contracts  │ Super Admin  │ Create commercial contract│
│ PUT     │ /api/admin/contracts/:contract_id │ Super Admin  │ Update contract details   │
│ GET     │ /api/admin/tenants/:id/profile    │ Super Admin  │ Fetch technical profile   │
│ PUT     │ /api/admin/tenants/:id/profile    │ Super Admin  │ Update modules and limits │
│ GET     │ /api/admin/tenants/:id/audit-log  │ Super Admin  │ Fetch access audit trail  │
└─────────┴───────────────────────────────────┴──────────────┴───────────────────────────┘
```

### Sample Payload: `PUT /api/admin/tenants/:id/profile`
```json
{
  "modules": {
    "crm": true,
    "sales": true,
    "finance": true,
    "real_estate": true,
    "hr": false,
    "inventory": false,
    "purchasing": false,
    "marketing": true,
    "reports": true,
    "automation": false
  },
  "limits": {
    "max_users": 25,
    "max_branches": 3
  },
  "reason": "Client signed contract extension adding 5 user seats and WhatsApp marketing."
}
```

---

## 9. SECURITY & ACCESS CONTROL SPECIFICATIONS

1. **Privilege Separation:**
   - Routes under `/api/admin/tenants/:id/*` require `req.user.tenant_id === '00000000-0000-0000-0000-000000000000'` and `req.user.role === 'admin'`.
   - Tenant administrators have **zero access** to `/api/admin/*` and cannot view or alter their own commercial contracts or entitlement profiles.
2. **Confidentiality:**
   - Commercial contract values (`contract_value`, `payment_terms`) are never returned in client-side tenant settings or tenant API responses.
3. **Audit Immutability:**
   - `tenant_access_audit_logs` records cannot be updated or deleted via the API (Append-Only design).
4. **Cache Invalidation:**
   - When an entitlement profile is updated in HUD, in-memory caches or active session claims for that tenant are invalidated immediately.

---

## 10. IMPLEMENTATION ROADMAP & DEPENDENCY PHASES

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               PHASED IMPLEMENTATION PLAN                               │
├─────────┬────────────────────────────────────────────┬──────────┬──────────────────────┤
│ Stage   │ Deliverable Focus                          │ Effort   │ Dependencies         │
├─────────┼────────────────────────────────────────────┼──────────┼──────────────────────┤
│ Stage 1 │ Schema Creation (tenant_contracts, audit)  │ Small    │ None (Non-breaking)  │
│ Stage 2 │ Refactor subscriptionGuard -> AccessGuard  │ Medium   │ Stage 1              │
│ Stage 3 │ Backend APIs (Contracts CRUD, Profile PUT) │ Medium   │ Stage 1 & 2          │
│ Stage 4 │ HUD Frontend Redesign (Tenant Dossier UX)  │ Medium   │ Stage 3              │
│ Stage 5 │ Automated Regression Tests                 │ Small    │ Stage 4              │
└─────────┴────────────────────────────────────────────┴──────────┴──────────────────────┘
```

---

## 11. VERIFIED FACTS VS. PROPOSED DESIGN DECISIONS

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              EVIDENCE VS. PROPOSAL MATRIX                              │
├────────────────────────────────────────┬───────────────────────────────────────────────┤
│ Verified Facts (Code & Live Catalog)   │ Proposed Architectural Designs (Pending Appr.)│
├────────────────────────────────────────┼───────────────────────────────────────────────┤
│ • plans table has 3 static rows        │ • Formalize tenant_overrides as primary profile│
│ • subscriptions table has 0 rows       │ • Introduce tenant_contracts table for ledger │
│ • tenant_overrides table has 0 rows    │ • Introduce tenant_access_audit_logs table    │
│ • 6 tenants are active and functioning │ • Refactor subscriptionGuard to fail closed   │
│ • tenant_overrides schema exists       │ • HUD 5-section Tenant Dossier interface      │
│ • HUD already has an overrides modal   │ • Transition existing tenants via fallback   │
└────────────────────────────────────────┴───────────────────────────────────────────────┘
```

---

## 12. FINAL STOP CONDITION & AUDIT SIGN-OFF

* **Read-Only Strict Compliance:** This document was authored exclusively through read-only inspection of source code and catalog metadata. Zero files in application code, configuration, or database tables were modified.
* **Stop Condition Enforced:** Antigravity AI has concluded this architectural specification. Execution is paused awaiting explicit authorization from ITQAN Solutions leadership before implementing Stage 1.
