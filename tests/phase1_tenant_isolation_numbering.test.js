const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');

// Original db handles
const originalDbQuery = db.query;
const originalDbConnect = db.connect;
const originalPool = db.pool;

test('Phase 1: Tenant Isolation & Document Numbering (Unit Regression Suite)', async (t) => {
  t.beforeEach(() => {
    db.query = async () => ({ rows: [] });
  });

  t.afterEach(() => {
    db.query = originalDbQuery;
    db.connect = originalDbConnect;
    db.pool = originalPool;
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 1: Quotations - DocumentSequencer and Cross-Tenant Validation
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test('Quotations Controller - Tenant Isolation & Numbering', async (t2) => {
    const quotationsController = require('../controllers/quotationsController');

    await t2.test('rejects creation when client_id belongs to another tenant', async () => {
      let rollbackCalled = false;
      const mockClient = {
        query: async (sql, params) => {
          if (sql === 'BEGIN') return { rows: [] };
          if (sql === 'ROLLBACK') {
            rollbackCalled = true;
            return { rows: [] };
          }
          if (sql.includes('FROM customers WHERE id = $1')) {
            // Customer does not exist under tenant-b
            return { rows: [] };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.pool = { connect: async () => mockClient };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      await quotationsController.createQuotation({
        body: { client_id: 101, total_amount: 5000 },
        user: { tenant_id: 'tenant-b', branch_id: 'branch-1' }
      }, res);

      assert.equal(statusCode, 400);
      assert.match(jsonBody.message, /Client not found or belongs to another tenant/);
      assert.equal(rollbackCalled, true, 'Must rollback on cross-tenant client rejection');
    });

    await t2.test('rejects creation when deal client does not match quotation client (Relational Inconsistency)', async () => {
      let rollbackCalled = false;
      const mockClient = {
        query: async (sql, params) => {
          if (sql === 'BEGIN') return { rows: [] };
          if (sql === 'ROLLBACK') {
            rollbackCalled = true;
            return { rows: [] };
          }
          if (sql.includes('FROM customers WHERE id = $1')) {
            return { rows: [{ id: 101 }] };
          }
          if (sql.includes('FROM deals WHERE id = $1')) {
            // Deal belongs to tenant-a, but associated with a different customer (client_id: 999)
            return { rows: [{ id: 202, client_id: 999 }] };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.pool = { connect: async () => mockClient };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      await quotationsController.createQuotation({
        body: { client_id: 101, deal_id: 202, total_amount: 5000 },
        user: { tenant_id: 'tenant-a', branch_id: 'branch-1' }
      }, res);

      assert.equal(statusCode, 400);
      assert.match(jsonBody.message, /Deal client does not match the quotation client/);
      assert.equal(rollbackCalled, true);
    });

    await t2.test('rejects creation when Real Estate unit_id belongs to another tenant', async () => {
      let rollbackCalled = false;
      const mockClient = {
        query: async (sql, params) => {
          if (sql === 'BEGIN') return { rows: [] };
          if (sql === 'ROLLBACK') {
            rollbackCalled = true;
            return { rows: [] };
          }
          if (sql.includes('FROM re_units WHERE')) {
            return { rows: [] }; // Unit not found for tenant
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.pool = { connect: async () => mockClient };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      await quotationsController.createQuotation({
        body: { unit_id: 'foreign-unit-uuid', total_amount: 1500000 },
        user: { tenant_id: 'tenant-a', branch_id: 'branch-1' }
      }, res);

      assert.equal(statusCode, 400);
      assert.match(jsonBody.message, /Unit not found or belongs to another tenant/);
      assert.equal(rollbackCalled, true);
    });

    await t2.test('rejects creation when General product_id belongs to another tenant', async () => {
      let rollbackCalled = false;
      const mockClient = {
        query: async (sql, params) => {
          if (sql === 'BEGIN') return { rows: [] };
          if (sql === 'ROLLBACK') {
            rollbackCalled = true;
            return { rows: [] };
          }
          if (sql.includes('FROM products WHERE id = ANY')) {
            // One product returned instead of 2
            return { rows: [{ id: 1 }] };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.pool = { connect: async () => mockClient };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      await quotationsController.createQuotation({
        body: {
          items: [
            { product_id: 1, quantity: 2, unit_price: 100 },
            { product_id: 999, quantity: 1, unit_price: 200 } // foreign product
          ]
        },
        user: { tenant_id: 'tenant-a', branch_id: 'branch-1' }
      }, res);

      assert.equal(statusCode, 400);
      assert.match(jsonBody.message, /One or more products not found or belong to another tenant/);
      assert.equal(rollbackCalled, true);
    });

    await t2.test('creates quotation with DocumentSequencer number (QUO-YYYY-XXXXX) for valid tenant entities', async () => {
      let insertedNumber = null;
      const mockClient = {
        query: async (sql, params) => {
          if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
          if (sql.includes('FROM customers WHERE id = $1')) return { rows: [{ id: 101 }] };
          if (sql.includes('FROM deals WHERE id = $1')) return { rows: [{ id: 202, client_id: 101 }] };
          if (sql.includes('FROM products WHERE id = ANY')) return { rows: [{ id: 5 }] };
          // DocumentSequencer atomic upsert mock (RETURNING last_sequence, prefix)
          if (sql.includes('INSERT INTO document_sequences')) {
            return { rows: [{ last_sequence: 1, prefix: 'QUO' }] };
          }
          if (sql.includes('INSERT INTO quotations')) {
            insertedNumber = params[0];
            return { rows: [{ id: 50, number: insertedNumber, tenant_id: 'tenant-a' }] };
          }
          if (sql.includes('INSERT INTO quotation_items')) {
            return { rows: [{ id: 1 }] };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.pool = { connect: async () => mockClient };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      await quotationsController.createQuotation({
        body: {
          client_id: 101,
          deal_id: 202,
          total_amount: 1000,
          items: [{ product_id: 5, quantity: 2, unit_price: 500 }]
        },
        user: { tenant_id: 'tenant-a', branch_id: 'branch-1' }
      }, res);

      assert.equal(statusCode, 201);
      assert.match(insertedNumber, /^QUO-\d{4}-00001$/);
      assert.equal(jsonBody.data.number, insertedNumber);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 2: Purchase Requests - Cross-Tenant Rejection
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test('Purchase Requests Controller - Tenant Isolation', async (t2) => {
    const purchaseRequestsController = require('../controllers/purchaseRequestsController');

    await t2.test('createPurchaseRequest rejects foreign warehouse_id', async () => {
      let rollbackCalled = false;
      const mockClient = {
        query: async (sql, params) => {
          if (sql === 'BEGIN') return { rows: [] };
          if (sql === 'ROLLBACK') {
            rollbackCalled = true;
            return { rows: [] };
          }
          if (sql.includes('FROM warehouses WHERE id = $1')) {
            return { rows: [] }; // Foreign warehouse
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.pool = { connect: async () => mockClient };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      await purchaseRequestsController.createPurchaseRequest({
        body: {
          warehouse_id: 99,
          items: [{ product_id: 1, quantity: 5 }]
        },
        user: { id: 1, tenant_id: 'tenant-b' }
      }, res);

      assert.equal(statusCode, 400);
      assert.match(jsonBody.message, /Warehouse not found or belongs to another tenant/);
      assert.equal(rollbackCalled, true);
    });

    await t2.test('updatePurchaseRequest rejects foreign warehouse_id during edit', async () => {
      let rollbackCalled = false;
      const mockClient = {
        query: async (sql, params) => {
          if (sql === 'BEGIN') return { rows: [] };
          if (sql === 'ROLLBACK') {
            rollbackCalled = true;
            return { rows: [] };
          }
          if (sql.includes('SELECT * FROM purchase_requests')) {
            return { rows: [{ id: 1, status: 'draft', tenant_id: 'tenant-b' }] };
          }
          if (sql.includes('FROM warehouses WHERE id = $1')) {
            return { rows: [] }; // Foreign warehouse
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.pool = { connect: async () => mockClient };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      await purchaseRequestsController.updatePurchaseRequest({
        params: { id: 1 },
        body: { warehouse_id: 88 },
        user: { id: 1, tenant_id: 'tenant-b' }
      }, res);

      assert.equal(statusCode, 400);
      assert.match(jsonBody.message, /Warehouse not found or belongs to another tenant/);
      assert.equal(rollbackCalled, true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 3: Purchases Controller - Cross-Tenant Rejection
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test('Purchases Controller - Tenant Isolation', async (t2) => {
    const purchasesController = require('../controllers/purchasesController');

    await t2.test('createPurchaseInvoice rejects foreign vendor_id', async () => {
      let rollbackCalled = false;
      const mockClient = {
        query: async (sql, params) => {
          if (sql === 'BEGIN') return { rows: [] };
          if (sql === 'ROLLBACK') {
            rollbackCalled = true;
            return { rows: [] };
          }
          if (sql.includes('FROM vendors WHERE id = $1')) {
            return { rows: [] }; // Foreign vendor
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.pool = { connect: async () => mockClient };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      await purchasesController.createPurchaseInvoice({
        body: {
          vendor_id: 99,
          warehouse_id: 1,
          items: [{ product_id: 1, quantity: 2, unit_price: 50 }]
        },
        user: { id: 1, tenant_id: 'tenant-b' }
      }, res);

      assert.equal(statusCode, 400);
      assert.match(jsonBody.message, /Vendor not found or belongs to another tenant/);
      assert.equal(rollbackCalled, true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 4: Branch Scoping - Global Products Visibility
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test('Products Controller - Global Product Scoping', async (t2) => {
    const productsController = require('../controllers/productsController');

    await t2.test('includes both branch-specific and global (branch_id IS NULL) products', async () => {
      let executedSql = '';
      let executedParams = [];
      db.query = async (sql, params) => {
        if (sql.includes('ALTER TABLE')) return { rows: [] };
        executedSql = sql;
        executedParams = params;
        return {
          rows: [
            { id: 1, name: 'Global Item', branch_id: null, tenant_id: 'tenant-a' },
            { id: 2, name: 'Branch Item', branch_id: 'branch-1', tenant_id: 'tenant-a' }
          ]
        };
      };

      const req = {
        user: { tenant_id: 'tenant-a' },
        branchId: 'branch-1'
      };

      let jsonBody = null;
      const res = {
        json: (data) => { jsonBody = data; }
      };

      await productsController.getProducts(req, res);

      assert.match(executedSql, /branch_id IS NULL OR \$2 IS NULL/);
      assert.equal(executedParams[0], 'tenant-a');
      assert.equal(executedParams[1], 'branch-1');
      assert.equal(jsonBody.data.length, 2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 5: Warehouses Controller - Global Warehouse Scoping
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test('Inventory Controller - Global Warehouse Scoping', async (t2) => {
    const inventoryController = require('../controllers/inventoryController');

    await t2.test('includes both branch-specific and global (branch_id IS NULL) warehouses for tenant', async () => {
      let executedSql = '';
      let executedParams = [];
      db.query = async (sql, params) => {
        if (sql.includes('ALTER TABLE')) return { rows: [] };
        executedSql = sql;
        executedParams = params;
        return {
          rows: [
            { id: 1, name: 'Main Central Hub', branch_id: null, tenant_id: 'tenant-a' },
            { id: 2, name: 'Cairo Branch Warehouse', branch_id: 'branch-1', tenant_id: 'tenant-a' }
          ]
        };
      };

      const req = {
        user: { tenant_id: 'tenant-a' },
        branchId: 'branch-1'
      };

      let jsonBody = null;
      const res = {
        json: (data) => { jsonBody = data; }
      };

      await inventoryController.getWarehouses(req, res);

      assert.match(executedSql, /w\.branch_id IS NULL OR \$2 IS NULL/);
      assert.equal(executedParams[0], 'tenant-a');
      assert.equal(executedParams[1], 'branch-1');
      assert.equal(jsonBody.data.length, 2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 6: Real Estate vs General Quotation Path Separation & Rollback
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test('Quotations Controller - Path Separation & Rollback Integrity', async (t2) => {
    const quotationsController = require('../controllers/quotationsController');

    await t2.test('Real Estate path succeeds with unit_id and deal without requiring products or items', async () => {
      const mockClient = {
        query: async (sql, params) => {
          if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
          if (sql.includes('FROM customers WHERE id = $1')) return { rows: [{ id: 101 }] };
          if (sql.includes('FROM deals WHERE id = $1')) return { rows: [{ id: 202, client_id: 101 }] };
          if (sql.includes('FROM re_units WHERE id::text = $1::text')) return { rows: [{ id: 'unit-xyz' }] };
          if (sql.includes('INSERT INTO document_sequences')) return { rows: [{ last_sequence: 1, prefix: 'QUO' }] };
          if (sql.includes('INSERT INTO quotations')) {
            return { rows: [{ id: 80, number: params[0], unit_id: 'unit-xyz', tenant_id: 'tenant-re' }] };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.pool = { connect: async () => mockClient };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      // Real Estate quotation: Has unit_id, deal_id, client_id, and NO items/products array
      await quotationsController.createQuotation({
        body: {
          client_id: 101,
          deal_id: 202,
          unit_id: 'unit-xyz',
          total_amount: 2500000,
          items: []
        },
        user: { tenant_id: 'tenant-re', branch_id: 'branch-1' }
      }, res);

      assert.equal(statusCode, 201);
      assert.equal(jsonBody.data.unit_id, 'unit-xyz');
      assert.match(jsonBody.data.number, /^QUO-\d{4}-00001$/);
    });

    await t2.test('Full rollback executed when inserting quotation item fails (No partial records)', async () => {
      let rollbackCalled = false;
      const mockClient = {
        query: async (sql, params) => {
          if (sql === 'BEGIN') return { rows: [] };
          if (sql === 'ROLLBACK') {
            rollbackCalled = true;
            return { rows: [] };
          }
          if (sql.includes('FROM customers WHERE id = $1')) return { rows: [{ id: 101 }] };
          if (sql.includes('FROM products WHERE id = ANY')) return { rows: [{ id: 1 }] };
          if (sql.includes('INSERT INTO document_sequences')) return { rows: [{ id: 'seq-1', last_sequence: 0, prefix: 'QUO' }] };
          if (sql.includes('UPDATE document_sequences')) return { rows: [{ last_sequence: 1, prefix: 'QUO' }] };
          if (sql.includes('INSERT INTO quotations')) {
            return { rows: [{ id: 99, number: 'QUO-2026-00001' }] };
          }
          if (sql.includes('INSERT INTO quotation_items')) {
            throw new Error('Database disk error on item insert');
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.pool = { connect: async () => mockClient };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonBody = data; } };
        }
      };

      await quotationsController.createQuotation({
        body: {
          client_id: 101,
          total_amount: 100,
          items: [{ product_id: 1, quantity: 1, unit_price: 100 }]
        },
        user: { tenant_id: 'tenant-a', branch_id: 'branch-1' }
      }, res);

      assert.equal(statusCode, 500);
      assert.equal(rollbackCalled, true, 'Must execute ROLLBACK and prevent header from persisting');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 7: DocumentSequencer - Partial Index Targeting & Concurrency Logic
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test('DocumentSequencer - Partial Index ON CONFLICT Targeting', async (t2) => {
    const { nextSequence } = require('../src/infrastructure/sequencing/DocumentSequencer');

    await t2.test('targets enterprise partial index when branchId is null', async () => {
      let executedSql = '';
      let executedParams = [];

      const mockClient = {
        query: async (sql, params) => {
          executedSql = sql;
          executedParams = params;
          return { rows: [{ last_sequence: 1, prefix: 'QUO' }] };
        }
      };

      const result = await nextSequence(mockClient, {
        tenantId: 'tenant-test',
        branchId: null,
        docType: 'QUO',
        fiscalYear: 2026
      });

      assert.equal(result, 'QUO-2026-00001');
      assert.match(executedSql, /ON CONFLICT \(tenant_id, doc_type, fiscal_year\) WHERE branch_id IS NULL/);
      assert.match(executedSql, /DO UPDATE SET last_sequence = document_sequences\.last_sequence \+ 1/);
      assert.equal(executedParams[0], 'tenant-test');
      assert.equal(executedParams[1], 'QUO');
      assert.equal(executedParams[2], 2026);
    });

    await t2.test('targets branch-specific partial index when branchId is provided', async () => {
      let executedSql = '';
      let executedParams = [];

      const mockClient = {
        query: async (sql, params) => {
          executedSql = sql;
          executedParams = params;
          return { rows: [{ last_sequence: 42, prefix: 'SO' }] };
        }
      };

      const result = await nextSequence(mockClient, {
        tenantId: 'tenant-test',
        branchId: 'branch-cairo',
        docType: 'SO',
        fiscalYear: 2026
      });

      assert.equal(result, 'SO-2026-00042');
      assert.match(executedSql, /ON CONFLICT \(tenant_id, branch_id, doc_type, fiscal_year\) WHERE branch_id IS NOT NULL/);
      assert.match(executedSql, /DO UPDATE SET last_sequence = document_sequences\.last_sequence \+ 1/);
      assert.equal(executedParams[0], 'tenant-test');
      assert.equal(executedParams[1], 'branch-cairo');
      assert.equal(executedParams[2], 'SO');
      assert.equal(executedParams[3], 2026);
    });
  });
});
