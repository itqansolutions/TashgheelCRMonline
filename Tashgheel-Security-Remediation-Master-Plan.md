# TASHGHEEL CRM ONLINE & ITQAN HUD
# SECURITY REMEDIATION MASTER PLAN (PHASE 4.2)

**Document Version:** 1.0.0 — Definitive Architecture & Remediation Blueprint  
**Status:** PLANNING ONLY — STRICT READ-ONLY AUDIT (Zero Code / Schema Modifications)  
**Target Repository:** `itqansolutions/TashgheelCRMonline.git`  
**Workspace Root:** `d:\Tashgheel CRM Online`  
**Execution Context:** Production Hardening & Multi-Tenant Defense  

---

## 1. EXECUTIVE SUMMARY & STRATEGIC GOALS

This document constitutes the comprehensive, engineering-grade Security Remediation Master Plan for **Tashgheel CRM Online** and its integrated platform portal **`itqan-crm-hud`**. 

Following the completion of functional audits (Phase 1–2) and security evaluations (Phase 3–4.1), this master plan translates all confirmed static code findings, relational integrity gaps, and authorization anomalies into an actionable, dependency-aware architectural blueprint.

### Core Strategic Mandates
1. **Zero Customer Disruption:** Remediation must strictly preserve existing tenant data, active workflows, and operational continuity. Specifically, legacy tenants without populated subscription rows must NOT be locked out.
2. **Definitive Multi-Tenant Data Isolation:** Ensure that tenant boundaries are mathematically enforced across file storage, transactional invoicing, analytics reporting, and identity access control.
3. **Defense-in-Depth:** Combine strict application-layer tenant parameterization, schema-level foreign key validation, fail-closed service guards, and an evaluation path for PostgreSQL Row-Level Security (RLS).
4. **Phased Execution:** Divide remediation into three self-contained phases:
   * **Phase A (Critical & High Severity):** SEC-01, SEC-02, SEC-03, SEC-04.
   * **Phase B (Authorization & Operations):** AUTH-RISK-01, AUTH-RISK-02, AUTH-RISK-03, SEC-05, AUTH-RISK-04, AUTH-RISK-05.
   * **Phase C (Integrity & Long-Term Architecture):** SEC-06, PostgreSQL RLS, Composite Foreign Keys, and Query Scoping.

---

## 2. CORRECTED SECURITY FINDINGS REGISTER & FACTUAL RECONCILIATION

During Phase 4.2 pre-flight verification, six specific architectural questions and previous audit ambiguities were investigated through direct inspection of the live source code and PostgreSQL catalog. Below is the definitive reconciliation of facts:

### 2.1 AUTH-RISK-04: Backend Permission Validation vs. Stale JWT Claims
* **Previous Ambiguity:** Phase 3 reported that permissions were checked against the database on each request, while Phase 4.1 noted potential stale JWT claims.
* **Code-Verified Resolution:**
  1. **User Role (`req.user.role`):** Extracted purely from the JWT payload in `middleware/auth.js:16-17` (`decoded.user`). The database query in `auth.js:23-42` checks `is_working`, `tenant_id`, and `name`, but **does NOT select or refresh `role`**.
  2. **Role-Based Routing (`roleMiddleware.authorize`):** Line 107 evaluates `if (roles.includes(req.user.role)) return next();`. Because `req.user.role` is read from the unrefreshed JWT, an in-database role downgrade (e.g. from `admin` to `employee`) **remains unenforced** until the token expires or the user logs out.
  3. **Screen Access (`user_access` / PBAC):** Checked against the live database in `roleMiddleware.js:115-125` (`SELECT 1 FROM user_access...`) only when the user's role does not match `roles`. `checkPageAccess` also queries the live database.
  4. **Financial Permission Overrides:** Explicit overrides in `financial_permissions` are checked against the live database (`financialPermission.js:90-94`). If no override exists, it falls back to `ROLE_DEFAULT_PERMISSIONS[req.user.role]`, which relies on the stale JWT role.
  5. **Account Deactivation:** Handled against the live database on every request (`users.is_working = false` halts execution with a 403 `USER_DEACTIVATED`).
* **Verdict:** Role downgrades are vulnerable to stale JWT claims; screen-level PBAC and explicit financial overrides query live DB state. Real-time synchronization and role cache invalidation are required.

### 2.2 SEC-03: Actual Foreign Key Constraints on Invoices and Customers
* **Previous Ambiguity:** Did the database engine have foreign keys preventing cross-tenant customer links in invoices?
* **Catalog-Verified Evidence:** Inspection of `information_schema.table_constraints` revealed:
  1. `invoices.client_id` and `invoices.customer_id` are defined as `VARCHAR(255) NULL`.
  2. **There is NO foreign key constraint** between `invoices.client_id` (or `customer_id`) and `customers.id`.
  3. In `invoice_items`, `product_id` has a foreign key `REFERENCES products(id)` where `products.id` is a global SERIAL primary key. There is **no composite foreign key** on `(tenant_id, id)`.
* **Verdict:** The database engine permits any arbitrary UUID or cross-tenant customer ID in `invoices.client_id`, and any foreign `product_id` in `invoice_items.product_id`. The cross-tenant reference and reporting leak (`SEC-02` and `SEC-03`) are **100% technically executable at the database layer**.

