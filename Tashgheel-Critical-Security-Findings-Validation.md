# TASHGHEEL CRM ONLINE & ITQAN HUD
# PHASE 4.1: CRITICAL SECURITY FINDINGS VALIDATION & CODE EVIDENCE REPORT

**Audit Date:** November 2026  
**Auditor:** Antigravity AI — Advanced Security & Architecture Audit  
**Target Repository:** `itqansolutions/TashgheelCRMonline.git`  
**Workspace Path:** `d:\Tashgheel CRM Online`  
**Execution Mode:** STRICT READ-ONLY (No code, schema, config, or data modifications)  
**Verification Level:** Code Verified (Static source code, middleware chains, execution paths, and SQL query analysis)  

---

## 1. EXECUTIVE SUMMARY & AUDIT POSTURE

### Arabic Executive Brief (ملخص تنفيذي للإدارة)
> **تقييم الحالة الأمنية:**  
> بناءً على التوجيهات الصادرة بعد مرحلة Phase 4، تم تنفيذ مرحلة التدقيق المعمق **Phase 4.1** للتحقق البرمجي الدقيق (Code Verification) من 6 ثغرات أمنية مصنفة كحرجة وعالية الخطورة (SEC-01 إلى SEC-06) بالإضافة إلى إعادة تقييم مخاطر الصلاحيات الصادرة في Phase 3 (AUTH-RISK-01 إلى 05).  
> 
> **النتائج الحاسمة:**
> 1. **تأكيد الثغرة الحرجة SEC-01:** تم التحقق بنسبة 100% من أن وسيط فحص الملفات المرفوعة (`secureUploads.js`) يتجاوز التحقق من تسجيل الدخول تماماً لأي ملف يحمل امتداد صورة (`.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`, `.gif`, `.ico`). يتيح ذلك لأي مستخدم على الإنترنت تحميل وثائق الهوية، الشيكات، والعقود المصورة طالما عُرف مسار الملف دون الحاجة لـ JWT Token.
> 2. **تأكيد تسريب البيانات العابر للمستأجرين SEC-02 و SEC-03:** تم إثبات أن استعلام إضافة بنود الفاتورة لا يقيد المنتجات بالمستأجر، وأن معرف العميل يُقبل بدون فحص ملكية، مما يسبب تسريباً مباشراً لأسماء عملاء الشركات الأخرى في تقارير الترتيب المالي (`getCustomerRankings`).
> 3. **تأكيد ثغرة الفتح عند الخطأ SEC-04 (Fail-Open):** في حال حدوث أي انقطاع مؤقت لقاعدة البيانات أو عند عدم وجود سجل اشتراك لمستأجر، يتجاوز وسيط الاشتراك الفحص ويستدعي `next()` دون تقييد الوحدات، مما يلغي حماية الباقات والاشتراكات.
> 4. **ثغرة أجهزة البصمة SEC-05:** بروتوكول ZKTeco ADMS يستقبل سجلات الحضور عبر HTTP عام اعتماداً على الرقم التسلسلي فقط دون تحقق تشفيري أو توقيع رقمي.
> 5. **توضيح دقيق لنطاق SEC-06:** إضافة الأنشطة للعملاء لا تتحقق من وجود العميل في المستأجر، لكن استعلامات العرض تعزل الأنشطة بـ `WHERE tenant_id = $1`، مما يحصر الخطر في سلامة العلاقات وتلوث البيانات (Data Contamination) دون تسريب قراءة مباشر للمستأجر الآخر.
> 6. **إعادة تأكيد مخاطر الصلاحيات:** حذف العملاء (`DELETE /api/customers/:id`) محمي بدقة على مستوى المستأجر والفرع، لكنه يفتقر تماماً للتحقق من دور المستخدم (RBAC)، مما يمكن موظفي المبيعات من حذف عملاء فرعهم.

---

## 2. AUDIT STATUS & VERIFICATION TAXONOMY

In strict compliance with audit governance rules, every finding in this report is classified according to the following verification taxonomy:

