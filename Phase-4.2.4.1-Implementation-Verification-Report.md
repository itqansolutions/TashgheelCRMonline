# تقرير التحقق والمراجعة الأمنية لتنفيذ محرك الصلاحيات اليدوية
# PHASE 4.2.4.1 — IMPLEMENTATION VERIFICATION & SECURITY REVIEW

**تاريخ التقرير:** 8 نوفمبر 2026  
**المشروع:** Tashgheel CRM Online & ITQAN Platform HUD (`itqan-crm-hud`)  
**المرحلة:** Phase 4.2.4.1 (Implementation Verification & Code Audit)  
**الحالة:** READ-ONLY Verification Complete  

---

## 1. الخلاصة التنفيذية والتقييم النهائي (Executive Verdict)

تمت المراجعة المعمارية والكودية الشاملة (Read-Only) لكافة الملفات التي تم إنشاؤها وتعديلها في المرحلة **Phase 4.2.4**. نعلن النتائج التالية بثقة هندسية موثقة:

| المحور | التقييم | الحكم والنتيجة الفنية |
| :--- | :---: | :--- |
| **المعمارية المركزية (Central Architecture)** | **ممتاز (PASS)** | تم فصل محرك الصلاحيات التشغيلية تماماً عن الباقات التجارية السابقة (`basic`, `pro`, `enterprise`). محرك [`tenantEntitlementService.js`](file:///d:/Tashgheel%20CRM%20Online/services/tenantEntitlementService.js) هو المرجع الوحيد للصلاحيات والحدود. |
| **آلية التهيئة الأولى (Super Admin Bootstrap)** | **مؤكد وخالٍ من التعليق الدائري (PASS)** | مسارات الإدارة العليا `/api/admin/*` مفصولة بنيوياً في [`server.js:137`](file:///d:/Tashgheel%20CRM%20Online/server.js#L137) وتسبق برمجية `subscriptionGuard` في [`server.js:154`](file:///d:/Tashgheel%20CRM%20Online/server.js#L154). يستطيع مسؤول إتقان استعراض وتهيئة أي شركة جديدة حتى لو كان جدول `tenant_overrides` فارغاً تماماً. |
| **مبدأ الإغلاق الآمن (Fail-Closed Enforcement)** | **صارم (PASS)** | تم سد ثغرة السطر 14 في [`middleware/moduleGuard.js`](file:///d:/Tashgheel%20CRM%20Online/middleware/moduleGuard.js#L14). أي مستأجر غير مهيأ يُحظر بـ 403 `ENTITLEMENTS_NOT_CONFIGURED`، وأي انقطاع لقاعدة البيانات يمنع المرور بـ 503 `ACCESS_CHECK_UNAVAILABLE`. |
| **حدود الاستخدام والسعات (Usage Limits)** | **يعمل محلياً مع ملاحظة تزامن (PASS WITH FINDING)** | تم تطبيق فحص السعة (`max_users`, `max_branches`) مع دعم السعة غير المحدودة (`-1`) والسعة الصفرية (`0`) وتجاهل المستخدمين غير النشطين (`is_working = false`). توجد ملاحظة هندسية حول التزامن (Race Condition) عند إرسال طلبات متزامنة في نفس اللحظة. |
| **تغطية الموديولات (Module Coverage)** | **مطابق مع استثناء مسار المبيعات (PASS WITH FINDING)** | تطابق تام للمفاتيح الـ 10 المعيارية مع الـ Frontend، مع ملاحظة أن مساري `/api/sales` و `/api/erp/sales` محميان بـ `templateGuard('general')` فقط وليس بـ `moduleGuard('sales')`. |
| **الكاش وإلغاء الصلاحيات (Cache & Revocation)** | **فوري محلياً / مقيّد زمنياً بالتعدد (PASS)** | الإلغاء فوري داخل نفس السيرفر، ومقيّد بـ 30 ثانية كحد أقصى (Bounded TTL) في حالة تشغيل عدة سيرفرات متزامنة على Railway. |
| **مطابقة الاختبارات (Test Reconciliation)** | **مكتملة وموضحة بدقة (PASS)** | تم حسم سبب تسجيل 14 اختباراً في Node Test Runner (جناح الاختبار الرئيسي كـ Suite Test + 13 اختباراً فرعياً). تم جرد الحالات المختبرة وغير المختبرة بكل شفافية. |

---

## 2. المسار المعتمد للبرمجيات الوسيطة (Verified Middleware Flow)

يوضح المخطط التالي كيفية معالجة الطلبات الواردة وعزل مسارات إدارة إتقان عن مسارات المستأجرين:

```mermaid
flowchart TD
    ClientReq["Incoming HTTP Request"] --> RouterBranch{"Route Path Target"}
    
    %% Admin Path
    RouterBranch -->|"/api/admin/*" (server.js:137)| AdminPath["adminPlanRoutes.js"]
    AdminPath --> AdminAuth["authMiddleware (JWT Verify)"]
    AdminAuth --> SuperAdminGuard["superAdminOnly Guard\n(role === 'admin' && tenant_id === SYSTEM_TENANT)"]
    SuperAdminGuard -->|Passed| AdminController["adminPlansController\n(getTenantOverride / setTenantOverride)"]
    SuperAdminGuard -->|Failed| ForbiddenAdmin["HTTP 403 Super Admin access required"]
    AdminController --> DBOverrides["tenant_overrides & tenant_access_audit_logs"]

    %% Tenant API Path
    RouterBranch -->|"/api/*" (server.js:154)| GlobalApiMiddleware["Global API Pipeline (server.js:154)"]
    GlobalApiMiddleware --> TenantAuth["authMiddleware (Extract req.user.tenant_id)"]
    TenantAuth --> BranchScope["branchScope Middleware"]
    BranchScope --> SubGuard["subscriptionGuard.js"]
    
    SubGuard --> CheckExempt{"Is Super Admin Tenant?"}
    CheckExempt -->|Yes| NextToRoutes["Proceed to Target Route"]
    CheckExempt -->|No| FetchEntitlements["tenantEntitlementService.getTenantEntitlements()"]
    
    FetchEntitlements --> DBCheck{"tenant_overrides row exists?"}
    DBCheck -->|No| BlockNotConfigured["HTTP 403 ENTITLEMENTS_NOT_CONFIGURED"]
    DBCheck -->|DB Error| BlockUnavailable["HTTP 503 ACCESS_CHECK_UNAVAILABLE"]
    DBCheck -->|Yes| AttachReq["Attach req.modules & req.planLimits"]
    
    AttachReq --> ModuleCheck{"Protected by moduleGuard?"}
    ModuleCheck -->|Yes| ModuleGuard["moduleGuard(canonicalModule)"]
    ModuleGuard -->|Disabled/Missing| BlockLocked["HTTP 403 MODULE_LOCKED / MODULE_ACCESS_DENIED"]
    ModuleGuard -->|Enabled| RouteHandler["Execute Business Route Handler"]
    ModuleCheck -->|No| RouteHandler
```

---

## 3. التحقق من آلية التهيئة الأولى (Super Admin Bootstrap Assessment)

### أ. تحليل المسار البرمجي في `server.js`
في ملف [`server.js`](file:///d:/Tashgheel%20CRM%20Online/server.js):
- **السطر 137:**
  ```javascript
  // Admin Pricing Engine (Super Admin only — bypasses subscription guard)
  app.use('/api/admin', adminPlanRoutes);
  ```
- **السطر 154:**
  ```javascript
  // Global Subscription & Branch Guard (applies only to /api routes below)
  app.use('/api', authMiddleware, branchScope, subscriptionGuard);
  ```

**النتيجة الهندسية المؤكدة:**
1. مسارات الإدارة العليا `/api/admin` مسجلة في السطر 137، أي **قبل** تسجيل `subscriptionGuard` في السطر 154.
2. في بيئة Express.js، يتم تنفيذ البرمجيات الوسيطة وفق ترتيب التسجيل؛ لذلك، **أي طلب موجه إلى `/api/admin/*` لا يمر إطلاقاً عبر `subscriptionGuard`**.
3. هذا يضمن عدم وجود أي تعليق أو اعتماد دائري (No Circular Dependency).

### ب. سلوك استرجاع وتهيئة شركة غير مسجلة في `tenant_overrides`
عندما تقوم الإدارة العليا بفتح شركة جديدة ليس لها سجل سابق في `tenant_overrides`:
1. يتم إرسال طلب `GET /api/admin/tenants/:tenant_id/override`.
2. يتم فحص توثيق المسؤول بواسطة [`routes/adminPlanRoutes.js:10-16`](file:///d:/Tashgheel%20CRM%20Online/routes/adminPlanRoutes.js#L10-L16):
   ```javascript
   const superAdminOnly = (req, res, next) => {
       const SYSTEM_TENANT = '00000000-0000-0000-0000-000000000000';
       if (req.user.role !== 'admin' || req.user.tenant_id !== SYSTEM_TENANT) {
           return res.status(403).json({ status: 'error', message: 'Super Admin access required.' });
       }
       next();
   };
   ```
3. يستدعي الكنترولر دالة [`getTenantEntitlements(tenant_id)`](file:///d:/Tashgheel%20CRM%20Online/services/tenantEntitlementService.js#L113-L149).
4. عندما لا تعثر قاعدة البيانات على سجل، تُعيد الدالة كائناً آمناً:
   ```javascript
   {
     modules: {},
     limits: { max_users: 0, max_branches: 0 },
     notes: null,
     isConfigured: false
   }
   ```
5. يستجيب الكنترولر بنجاح كود 200 حاملاً `isConfigured: false`.
6. في واجهة HUD، تظهر مفاتيح الموديولات معطلة مع تنبيه "غير مهيأ بعد".
7. يحدد المسؤول الموديولات والحدود المطلوبة ويكتب سبب التعديل، ويرسل طلب `PUT /api/admin/tenants/:tenant_id/override`.
8. تنفذ دالة [`setTenantEntitlements`](file:///d:/Tashgheel%20CRM%20Online/services/tenantEntitlementService.js#L179-L250) عملية `UPSERT` في جدول `tenant_overrides`، وتسجل العملية في `tenant_access_audit_logs`، وتلغي الكاش فورياً.
9. تصبح صلاحيات الشركة سارية فوراً ويتمكن مستخدموها من العمل.

### ج. الحماية من تجاوز المستخدمين العاديين (No Tenant Bypass)
- مستخدمو الشركات العادية يحملون `tenant_id` حقيقي لشركتهم (وليس `00000000-0000-0000-0000-000000000000`).
- لو حاول أي مستخدم أو مدير شركة استدعاء مسار `/api/admin/*`، يتم صده في السطر 12 من [`routes/adminPlanRoutes.js`](file:///d:/Tashgheel%20CRM%20Online/routes/adminPlanRoutes.js#L12) بـ HTTP 403 `Super Admin access required`.

---

## 4. التحقق من حدود الاستخدام والسعات (Usage Limits Verification)

تم فحص [`middleware/usageLimits.js`](file:///d:/Tashgheel%20CRM%20Online/middleware/usageLimits.js) وجميع مسارات إنشاء الموارد:

### أ. الرقابة على مقاعد المستخدمين (`max_users`)
- **المسار المطبق:** [`routes/userRoutes.js:20`](file:///d:/Tashgheel%20CRM%20Online/routes/userRoutes.js#L20):
  ```javascript
  router.post('/', authorize(['admin']), usageLimits('users'), usersController.createUser);
  ```
- **حساب المستخدمين النشطين:**
  يتم احتساب المستخدمين النشطين فقط عبر استعلام SQL:
  ```sql
  SELECT COUNT(*) FROM users WHERE tenant_id::text = $1::text AND COALESCE(is_working, true) = true
  ```
- **استثناء المستخدمين غير النشطين:**
  إذا كان الطلب يحمل `req.body.is_working === false` (السطر 55)، يتم تمرير الطلب عبر `next()` دون استهلاك مقعد مدفوع.
- **السعة غير المحدودة (`-1`):**
  السطر 60 يتجاوز التحقق ويسمح بالإنشاء الحر.
- **السعة الصفرية (`0`):**
  السطر 65 يمنع إنشاء أي مستخدمين ويعيد 403 `USER_LIMIT_ZERO`.

### ب. الرقابة على الفروع (`max_branches`)
- **المسار المطبق:** [`routes/branchRoutes.js:12`](file:///d:/Tashgheel%20CRM%20Online/routes/branchRoutes.js#L12):
  ```javascript
  router.post('/', usageLimits('branches'), branchesController.createBranch);
  ```
- **استعلام الفروع النشطة:**
  ```sql
  SELECT COUNT(*) FROM branches WHERE tenant_id::text = $1::text AND COALESCE(is_active, true) = true
  ```
- **السعة غير المحدودة (`-1`):** تسمح بإنشاء فروع بلا قيود.
- **السعة الصفرية (`0`):** تعيد 403 `BRANCH_LIMIT_ZERO`.
- **تجاوز الحد:** تعيد 403 `BRANCH_LIMIT_EXCEEDED`.

### ج. فحص التزامن وسباق الطلبات (Concurrency & Race Condition Analysis)
> [!WARNING]
> **ملاحظة أمنية / معمارية حول التزامن (Time-Of-Check to Time-Of-Use):**
> آلية الفحص الحالية في `usageLimits.js` تعتمد على استعلام `SELECT COUNT(*)` في البرمجية الوسيطة، يليه أمر `INSERT` في الكنترولر داخل طلب منفصل.
> إذا أرسل المستأجر طلبين متزامنين في نفس الجزء من الثانية (Parallel Requests) بينما المتبقي مقعد واحد فقط، فإن كلا الطلبين سيقرأ نفس العدد المسموح ويمران معاً، مما قد يؤدي إلى تجاوز الحد بمقدار طلب إضافي.
> **التوصية:** لا تعيق هذه الملاحظة إطلاق واجهة HUD، ولكن يُوصى في مرحلة الـ Hardening بإضافة قفل استشاري للمعاملة (Advisory Lock):
> `SELECT pg_advisory_xact_lock(hashtext('tenant_limits_' || tenant_id::text));` داخل معاملة إنشاء المستخدم والفرع.

---

## 5. مصفوفة التحقق من الموديولات المعيارية (Canonical Module Registry)

تم حصر الموديولات الـ 10 المعيارية في [`services/tenantEntitlementService.js`](file:///d:/Tashgheel%20CRM%20Online/services/tenantEntitlementService.js#L12-L23) ومطابقتها مع كافة مسارات الباك إند والفرونت إند:

| الموديول المعياري | المسارات المحمية في `server.js` | البرمجية الوسيطة المطبقة | التطابق في الـ Frontend |
| :--- | :--- | :--- | :---: |
| **`crm`** | `/api/customers`, `/api/tasks`, `/api/deals`, `/api/sales-management` | `moduleGuard('crm')` | ✅ مطابق |
| **`sales`** | `/api/quotations` (مزدوج مع crm), `/api/sales` (ملاحظة 1) | `moduleGuard('crm', 'sales')` | ✅ مطابق |
| **`finance`** | `/api/finance`, `/api/invoices`, `/api/expenses` | `moduleGuard('finance')` | ✅ مطابق |
| **`real_estate`** | `/api/re-units`, `/api/re-contracts`, `/api/propertyfinder`, إلخ (10 مسارات) | `templateGuard('real_estate')` (ملاحظة 2) | ✅ مطابق |
| **`hr`** | `/api/hr`, `/api/hr/activity-types`, `/api/hr/shifts`, `/api/hr/devices` | `moduleGuard('hr')` | ✅ مطابق |
| **`inventory`** | `/api/products`, `/api/inventory` | `moduleGuard('inventory')` | ✅ مطابق |
| **`purchasing`** | `/api/vendors`, `/api/purchases`, `/api/purchase-orders`, `/api/rfqs` | `moduleGuard('purchasing', 'inventory')` (ملاحظة 3) | ✅ مطابق |
| **`marketing`** | `/api/meta`, `/api/whatsapp` | `moduleGuard('marketing', 'crm')` | ✅ مطابق |
| **`reports`** | `/api/reports` | `moduleGuard('reports')` | ✅ مطابق |
| **`automation`** | `/api/workflows`, `/api/rules` | `moduleGuard('automation')` | ✅ مطابق |

### الملاحظات الهندسية المكتشفة على الموديولات:
1. **مسار المبيعات العام (`/api/sales` و `/api/erp/sales`):**
   محمي في السطور 221-222 بـ `templateGuard('general')` فقط، ولا يحتوي على `moduleGuard('sales')`. هذا يعني أنه إذا كانت الشركة من نوع `general` لكن تم تعطيل موديول `sales` في الصلاحيات اليدوية، فإن مسار `/api/sales` لن يُحظر بواسطة `moduleGuard`. (يجب إضافة `moduleGuard('sales')` لاحقاً).
2. **عزل موديول العقارات (`real_estate`):**
   يقوم [`middleware/templateGuard.js:10`](file:///d:/Tashgheel%20CRM%20Online/middleware/templateGuard.js#L10) بالتحقق المباشر من `req.modules.real_estate === false` ويحظر الطلب بـ 403 `MODULE_LOCKED`؛ وبالتالي يتم احترام الصلاحيات اليدوية بشكل ممتاز بالتكامل مع عزل القالب.
3. **التوافق التراجعي للمشتريات والمخازن (`purchasing` & `inventory`):**
   تستخدم مسارات المشتريات `moduleGuard('purchasing', 'inventory')` للسماح للشركات التي لديها صلاحية المخازن بالنفاذ للمشتريات ما لم يتم تعطيل المشتريات صراحة.

---

## 6. التحقق من الكاش وإلغاء الصلاحيات (Cache & Revocation Verification)

تم فحص آلية التخزين المؤقت في [`services/tenantEntitlementService.js`](file:///d:/Tashgheel%20CRM%20Online/services/tenantEntitlementService.js#L32-L51):

### أ. عزل مفاتيح الكاش (Cache Key Isolation)
- المفتاح معزول لكل مستأجر على حدة عبر تحويل المعرف لصيغة نصية موحدة:
  `cache.get(String(tenantId).toLowerCase())`.
- لا يوجد أي تداخل أو تسريب لمفاتيح الكاش بين المستأجرين.

### ب. صلاحية الكاش والإلغاء الفوري (TTL & Invalidation)
- **مدة الصلاحية (TTL):** مضبوطة بدقة على **30 ثانية** (`CACHE_TTL_MS = 30 * 1000`).
- **الإلغاء المحلي الفوري:** عند قيام المسؤول بحفظ تعديلات على الصلاحيات أو حذفها، يتم استدعاء [`invalidateTenantEntitlements(tenantId)`](file:///d:/Tashgheel%20CRM%20Online/services/tenantEntitlementService.js#L40) التي تقوم بمسح المفتاح فورياً من الذاكرة (`cache.delete(...)`).

### ج. السلوك عبر بيئة النسخ المتعددة (Multi-Instance Behavior on Railway)
> [!IMPORTANT]
> **التزام الصراحة والشفافية الهندسية:**
> الكاش الحالي يعتمد على كائن الذاكرة الخاص بعملية Node.js (`new Map()`).
> في حالة تشغيل السيرفر على نسختين أو أكثر (Multiple Replicas / Horizontal Scaling):
> - تعديل الصلاحيات على النسخة (Instance A) يلغي الكاش فورياً على Instance A فقط.
> - النسخة (Instance B) ستظل تقدم الصلاحيات السابقة حتى تنتهي مدة الـ TTL البالغة **30 ثانية كحد أقصى**.
> - **الخلاصة:** النظام يضمن الإلغاء الفوري (0 ثانية) على نفس النسخة، والإلغاء النهائي (Eventual Consistency) خلال 30 ثانية عبر النسخ الأخرى، بدون الحاجة حالياً لتعقيد الـ Redis أو WebSocket.

### د. سلوك انقطاع قاعدة البيانات (Database Failure Resilience)
إذا توقفت قاعدة البيانات وانتهت صلاحية الـ TTL:
- لا يعتمد المحرك أي قيم افتراضية مفتوحة.
- يتم إرجاع HTTP 503 `ACCESS_CHECK_UNAVAILABLE`، مما يضمن الإغلاق الآمن التام.

---

## 7. التحقق الأمني وعزل المستأجرين (Security & Tenant Isolation)

1. **صلاحية التعديل مقصورة حصرياً على إتقان:**
   مسارات التعديل `/api/admin/tenants/:tenant_id/override` محمية بـ `superAdminOnly` ولا يمكن استدعاؤها إلا بحساب ينتمي للـ System Tenant (`00000000-0000-0000-0000-000000000000`).
2. **استخراج معرّف المستأجر للعمليات العادية:**
   يتم استخراج `tenant_id` حصرياً من حمولة الـ JWT الموقعة مشفرة (`req.user.tenant_id`) بواسطة برمجية `authMiddleware`. لا يمكن للمستخدم تمرير `tenant_id` في الـ Header أو الـ Body لتجاوز العزل.
3. **مناعة سجل التدقيق ضد التزوير (Audit Log Tamper-Resistance):**
   - السجل يُنشأ برمجياً على السيرفر فقط داخل دالة `setTenantEntitlements`.
   - لا توجد أي واجهة برمجة تطبيقات (API) تسمح بالتعديل (`UPDATE`) أو الحذف (`DELETE`) من جدول `tenant_access_audit_logs`.
   - السجل يوثق هوية المسؤول الحقيقية وعنوان الـ IP وسبب التعديل الإلزامي والحالة السابقة والجديدة.

---

## 8. جرد ومطابقة الاختبارات الآلية (Exact Test Inventory)

### أ. توضيح سبب ظهور 14 اختباراً في تقرير Test Runner
عند تشغيل الأمر:
```bash
node --test tests/manual_entitlements_engine.test.js
```
أخرج التقرير: `ℹ tests 14, pass 14`.  
**السبب الهندسي الدقيق:** محرك اختبارات Node.js (`node:test`) يحتسب دالة الاختبار الرئيسية المغلفة `test('🏛️ Manual Entitlements Engine Test Suite (Phase 4.2.4)', ...)` كاختار رقم 1 (Suite Root Test)، بالإضافة إلى 13 اختباراً فرعياً بداخلها (`await t.test(...)`)، فيصبح الإجمالي 1 + 13 = 14 اختباراً.

### ب. جدول الجرد التفصيلي للاختبارات المنفذة

| # | اسم الاختبار في الكود | الغرض والوظيفة التي يتحقق منها | النتيجة الفعلية |
| :---: | :--- | :--- | :---: |
| 1 | `Explicitly enabled module` | التحقق من أن الموديول المفعل يمرر الطلب عبر `next()` | **PASS** |
| 2 | `Explicitly disabled module` | التحقق من أن الموديول المعطل يُحظر بـ 403 `MODULE_LOCKED` | **PASS** |
| 3 | `Missing entitlement profile` | التحقق من أن غياب ملف الصلاحيات يُحظر بـ 403 `MODULE_ACCESS_DENIED` | **PASS** |
| 4 | `Unknown module key` | التحقق من تجريد أي مفاتيح موديولات غريبة وحظرها تلقائياً | **PASS** |
| 5 | `Limit Validation` | التحقق من رفض السعات الكسرية والسالبة باستثناء `-1` | **PASS** |
| 6 | `Entitlement Service: fails closed` | التحقق من الإغلاق الآمن عند عدم وجود سجل في قاعدة البيانات | **PASS** |
| 7 | `Cache Invalidation` | التحقق من خدمة الطلبات من الكاش وإلغائه فورياً عند التعديل | **PASS** |
| 8 | `User Limit Exceeded` | التحقق من حظر إنشاء المستخدمين بـ 403 `USER_LIMIT_EXCEEDED` عند الوصول للحد | **PASS** |
| 9 | `Inactive User Creation` | التحقق من أن المستخدم غير النشط (`is_working: false`) لا يستهلك مقعداً | **PASS** |
| 10 | `Unlimited Capacity (-1)` | التحقق من السماح بإنشاء المستخدمين والفروع عند ضبط السعة على `-1` | **PASS** |
| 11 | `Zero Capacity (0)` | التحقق من حظر الإنشاء التام بـ 403 عند ضبط السعة على `0` | **PASS** |
| 12 | `Database Connection Failure` | التحقق من الإغلاق الآمن وإرجاع 503 عند انقطاع قاعدة البيانات | **PASS** |
| 13 | `TemplateGuard Preservation` | التحقق من بقاء عزل قوالب العقارات فعالاً بالتكامل مع الموديولات | **PASS** |

### ج. الحالات غير المغطاة باختبارات مستقلة (Gaps Identified for Future Hardening)
- **اختبار حظر تجاوز حد الفروع (`BRANCH_LIMIT_EXCEEDED`):** تم اختبار السعة غير المحدودة للسماح بإنشاء الفروع، ولكن لم يُكتب اختبار مستقل لحالة امتلاء سعة الفروع وحظرها (تم الاعتماد على تماثل منطق الكود مع المستخدمين).
- **محاولة تعديل HUD بحساب غير مصرح (Unauthorized HUD Modification):** لم يُضمن كحالة اختبار منفصلة في هذا الملف (محمي بـ `adminPlanRoutes.js`).
- **اختبار التزامن المتوازي (Concurrent Creation Race Condition):** لم يُكتب اختبار لمحاكاة طلبين متوازيين في نفس الميلي ثانية.

---

## 9. مراجعة سكريبت الترحيل والجاهزية التشغيلية (Migration Review)

### أ. فحص سكريبت الترحيل الساكن `migrations/011_manual_entitlements_and_audit_schema.sql`
- **جدول `tenant_overrides`:**
  - الأعمدة: `id SERIAL`, `tenant_id UUID NOT NULL UNIQUE`, `modules JSONB`, `limits JSONB`, `notes TEXT`, `created_at`, `updated_at`.
  - الفهرس: `uq_tenant_overrides_tenant_id` يمنع تكرار الشركة.
  - **ملاحظة تحسينية للمستقبل:** يُفضل إضافة قيد المفتاح الأجنبي `REFERENCES tenants(id) ON DELETE CASCADE`.
- **جدول `tenant_access_audit_logs`:**
  - الأعمدة: `id UUID`, `tenant_id UUID NOT NULL`, `changed_by INTEGER`, `previous_modules JSONB`, `new_modules JSONB`, `previous_limits JSONB`, `new_limits JSONB`, `reason TEXT NOT NULL`, `ip_address VARCHAR(45)`, `created_at`.
  - الفهرس: `idx_tenant_access_audit_tenant_created` على `(tenant_id, created_at DESC)` يضمن سرعة استرجاع السجل التاريخي في واجهة HUD.
  - متوافق بنسبة 100% مع معايير PostgreSQL المستخدمة في Tashgheel.

### ب. ماذا يحدث لو تم تشغيل الكود الجديد بينما جدول `tenant_overrides` فارغ؟
- **المسارات التي تظل تعمل بشكل طبيعي:**
  1. مسارات المصادقة وتسجيل الدخول (`/api/auth/*`).
  2. مسارات مسؤولي إتقان (`/api/admin/*`) لإدارة وتهيئة الصلاحيات.
  3. مسارات الـ Webhooks العامة (`/api/meta/webhook`, `/api/whatsapp/webhook`, `/api/propertyfinder/webhook`).
  4. الأصول والصفحات الثابتة للواجهة الأمامية (`/`, `/assets/*`).
- **المسارات والعمليات التي تُحظر تماماً (Fail-Closed):**
  - **جميع مسارات العمليات التشغيلية للمستأجرين** المندرجة تحت `/api/*` (العملاء، الصفقات، الفواتير، المخازن، الموظفون، الوحدات، إلخ).
  - عند محاولة أي مستخدم إجراء أي طلب، يستجيب السيرفر بكود **HTTP 403**:
    ```json
    {
      "status": "subscription_locked",
      "code": "ENTITLEMENTS_NOT_CONFIGURED",
      "message": "Organization access profile is not configured. Please contact ITQAN administration to initialize your service agreement."
    }
    ```
- **كيف يتم فك الحظر؟**
  بمجرد دخول مسؤول إتقان عبر HUD وحفظ أول إعداد صلاحيات للشركة، يُفك الحظر فورياً وتبدأ الشركة بالعمل.

---

## 10. قائمة القضايا والأولويات (Issues & Priorities)

| الرقم | المستوى | الوصف الهندسي | التأثير التشغيلي | الإجراء المقترح |
| :---: | :---: | :--- | :--- | :--- |
| **SEC-4.2-A** | **Medium** | مسار `/api/sales` غير محمي بـ `moduleGuard('sales')` | يمكن لشركات القالب العام النفاذ لأوامر البيع حتى لو كان موديول `sales` معطلاً | إضافة `moduleGuard('sales')` إلى مسار المبيعات |
| **SEC-4.2-B** | **Medium** | سباق الطلبات المتزامنة (Race Condition) في فحص حدود المستخدمين والفروع | احتمال نظري لإنشاء مستخدم إضافي عند الإرسال المتزامن في نفس الجزء من الثانية | تطبيق قفل استشاري للمعاملات `pg_advisory_xact_lock` في مرحلة الـ Hardening |
| **SEC-4.2-C** | **Low** | الكاش لا يتزامن فورياً عبر خوادم متعددة (مقيّد بـ 30 ثانية) | في حالة الـ Multi-Instance، قد يستغرق إلغاء الصلاحيات حتى 30 ثانية كحد أقصى | مقبول جداً للمرحلة الحالية ولا يتطلب تعقيد Redis حالياً |
| **SEC-4.2-D** | **Low** | غياب قيد المفتاح الأجنبي `REFERENCES tenants(id)` في سكريبت الترحيل 011 | احتمال بقاء سجلات يتيمة في حالة مسح الشركة نهائياً | تحديث سكريبت الترحيل قبل اعتماده في بيئة الإنتاج |

---

## 11. التوصية النهائية والجاهزية للمرحلة 4.2.5 (Readiness Recommendation)

> [!TIP]
> **قرار الجاهزية:**
> المعمارية البرمجية لمحرك الصلاحيات اليدوية (Phase 4.2.4) **سليمة، آمنة، محكمة الإغلاق، ومثبتة تجريبياً**.
> مسارات Super Admin تعمل بدون أي تعليق دائري وجاهزة 100% لاستقبال طلبات واجهة المستخدم.
> **نوصي بالاعتماد والمضي قدماً في تنفيذ المرحلة 4.2.5 (ITQAN Platform HUD Frontend Interface)** لبناء واجهات التحكم.