### 2.3 SEC-05: ZKTeco Device Lifecycle & Cross-Tenant Attendance Manipulation
* **Previous Ambiguity:** Does knowing an ADMS serial number immediately permit cross-tenant attendance injection?
* **Code-Verified Resolution:**
  1. **Auto-Registration:** When an unconfigured device connects (`POST /iclock/cdata?SN=...`), `ZkAdmsService.js:58-62` inserts a row into `hr_attendance_devices` with `tenant_id = NULL`.
  2. **Ingestion Gate:** Line 78 of `ZkAdmsService.js` strictly enforces: `if (!device || !device.tenant_id) return;`. Unclaimed devices **cannot** record attendance.
  3. **Device Claiming:** In `controllers/hrDevicesController.js:145`, claiming executes `UPDATE hr_attendance_devices SET tenant_id = $1 WHERE id = $5 AND (tenant_id IS NULL OR tenant_id = $1)`. Once claimed by Tenant B, Tenant A cannot claim it.
  4. **The Verified Threat:** If Tenant B claims a device, any party on the internet who knows or discovers Tenant B's device serial number (`SN`) can issue public HTTP POST requests to `/iclock/cdata?SN=Tenant_B_SN` with spoofed attendance strings (`ATTLOG <badge_number> <timestamp>`). Because the device is claimed by Tenant B, the server will match users in Tenant B by `badge_number` and inject fake attendance logs.
* **Verdict:** Missing cryptographic authentication permits attendance record spoofing against *already-claimed* devices, but unclaimed devices do not ingest attendance.

### 2.4 SEC-01: File Path Resolution, Path Traversal & Image Access
* **Previous Ambiguity:** Is path traversal possible, or is the vulnerability limited to predictable image filenames?
* **Code-Verified Resolution:**
  1. **Path Traversal Protection:** `middleware/secureUploads.js:22-47` features robust path traversal defenses (decoding checks, null byte checks, `..` rejection, and `filePath.startsWith(resolvedUploadsDir)` verification). Traversal outside `/uploads/` is **blocked**.
  2. **The Authentication Bypass:** Lines 94–99 evaluate:
     `const isImage = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico'].includes(ext);`
     `if (isTenantLogo || isImage) return res.sendFile(filePath);`
     This executes **before** checking `authenticatedUser`.
  3. **File Naming:** Uploads in `routes/fileRoutes.js:26` use `${Date.now()}-${sanitizedOriginal}` under `/uploads/:tenantId/`.
* **Verdict:** Path traversal is safely prevented. However, any image file stored in `/uploads/:tenantId/` is served without authentication if its URL is known or enumerated.

### 2.5 SEC-04: Legacy Tenants vs. Missing Subscription Records
* **Previous Ambiguity:** Will a strict fail-closed approach lock out legitimate active users?
* **Database Inspection Evidence:**
  Direct query on the live PostgreSQL database revealed:
  * `SELECT COUNT(*) FROM tenants;` = **6 active tenants** (including real estate groups and demo orgs).
  * `SELECT COUNT(*) FROM subscriptions;` = **0 rows (`[]`)**.
  * `SELECT COUNT(*) FROM tenant_overrides;` = **0 rows (`[]`)**.
* **Verdict:** If `subscriptionGuard` failed-closed on empty subscription records, **100% of all existing tenants would be immediately locked out**. A grandfathering / legacy compatibility strategy is mandatory before enforcing subscription status.

### 2.6 AUTH-RISK-02: Secret Portal HUD Passphrase Analysis
* **Previous Ambiguity:** Does the hardcoded passphrase in `SecretPortalGate.jsx` unlock backend data?
* **Code-Verified Resolution:**
  1. `SecretPortalGate.jsx` compares input against `'T@shgheelYasmina89'` and writes to browser `sessionStorage`.
  2. `PlatformWrapper.jsx:35` rejects any user whose `user.tenant_id !== '00000000-0000-0000-0000-000000000000'` **before** reaching the gate.
  3. All backend routes in `routes/superAdminRoutes.js` and `controllers/superAdminController.js` require a valid JWT issued by the system tenant.
* **Verdict:** The passphrase is an in-browser visual gate. Hardcoding it in the bundle is a security anti-pattern, but it exposes **no backend API or database access** to unauthorized users.

---

## 3. ROOT CAUSE ANALYSIS (RCA)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  ROOT CAUSE TAXONOMY                                   │
├────────────────────┬─────────────────────────────┬─────────────────────────────────────┤
│ Architectural Area │ Primary Root Cause          │ Manifestation                       │
├────────────────────┼─────────────────────────────┼─────────────────────────────────────┤
│ Static File Engine │ Overbroad Public Whitelist  │ All image extensions bypass auth in │
│                    │                             │ secureUploads.js                    │
├────────────────────┼─────────────────────────────┼─────────────────────────────────────┤
│ Financial Module   │ Omission of Tenant Filter   │ SELECT products & customers queries │
│                    │ in Parameterized SQL        │ omit AND tenant_id = $2             │
├────────────────────┼─────────────────────────────┼─────────────────────────────────────┤
│ Relational Schema  │ Missing Composite FKs &     │ Invoices accept foreign client_id;  │
│                    │ Loose Typings (VARCHAR)     │ products referenced globally        │
├────────────────────┼─────────────────────────────┼─────────────────────────────────────┤
│ Licensing Engine   │ Unhandled Catch Fallthrough │ DB exceptions and empty sub tables  │
│                    │                             │ call next() without modules map     │
├────────────────────┼─────────────────────────────┼─────────────────────────────────────┤
│ ADMS Push Service  │ Reliance on Client Metadata │ Device ID based solely on ?SN=...   │
│                    │ Without Cryptographic Token │ query string                        │
├────────────────────┼─────────────────────────────┼─────────────────────────────────────┤
│ Identity & RBAC    │ Token Payload Caching       │ Role changes in DB not reflected in │
│                    │ Without Version / Revocation│ active JWT tokens                   │
└────────────────────┴─────────────────────────────┴─────────────────────────────────────┘
```

---

## 4. DETAILED REMEDIATION SPECIFICATIONS

---

### PHASE A: CRITICAL & HIGH SEVERITY REMEDIATIONS

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ [SEC-01] PUBLIC ACCESS TO UPLOADED IMAGES                                             │
├─────────────────────────┬─────────────────────────────────────────────────────────────┤
│ Root Cause              │ Overbroad isImage whitelist in secureUploads.js:95-99        │
│ Priority & Severity     │ P0 — CRITICAL                                               │
│ Target Files & Lines    │ middleware/secureUploads.js (Lines 90–103)                  │
│                         │ routes/fileRoutes.js (Lines 10–28)                          │
└─────────────────────────┴─────────────────────────────────────────────────────────────┘
```
* **Detailed Proposed Solution:**
  1. Segment file storage into two physical directories:
     * `/uploads/public/`: Tenant logos, company letterheads, and explicit public marketing media.
     * `/uploads/private/:tenantId/`: Sensitive attachments (KYC, national IDs, passports, receipts, contracts).
  2. Refactor `secureUploads.js`:
     * Completely eliminate the general `isImage` extension bypass for unauthenticated requests.
     * For unauthenticated requests, allow delivery **only** if:
       a) The file path resides strictly under `/uploads/public/`, OR
       b) The file record in the `attachments` table has `linked_type = 'tenant'` and `is_public = TRUE`.
     * Require valid JWT authentication (via `Authorization: Bearer <token>` or temporary signed URL token) for all files in `/uploads/private/`.
     * Verify that `authenticatedUser.tenant_id` matches the path's `:tenantId`.