* **`Code Verified`**: The defect, logic gap, or bypass was traced line-by-line in the committed JavaScript source code, route declarations, SQL query texts, and middleware pipelines. The exact conditions required to trigger the condition exist in the codebase.
* **`Runtime Unverified`**: Dynamic HTTP exploit requests or penetration testing against live running servers was NOT executed, honoring the user's explicit mandate for zero disruption to live databases or running instances.
* **`Architectural Assessment`**: Evaluation of architectural patterns (e.g., Shared-Database/Shared-Schema multi-tenancy, defense-in-depth, principle of least privilege) against industry standards (OWASP ASVS 4.0, NIST SP 800-145).

---

## 3. DEEP-DIVE VALIDATION OF CRITICAL FINDINGS (SEC-01 TO SEC-06)

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                               PHASE 4.1 FINDINGS DASHBOARD                                │
├──────────┬──────────┬─────────────────────────────────────────────────┬───────────────────┤
│ ID       │ Severity │ Vulnerability / Defect Title                    │ Verification      │
├──────────┼──────────┼─────────────────────────────────────────────────┼───────────────────┤
│ SEC-01   │ CRITICAL │ Unauthenticated Public Access to Uploaded Images│ Code Verified     │
│ SEC-02   │ HIGH     │ Cross-Tenant Product Injection in Invoices      │ Code Verified     │
│ SEC-03   │ HIGH     │ Cross-Tenant Customer Leakage via Report JOINs   │ Code Verified     │
│ SEC-04   │ HIGH     │ Fail-Open Fallthrough in Subscription/Module Gating│ Code Verified   │
│ SEC-05   │ MEDIUM   │ Unauthenticated ZKTeco ADMS Device Push Endpoint │ Code Verified    │
│ SEC-06   │ LOW-MED  │ Unvalidated Cross-Tenant Customer Activity Links│ Code Verified     │
└──────────┴──────────┴─────────────────────────────────────────────────┴───────────────────┘
```

---

### 3.1 FINDING SEC-01: UNAUTHENTICATED PUBLIC ACCESS TO UPLOADED IMAGES

* **Target File:** [secureUploads.js](file:///d:/Tashgheel%20CRM%20Online/middleware/secureUploads.js#L90-L103)
* **Lines of Interest:** 90–103
* **CWE Mapping:** [CWE-284: Improper Access Control](https://cwe.mitre.org/data/definitions/284.html) / [CWE-306: Missing Authentication for Critical Function](https://cwe.mitre.org/data/definitions/306.html)
* **Severity Reclassification:** **CRITICAL** (Exploitable over public HTTP without authentication)

#### Detailed Code Analysis
In `middleware/secureUploads.js`, incoming requests to `/uploads/*` are intercepted by the `secureUploads` middleware factory. The logic is intended to protect private tenant documents while allowing public access to company branding logos needed for email templates and public quotation links.

However, examine lines 90 through 103:

```javascript
// middleware/secureUploads.js (lines 90-103)
// 4. Authorization & Tenant Isolation Enforcement
// Unauthenticated request handling:
if (!authenticatedUser) {
  // Public tenant branding logos & image assets are permitted for invoice/quotation rendering
  const ext = path.extname(filePath).toLowerCase();
  const isImage = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico'].includes(ext);
  const isTenantLogo = attachmentRecord && String(attachmentRecord.linked_type).toLowerCase() === 'tenant';

  if (isTenantLogo || isImage) {
    return res.sendFile(filePath);
  }
  return res.status(401).json({ status: 'error', message: 'Authentication required to access this file.' });
}
```

#### The Vulnerability Mechanism
1. Line 95 evaluates `isImage`: Any file ending in `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`, `.gif`, or `.ico` evaluates `isImage = true`.
2. Line 98 tests: `if (isTenantLogo || isImage) return res.sendFile(filePath);`.
3. Because the conditional uses a logical OR (`||`), any image file matches `isImage === true` even when `isTenantLogo` is `false` or `attachmentRecord` does not exist!
4. This return statement is executed **before** token verification or tenant matching (`authenticatedUser` is null).
5. As a consequence, non-image files (e.g., `.pdf`, `.docx`, `.xlsx`) require a valid JWT token, but **every image file stored under `/uploads/` is served directly to unauthenticated anonymous requests**.

#### Data Exposure Scope
In Tashgheel CRM, user uploads stored in `/uploads/` include:
* National ID / Passport photo scans attached to customer KYC records.
* Bank deposit receipts and paper cheque scans attached to financial vouchers.
* Real estate title deed photos and property inspection images.
* Employee profile pictures and national identification cards.
* General marketing and communication media.

#### Threat Model & Attack Vector
* **Predictable / Enumerable Paths:** Many upload implementations use timestamps, incremental IDs, or original file names (e.g., `/uploads/attachments/1715000000_id_scan.jpg` or `/uploads/receipts/cheque_1042.png`).
* **Search Engine Indexing / Spidering:** Public web crawlers requesting media paths can cache confidential identity documents.
* **Cross-Tenant Scraping:** A malicious user in Tenant A who knows or bruteforces attachment filenames can download Tenant B's confidential image documents without logging in or presenting credentials.

---

### 3.2 FINDING SEC-02 & SEC-03: CROSS-TENANT PRODUCT & CUSTOMER INJECTION & REPORTING LEAK

* **Target Controller 1:** [financeController.js](file:///d:/Tashgheel%20CRM%20Online/controllers/financeController.js#L415-L470) (Lines 415–470)
* **Target Controller 2:** [reportsController.js](file:///d:/Tashgheel%20CRM%20Online/controllers/reportsController.js#L88-L108) (Lines 88–108)
* **CWE Mapping:** [CWE-639: Authorization Bypass Through User-Controlled Key](https://cwe.mitre.org/data/definitions/639.html) / [CWE-200: Exposure of Sensitive Information](https://cwe.mitre.org/data/definitions/200.html)
* **Severity Reclassification:** **HIGH** (Cross-Tenant Relational Violation & Information Disclosure)

#### Detailed Code Analysis: SEC-02 (Product Injection)
In `controllers/financeController.js` under `createInvoice`, lines 415–429 handle incoming line items:

```javascript
// controllers/financeController.js (lines 415-429)
if (item.product_id && item.product_id !== '' && item.product_id !== 'null' && item.product_id !== 'Custom') {
    const parsedPid = parseInt(item.product_id, 10);
    if (!isNaN(parsedPid)) {
        try {
            const prodCheck = await db.query(
                'SELECT id, name FROM products WHERE id = $1',
                [parsedPid]
            );
            if (prodCheck.rows.length > 0) {
                prodId = prodCheck.rows[0].id;
                if (!itemDesc) itemDesc = prodCheck.rows[0].name;
            }
        } catch (e) {}
    }
}
```

* **Defect:** `SELECT id, name FROM products WHERE id = $1` completely omits `AND tenant_id = $2`.
* **Impact:** If Tenant A submits `product_id: 852` (a proprietary service or physical product belonging to Tenant B), the query returns Tenant B's product name (`prodCheck.rows[0].name`) and copies it into Tenant A's `invoice_items` table under Tenant A's `tenant_id`.

#### Detailed Code Analysis: SEC-03 (Customer Reference & Cross-Tenant Reporting Leak)
In the same function (`controllers/financeController.js:445-469`), customer ID handling is implemented as:

```javascript
// controllers/financeController.js (lines 445-469)
let sanitizedClientId = null;
if (effectiveClientId && effectiveClientId !== '' && effectiveClientId !== 'null' && effectiveClientId !== 'undefined') {
    sanitizedClientId = String(effectiveClientId).trim();
}

const invRes = await db.query(`
    INSERT INTO invoices (invoice_number, total_amount, due_date, status, tenant_id, branch_id, client_id, customer_id, deal_id, unit_id, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
`, [
    invoiceNumber, total_amount, due_date || null, 'unpaid', tenant_id, branch_id ? String(branch_id) : null,
    sanitizedClientId, sanitizedClientId, sanitizedDealId, sanitizedUnitId, notes || null
]);
```

* **Defect:** `effectiveClientId` is accepted directly from the request payload. There is **zero verification** that `SELECT id FROM customers WHERE id = $1 AND tenant_id = $2` exists or belongs to the calling tenant!
* **Consequence in Reporting:** Now examine how reports consume this data in `controllers/reportsController.js:91-104`:

```javascript
// controllers/reportsController.js (lines 91-104)
exports.getCustomerRankings = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    try {
        const result = await db.query(`
            SELECT c.name, COUNT(i.id) as invoice_count, SUM(i.total_amount) as total_spent
            FROM customers c
            JOIN invoices i ON c.id::text = i.client_id::text
            WHERE i.tenant_id::text = $1::text
            GROUP BY c.id, c.name
            ORDER BY total_spent DESC
            LIMIT 10
        `, [tenant_id]);
        res.json({ status: 'success', data: result.rows });
    } catch (err) { ... }
};
```

#### The Exploit / Leakage Mechanism
1. Tenant A creates an invoice maliciously or accidentally passing `client_id: "<Tenant_B_Customer_UUID>"`.
2. The invoice is stored with `tenant_id = Tenant_A` and `client_id = Tenant_B_Customer_UUID`.
3. When Tenant A requests `GET /api/reports/customer-rankings`, the SQL query executes `WHERE i.tenant_id = Tenant_A`.
4. It joins `customers c ON c.id = i.client_id`, but **does NOT filter `c.tenant_id = Tenant_A`**.
5. As a result, Tenant B's customer name (`c.name`) is selected from Tenant B's private customer records and displayed inside Tenant A's analytics dashboard!

---

### 3.3 FINDING SEC-04: FAIL-OPEN BEHAVIOR IN SUBSCRIPTION & MODULE GUARD

* **Target File 1:** [subscriptionGuard.js](file:///d:/Tashgheel%20CRM%20Online/middleware/subscriptionGuard.js#L52-L140) (Lines 52–71, 136–140)
* **Target File 2:** [moduleGuard.js](file:///d:/Tashgheel%20CRM%20Online/middleware/moduleGuard.js#L10-L16) (Lines 10–16)
* **CWE Mapping:** [CWE-754: Improper Check for Unusual or Exceptional Conditions](https://cwe.mitre.org/data/definitions/754.html) / [CWE-391: Unchecked Error Condition](https://cwe.mitre.org/data/definitions/391.html)
* **Severity Reclassification:** **HIGH** (Bypasses Monetization, Plan Gating & Access Control)

#### The 8-Scenario Subscription & Module Enforcement Matrix

| # | Scenario Description | Intended Behavior | Actual Code Behavior | Risk Level |
|---|----------------------|-------------------|----------------------|------------|
| 1 | Active paid subscription, module in plan | Allow access | `req.modules[mod] === true` → `next()` | Expected |
| 2 | Active paid subscription, module NOT in plan | Deny access (403) | `req.modules[mod] === false` → returns 403 | Expected |
| 3 | Expired subscription (`expires_at < now`) | Block access (402) | Updates status to `expired`, returns 402 | Expected |
| 4 | Suspended tenant (`status === 'suspended'`) | Block access (403) | Returns 403 `SUBSCRIPTION_SUSPENDED` | Expected |
| 5 | Tenant override active (`tenant_overrides`) | Apply custom limits/modules | Merges overrides into `req.modules` | Expected |
| 6 | **Unseeded Tenant (No row in `subscriptions`)** | Deny / fallback to basic trial | Lines 52-70: Falls through to `return next()` with `req.modules = undefined`! | **FAIL-OPEN** |
| 7 | **Database Error / Timeout in Guard Query** | Deny (500/503) safe fail-closed | Lines 137-139: `catch(err) { console.error(...); next(); }` | **FAIL-OPEN** |
| 8 | Public / Exempt Routes (e.g. `/api/auth/login`) | Unrestricted access | Bypasses `subscriptionGuard` via route placement | Expected |

#### Code Tracing of Scenarios 6 & 7

In `middleware/subscriptionGuard.js`:
```javascript
// middleware/subscriptionGuard.js (lines 52-71)
if (result.rows.length === 0) {
    // Legacy tenant without subscription row — still honor tenant_overrides if present
    const overrideRes = await db.query(
        `SELECT modules, limits FROM tenant_overrides WHERE tenant_id::text = $1::text`,
        [tenant_id]
    );
    const ov = overrideRes.rows[0];
    if (ov) {
        // ... sets req.modules ...
    }
    return next(); // <--- IF NO OVERRIDE EXISTS, req.modules IS NEVER ATTACHED!
}
```

And in the error handler:
```javascript
// middleware/subscriptionGuard.js (lines 136-140)
    next();
} catch (err) {
    console.error('[subscriptionGuard] Error:', err.message);
    next(); // <--- CALLS next() ON DB EXCEPTION!
}
```

Now trace what happens next in `middleware/moduleGuard.js`:
```javascript
// middleware/moduleGuard.js (lines 10-15)
module.exports = (...moduleNames) => (req, res, next) => {
    const modules = req.modules; // Attached by subscriptionGuard

    // If no module map (e.g. legacy tenant without subscription), allow access
    if (!modules) return next(); // <--- ALLOWS UNRESTRICTED ACCESS!
```

#### Defect Summary
When a database query fails, or when a new tenant has not yet had a subscription record seeded, `subscriptionGuard` catches the error and executes `next()`. At this point, `req.modules` is `undefined`. When `moduleGuard` runs downstream on premium routes (such as HR, ERP, Automation, or Real Estate), it observes `!modules` and immediately calls `return next()`. Consequently, the tenant is granted **100% unrestricted access to all premium modules and features**, completely subverting the license and plan enforcement engine.

---

### 3.4 FINDING SEC-05: ZKTECO ADMS DEVICE AUTHENTICATION & SPOOFING WEAKNESS

* **Target File:** [ZkAdmsService.js](file:///d:/Tashgheel%20CRM%20Online/services/ZkAdmsService.js#L42-L85) (Lines 42–85, 130–160)
* **Mount Point:** [server.js](file:///d:/Tashgheel%20CRM%20Online/server.js#L100) (Line 100: `ZkAdmsService(app)`)
* **CWE Mapping:** [CWE-290: Authentication Bypass by Spoofing](https://cwe.mitre.org/data/definitions/290.html) / [CWE-306: Missing Authentication for Critical Function](https://cwe.mitre.org/data/definitions/306.html)
* **Severity Reclassification:** **MEDIUM** (Operational Spoofing / No Mutual Authentication)

#### Detailed Code Analysis
ZKTeco ADMS (Automatic Data Master Server) devices use an HTTP Push protocol where the physical time-attendance terminal connects outward to the cloud server to push punch-clock records.

In `services/ZkAdmsService.js`:
```javascript
// services/ZkAdmsService.js (lines 42-64)
const getOrRegisterDevice = async (sn) => {
  if (!sn) return null;
  let res = await db.query(
    `SELECT * FROM hr_attendance_devices WHERE serial_number = $1 AND is_active = TRUE LIMIT 1`,
    [sn]
  );
  if (res.rows.length > 0) {
    await db.query(
      `UPDATE hr_attendance_devices SET last_seen = NOW(), total_pushes = total_pushes + 1 WHERE serial_number = $1`,
      [sn]
    );
    return res.rows[0];
  }
  // Auto-register new device (unassigned tenant — admin can claim later)
  const inserted = await db.query(
    `INSERT INTO hr_attendance_devices (name, serial_number, last_seen, total_pushes)
     VALUES ($1, $2, NOW(), 1) RETURNING *`,
    [`ZKTeco Device (${sn})`, sn]
  );
  return inserted.rows[0];
};
```

And in the attendance ingestion route `POST /iclock/cdata`:
```javascript
// services/ZkAdmsService.js (lines 77-84, 130-155)
const processAttendanceRecord = async (badge_number, timestamp, attend_date, device) => {
  if (!device || !device.tenant_id) return;
  const user = await findUserByBadge(badge_number, device.tenant_id);
  if (!user) return;
  // Inserts attendance record and calculates late/penalty rules...
};
```

#### Vulnerability Assessment
1. **Device Identification relies solely on `req.query.SN`:** The device serial number is passed as a plaintext query string parameter (`/iclock/cdata?SN=BJ8938491823`).
2. **Missing Cryptographic Authentication:** There is no shared secret, API token, pre-shared key (PSK), HMAC signature, or client TLS certificate (mTLS) validating that the HTTP request actually originates from a physical biometric terminal.
3. **Spoofing Feasibility:** If an attacker or disgruntled employee discovers the serial number of their company's attendance device (often printed on the physical label on the back of the device or visible in the device settings menu), they can forge HTTP POST requests containing fabricated punch times (`ATTLOG 101 2026-11-08 09:00:00 0 1`), manipulating payroll calculations, attendance records, and deduction rules without being physically present.

---

### 3.5 FINDING SEC-06: CROSS-TENANT CUSTOMER ACTIVITY REFERENCES & RELATIONAL INTEGRITY

* **Target File:** [activityController.js](file:///d:/Tashgheel%20CRM%20Online/controllers/activityController.js#L280-L327) (Lines 280–327)
* **CWE Mapping:** [CWE-639: Authorization Bypass Through User-Controlled Key](https://cwe.mitre.org/data/definitions/639.html)
* **Severity Reclassification:** **LOW–MEDIUM** (Data Integrity & Foreign Key Contamination; No Direct Cross-Tenant Read Leak)

#### Detailed Code Analysis
In `controllers/activityController.js`, `createActivity` validates permissions and row-level ownership conditionally based on `entity_type`:

```javascript
// controllers/activityController.js (lines 280-312)
const cleanEntityType = (entity_type || 'customer').toLowerCase();

// Deal permission and row-level scope check
if (cleanEntityType === 'deal') {
    const { checkDealPermission } = require('../middleware/dealPermission');
    // ... validates deal.log_activity ...
    // ... validates SELECT id FROM deals WHERE id = $1 AND tenant_id = $2 AND scope ...
    if (dealChk.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized.' });
    }
}

// Customer entity handling: ZERO CHECKS PERFORMED!
const result = await db.query(
    `INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, meta, scheduled_at, reminder_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [tenant_id, req.user.id, cleanEntityType, String(entity_id), action, JSON.stringify(meta), parsedScheduledAt, reminder_note]
);
```

#### Precise Isolation Boundary Evaluation
* **Does Tenant B see Tenant A's activity?**  
  **NO.** When Tenant B loads their customer timeline, `getActivities` executes:
  `WHERE a.tenant_id::text = $1::text AND LOWER(a.entity_type) = 'customer' AND a.entity_id::text = $3::text`.
  Because Tenant A's activity was saved with `tenant_id = Tenant_A`, Tenant B's query will **never** return Tenant A's activity.
* **Does Tenant A see Tenant B's customer data?**  
  **NO.** The `activities` insert only writes the string `entity_id`. It does not fetch or return fields from Tenant B's customer record.
* **What is the actual impact?**
  1. **Relational Contamination:** Tenant A has activity records pointing to foreign IDs not present in Tenant A's `customers` table.
  2. **Potential UI & Reporting Breaks:** If any query or dashboard attempts to perform an `INNER JOIN customers c ON c.id = a.entity_id AND c.tenant_id = a.tenant_id`, the activity disappears or causes null pointer errors in frontend components expecting valid customer data.

---

## 4. CROSS-REFERENCE & RE-EVALUATION OF PHASE 3 FINDINGS

| Finding ID | Title | Re-Evaluation Status | Code Verification Details |
|---|---|---|---|
| **AUTH-RISK-01** | Missing RBAC on Customer Deletion | **Confirmed High Risk** | `DELETE /api/customers/:id` has strict tenant and branch isolation (`WHERE id = $1 AND tenant_id = $2 AND branch_id = $3`), but lacks `authorize(...)` and `accessScopeService`. Any authenticated sales rep can permanently delete branch customers. |
| **AUTH-RISK-02** | Static HUD PIN in Frontend Bundle | **Confirmed Design Weakness** | PIN `T@shgheelYasmina89` is exposed in `SecretPortalGate.jsx`. However, backend super-admin APIs are strictly guarded by `req.user.tenant_id === '00000000-0000-0000-0000-000000000000'`. Exploitability requires a valid system admin JWT. |
| **AUTH-RISK-03** | Over-Permissioned Manager Role in Treasury | **Confirmed Operational Risk** | `financialPermission.js:47` grants `payment.create` to `manager`. `financeRoutes.js:107` guards `POST /api/finance/treasury/accounts` with `payment.create`. Managers can create and modify bank accounts. |
| **AUTH-RISK-04** | Missing Real-Time Session Invalidation | **Confirmed Architecture Gap** | Permission modifications in `user_access` are updated in the database but not pushed to active user JWTs or client states. Revoked permissions persist until token expiry or re-login. |
| **AUTH-RISK-05** | Unvalidated Role Strings in User Updates | **Confirmed Input Validation Gap** | `updateUserRole` in `usersController.js:140` executes `role = COALESCE($4, role)` without validating against the 9 defined system roles, permitting arbitrary string values in PostgreSQL. |

---

## 5. EXPLOITABILITY ASSESSMENT & THREAT MATRIX

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           VULNERABILITY THREAT MATRIX                                            │
├──────────┬──────────┬─────────────────┬──────────────────────┬────────────────────────────────┬──────────────────┤
│ Finding  │ Severity │ Exploitability  │ Blast Radius         │ Attack Vector                  │ Code Verified    │
├──────────┼──────────┼─────────────────┼──────────────────────┼────────────────────────────────┼──────────────────┤
│ SEC-01   │ CRITICAL │ High (Trivial)  │ Global Uploads       │ Anonymous HTTP GET to /uploads │ YES              │
│ SEC-02   │ HIGH     │ Medium          │ Tenant Invoices      │ Authenticated POST /invoices   │ YES              │
│ SEC-03   │ HIGH     │ Medium          │ Analytics Reports    │ Authenticated GET /rankings    │ YES              │
│ SEC-04   │ HIGH     │ Low (Transient) │ Tenant Subscriptions │ DB Hiccup / Unseeded Tenant    │ YES              │
│ SEC-05   │ MEDIUM   │ Medium          │ Attendance / Payroll │ HTTP POST /iclock/cdata?SN=... │ YES              │
│ SEC-06   │ LOW-MED  │ Low             │ Relational Integrity │ Authenticated POST /activities │ YES              │
│ AUTH-01  │ HIGH     │ High            │ Customer Records     │ Authenticated DELETE /customer │ YES              │
│ AUTH-02  │ MEDIUM   │ Low             │ Client-Side Bundle   │ Source Code / Bundle Inspect   │ YES              │
│ AUTH-03  │ MEDIUM   │ Medium          │ Treasury Accounts    │ Manager Account Abuse          │ YES              │
│ AUTH-04  │ MEDIUM   │ Low             │ Session Revocation   │ Active Session Window          │ YES              │
│ AUTH-05  │ LOW      │ Low             │ User Role Integrity  │ Malformed Admin API Request    │ YES              │
└──────────┴──────────┴─────────────────┴──────────────────────┴────────────────────────────────┴──────────────────┤
│ * All findings reflect Code Verification from static analysis. No dynamic tests were run against live databases. │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. ARCHITECTURAL RECOMMENDATIONS & REMEDIATION BLUEPRINT

> [!IMPORTANT]
> In accordance with strict audit constraints, **zero code modifications have been made to the repository**. The following blueprints represent non-destructive architectural recommendations for engineering leadership to review before remediation.

### 6.1 Remediation Blueprint: SEC-01 (Secure Uploads)
**File:** `middleware/secureUploads.js`  
**Recommendation:** Remove the automatic extension-based bypass `isImage`. Public access must be restricted **strictly** to verified public tenant logos and system branding assets via database record check or a dedicated `/uploads/public/` folder:

```diff
- const isImage = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico'].includes(ext);
- const isTenantLogo = attachmentRecord && String(attachmentRecord.linked_type).toLowerCase() === 'tenant';
- if (isTenantLogo || isImage) {
-   return res.sendFile(filePath);
- }
+ const isPublicAsset = attachmentRecord && (
+   String(attachmentRecord.linked_type).toLowerCase() === 'tenant' ||
+   attachmentRecord.is_public === true
+ );
+ if (isPublicAsset) {
+   return res.sendFile(filePath);
+ }
```

### 6.2 Remediation Blueprint: SEC-02 & SEC-03 (Tenant Scoping in Invoicing & Reports)
**File:** `controllers/financeController.js` & `controllers/reportsController.js`  
**Recommendation:** Enforce `tenant_id` validation on both products and customer entities during invoice creation, and add `c.tenant_id = i.tenant_id` to report JOIN clauses:

```diff
// In financeController.js: Validate product ownership
- 'SELECT id, name FROM products WHERE id = $1'
+ 'SELECT id, name FROM products WHERE id = $1 AND tenant_id::text = $2::text', [parsedPid, tenant_id]

// In financeController.js: Validate customer ownership
+ if (sanitizedClientId) {
+   const custCheck = await db.query('SELECT id FROM customers WHERE id = $1 AND tenant_id::text = $2::text', [sanitizedClientId, tenant_id]);
+   if (custCheck.rows.length === 0) sanitizedClientId = null;
+ }

// In reportsController.js: Scoped JOIN
- FROM customers c JOIN invoices i ON c.id::text = i.client_id::text WHERE i.tenant_id::text = $1::text
+ FROM customers c JOIN invoices i ON c.id::text = i.client_id::text AND c.tenant_id::text = i.tenant_id::text WHERE i.tenant_id::text = $1::text
```

### 6.3 Remediation Blueprint: SEC-04 (Subscription Fail-Closed)
**File:** `middleware/subscriptionGuard.js` & `middleware/moduleGuard.js`  
**Recommendation:** Adopt a strict **Fail-Closed** design. When an error occurs or no subscription exists, deny access with an appropriate service error or fallback to a minimal locked-down state:

```diff
// In subscriptionGuard.js
- } catch (err) {
-   console.error('[subscriptionGuard] Error:', err.message);
-   next();
- }
+ } catch (err) {
+   console.error('[subscriptionGuard] Error:', err.message);
+   return res.status(503).json({ status: 'error', message: 'Service temporarily unavailable. Subscription verification failed.' });
+ }
```

### 6.4 Remediation Blueprint: AUTH-RISK-01 (Customer Deletion RBAC)
**File:** `routes/customerRoutes.js`  
**Recommendation:** Attach role-based authorization to the customer deletion route:

```diff
- router.delete('/:id', customersController.deleteCustomer);
+ router.delete('/:id', authorize(['admin', 'manager']), customersController.deleteCustomer);
```

---

## 7. AUDIT VERDICT & CONCLUSION

1. **Phase 4.1 Objectives Fully Achieved:** All 6 critical findings (`SEC-01` through `SEC-06`) and the 5 Phase 3 authorization risks (`AUTH-RISK-01` through `AUTH-RISK-05`) have been rigorously validated against the source code, line numbers verified, data flows mapped, and threat models articulated.
2. **Read-Only Compliance Maintained:** Zero code files, database rows, configuration settings, or runtime environments were altered during this audit.
3. **Audit Status:** **PHASE 4.1 CODE VALIDATION COMPLETE.** Ready for executive review.
