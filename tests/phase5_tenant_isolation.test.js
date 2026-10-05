const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');

// Save original db methods
const originalDbQuery = db.query;
const originalDbConnect = db.connect;
const originalPoolConnect = db.pool.connect;

test('Phase 5: Tenant Isolation Vulnerability Verification & Fixes', async (t) => {
  t.beforeEach(() => {
    db.query = async () => ({ rows: [] });
  });

  t.afterEach(() => {
    db.query = originalDbQuery;
    db.connect = originalDbConnect;
    db.pool.connect = originalPoolConnect;
  });

  // ---------------------------------------------------------------------------
  // SUITE 1: Deals Controller - updateDealStatus IDOR & Tenant Scoping
  // ---------------------------------------------------------------------------
  await t.test('dealsController.updateDealStatus: enforces tenant isolation across all stages and related updates', async (t2) => {
    const dealsController = require('../controllers/dealsController');

    await t2.test('rejects status update when deal belongs to a different tenant', async () => {
      const mockClient = {
        query: async (sql, params) => {
          if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return { rows: [] };
          if (sql.includes('SELECT title, pipeline_stage, assigned_to FROM deals')) {
            const [idParam, tenantParam] = params;
            if (tenantParam === 'tenant-b') {
              return { rows: [] }; // Tenant B cannot see Tenant A's deal
            }
            return { rows: [{ title: 'Villa A', pipeline_stage: 'lead', assigned_to: 'user-1' }] };
          }
          return { rows: [] };
        },
        release: () => {}
      };
      db.connect = async () => mockClient;

      const req = {
        params: { id: 'deal-tenant-a' },
        body: { pipeline_stage: 'won' },
        user: { id: 'user-b', tenant_id: 'tenant-b', role: 'admin' }
      };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      await dealsController.updateDealStatus(req, res);

      assert.equal(statusCode, 404, 'Must return 404 when tenant tries to update another tenant deal');
      assert.equal(jsonBody.status, 'error');
    });

    await t2.test('rejects status update with invalid pipeline_stage with 400', async () => {
      const req = {
        params: { id: 'deal-1' },
        body: { pipeline_stage: '' },
        user: { id: 'user-a', tenant_id: 'tenant-a', role: 'admin' }
      };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      await dealsController.updateDealStatus(req, res);

      assert.equal(statusCode, 400);
      assert.match(jsonBody.message, /Invalid pipeline_stage/i);
    });

    await t2.test('ensures downstream real estate queries are strictly scoped to req.user.tenant_id', async () => {
      const executedQueries = [];

      const mockClient = {
        query: async (sql, params) => {
          executedQueries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
          if (sql.includes('BEGIN') || sql.includes('COMMIT')) return { rows: [] };

          // 1. SELECT title, pipeline_stage...
          if (sql.includes('SELECT title, pipeline_stage, assigned_to FROM deals')) {
            return { rows: [{ title: 'Unit 101 Deal', pipeline_stage: 'proposal', assigned_to: 'user-a' }] };
          }
          // 2. UPDATE deals SET pipeline_stage...
          if (sql.includes('UPDATE deals SET pipeline_stage')) {
            return { rows: [{ id: 'deal-1', unit_id: 'unit-101', pipeline_stage: 'won', tenant_id: 'tenant-a', branch_id: 'branch-a', value: 1000000 }] };
          }
          // 3. Automation queries
          if (sql.includes('SELECT unit_id FROM deals')) {
            return { rows: [{ unit_id: 'unit-101' }] };
          }
          if (sql.includes('UPDATE re_units SET status = \'Sold\'')) {
            return { rowCount: 1, rows: [] };
          }
          if (sql.includes('SELECT value, tenant_id, branch_id FROM deals')) {
            return { rows: [{ value: 1000000, tenant_id: 'tenant-a', branch_id: 'branch-a' }] };
          }
          if (sql.includes('SELECT id FROM re_payments_mvp')) {
            return { rows: [] };
          }
          if (sql.includes('INSERT INTO re_payments_mvp')) {
            return { rows: [] };
          }
          return { rows: [] };
        },
        release: () => {}
      };
      db.connect = async () => mockClient;

      const req = {
        params: { id: 'deal-1' },
        body: { pipeline_stage: 'won' },
        user: { id: 'user-a', tenant_id: 'tenant-a', role: 'admin' },
        branchId: 'branch-a'
      };

      let statusCode = 200;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        },
        json: (data) => { jsonBody = data; }
      };

      await dealsController.updateDealStatus(req, res);

      // Verify that every single query executed in this flow contains tenant scoping
      for (const q of executedQueries) {
        if (q.sql.includes('deals') || q.sql.includes('re_units') || q.sql.includes('re_payments_mvp')) {
          const hasTenantScope = q.sql.includes('tenant_id') || q.params.includes('tenant-a');
          assert.equal(
            hasTenantScope,
            true,
            `Query must be scoped by tenant_id. Offending query: "${q.sql}" with params: ${JSON.stringify(q.params)}`
          );
        }
      }
    });

    await t2.test('rolls back entire transaction if unit status update fails', async () => {
      let rollbackExecuted = false;

      const mockClient = {
        query: async (sql, params) => {
          if (sql.includes('BEGIN')) return { rows: [] };
          if (sql.includes('ROLLBACK')) {
            rollbackExecuted = true;
            return { rows: [] };
          }
          if (sql.includes('SELECT title, pipeline_stage, assigned_to FROM deals')) {
            return { rows: [{ title: 'Villa 101', pipeline_stage: 'proposal', assigned_to: 'user-1' }] };
          }
          if (sql.includes('UPDATE deals SET pipeline_stage')) {
            return { rows: [{ id: 'deal-fail', pipeline_stage: 'won', tenant_id: 'tenant-a' }] };
          }
          if (sql.includes('SELECT unit_id FROM deals')) {
            return { rows: [{ unit_id: 'unit-locked-99' }] };
          }
          if (sql.includes('UPDATE re_units')) {
            throw new Error('Simulated unit update deadlock or DB lock error');
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.connect = async () => mockClient;

      const req = {
        params: { id: 'deal-fail' },
        body: { pipeline_stage: 'won' },
        user: { id: 'user-a', tenant_id: 'tenant-a', role: 'admin' }
      };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      await dealsController.updateDealStatus(req, res);

      assert.equal(statusCode, 500);
      assert.equal(rollbackExecuted, true, 'Transaction must execute ROLLBACK on unit automation error');
    });

    await t2.test('updateDealStatus lost: does not release unit if another active deal references it', async () => {
      let unitUpdated = false;

      const mockClient = {
        query: async (sql, params) => {
          if (sql.includes('BEGIN') || sql.includes('COMMIT')) return { rows: [] };
          if (sql.includes('SELECT title, pipeline_stage, assigned_to FROM deals')) {
            return { rows: [{ title: 'Unit 202 Deal A', pipeline_stage: 'proposal', assigned_to: 'user-1' }] };
          }
          if (sql.includes('UPDATE deals SET pipeline_stage')) {
            return { rows: [{ id: 'deal-a', pipeline_stage: 'lost' }] };
          }
          if (sql.includes('SELECT unit_id FROM deals WHERE id = $1')) {
            return { rows: [{ unit_id: 'unit-202' }] };
          }
          // Active deals query: returns another active deal B on the same unit
          if (sql.includes('FROM deals') && sql.includes('unit_id::text = $1::text')) {
            return { rows: [{ id: 'deal-b' }] };
          }
          if (sql.includes('UPDATE re_units SET status = \'Available\'')) {
            unitUpdated = true;
            return { rows: [] };
          }
          return { rows: [] };
        },
        release: () => {}
      };
      db.connect = async () => mockClient;

      const req = {
        params: { id: 'deal-a' },
        body: { pipeline_stage: 'lost' },
        user: { id: 'user-1', tenant_id: 'tenant-1', role: 'admin' }
      };

      let statusCode = 200;
      let jsonBody = null;
      const res = {
        status: (code) => { statusCode = code; return { json: (d) => { jsonBody = d; } }; },
        json: (d) => { jsonBody = d; }
      };

      await dealsController.updateDealStatus(req, res);

      assert.equal(unitUpdated, false, 'Unit must NOT be set to Available if another active deal references it');
    });

    await t2.test('updateDealStatus closed: does NOT mark unit Sold or create re_payments_mvp', async () => {
      let unitMarkedSold = false;
      let paymentInserted = false;

      const mockClient = {
        query: async (sql, params) => {
          if (sql.includes('BEGIN') || sql.includes('COMMIT')) return { rows: [] };
          if (sql.includes('SELECT title, pipeline_stage, assigned_to FROM deals')) {
            return { rows: [{ title: 'Unit 303 Deal', pipeline_stage: 'proposal', assigned_to: 'user-1' }] };
          }
          if (sql.includes('UPDATE deals SET pipeline_stage')) {
            return { rows: [{ id: 'deal-closed-1', pipeline_stage: 'Closed' }] };
          }
          if (sql.includes('SELECT unit_id FROM deals WHERE id = $1')) {
            return { rows: [{ unit_id: 'unit-303' }] };
          }
          if (sql.includes('UPDATE re_units SET status = \'Sold\'')) {
            unitMarkedSold = true;
            return { rows: [] };
          }
          if (sql.includes('INSERT INTO re_payments_mvp')) {
            paymentInserted = true;
            return { rows: [] };
          }
          return { rows: [] };
        },
        release: () => {}
      };
      db.connect = async () => mockClient;

      for (const stageVal of ['Closed', 'closed']) {
        unitMarkedSold = false;
        paymentInserted = false;

        const req = {
          params: { id: 'deal-closed-1' },
          body: { pipeline_stage: stageVal },
          user: { id: 'user-1', tenant_id: 'tenant-1', role: 'admin' }
        };

        const res = {
          status: () => ({ json: () => {} }),
          json: () => {}
        };

        await dealsController.updateDealStatus(req, res);

        assert.equal(unitMarkedSold, false, `Stage '${stageVal}' must NOT mark unit as Sold`);
        assert.equal(paymentInserted, false, `Stage '${stageVal}' must NOT insert into re_payments_mvp`);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // SUITE 2: Meta Controller - createMetaForm Branch-Tenant Reassignment Prevention
  // ---------------------------------------------------------------------------
  await t.test('metaController.createMetaForm: prevents cross-tenant branch hijacking', async (t2) => {
    const metaController = require('../controllers/metaController');

    await t2.test('rejects branch belonging to a foreign tenant with 403', async () => {
      db.query = async (sql, params) => {
        // Branch verification query
        if (sql.includes('FROM branches WHERE id::text')) {
          // If query checks both id AND tenant_id:
          if (sql.includes('tenant_id')) {
            return { rows: [] }; // Foreign branch not found for this tenant
          }
          // If query only checks id (the vulnerable state): returns foreign tenant
          return { rows: [{ tenant_id: 'foreign-tenant-99' }] };
        }
        return { rows: [] };
      };

      const req = {
        body: {
          form_id: 'form-12345',
          form_name: 'Contact Lead Form',
          branch_id: 'foreign-branch-88'
        },
        user: { id: 'attacker-1', tenant_id: 'attacker-tenant' }
      };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      await metaController.createMetaForm(req, res);

      assert.equal(statusCode, 403, 'Must return 403 when user specifies a branch belonging to another tenant');
      assert.match(jsonBody.message, /branch/i);
    });

    await t2.test('does NOT reassign tenant_id to foreign branch tenant_id', async () => {
      let insertedTenantId = null;

      db.query = async (sql, params) => {
        if (sql.includes('FROM branches WHERE id::text')) {
          // Properly scoped check returns matching row for attacker tenant
          if (sql.includes('tenant_id')) {
            return { rows: [{ id: 'my-branch-1', tenant_id: 'attacker-tenant' }] };
          }
          return { rows: [{ tenant_id: 'foreign-tenant-99' }] };
        }
        if (sql.includes('FROM meta_forms WHERE form_id = $1')) {
          return { rows: [] }; // No existing form
        }
        if (sql.includes('INSERT INTO meta_forms')) {
          // params[6] is tenant_id ($7)
          insertedTenantId = params[6];
          return { rows: [{ id: 1, form_id: 'form-12345', tenant_id: insertedTenantId }] };
        }
        return { rows: [] };
      };

      const req = {
        body: {
          form_id: 'form-12345',
          form_name: 'Contact Lead Form',
          branch_id: 'my-branch-1'
        },
        user: { id: 'attacker-1', tenant_id: 'attacker-tenant' }
      };

      let statusCode = 200;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        },
        json: (data) => { jsonBody = data; }
      };

      await metaController.createMetaForm(req, res);

      assert.equal(insertedTenantId, 'attacker-tenant', 'Inserted tenant_id must remain authenticated user tenant');
    });
  });

  // ---------------------------------------------------------------------------
  // SUITE 3: Accounting Controller - Tenant Isolation on Payments & Expenses
  // ---------------------------------------------------------------------------
  await t.test('accountingController: enforces tenant_id on getProfitLoss and getSummaryByCategories', async (t2) => {
    const accountingController = require('../controllers/accountingController');

    await t2.test('getProfitLoss queries payments and expenses with tenant_id filter', async () => {
      const executedQueries = [];

      db.query = async (sql, params) => {
        executedQueries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
        if (sql.includes('payments')) {
          return { rows: [{ total_income: '5000' }] };
        }
        if (sql.includes('expenses')) {
          return { rows: [{ total_expenses: '2000' }] };
        }
        return { rows: [] };
      };

      const req = {
        query: { startDate: '2026-01-01', endDate: '2026-01-31' },
        user: { id: 'user-1', tenant_id: 'tenant-secure-123' }
      };

      let jsonBody = null;
      const res = {
        json: (data) => { jsonBody = data; },
        status: () => ({ json: () => {} })
      };

      await accountingController.getProfitLoss(req, res);

      assert.equal(jsonBody.status, 'success');
      assert.equal(jsonBody.data.net_profit, 3000);

      // Verify tenant_id in both queries
      for (const q of executedQueries) {
        assert.equal(
          q.sql.includes('tenant_id'),
          true,
          `Accounting query must filter by tenant_id. Got: "${q.sql}"`
        );
        assert.equal(
          q.params.includes('tenant-secure-123'),
          true,
          `Parameters must include user's tenant_id. Got: ${JSON.stringify(q.params)}`
        );
      }
    });

    await t2.test('getSummaryByCategories filters expenses by tenant_id', async () => {
      const executedQueries = [];

      db.query = async (sql, params) => {
        executedQueries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
        return { rows: [{ category: 'Office', total: '1500' }] };
      };

      const req = {
        query: {},
        user: { id: 'user-1', tenant_id: 'tenant-secure-123' }
      };

      let jsonBody = null;
      const res = {
        json: (data) => { jsonBody = data; },
        status: () => ({ json: () => {} })
      };

      await accountingController.getSummaryByCategories(req, res);

      assert.equal(jsonBody.status, 'success');
      assert.equal(executedQueries.length, 1);
      assert.equal(
        executedQueries[0].sql.includes('tenant_id'),
        true,
        `Summary by category query must filter by tenant_id. Got: "${executedQueries[0].sql}"`
      );
      assert.equal(
        executedQueries[0].params.includes('tenant-secure-123'),
        true,
        `Parameters must include user's tenant_id. Got: ${JSON.stringify(executedQueries[0].params)}`
      );
    });
  });

  // ---------------------------------------------------------------------------
  // SUITE 4: Invoices Controller - addPayment Atomic Transaction & Isolation
  // ---------------------------------------------------------------------------
  await t.test('invoicesController.addPayment: atomic transaction, voucher linkage & tenant isolation', async (t2) => {
    const invoicesController = require('../controllers/invoicesController');

    await t2.test('rejects cross-tenant payment attempt with 404', async () => {
      let rollbackCalled = false;
      const mockClient = {
        query: async (sql, params) => {
          if (sql.includes('BEGIN')) return { rows: [] };
          if (sql.includes('ROLLBACK')) { rollbackCalled = true; return { rows: [] }; }
          if (sql.includes('FROM invoices') && sql.includes('FOR UPDATE')) {
            const tenantParam = params[1];
            if (tenantParam === 'tenant-b') {
              return { rows: [] }; // Tenant B cannot see Tenant A invoice
            }
            return { rows: [{ id: 10, invoice_number: 'INV-001', total_amount: '500' }] };
          }
          return { rows: [] };
        },
        release: () => {}
      };
      db.connect = async () => mockClient;

      const req = {
        params: { id: '10' },
        body: { amount: 200, payment_method: 'cash' },
        user: { id: 'user-b', tenant_id: 'tenant-b', role: 'admin' }
      };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      await invoicesController.addPayment(req, res);

      assert.equal(statusCode, 404);
      assert.equal(rollbackCalled, true);
    });

    await t2.test('rolls back transaction and releases client if voucher or payment insert fails', async () => {
      let rollbackCalled = false;
      let released = false;

      const mockClient = {
        query: async (sql, params) => {
          if (sql.includes('BEGIN')) return { rows: [] };
          if (sql.includes('ROLLBACK')) { rollbackCalled = true; return { rows: [] }; }
          if (sql.includes('FROM invoices') && sql.includes('FOR UPDATE')) {
            return { rows: [{ id: 10, invoice_number: 'INV-001', total_amount: '500', client_id: 'c-1' }] };
          }
          if (sql.includes('SELECT COALESCE(SUM(amount)')) {
            return { rows: [{ paid: '0.00' }] };
          }
          if (sql.includes('SELECT') && sql.includes('finance_vouchers')) {
            return { rows: [{ vnum: 'REC-00005' }] };
          }
          if (sql.includes('INSERT INTO finance_vouchers')) {
            throw new Error('Simulated DB voucher constraint error');
          }
          return { rows: [] };
        },
        release: () => { released = true; }
      };
      db.connect = async () => mockClient;

      const req = {
        params: { id: '10' },
        body: { amount: 200, payment_method: 'cash' },
        user: { id: 'user-a', tenant_id: 'tenant-a', role: 'admin' }
      };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      await invoicesController.addPayment(req, res);

      assert.equal(statusCode, 500);
      assert.equal(rollbackCalled, true);
      assert.equal(released, true);
      assert.match(jsonBody.message, /Simulated DB voucher constraint error/i);
    });

    await t2.test('successfully executes payment + voucher + status update in atomic transaction with customer name and lock', async () => {
      let commitCalled = false;
      let released = false;
      let insertedPartyName = null;
      let lockQueryExecuted = false;
      let lockIndex = -1;
      let sequenceIndex = -1;
      const executed = [];

      const mockClient = {
        query: async (sql, params) => {
          executed.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
          if (sql.includes('BEGIN')) return { rows: [] };
          if (sql.includes('COMMIT')) { commitCalled = true; return { rows: [] }; }
          if (sql.includes('pg_advisory_xact_lock')) {
            lockQueryExecuted = true;
            lockIndex = executed.length - 1;
            return { rows: [] };
          }
          if (sql.includes('FROM invoices') && sql.includes('FOR UPDATE')) {
            return { rows: [{ id: 10, invoice_number: 'INV-001', total_amount: '500', client_id: 'cust-42' }] };
          }
          if (sql.includes('SELECT COALESCE(SUM(amount)')) {
            return { rows: [{ paid: '0.00' }] };
          }
          if (sql.includes('SELECT voucher_number FROM finance_vouchers')) {
            sequenceIndex = executed.length - 1;
            return { rows: [{ voucher_number: 'RV-0005' }] };
          }
          if (sql.includes('SELECT name FROM customers')) {
            return { rows: [{ name: 'Al-Amal Enterprise' }] };
          }
          if (sql.includes('INSERT INTO finance_vouchers')) {
            insertedPartyName = params[1]; // party_name parameter
            return { rows: [{ id: 77, voucher_number: 'RV-0006' }] };
          }
          if (sql.includes('INSERT INTO payments')) {
            return { rows: [{ id: 88, invoice_id: 10, amount: 200, voucher_id: 77, status: 'active' }] };
          }
          if (sql.includes('UPDATE invoices SET status')) {
            return { rows: [] };
          }
          return { rows: [] };
        },
        release: () => { released = true; }
      };
      db.connect = async () => mockClient;

      const req = {
        params: { id: '10' },
        body: { amount: 200, payment_method: 'bank_transfer', notes: 'Installment 1' },
        user: { id: 'user-a', tenant_id: 'tenant-a', role: 'admin' }
      };

      let responseBody = null;
      const res = {
        json: (data) => { responseBody = data; }
      };

      await invoicesController.addPayment(req, res);

      assert.equal(commitCalled, true);
      assert.equal(released, true);
      assert.equal(responseBody.status, 'success');
      assert.equal(responseBody.invoiceStatus, 'partial');
      assert.equal(responseBody.data.voucher_id, 77);
      assert.equal(insertedPartyName, 'Al-Amal Enterprise', 'Voucher party_name must be real customer name from DB');
      assert.equal(lockQueryExecuted, true, 'Advisory lock query must be executed');
      assert.ok(lockIndex < sequenceIndex, 'Advisory lock must be acquired BEFORE reading sequence');

      // Verify tenant isolation on all queries
      for (const q of executed) {
        if (q.sql.includes('invoices') || q.sql.includes('finance_vouchers') || q.sql.includes('payments') || q.sql.includes('customers')) {
          const hasTenant = q.sql.includes('tenant_id') || (q.params && q.params.includes('tenant-a'));
          assert.equal(hasTenant, true, `Query missing tenant scoping: ${q.sql}`);
        }
      }
    });

    await t2.test('rejects overpayment exceeding remaining invoice balance with 400', async () => {
      let rollbackCalled = false;
      let released = false;

      const mockClient = {
        query: async (sql, params) => {
          if (sql.includes('BEGIN')) return { rows: [] };
          if (sql.includes('ROLLBACK')) { rollbackCalled = true; return { rows: [] }; }
          if (sql.includes('FROM invoices') && sql.includes('FOR UPDATE')) {
            // Invoice total: 500
            return { rows: [{ id: 10, invoice_number: 'INV-001', total_amount: '500', client_id: 'c-1' }] };
          }
          if (sql.includes('SELECT COALESCE(SUM(amount)')) {
            // Already paid: 400. Remaining: 100
            return { rows: [{ paid: '400.00' }] };
          }
          return { rows: [] };
        },
        release: () => { released = true; }
      };
      db.connect = async () => mockClient;

      // Attempt to pay 200 when remaining is only 100
      const req = {
        params: { id: '10' },
        body: { amount: 200, payment_method: 'cash' },
        user: { id: 'user-a', tenant_id: 'tenant-a', role: 'admin' }
      };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      await invoicesController.addPayment(req, res);

      assert.equal(statusCode, 400);
      assert.equal(rollbackCalled, true);
      assert.equal(released, true);
      assert.match(jsonBody.message, /exceeds remaining invoice balance/i);
    });
  });

  await t.test('Voucher Numbering: reInstallmentsController & purchasesController invoke shared numbering with active transaction client', async (t2) => {
    const reInstallmentsController = require('../controllers/reInstallmentsController');
    const purchasesController = require('../controllers/purchasesController');

    await t2.test('reInstallmentsController.recordPayment generates voucher number using client and advisory lock', async () => {
      let commitCalled = false;
      let released = false;
      let advisoryLockCalled = false;
      let lockIndex = -1;
      let seqIndex = -1;
      let insertedVoucherNum = null;
      const executed = [];

      const mockClient = {
        query: async (sql, params) => {
          executed.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
          if (sql.includes('BEGIN')) return { rows: [] };
          if (sql.includes('COMMIT')) { commitCalled = true; return { rows: [] }; }
          if (sql.includes('pg_advisory_xact_lock')) {
            advisoryLockCalled = true;
            lockIndex = executed.length - 1;
            return { rows: [] };
          }
          if (sql.includes('FROM re_installments') && sql.includes('FOR UPDATE')) {
            return {
              rows: [{
                id: 55,
                installment_number: 1,
                amount: '1000.00',
                paid_amount: '0.00',
                deal_id: 101,
                contract_id: 202,
                tenant_id: 'tenant-re'
              }]
            };
          }
          if (sql.includes('FROM deals')) {
            return { rows: [{ id: 101, customer_name: 'RE Buyer', client_id: 888 }] };
          }
          if (sql.includes('SELECT voucher_number FROM finance_vouchers')) {
            seqIndex = executed.length - 1;
            return { rows: [{ voucher_number: 'RV-0010' }] };
          }
          if (sql.includes('INSERT INTO finance_vouchers')) {
            insertedVoucherNum = params[0];
            return { rows: [{ id: 999, voucher_number: params[0] }] };
          }
          if (sql.includes('UPDATE re_installments')) {
            return {
              rows: [{
                id: 55,
                installment_number: 1,
                amount: '1000.00',
                paid_amount: '500.00',
                status: 'partially_paid',
                last_voucher_id: 999
              }]
            };
          }
          if (sql.includes('UPDATE re_payments_mvp')) return { rows: [] };
          return { rows: [] };
        },
        release: () => { released = true; }
      };

      db.connect = async () => mockClient;
      if (db.pool) db.pool.connect = async () => mockClient;

      const req = {
        params: { id: '55' },
        body: { amount: 500, payment_method: 'bank_transfer', notes: 'Inst 1 payment' },
        user: { id: 'agent-1', tenant_id: 'tenant-re' }
      };

      let jsonResponse = null;
      let statusCode = 200;
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (d) => { jsonResponse = d; }
          };
        },
        json: (d) => { jsonResponse = d; }
      };

      await reInstallmentsController.recordPayment(req, res);

      assert.equal(commitCalled, true);
      assert.equal(released, true);
      assert.equal(advisoryLockCalled, true, 'pg_advisory_xact_lock must be invoked for safe numbering');
      assert.ok(lockIndex < seqIndex, 'Advisory lock must be acquired before sequence check');
      assert.equal(insertedVoucherNum, 'RV-0011', 'Next voucher number must be computed and used');
      assert.equal(jsonResponse.status, 'success');
      assert.equal(jsonResponse.data.last_voucher_id, 999);
    });

    await t2.test('purchasesController.recordVendorPayment generates voucher number using client and advisory lock', async () => {
      let commitCalled = false;
      let released = false;
      let advisoryLockCalled = false;
      let lockIndex = -1;
      let seqIndex = -1;
      let insertedVoucherNum = null;
      let insertedVoucherType = null;
      const executed = [];

      const mockClient = {
        query: async (sql, params) => {
          executed.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
          if (sql.includes('BEGIN')) return { rows: [] };
          if (sql.includes('COMMIT')) { commitCalled = true; return { rows: [] }; }
          if (sql.includes('pg_advisory_xact_lock')) {
            advisoryLockCalled = true;
            lockIndex = executed.length - 1;
            return { rows: [] };
          }
          if (sql.includes('FROM vendors')) {
            return { rows: [{ id: 44, name: 'Main Supplier' }] };
          }
          if (sql.includes('FROM treasury_accounts')) {
            return { rows: [{ id: 12 }] };
          }
          if (sql.includes('SELECT voucher_number FROM finance_vouchers')) {
            seqIndex = executed.length - 1;
            return { rows: [{ voucher_number: 'PV-0003' }] };
          }
          if (sql.includes('INSERT INTO finance_vouchers')) {
            insertedVoucherNum = params[0];
            insertedVoucherType = 'payment';
            return { rows: [{ id: 777, voucher_number: params[0], voucher_type: 'payment' }] };
          }
          return { rows: [] };
        },
        release: () => { released = true; }
      };

      db.connect = async () => mockClient;
      if (db.pool) db.pool.connect = async () => mockClient;

      const req = {
        params: { id: '44' },
        body: { amount: 1500, payment_method: 'cash', notes: 'Supplier settlement' },
        user: { id: 'buyer-1', tenant_id: 'tenant-gen' }
      };

      let jsonResponse = null;
      let statusCode = 200;
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (d) => { jsonResponse = d; }
          };
        },
        json: (d) => { jsonResponse = d; }
      };

      await purchasesController.recordVendorPayment(req, res);

      assert.equal(commitCalled, true);
      assert.equal(released, true);
      assert.equal(advisoryLockCalled, true, 'pg_advisory_xact_lock must be invoked for safe numbering');
      assert.ok(lockIndex < seqIndex, 'Advisory lock must be acquired before sequence check');
      assert.equal(insertedVoucherNum, 'PV-0004', 'Payment voucher sequence PV-0004 must be computed and used');
      assert.equal(insertedVoucherType, 'payment');
      assert.equal(jsonResponse.status, 'success');
      assert.equal(jsonResponse.data.id, 777);
    });
  });
});