* **Required Database Changes:**
  * Add column: `ALTER TABLE attachments ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;`
  * Add index: `CREATE INDEX IF NOT EXISTS idx_attachments_public ON attachments(filename) WHERE is_public = TRUE;`
* **API Compatibility Implications:** Zero breakage for authenticated frontend components that include standard authorization headers or query tokens. Public quotation or invoice view links will fetch tenant branding from the public folder.
* **Existing Customer Impact:** None. Existing customer identity files will now be properly secured.
* **Regression Tests:**
  1. `test_unauthenticated_request_to_national_id_image_returns_401()`
  2. `test_unauthenticated_request_to_tenant_logo_returns_200()`
  3. `test_cross_tenant_authenticated_image_request_returns_403()`
* **Rollback Strategy:** Revert `secureUploads.js` to prior logic via Git rollback.
* **Dependencies:** None. Independent immediate fix.

---

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ [SEC-02 & SEC-03] CROSS-TENANT PRODUCT & CUSTOMER REFERENCES IN INVOICES & REPORTS   │
├─────────────────────────┬─────────────────────────────────────────────────────────────┤
│ Root Cause              │ Unscoped SELECT and INSERT queries; Unscoped report JOINs   │
│ Priority & Severity     │ P0 — HIGH                                                   │
│ Target Files & Lines    │ controllers/financeController.js (Lines 415–470)            │
│                         │ controllers/reportsController.js (Lines 91–105)             │
└─────────────────────────┴─────────────────────────────────────────────────────────────┘
```
* **Detailed Proposed Solution:**
  1. **In `controllers/financeController.js` (`createInvoice`):**
     * Enforce tenant scoping when looking up products:
       ```javascript
       const prodCheck = await db.query(
           'SELECT id, name FROM products WHERE id = $1 AND tenant_id::text = $2::text',
           [parsedPid, tenant_id]
       );
       if (prodCheck.rows.length === 0) {
           return res.status(400).json({ status: 'error', message: `Invalid product ID ${parsedPid} for this organization.` });
       }
       ```
     * Enforce tenant and branch validation on `client_id` / `customer_id`:
       ```javascript
       if (sanitizedClientId) {
           const custCheck = await db.query(
               'SELECT id FROM customers WHERE id::text = $1::text AND tenant_id::text = $2::text',
               [sanitizedClientId, tenant_id]
           );
           if (custCheck.rows.length === 0) {
               return res.status(400).json({ status: 'error', message: 'Customer not found or unauthorized.' });
           }
       }
       ```
     * Validate `deal_id` and `unit_id` against `tenant_id` before inserting.
  2. **In `controllers/reportsController.js` (`getCustomerRankings`):**
     * Update the JOIN condition to enforce matching `tenant_id`:
       ```sql
       SELECT c.name, COUNT(i.id) as invoice_count, SUM(i.total_amount) as total_spent
       FROM customers c
       JOIN invoices i ON c.id::text = i.client_id::text AND c.tenant_id::text = i.tenant_id::text
       WHERE i.tenant_id::text = $1::text
       GROUP BY c.id, c.name
       ORDER BY total_spent DESC
       LIMIT 10
       ```
* **Required Database Changes:** None for application-layer enforcement. (Schema-level composite foreign keys planned in Phase C).
* **API Compatibility Implications:** Fully compatible. Rejects malformed or malicious payload injections.
* **Existing Customer Impact:** Protects legitimate tenants from seeing competitors' customer names in analytics.
* **Regression Tests:**
  1. `test_create_invoice_with_foreign_product_returns_400()`
  2. `test_create_invoice_with_foreign_customer_returns_400()`
  3. `test_customer_rankings_does_not_leak_foreign_tenant_customers()`
* **Rollback Strategy:** Revert controller query adjustments.
* **Dependencies:** None.

---

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ [SEC-04] SUBSCRIPTION & MODULE GUARD FAIL-OPEN BEHAVIOR                               │
├─────────────────────────┬─────────────────────────────────────────────────────────────┤
│ Root Cause              │ Empty catch block and missing sub rows calling next()       │
│ Priority & Severity     │ P1 — HIGH                                                   │
│ Target Files & Lines    │ middleware/subscriptionGuard.js (Lines 52–71, 136–140)      │
│                         │ middleware/moduleGuard.js (Lines 10–16)                     │
└─────────────────────────┴─────────────────────────────────────────────────────────────┘
```
* **Detailed Proposed Solution:**
  1. **Legacy Tenant Grandfathering Policy:**
     * To prevent locking out the 6 existing active tenants who currently have no row in `subscriptions`:
     * Before changing guard behavior, run a one-time non-destructive idempotent seeding script that provisions an active subscription record (`plan_id = 'enterprise'`, `status = 'active'`, `expires_at = NOW() + INTERVAL '1 year'`) for all existing tenants in the `tenants` table.
  2. **Refactor `middleware/subscriptionGuard.js`:**
     * In the database error handler (`catch` block), adopt a **Fail-Closed** approach:
       ```javascript
       } catch (err) {
           console.error('[subscriptionGuard] Critical Error:', err.message);
           return res.status(503).json({
               status: 'error',
               message: 'Service temporarily unavailable. Unable to verify subscription status.',
               code: 'SUBSCRIPTION_CHECK_FAILED'
           });
       }
       ```
     * For tenants with no subscription row found:
       - Check if `tenants.status === 'active'`. If so, fallback to a safe standard baseline plan (`req.modules = { crm: true, sales: true, finance: true, reports: true, hr: false, inventory: false }`) and log a telemetry warning for ITQAN operations.
       - If tenant is not found or inactive, return 403 `TENANT_INACTIVE`.
  3. **Refactor `middleware/moduleGuard.js`:**
     * Replace `if (!modules) return next();` with:
       ```javascript
       if (!modules) {
           return res.status(403).json({
               status: 'module_locked',
               message: 'Access denied: Organization module configuration could not be resolved.',
               code: 'MODULES_UNRESOLVED'
           });
       }
       ```
