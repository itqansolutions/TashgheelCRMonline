# Tashgheel CRM Online — Real Estate Module
# Application Controller Integration Test Report

**Document Reference:** `RE-APPLICATION-INTEGRATION-REPORT.md`  
**Date:** November 21, 2026  
**Auditor / Engineering Lead:** Real Estate Engineering & Platform Core Team  
**Branch:** `fix/real-estate-lifecycle-audit`  
**Test Suite Path:** `tests/re_application_controller_integration.test.js`  
**Execution Environment:** Node.js v24.19.0 / PostgreSQL 18.6  
**Status:** **100% PASSING (All Controller Invocations Verified)**  

---

## 1. Distinction: Direct SQL Verification vs Application Controller Integration

To provide total clarity requested by engineering leadership, our verification methodology separates direct engine semantics from actual application code execution:

| Layer | Test Suite | Methodology | What It Proves |
| :--- | :--- | :--- | :--- |
| **Layer 1: Engine SQL Semantics** | `tests/re_postgres_live_verification.test.js` | Direct PostgreSQL client queries (`client.query`) | Proves SQL grammar, SQLSTATE `0A000` reproduction, AST row-locking (`FOR UPDATE OF rc`), and OS-level client connection blocking. |
| **Layer 2: Application Controller Integration** | `tests/re_application_controller_integration.test.js` | **Direct invocation of actual Express controller handlers** (`req`, `res`) | Proves the actual JavaScript controller code, input parsing, validation guards, advisory locking, database transactions, and HTTP responses. |

---

## 2. Test Execution Output

```text
◇ injected env (4) from .env
Connected to PostgreSQL
▶ Real Application Controller Integration Suite
  ✔ 1. reInstallmentsController.generateSchedule executes real transaction, locks rc, and creates installments in database (2192.7544ms)
  ✔ 2. reHandoversController.updateHandoverStatus executes real transaction with FOR UPDATE OF rh and updates status (718.8062ms)
  ✔ 3. dealsController.reserveDealUnit handles simultaneous concurrent requests: exactly one wins (200), loser gets 409 UNIT_NOT_AVAILABLE (7670.0623ms)
  ✔ 4. reInstallmentsController.generateSchedule rolls back cleanly and returns 400 when contract is already completed (828.9479ms)
✔ Real Application Controller Integration Suite (15882.526ms)
ℹ tests 4
ℹ suites 1
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 46074.8115
```

---

## 3. Test-by-Test Deep Dive: Actual Controller Handlers

