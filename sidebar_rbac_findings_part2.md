# Part 2 — Root Cause Deep Dive: Data Model, Module Loading, and Backend Enforcement

**Investigation Baseline:**  
- Branch: `main` (`d1d10c6`)  
- Working Tree: Clean (No tracked changes)  
- Database Access: Strictly None (Zero external DB connections)

---

## 1. Leads vs Customers Data Model

### A. Schema Definition
In [database/schema.sql lines 71-85](file:///d:/Tashgheel%20CRM%20Online/database/schema.sql#L71-L85):
```sql
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    source_id INTEGER REFERENCES lead_sources(id) ON DELETE SET NULL,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'lead',
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```
In [scripts/dbReconciliation.js line 290](file:///d:/Tashgheel%20CRM%20Online/scripts/dbReconciliation.js#L290):
```sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50) DEFAULT 'customer';
```

### B. Every Place That Writes the Distinguishing Field

| File | Line | Operation | Field | Value Written | Context |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `services/metaService.js` | [290-311](file:///d:/Tashgheel%20CRM%20Online/services/metaService.js#L290-L311) | `INSERT` | `status`, `entity_type` | `status: 'lead'`, `entity_type: 'customer'` | Inbound Meta Lead webhook |
| `controllers/whatsappController.js` | [1634-1637](file:///d:/Tashgheel%20CRM%20Online/controllers/whatsappController.js#L1634-L1637) | `INSERT` | `status`, `entity_type` | `status: 'lead'`, `entity_type: 'customer'` | Inbound unknown WhatsApp contact message |
| `controllers/customersController.js` | [225](file:///d:/Tashgheel%20CRM%20Online/controllers/customersController.js#L225) | `INSERT` | `status` | `status || 'lead'` | Manual CRM Customer/Lead creation |
| `frontend/src/pages/Contacts/ContactsCustomers.jsx` | [271](file:///d:/Tashgheel%20CRM%20Online/frontend/src/pages/Contacts/ContactsCustomers.jsx#L271) | `INSERT/PUT` | `status`, `entity_type` | `status: 'customer'`, `entity_type: 'customer'` | Quick Customer Modal form submission |
| `frontend/src/pages/Customers.jsx` | [61](file:///d:/Tashgheel%20CRM%20Online/frontend/src/pages/Customers.jsx#L61) | Form Initial | `status` | `'lead'` | Default form state when opening Create modal |

### C. Lead → Customer Conversion Flow
- **Does it exist?** **NO explicit conversion endpoint exists.**
- The conversion in the architecture is purely an operational lifecycle change: when a lead signs a contract or is marked as converted, the record's `status` column in `customers` is intended to change from `'lead'` to `'customer'`.
- In [controllers/reportsController.js lines 138-139](file:///d:/Tashgheel%20CRM%20Online/controllers/reportsController.js#L138-L139), the funnel metrics explicitly measure this transition:
  ```sql
  SELECT COUNT(*)::int as count FROM customers WHERE status = 'lead';
  SELECT COUNT(*)::int as count FROM customers WHERE status = 'customer';
  ```

### D. Final Conclusion
1. **Are Leads and Customers separate entities?** **NO.** They are rows in the exact same table (`customers`).
2. **What is the discriminator?** The column `status` (values `'lead'` vs `'customer'`). (Note: `entity_type` distinguishes `customer` vs `vendor` vs `broker`).
3. **What prevents `/customers?type=lead` from working?** 
   - `Customers.jsx` does not read `location.search`.
   - `fetchCustomers()` in `DataContext.jsx` invokes `GET /api/customers` with no query parameters.
   - `controllers/customersController.js` does not implement `req.query.status`.

---

## 2. Module Loading, First-Render, and Race Conditions

### A. First Render State
- In [frontend/src/context/AuthContext.jsx lines 8-10](file:///d:/Tashgheel%20CRM%20Online/frontend/src/context/AuthContext.jsx#L8-L10):
  - `user` is initialized to `null`.
  - `subscription` is initialized to `null`.
  - `loading` is `true`.
- In [frontend/src/hooks/useModule.js lines 13-24](file:///d:/Tashgheel%20CRM%20Online/frontend/src/hooks/useModule.js#L13-L24):
  - `modules = subscription?.modules || {}`.
  - `can(moduleName)` returns `modules[moduleName] === true`.

### B. What `can('x')` Returns Before Modules Load
- **Returns `false`.**
- Because `subscription` is initially `null`, `modules` evaluates to `{}`. `modules['inventory'] === true` evaluates strictly to `false`.

### C. Race Condition Analysis
- In [AuthContext.jsx lines 33-41](file:///d:/Tashgheel%20CRM%20Online/frontend/src/context/AuthContext.jsx#L33-L41):
  ```javascript
  const cached = localStorage.getItem('subscription');
  if (cached) setSubscription(JSON.parse(cached));
  api.get('/me/subscription').then(subRes => {
    setSubscription(subRes.data.data);
    localStorage.setItem('subscription', JSON.stringify(subRes.data.data));
  });
  ```
- **Finding:** If a user logs in for the first time or clears cache, `localStorage` has no cached subscription. On initial render, `hasInventory` and `hasPurchasing` evaluate to `false`. Once the asynchronous `/me/subscription` finishes, `setSubscription` triggers a rerender of `Sidebar.jsx`, revealing the items.
- However, if the subscription endpoint fails or returns 401/404, **all module-gated groups remain permanently hidden!**

### D. Module Source Trace
`tenants` (DB) $\rightarrow$ `subscriptions` / `plans` (DB) $\rightarrow$ `GET /api/me/subscription` ([plansController.js:17](file:///d:/Tashgheel%20CRM%20Online/controllers/plansController.js#L17)) $\rightarrow$ `AuthContext: subscription` ([AuthContext.jsx:38](file:///d:/Tashgheel%20CRM%20Online/frontend/src/context/AuthContext.jsx#L38)) $\rightarrow$ `useModule: can()` ([useModule.js:21](file:///d:/Tashgheel%20CRM%20Online/frontend/src/hooks/useModule.js#L21)) $\rightarrow$ `Sidebar.jsx: hasInventory, hasPurchasing` ([Sidebar.jsx:156-157](file:///d:/Tashgheel%20CRM%20Online/frontend/src/components/Layout/Sidebar.jsx#L156-L157)).

### E. Refresh Lifecycle
Modules are fetched:
1. On initial app mount if JWT exists in `localStorage` ([AuthContext.jsx:16](file:///d:/Tashgheel%20CRM%20Online/frontend/src/context/AuthContext.jsx#L16)).
2. On successful login ([AuthContext.jsx:70](file:///d:/Tashgheel%20CRM%20Online/frontend/src/context/AuthContext.jsx#L70)).
3. **NEVER** on browser focus, route change, or tenant update.

---

## 3. Plan Defaults & Tenant Entitlements

### A. Plan Entitlement Matrix
From [scripts/saas-migration.js lines 42-59](file:///d:/Tashgheel%20CRM%20Online/scripts/saas-migration.js#L42-L59) and [controllers/plansController.js lines 59-74](file:///d:/Tashgheel%20CRM%20Online/controllers/plansController.js#L59-L74):

| Plan Name | `crm` | `finance` | `hr` | `inventory` | `automation` | Notes / Fallbacks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`basic` (Default)** | **true** | **true** | **false** | **false** | **false** | `purchasing` inherits `inventory` (`false`) |
| **`pro`** | **true** | **true** | **true** | **true** | **false** | Unlocks HR & Inventory |
| **`enterprise`** | **true** | **true** | **true** | **true** | **true** | Unlocks all modules |

### B. New Tenant Default Plan
- When a new tenant is provisioned via [services/provisioningService.js line 121](file:///d:/Tashgheel%20CRM%20Online/services/provisioningService.js#L121):
  ```javascript
  const planName = selectedPlan || 'basic';
  ```
- **A new tenant default plan is `'basic'`.**
- **Impact:** By default, every newly created tenant has `inventory: false`, `purchasing: false`, `hr: false`, `automation: false`.

### C. Demo Tenant Plan
- In [server.js lines 664-666](file:///d:/Tashgheel%20CRM%20Online/server.js#L664-L666):
  ```sql
  INSERT INTO tenants (name, slug, plan, status)
  VALUES ('Itqan Demo Corp', 'demo-corp', 'enterprise', 'active')
  ```
- The seeded Demo Tenant is provisioned on the **`enterprise` plan**.
- *UNCERTAIN — NEEDS BROWSER VERIFICATION:* For any real tenant being tested, inspect `GET /api/me/subscription` response `data.plan_name` and `data.modules` in DevTools to confirm whether the tenant is on Basic, Pro, or Enterprise.

### D. Sidebar Impact: Is the "Missing Items" Problem Plan-Related?
**YES, IN LARGE PART.**
- If a tenant is on the `basic` plan:
  - **Inventory group** (`/products`, `/inventory/warehouses`, etc.) is completely hidden because `can('inventory') === false` ([Sidebar.jsx:345](file:///d:/Tashgheel%20CRM%20Online/frontend/src/components/Layout/Sidebar.jsx#L345)).
  - **Purchasing group** is completely hidden because `can('purchasing') || can('inventory') === false` ([Sidebar.jsx:364](file:///d:/Tashgheel%20CRM%20Online/frontend/src/components/Layout/Sidebar.jsx#L364)).
  - **Automation link** is locked/hidden ([Sidebar.jsx:426](file:///d:/Tashgheel%20CRM%20Online/frontend/src/components/Layout/Sidebar.jsx#L426)).
- Therefore, for any tenant on the default `basic` plan, **Inventory and Purchasing are intentionally hidden by plan entitlement design**, not by a rendering bug.

---

## 4. Backend Route Mount & Authorization Audit

All routes mounted on `/api` in [server.js line 138](file:///d:/Tashgheel%20CRM%20Online/server.js#L138) pass through:
`authMiddleware` $\rightarrow$ `branchScope` $\rightarrow$ `subscriptionGuard`.

The table below catalogs every specific route mount:

| Route Mount Path | Sub-Router File | Additional Middleware on Mount | Page Guard (`checkPageAccess`)? | Action Guard (`requirePermission`)? | Sensitive Write/Read? | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/customers` | `customerRoutes.js` | None | **NO** | **NO** | Sensitive Read/Write | Accessible to any tenant token |
| `/api/deals` | `dealRoutes.js` | None | **NO** | **NO** | Sensitive Read/Write | Accessible to any tenant token |
| `/api/quotations` | `quotationRoutes.js` | None | **NO** | **NO** | Sensitive Read/Write | Accessible to any tenant token |
| `/api/finance` | `financeRoutes.js` | None | **NO** | Cancel only (`voucher.cancel`) | **CRITICAL MONEY** | Voucher create has NO action guard |
| `/api/invoices` | `invoiceRoutes.js` | None | **NO** | **NO** | Sensitive Money | Accessible to any tenant token |
| `/api/expenses` | `expenseRoutes.js` | None | **NO** | **NO** | Sensitive Money | Accessible to any tenant token |
| `/api/products` | `productRoutes.js` | `moduleGuard('inventory')` | **NO** | **NO** | Core Product Catalog | Gated only by tenant plan |
| `/api/hr` | `hrRoutes.js` | `moduleGuard('hr')` | **NO** | **NO** | Sensitive Employee HR | Gated only by tenant plan |
| `/api/inventory` | `inventoryRoutes.js` | `moduleGuard('inventory')` | **NO** | **NO** | Sensitive Stock Ops | Gated only by tenant plan |
| `/api/purchases` | `purchaseRoutes.js` | `moduleGuard('purchasing', 'inventory')` | **NO** | **NO** | Sensitive Vendor Orders | Gated only by tenant plan |
| `/api/re-units` | `reUnitRoutes.js` | `templateGuard('real_estate')` | **NO** | **NO** | Core Real Estate Units | Gated only by template |
| `/api/re-contracts` | `reContractRoutes.js`| `templateGuard('real_estate')` | **NO** | **NO** | Sensitive Legal Contracts | Gated only by template |
| `/api/re-installments` | `reInstallmentRoutes.js`| `templateGuard('real_estate')` | **NO** | **NO** | **CRITICAL MONEY** | Payment collection has NO guard |
| `/api/reports` | `reportRoutes.js` | None | **NO** | **NO** | Sensitive Analytics | Accessible to any tenant token |
| `/api/users` | `userRoutes.js` | None | **NO** | `authorize(['admin'])` | High Security Admin | User creation & permissions |
| `/api/settings` | `settingsRoutes.js` | None | **NO** | `authorize(['admin'])` | High Security Admin | Company profile & setup |
| `/api/logs` | `logRoutes.js` | None | **NO** | `authorize(['admin'])` | High Security Audit | System audit trail |

### Sensitive Read Endpoints: Dependencies Matrix (For Staged Guarding)

| Read Endpoint | Called by Main Page | Also Called by Other Components / Modals (SHARED)? | Dependency Files |
| :--- | :--- | :--- | :--- |
| `GET /api/customers` | `Customers.jsx` | **YES (SHARED)** | `DataContext.jsx:58`, `SalesCycle.jsx:47`, `WhatsAppChat.jsx:110` |
| `GET /api/deals` | `Deals.jsx` | **YES (SHARED)** | `DataContext.jsx:82`, `Customers.jsx:93` |
| `GET /api/products` | `Products.jsx` | **YES (SHARED)** | `DataContext.jsx:70`, `MetaForms.jsx:72`, `InventoryControl.jsx:32`, `ItemCard.jsx:19`, `PurchaseOrders.jsx:101`, `PurchaseRequests.jsx:73`, `Purchases.jsx:46`, `RFQs.jsx:89` |
| `GET /api/finance/summary` | `Invoices.jsx` | Main Page Only | `Invoices.jsx:111` |
| `GET /api/inventory/warehouses` | `Warehouses.jsx`| **YES (SHARED)** | `InventoryControl.jsx:33`, `StockBalances.jsx:34`, `PurchaseOrders.jsx:99`, `PurchaseRequests.jsx:72`, `Purchases.jsx:45` |
| `GET /api/reports/financial-trends` | `Reports.jsx` | Main Page Only | `Reports.jsx:31` |
| `GET /api/hr/attendance/my` | `Attendance.jsx` | **YES (SHARED)** | `MyProfile.jsx:120` |

*Critical Architecture Warning:* Blanketing `checkPageAccess` on `GET /api/products`, `GET /api/customers`, or `GET /api/inventory/warehouses` will **break purchasing, deals, profile, and meta forms for employees** unless shared read endpoints are exempted or scoped by a lightweight reader permission.

---

## 5. Financial Action Authorization Surface

| Action / Operation | Exact Endpoint | Current Guard in Code | Recommended Permission | Product Role Policy | Risk Level |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Voucher Cancellation** | `POST /api/finance/vouchers/:id/cancel` | `requirePermission('voucher.cancel')` | `voucher.cancel` | `admin` only | **LOW (Guarded)** |
| **Voucher Creation (Receipt/Payment)** | `POST /api/finance/vouchers` | `authMiddleware` only ([financeRoutes.js:50](file:///d:/Tashgheel%20CRM%20Online/routes/financeRoutes.js#L50)) | `payment.create` | `admin`, `manager` | **P0 (CRITICAL)** |
| **Installment Cash Payment** | `POST /api/re-installments/:id/pay` | `authMiddleware` only ([reInstallmentRoutes.js:22](file:///d:/Tashgheel%20CRM%20Online/routes/reInstallmentRoutes.js#L22)) | `payment.create` | `admin`, `manager` | **P0 (CRITICAL)** |
| **Invoice Payment Recording** | `POST /api/invoices/:id/payments` | `authMiddleware` only ([invoiceRoutes.js:14](file:///d:/Tashgheel%20CRM%20Online/routes/invoiceRoutes.js#L14)) | `payment.create` | `admin`, `manager` | **P0 (CRITICAL)** |
| **Vendor Purchase Payment** | `POST /api/purchases/vendor-payment` | `authMiddleware` only ([purchaseRoutes.js:20](file:///d:/Tashgheel%20CRM%20Online/routes/purchaseRoutes.js#L20)) | `payment.create` | `admin`, `manager` | **P0 (CRITICAL)** |
| **Expense Creation** | `POST /api/expenses` | `authMiddleware` only ([expenseRoutes.js:12](file:///d:/Tashgheel%20CRM%20Online/routes/expenseRoutes.js#L12)) | `expense.create` | `admin`, `manager` | **P1** |
| **Invoice Deletion / Cancel** | `DELETE /api/invoices/:id` | `authorize(['admin'])` ([invoiceRoutes.js:12](file:///d:/Tashgheel%20CRM%20Online/routes/invoiceRoutes.js#L12)) | `invoice.cancel` | `admin` only | **LOW (Guarded)** |

---

## 6. Session Refresh & Permission Propagation

### A. Does `AuthContext` call `/auth/me` on app load?
**YES.** In [AuthContext.jsx lines 12-20](file:///d:/Tashgheel%20CRM%20Online/frontend/src/context/AuthContext.jsx#L12-L20), `useEffect` calls `fetchUser()` on mount if a token exists in `localStorage`.

### B. Does it call it on browser focus or route change?
**NO.** There are no window focus listeners, visibility listeners, or route change triggers.

### C. Does it refresh after an admin modifies permissions?
**NO.** There is no websocket event, broadcast channel, or polling mechanism.

### D. Are permissions stored in JWT?
**NO.** The JWT payload in [authController.js line 270](file:///d:/Tashgheel%20CRM%20Online/controllers/authController.js#L270) strictly contains:
`{ user: { id, name, role, tenant_id } }`.

### E. Are permissions stored in `localStorage`?
**NO.** Only `token`, `branch_id`, and `subscription` are stored in `localStorage` ([AuthContext.jsx:54-58](file:///d:/Tashgheel%20CRM%20Online/frontend/src/context/AuthContext.jsx#L54-L58)). `allowedPages` exists purely in React memory state (`user.allowedPages`).

### F. What happens when an admin changes an employee's permissions?
1. The backend updates `user_access` in PostgreSQL.
2. The affected employee's browser continues running with its existing in-memory `user.allowedPages`.
3. **Nothing changes in the employee's Sidebar until they perform a hard page reload (`F5`) or log out and log back in.**

### G. Minimal Safe Propagation Strategy
The minimal, zero-breaking conceptual approach:
- Expose a lightweight `refreshUser()` method in `AuthContext` that re-runs `GET /api/auth/me`.
- Trigger `refreshUser()` on window focus (`window.addEventListener('focus', ...)`) or upon navigation to a newly permitted route.

---

## 7. Navigation Key Compatibility (Preparing for `navConfig` without DB Migration)

| Feature | Existing Key in `user_access` / UI | Current Sidebar Path | Backend Endpoint | Reusable as Stable Key? |
| :--- | :--- | :--- | :--- | :--- |
| **Dashboard** | `/dashboard` | `/dashboard` | `/api/dashboard` | **YES** (`dashboard`) |
| **Customers** | `/contacts/customers` | `/customers` | `/api/customers` | **YES** (Map `/customers` $\leftrightarrow$ `/contacts/customers`) |
| **Leads** | None (Unmapped) | `/customers?type=lead` | `/api/customers?status=lead` | **Needs Key** (`leads`) |
| **Deals** | `/deals` | `/deals` | `/api/deals` | **YES** (`deals`) |
| **Products** | `/products` | `/products` | `/api/products` | **YES** (`products`) |
| **Units Registry**| `/units-registry` | `/units-registry` | `/api/re-units` | **YES** (`units_registry`) |
| **Finance** | `/finance` | `/finance?tab=Invoices` | `/api/finance` | **YES** (`finance`) |
| **Tasks** | `/tasks` | `/tasks` | `/api/tasks` | **YES** (`tasks`) |
| **Reports** | `/reports` | `/reports` | `/api/reports` | **YES** (`reports`) |
| **HR Attendance**| `/hr/my-attendance` | (Missing from Sidebar) | `/api/hr/attendance/my` | **YES** (`hr_attendance`) |
| **Settings** | `/settings` | `/settings` | `/api/settings` | **YES** (`settings`) |

---

## 8. Verified System Roles

| Role String | Where Defined | Can Be Assigned in UI? | Backend Used | Frontend Used | Architecture Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`admin`** | User Schema & UI | **YES** ([ContactsEmployees.jsx:459](file:///d:/Tashgheel%20CRM%20Online/frontend/src/pages/Contacts/ContactsEmployees.jsx#L459)) | Full access across controllers | Full access | **ACTIVE SYSTEM ROLE** |
| **`manager`** | User Schema & UI | **YES** ([ContactsEmployees.jsx:458](file:///d:/Tashgheel%20CRM%20Online/frontend/src/pages/Contacts/ContactsEmployees.jsx#L458)) | Scoped access & approvals | Department/team views | **ACTIVE SYSTEM ROLE** |
| **`employee`** | User Schema & UI | **YES** ([ContactsEmployees.jsx:457](file:///d:/Tashgheel%20CRM%20Online/frontend/src/pages/Contacts/ContactsEmployees.jsx#L457)) | Base operational access | Base operational view | **ACTIVE SYSTEM ROLE** |
| `finance_manager`| `financialPermission.js:30` | **NO** | Default map only | None | **DEAD / UNASSIGNABLE** |
| `accountant` | `financialPermission.js:48` | **NO** | Default map only | None | **DEAD / UNASSIGNABLE** |
| `sales` | `userRoutes.js:14` | **NO** | Legacy route comment | None | **DEAD / UNASSIGNABLE** |
| `user` | `userRoutes.js:14` | **NO** | Legacy route comment | None | **DEAD / UNASSIGNABLE** |

---

## 9. Root Cause Classification

- **Category 1: Entitlement Gating vs Visual Bug (Plan Entitlements):**  
  The absence of Inventory and Purchasing sections for standard users is **by architectural design** when tenants are on the default `basic` plan. It is not a code failure.
- **Category 2: UI Contract Breakage (Query String Navigation):**  
  `Customers.jsx`, `Deals.jsx`, and `UnitsRegistry.jsx` completely ignore incoming query parameters (`?type=lead`, `?tab=reservations`, `?tab=developers`), causing distinct Sidebar links to resolve to identical screens.
- **Category 3: Incomplete Authorization Surface (Backend Money Operations):**  
  Critical financial writes (`POST /api/finance/vouchers`, `POST /api/re-installments/:id/pay`, `POST /api/invoices/:id/payments`) lack granular role or permission guards, allowing any employee token to create cash receipts and mark balances as paid.
- **Category 4: Stale RBAC Sessions:**  
  Permissions saved by Company Admins do not propagate to the active employee browser session without a hard reload.
- **Category 5: Route Collisions & Ghost Routes:**  
  `/reports` is shadowed by an ERP redirect; `/activities`, `/quotations`, and `/lead-sources` are completely unmounted in `App.jsx`.

---

## 10. Main Branch Protection Status

`Branch protection must be configured and verified in the Git hosting provider before implementation begins.`  
(The local shell environment cannot inspect or mutate remote repository branch rules on GitHub).