* **Required Database Changes:**
  * Non-destructive data migration: Insert baseline active subscription records for existing registered tenants.
* **API Compatibility Implications:** Existing tenants continue uninterrupted; invalid/suspended tenants are strictly blocked.
* **Regression Tests:**
  1. `test_expired_subscription_returns_402()`
  2. `test_suspended_subscription_returns_403()`
  3. `test_db_timeout_returns_503_fail_closed()`
  4. `test_legacy_tenant_receives_grandfathered_access()`
* **Rollback Strategy:** Revert middleware files; seeded subscription records remain harmless.
* **Dependencies:** Database seeding script must execute prior to middleware deployment.

---

### PHASE B: AUTHORIZATION & OPERATIONAL SECURITY REMEDIATIONS

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ [AUTH-RISK-01] MISSING RBAC ON CUSTOMER DELETION                                      │
├─────────────────────────┬─────────────────────────────────────────────────────────────┤
│ Root Cause              │ DELETE /api/customers/:id lacks authorize() middleware     │
│ Priority & Severity     │ P1 — HIGH                                                   │
│ Target Files & Lines    │ routes/customerRoutes.js (Line 41)                          │
│                         │ controllers/customersController.js (Lines 485–502)          │
└─────────────────────────┴─────────────────────────────────────────────────────────────┘
```
* **Detailed Proposed Solution:**
  1. In `routes/customerRoutes.js`, guard the deletion route:
     ```javascript
     const { authorize } = require('../middleware/roleMiddleware');
     router.delete('/:id', authorize(['admin', 'manager']), customersController.deleteCustomer);
     ```
  2. In `controllers/customersController.js`:
     * Introduce a soft-delete mechanism (`deleted_at = NOW()`) rather than immediate destructive `DELETE FROM customers`:
     * Check row-level permissions if the user is a `manager` (verifying branch assignment).
* **Required Database Changes:**
  * Optional: `ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;`
* **API Compatibility Implications:** Employees and sales reps will receive `403 Forbidden` if attempting deletion. Admins and managers will delete successfully.
* **Regression Tests:**
  1. `test_sales_role_delete_customer_returns_403()`
  2. `test_admin_role_delete_customer_returns_200()`
* **Rollback Strategy:** Remove `authorize` from `customerRoutes.js`.
* **Dependencies:** None.

---

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ [AUTH-RISK-02] STATIC HUD PASSPHRASE HYGIENE                                          │
├─────────────────────────┬─────────────────────────────────────────────────────────────┤
│ Root Cause              │ Hardcoded string 'T@shgheelYasmina89' in SecretPortalGate.jsx│
│ Priority & Severity     │ P2 — MEDIUM                                                 │
│ Target Files & Lines    │ frontend/src/pages/SuperAdmin/SecretPortalGate.jsx (Line 8)  │
│                         │ routes/superAdminRoutes.js                                  │
│                         │ controllers/superAdminController.js                         │
└─────────────────────────┴─────────────────────────────────────────────────────────────┘
```
* **Detailed Proposed Solution:**
  1. While confirmed that the passphrase unlocks zero backend capabilities without a signed System Super Admin JWT (`tenant_id = 0000...`), hardcoded secrets in frontend code violate security compliance.
  2. Remove the static string from the frontend bundle.
  3. Implement a backend verification endpoint `POST /api/super-admin/verify-gate`:
     * Request requires valid Super Admin JWT.
     * Passphrase is authenticated server-side against an environment variable `SUPER_ADMIN_PORTAL_KEY` using timing-safe comparison (`crypto.timingSafeEqual`).
     * On success, backend returns a short-lived signed gate token or sets an HttpOnly cookie.
* **Required Database Changes:** None.
* **Required Config Changes:** Set `SUPER_ADMIN_PORTAL_KEY` in server environment.
* **Regression Tests:**
  1. `test_regular_tenant_cannot_verify_super_admin_gate()`
  2. `test_system_admin_with_valid_key_unlocked()`
* **Rollback Strategy:** Revert frontend component.
* **Dependencies:** None.