### Test 1: `reInstallmentsController.generateSchedule`
- **Controller File:** [`controllers/reInstallmentsController.js`](file:///d:/Tashgheel%20CRM%20Online/controllers/reInstallmentsController.js) (Lines 140–340)
- **Invocation Code:**
  ```javascript
  const req = {
      user: { id: testUserId, tenant_id: TEST_TENANT_ID, role: 'admin' },
      body: {
          contract_id: testContractId,
          down_payment: 200000,
          number_of_installments: 4,
          frequency: 'quarterly',
          start_date: '2026-12-01'
      }
  };
  const res = createMockRes();
  await installmentsController.generateSchedule(req, res);
  ```
- **Observed Behavior:**
  1. The controller acquired connection from `config/db.js` and began a transaction.
  2. The controller acquired advisory lock `pg_advisory_xact_lock(hashtext('generate_schedule_' || $1))`.
  3. The controller executed the remediated query: `SELECT rc.*, d.pipeline_stage FROM re_contracts rc LEFT JOIN deals d ON rc.deal_id = d.id WHERE rc.id = $1 AND rc.tenant_id::text = $2::text FOR UPDATE OF rc`.
  4. The controller generated Down Payment Installment #0 (200,000 EGP) and 4 quarterly installments #1..4 (200,000 EGP each).
  5. The controller updated `re_contracts`: `down_payment = 200000`, `remaining_amount = 800000`.
  6. The controller committed the transaction and responded with **HTTP 201 Created**:
     ```json
     {
       "status": "success",
       "message": "Generated schedule of 4 installment(s).",
       "data": [
         { "installment_number": 0, "amount": 200000, "installment_type": "down_payment", "status": "Pending" },
         { "installment_number": 1, "amount": 200000, "installment_type": "installment", "status": "Pending" },
         { "installment_number": 2, "amount": 200000, "installment_type": "installment", "status": "Pending" },
         { "installment_number": 3, "amount": 200000, "installment_type": "installment", "status": "Pending" },
         { "installment_number": 4, "amount": 200000, "installment_type": "installment", "status": "Pending" }
       ]
     }
     ```
  7. Verification in database confirmed 5 records created with a total sum of **1,000,000 EGP**.
- **Result:** **PASS.**

---

### Test 2: `reHandoversController.updateHandoverStatus`
- **Controller File:** [`controllers/reHandoversController.js`](file:///d:/Tashgheel%20CRM%20Online/controllers/reHandoversController.js) (Lines 190–290)
- **Invocation Code:**
  ```javascript
  const req = {
      user: { id: testUserId, tenant_id: TEST_TENANT_ID, role: 'admin' },
      params: { id: testHandoverId },
      body: { status: 'Inspection' }
  };
  const res = createMockRes();
  await handoversController.updateHandoverStatus(req, res);
  ```
- **Observed Behavior:**
  1. The controller acquired connection and began transaction.
  2. The controller executed `SELECT rh.*, d.pipeline_stage FROM re_handovers rh LEFT JOIN deals d ON rh.deal_id = d.id WHERE rh.id = $1 AND rh.tenant_id::text = $2::text FOR UPDATE OF rh`.
  3. The lock succeeded without PostgreSQL `0A000` outer-join error.
  4. The controller updated `re_handovers` status to `'Inspection'`, populated `inspection_started_at`, committed transaction, and responded with **HTTP 200 OK**:
     ```json
     {
       "status": "success",
       "data": { "id": "...", "status": "Inspection" },
       "message": "Handover status updated to Inspection"
     }
     ```
  5. Verification in database confirmed `status = 'Inspection'`.
- **Result:** **PASS.**

---

### Test 3: `dealsController.reserveDealUnit` Concurrency
- **Controller File:** [`controllers/dealsController.js`](file:///d:/Tashgheel%20CRM%20Online/controllers/dealsController.js) (Lines 1320–1427)
- **Invocation Code:**
  ```javascript
  const req1 = { user: { id: testUserId, tenant_id: TEST_TENANT_ID, role: 'agent' }, params: { id: testDeal2022Id }, body: {} };
  const res1 = createMockRes();

  const req2 = { user: { id: testUserId, tenant_id: TEST_TENANT_ID, role: 'agent' }, params: { id: testDeal2023Id }, body: {} };
  const res2 = createMockRes();

  // Fire both controller invocations simultaneously
  await Promise.all([
      dealsController.reserveDealUnit(req1, res1),
      dealsController.reserveDealUnit(req2, res2)
  ]);
  ```
- **Observed Behavior:**
  1. Both controller handlers opened separate connection pool clients and started transactions.
  2. Both controller handlers reached `SELECT * FROM re_units WHERE id = $1 FOR UPDATE`.
  3. PostgreSQL serialized the two requests:
     - Request 1 was granted the lock, verified unit is `'Available'`, updated status to `'Reserved'`, updated deal custom fields, committed, and returned **HTTP 200 OK**:
       ```json
       {
         "status": "success",
         "message": "Unit reserved successfully."
       }
       ```
     - Request 2 unblocked after Request 1 committed, read the updated status `'Reserved'`, entered lines 1349-1356 (`if (uStatus !== 'available')`), executed `ROLLBACK`, and returned **HTTP 409 Conflict**:
       ```json
       {
         "status": "error",
         "code": "UNIT_NOT_AVAILABLE",
         "message": "This unit is already Reserved. Only an Available unit can be reserved."
       }
       ```
- **Result:** **PASS.** The actual application controller guarantees concurrency safety.

---

### Test 4: Controller Transaction Rollback on Blocked Contract State
- **Controller File:** [`controllers/reInstallmentsController.js`](file:///d:/Tashgheel%20CRM%20Online/controllers/reInstallmentsController.js) (Lines 170–180)
- **Invocation Code:**
  ```javascript
  await db.query(`UPDATE re_contracts SET status = 'Completed' WHERE id = $1`, [testContractId]);
  const req = {
      user: { id: testUserId, tenant_id: TEST_TENANT_ID, role: 'admin' },
      body: { contract_id: testContractId, number_of_installments: 4 }
  };
  const res = createMockRes();
  await installmentsController.generateSchedule(req, res);
  ```
- **Observed Behavior:**
  1. The controller evaluated contract status: found `'Completed'`.
  2. The controller executed `await client.query('ROLLBACK')`.
  3. The controller returned **HTTP 400 Bad Request**:
     ```json
     {
       "status": "error",
       "message": "Cannot generate or reschedule installments for a contract in 'Completed' status."
     }
     ```
  4. Database check verified 0 new installments created.
- **Result:** **PASS.**

---

## 4. Final Integration Verification Verdict

The application controllers themselves—not just raw SQL scripts—have been fully verified against PostgreSQL:
1. **`reInstallmentsController.generateSchedule`:** Works end-to-end with row locks, down payments, and schedule math.
2. **`reHandoversController.updateHandoverStatus`:** Works end-to-end with row locks during milestone progression.
3. **`dealsController.reserveDealUnit`:** Protects against concurrent conflicting reservations, returning HTTP 409.
4. **Error & Rollback Handling:** Rollbacks cleanly and returns user-safe responses.