---

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ [AUTH-RISK-03] MANAGER TREASURY PERMISSIONS RESTRUCTURING                             │
├─────────────────────────┬─────────────────────────────────────────────────────────────┤
│ Root Cause              │ Gating treasury creation with payment.create in routes       │
│ Priority & Severity     │ P2 — MEDIUM                                                 │
│ Target Files & Lines    │ routes/financeRoutes.js (Lines 106–112)                     │
│                         │ middleware/financialPermission.js (Lines 42–51)             │
└─────────────────────────┴─────────────────────────────────────────────────────────────┘
```
* **Detailed Proposed Solution:**
  1. Separate operational payment creation from administrative treasury setup.
  2. Introduce dedicated permission: `'treasury.manage'`.
  3. Grant `'treasury.manage'` only to `admin` and `finance_manager`. Remove it from the general `manager` role.
  4. In `routes/financeRoutes.js`:
     ```javascript
     router.post('/treasury/accounts', requirePermission('treasury.manage'), financeController.createTreasuryAccount);
     router.put('/treasury/accounts/:id', requirePermission('treasury.manage'), financeController.updateTreasuryAccount);
     ```
* **Required Database Changes:** None (permissions managed via Set in `financialPermission.js`).
* **Existing Customer Impact:** Branch managers will no longer be able to open bank accounts or change bank account metadata, aligning with banking audit standards.
* **Regression Tests:**
  1. `test_manager_create_treasury_account_returns_403()`
  2. `test_finance_manager_create_treasury_account_returns_200()`
* **Rollback Strategy:** Restore `payment.create` in `financeRoutes.js`.
* **Dependencies:** None.

---

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ [SEC-05] ZKTECO ADMS DEVICE AUTHENTICATION & CLAIMING SECURITY                        │
├─────────────────────────┬─────────────────────────────────────────────────────────────┤
│ Root Cause              │ Plaintext serial number identity; absence of shared secret  │
│ Priority & Severity     │ P2 — MEDIUM                                                 │
│ Target Files & Lines    │ services/ZkAdmsService.js (Lines 42–85, 130–160)            │
│                         │ controllers/hrDevicesController.js (Lines 135–154)          │
└─────────────────────────┴─────────────────────────────────────────────────────────────┘
```
* **Detailed Proposed Solution (Hardware-Compatible Architecture):**
  1. **Reality of ZKTeco Firmware:** Physical ZKTeco ADMS firmware does NOT support custom HTTP request headers, OAuth2, or HMAC signatures. It sends standard HTTP GET/POST queries with query parameters (`?SN=...`).
  2. **Multi-Factor Device Validation:**
     * **Device Secret Token (URL Token):** In ZKTeco server settings, the server address can be configured as a path: `http://crm.itqan.com/iclock/cdata?token=<DEVICE_SECRET>`.
     * Add `auth_token` column to `hr_attendance_devices`. When a device is claimed, a 32-character cryptographically secure token is generated.
     * The admin enters this token into the device's server path configuration.
     * In `ZkAdmsService.js`, validate that the incoming token matches `device.auth_token`.
     * **IP Allowlisting / Pinning:** Option to bind the device to the branch's static public IP address.
     * **Rate Limiting & Push Throttling:** Throttle incoming requests to prevent brute-forcing serial numbers.
  3. **Secure Device Claiming:**
     * Do not allow claiming based solely on device ID.
     * Require the physical administrator to enter both the **Serial Number** and a **One-Time Verification PIN** (displayed on the device screen or generated at first contact) to prove physical possession.
* **Required Database Changes:**
  * `ALTER TABLE hr_attendance_devices ADD COLUMN IF NOT EXISTS auth_token VARCHAR(64);`
  * `ALTER TABLE hr_attendance_devices ADD COLUMN IF NOT EXISTS allowed_ip VARCHAR(45);`
* **Regression Tests:**
  1. `test_cdata_push_without_auth_token_rejected()`
  2. `test_device_claiming_requires_matching_credentials()`
* **Rollback Strategy:** Revert service script to unauthenticated push handling.
* **Dependencies:** None.

---

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ [AUTH-RISK-04 & AUTH-RISK-05] SESSION SYNCHRONIZATION & ROLE VALIDATION               │
├─────────────────────────┬─────────────────────────────────────────────────────────────┤
│ Root Cause              │ JWT role caching; unvalidated role strings in updateUserRole│
│ Priority & Severity     │ P2 — MEDIUM                                                 │
│ Target Files & Lines    │ middleware/auth.js (Lines 23–45)                            │
│                         │ controllers/usersController.js (Lines 43–65, 135–145)       │
└─────────────────────────┴─────────────────────────────────────────────────────────────┘
```
* **Detailed Proposed Solution:**
  1. **In `middleware/auth.js`:**
     * Add `role` to the active user verification query on line 24:
       `SELECT is_working, tenant_id, name, role, token_version FROM users WHERE id::text = $1::text LIMIT 1`
     * Synchronize `req.user.role = dbUser.role`. This immediately reflects role promotions or demotions on the next API request without waiting for token expiration!
  2. **In `controllers/usersController.js` (`updateUserRole`):**
     * Enforce strict role whitelisting:
       ```javascript
       const VALID_SYSTEM_ROLES = ['admin', 'manager', 'sales', 'accountant', 'employee', 'finance_manager', 'supervisor', 'procurement', 'inventory_keeper'];
       if (role && !VALID_SYSTEM_ROLES.includes(String(role).trim().toLowerCase())) {
           return res.status(400).json({ status: 'error', message: `Invalid role '${role}'. Must be a valid system role.` });
       }
       ```
* **Required Database Changes:**
  * Optional: `ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 1;`
* **Regression Tests:**
  1. `test_updating_user_role_to_invalid_string_returns_400()`
  2. `test_immediate_role_downgrade_enforced_without_relogin()`
* **Rollback Strategy:** Revert query and validation additions.
* **Dependencies:** None.

---

### PHASE C: DATA INTEGRITY & LONG-TERM ARCHITECTURE

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ [SEC-06 & ARCH-01] CUSTOMER ACTIVITY INTEGRITY & COMPOSITE FOREIGN KEYS               │
├─────────────────────────┬─────────────────────────────────────────────────────────────┤
│ Root Cause              │ Missing customer check in activityController; simple FKs   │
│ Priority & Severity     │ P3 — LOW-MED                                                │
│ Target Files & Lines    │ controllers/activityController.js (Lines 280–327)           │
│                         │ Database Schema (invoices, customers, products)             │
└─────────────────────────┴─────────────────────────────────────────────────────────────┘
```
* **Detailed Proposed Solution:**
  1. In `activityController.js`: Add explicit ownership verification when `cleanEntityType === 'customer'`:
     ```javascript
     if (cleanEntityType === 'customer') {
         const custChk = await db.query(
             'SELECT id FROM customers WHERE id::text = $1::text AND tenant_id::text = $2::text',
             [entity_id, tenant_id]
         );
         if (custChk.rows.length === 0) {
             return res.status(404).json({ status: 'error', message: 'Customer not found or unauthorized.' });
         }
     }
     ```
  2. **Schema-Level Composite Keys (Phase C Long-Term):**
     * To achieve mathematical isolation at the database engine level:
     * Add composite unique keys: `ALTER TABLE customers ADD CONSTRAINT uq_customers_tenant_id UNIQUE (tenant_id, id);`
     * Update `invoices` table:
       `ALTER TABLE invoices ADD CONSTRAINT fk_invoices_customer_tenant FOREIGN KEY (tenant_id, client_id) REFERENCES customers(tenant_id, id) ON DELETE RESTRICT;`
* **Regression Tests:**
  1. `test_log_activity_for_foreign_customer_returns_404()`
  2. `test_db_rejects_mismatched_tenant_customer_invoice_insert()`

---

### 4.4 POSTGRESQL ROW-LEVEL SECURITY (RLS) FEASIBILITY ASSESSMENT

A comprehensive architectural evaluation of enabling PostgreSQL RLS on Tashgheel's shared-schema database was conducted:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              POSTGRESQL RLS FEASIBILITY MATRIX                         │
├─────────────────────────┬──────────────┬───────────────────────────────────────────────┤
│ Evaluation Dimension    │ Compatibility│ Engineering Analysis                          │
├─────────────────────────┼──────────────┼───────────────────────────────────────────────┤
│ Connection Pooling      │ ⚠️ HIGH RISK │ pg.Pool (20 connections) reuses clients.      │
│                         │              │ Executing SET LOCAL app.tenant_id outside an  │
│                         │              │ explicit transaction causes session variable  │
│                         │              │ pollution across tenants.                     │
├─────────────────────────┼──────────────┼───────────────────────────────────────────────┤
│ Performance Overhead    │ ⚠️ MEDIUM    │ Wrapping every single query in a transaction  │
│                         │              │ (BEGIN; SET LOCAL...; COMMIT) increases DB   │
│                         │              │ round-trips by ~300% on Railway proxy.        │
├─────────────────────────┼──────────────┼───────────────────────────────────────────────┤
│ Background Workers      │ ⚠️ HIGH RISK │ Reminders cron, ZKTeco ADMS, WhatsApp polling │
│                         │              │ operate across multiple tenants or globally.  │
│                         │              │ RLS would silently filter their queries.      │
├─────────────────────────┼──────────────┼───────────────────────────────────────────────┤
│ Super Admin Operations  │ ⚠️ MEDIUM    │ Platform HUD queries all tenants. Requires a  │
│                         │              │ bypass policy (BYPASSRLS or admin role check).│
├─────────────────────────┼──────────────┼───────────────────────────────────────────────┤
│ Application Migration   │ ⚠️ VERY LARGE│ Requires refactoring 71 routers & 466 APIs to  │
│                         │              │ use an AsyncLocalStorage tenant DB wrapper.   │
└─────────────────────────┴──────────────┴───────────────────────────────────────────────┘
```

#### RLS Architectural Recommendation
* **DO NOT** attempt to enable PostgreSQL RLS globally across all 127 tables in the immediate remediation phase. Doing so risks catastrophic service outage, connection state leakage, and background worker failures.
* **Recommended RLS Path:**
  1. Implement **Phase A & B** application-layer and schema-level composite constraints first.
  2. Pilot RLS on a single high-risk table (`invoices` or `customers`) within an isolated testing environment using an `AsyncLocalStorage` transaction context wrapper.
  3. Defer global RLS rollout to a dedicated major architectural release (e.g., v3.0).

---

## 5. MATRICES

### 5.1 Affected Files Matrix

| File Path | Module | Findings Addressed | Nature of Modification |
|---|---|---|---|
| `middleware/secureUploads.js` | Storage Security | SEC-01 | Remove `isImage` bypass; enforce public/private folder split |
| `routes/fileRoutes.js` | File Uploads | SEC-01 | Route private files to `/uploads/private/:tenantId` |
| `controllers/financeController.js` | Invoicing & Accounts | SEC-02, SEC-03 | Add `tenant_id` to product query and customer lookup |
| `controllers/reportsController.js` | Financial Analytics | SEC-03 | Scoped JOIN `c.tenant_id = i.tenant_id` |
| `middleware/subscriptionGuard.js` | License & Plan Gating | SEC-04 | Fail-closed on error; legacy fallback baseline |
| `middleware/moduleGuard.js` | Module Protection | SEC-04 | Block access if `modules` map is missing |
| `routes/customerRoutes.js` | Customer Management | AUTH-RISK-01 | Attach `authorize(['admin', 'manager'])` to DELETE |
| `controllers/customersController.js`| Customer Management | AUTH-RISK-01 | Add audit logging & optional soft delete check |
| `frontend/src/pages/SuperAdmin/SecretPortalGate.jsx` | SuperAdmin HUD | AUTH-RISK-02 | Remove hardcoded PIN; call verification API |
| `routes/superAdminRoutes.js` | Platform HUD | AUTH-RISK-02 | Add `POST /verify-gate` with server-side timing check |
| `routes/financeRoutes.js` | Treasury & Banking | AUTH-RISK-03 | Restrict treasury creation to `treasury.manage` |
| `middleware/financialPermission.js`| Financial Authorization| AUTH-RISK-03 | Define `treasury.manage` for admin/finance_manager only |
| `services/ZkAdmsService.js` | Biometric Attendance | SEC-05 | Add URL token validation & device secret verification |
| `controllers/hrDevicesController.js`| Device Management | SEC-05 | Require two-factor claim verification (PIN + SN) |
| `middleware/auth.js` | Authentication & Session | AUTH-RISK-04 | Refresh `role` from live database on every request |
| `controllers/usersController.js` | User Administration | AUTH-RISK-05 | Add role whitelist validation against allowed array |
| `controllers/activityController.js` | CRM Activities | SEC-06 | Verify customer ownership before inserting activity |

---

### 5.2 Database Impact Matrix

| Finding | Database Object | Action Type | Schema Change / SQL Definition | Impact on Existing Records |
|---|---|---|---|---|
| SEC-01 | `attachments` | Column Add | `ALTER TABLE attachments ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;` | Non-destructive (defaults to `false`) |
| SEC-04 | `subscriptions` | Data Migration | Seed grandfathered active subscription rows for existing tenants without records | Non-destructive (adds missing rows only) |
| SEC-05 | `hr_attendance_devices` | Column Add | `ALTER TABLE hr_attendance_devices ADD COLUMN IF NOT EXISTS auth_token VARCHAR(64);` | Non-destructive (nullable) |
| AUTH-01 | `customers` | Optional Column | `ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;` | Non-destructive (nullable) |
| SEC-06 | `customers` | Constraint (Phase C) | `ALTER TABLE customers ADD CONSTRAINT uq_customers_tenant_id UNIQUE (tenant_id, id);` | Requires validating duplicate IDs first |
| SEC-03 | `invoices` | Constraint (Phase C) | Composite foreign key `FOREIGN KEY (tenant_id, client_id) REFERENCES customers(tenant_id, id)` | Requires cleaning orphaned client_ids first |

---

### 5.3 API Compatibility Matrix

| API Endpoint | Method | Finding Addressed | Expected Client Behavior Change | Breaking Change Risk |
|---|---|---|---|---|
| `/uploads/*` | GET | SEC-01 | Private images require `Authorization` header or query token. Public logos remain open. | Low (Private media already fetched by authenticated client) |
| `/api/finance/invoices` | POST | SEC-02, SEC-03 | Rejects payload with 400 if product or customer belongs to another tenant. | Zero for legitimate users; blocks malicious payloads. |
| `/api/reports/customer-rankings`| GET | SEC-03 | Excludes foreign tenant customer rows from analytics ranking. | Zero (corrects analytical integrity). |
| `/api/customers/:id` | DELETE | AUTH-RISK-01 | Rejects `sales` and `employee` roles with 403 Forbidden. | Zero (intended RBAC enforcement). |
| `/api/finance/treasury/accounts`| POST | AUTH-RISK-03 | Rejects general `manager` role without `treasury.manage` permission. | Medium (Managers must be granted role or explicit override). |
| `/iclock/cdata` | POST | SEC-05 | Rejects push requests lacking valid `token` query param. | Low (Requires one-time configuration update on devices). |
| `/api/users/:id` | PUT | AUTH-RISK-05 | Returns 400 if `role` is not in allowed system role whitelist. | Zero for standard UI; blocks malformed API calls. |

---

## 6. REGRESSION TEST STRATEGY

Every proposed remediation will be paired with an automated regression test suite using the project's existing testing framework (`jest` / `supertest`) located in the `/tests/` directory:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               REGRESSION TEST SUITE BLUEPRINT                          │
├─────────────────────────┬──────────────────────────────────────────────────────────────┤
│ Test Suite File         │ Test Cases Executed                                          │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ test_secure_uploads.js  │ 1. Unauthenticated GET to /uploads/private/... returns 401.   │
│                         │ 2. Unauthenticated GET to /uploads/public/... returns 200.    │
│                         │ 3. Tenant A JWT requesting Tenant B private file returns 403.│
│                         │ 4. Path traversal attempt (../../) returns 403.              │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ test_invoice_tenant.js  │ 1. Tenant A creating invoice with Tenant B product -> 400.   │
│                         │ 2. Tenant A creating invoice with Tenant B customer -> 400.  │
│                         │ 3. Valid invoice creation for own tenant -> 201 Created.     │
│                         │ 4. Report query verifies no foreign customers returned.      │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ test_subscription.js    │ 1. Legacy tenant without custom sub gets baseline access.     │
│                         │ 2. Expired subscription returns 402 Upgrade Required.        │
│                         │ 3. Suspended subscription returns 403 Tenant Suspended.      │
│                         │ 4. Database timeout mock returns 503 Service Unavailable.    │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ test_rbac_auth.js       │ 1. Sales rep DELETE /api/customers/:id returns 403.          │
│                         │ 2. Admin DELETE /api/customers/:id returns 200.              │
│                         │ 3. Immediate role downgrade in DB takes effect without login.│
│                         │ 4. Updating user to invalid role returns 400 Bad Request.    │
└─────────────────────────┴──────────────────────────────────────────────────────────────┘
```

---

## 7. DEPLOYMENT, ROLLBACK & BACKWARD COMPATIBILITY STRATEGY

### 7.1 Pre-Deployment Safety Protocol
1. **Full Database Snapshot:** Execute a complete pg_dump snapshot of the production database prior to any schema additions.
2. **Idempotent Migrations:** All SQL scripts must use `IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` to ensure zero disruption if re-executed.
3. **Data Backfilling:** Execute the grandfathering script for the 6 existing tenants before deploying the updated `subscriptionGuard.js` code.

### 7.2 Zero-Downtime Deployment Sequence
```
Step 1: Execute non-destructive schema migrations (add columns: is_public, auth_token).
Step 2: Execute legacy tenant subscription seeding script.
Step 3: Deploy Phase A backend controllers (financeController, reportsController).
Step 4: Deploy Phase A middleware (secureUploads, subscriptionGuard, moduleGuard).
Step 5: Run automated regression suite against staging/canary environment.
Step 6: Deploy Phase B authorization updates (customerRoutes, financialPermission, auth).
Step 7: Deploy Phase B frontend update (SecretPortalGate).
```

### 7.3 Immediate Rollback Protocol
* **Code Rollback:** Each phase is isolated in a separate, dedicated Git feature branch (`fix/sec-phase-a`, `fix/sec-phase-b`). In the event of an unpredicted error, reverting the specific Git commit restores the exact previous logic in under 60 seconds.
* **Database Rollback:** Because all database changes in Phases A and B are additive (new columns with default values and data backfills), they are **100% backward-compatible** with the older code version and do not require column dropping on rollback.

---

## 8. PRIORITIZED IMPLEMENTATION ROADMAP & EFFORT ESTIMATES

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PRIORITIZED REMEDIATION ROADMAP                           │
├─────────┬──────────────┬────────────────────────────────────────┬─────────┬────────────┤
│ Phase   │ Finding ID   │ Remediation Focus                      │ Effort  │ Precedent  │
├─────────┼──────────────┼────────────────────────────────────────┼─────────┼────────────┤
│ Phase A │ SEC-01       │ Secure Uploads & Public/Private Split  │ Medium  │ None       │
│ Phase A │ SEC-04       │ Legacy Subscriptions Seeding & Guard   │ Medium  │ None       │
│ Phase A │ SEC-02 & 03  │ Invoice Tenant Scoping & Report JOINs  │ Small   │ None       │
├─────────┼──────────────┼────────────────────────────────────────┼─────────┼────────────┤
│ Phase B │ AUTH-RISK-01 │ Customer Deletion RBAC & Soft-Delete   │ Small   │ Phase A    │
│ Phase B │ AUTH-RISK-04 │ Live Role Synchronization in Auth      │ Small   │ Phase A    │
│ Phase B │ AUTH-RISK-05 │ Role Whitelist Validation in Users     │ Small   │ None       │
│ Phase B │ AUTH-RISK-03 │ Treasury Management Permission Split   │ Small   │ None       │
│ Phase B │ SEC-05       │ ZKTeco Token Authentication & Claiming │ Medium  │ None       │
│ Phase B │ AUTH-RISK-02 │ SuperAdmin HUD Server-Side Gate API    │ Small   │ None       │
├─────────┼──────────────┼────────────────────────────────────────┼─────────┼────────────┤
│ Phase C │ SEC-06       │ Activity Customer Scoping              │ Small   │ Phase B    │
│ Phase C │ ARCH-01      │ Composite Foreign Keys on Core Tables  │ Large   │ Phase B    │
│ Phase C │ ARCH-02      │ PostgreSQL RLS Sandbox Pilot           │ V.Large │ ARCH-01    │
└─────────┴──────────────┴────────────────────────────────────────┴─────────┴────────────┘
```

### Rationale for Sequence
1. **SEC-01 & SEC-04 must precede everything else:** SEC-01 addresses an active data exposure risk on public HTTP, while SEC-04 establishes the licensing baseline required before any tenant changes.
2. **SEC-02 & SEC-03 are immediate low-effort/high-impact fixes:** Modifying the parameterized queries in `financeController` and `reportsController` eliminates relational leakage without requiring schema refactoring.
3. **Phase B secures administrative workflows:** Role synchronization, deletion RBAC, and treasury separation prevent internal privilege escalation.
4. **Phase C provides long-term hardening:** Adding composite foreign keys and piloting RLS provides defense-in-depth after the core application is stabilized.

---

## 9. OPEN DECISIONS REQUIRING ITQAN APPROVAL

Before executing code modifications, executive confirmation is requested on the following strategic decisions:

1. **Legacy Tenant Grandfathering Terms:**  
   * **Proposal:** Grant all 6 existing active tenants an automatic 1-year "Enterprise / All-Access" subscription record with `max_users = 50` and `max_branches = 5` to ensure zero service disruption.  
   * *Status:* Awaiting ITQAN confirmation.
2. **Customer Deletion Policy:**  
   * **Proposal:** Transition customer deletion to a soft-delete (`deleted_at = NOW()`) rather than physical row deletion, preserving financial audit trails and historical quotations.  
   * *Status:* Awaiting ITQAN confirmation.
3. **ZKTeco Terminal Configuration:**  
   * **Proposal:** Implement URL-based secret tokens (`/iclock/cdata?token=...`) for existing biometric devices to ensure compatibility with hardware terminals.  
   * *Status:* Awaiting ITQAN confirmation.
4. **Treasury Management Role Restrictions:**  
   * **Proposal:** Revoke bank account creation permissions from general `manager` accounts and require explicit `treasury.manage` permission (held by `admin` and `finance_manager`).  
   * *Status:* Awaiting ITQAN confirmation.

---

## 10. FINAL STOP CONDITION & AUDIT SIGN-OFF

* **Audit Mode Compliance:** This Phase 4.2 Security Remediation Master Plan was conducted exclusively in **STRICT READ-ONLY** mode. Zero lines of application source code, configuration files, or database schemas were modified.
* **Stop Condition Enforced:** The planning phase is now officially complete. Antigravity AI has halted execution and will await explicit authorization from ITQAN leadership before initiating any code implementation or schema migrations.
