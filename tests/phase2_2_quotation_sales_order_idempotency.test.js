const test = require('node:test');
const assert = require('node:assert/strict');
const SalesOrderService = require('../src/domains/sales/SalesOrderService');
const salesController = require('../controllers/salesController');
const TransactionEngine = require('../src/domains/shared/TransactionEngine');

test('Phase 2.2: Quotation -> Sales Order Idempotency & Workflow Integrity (Unit/Mock)', async (t) => {

  const originalExecuteTransaction = TransactionEngine.executeTransaction;

  t.afterEach(() => {
    TransactionEngine.executeTransaction = originalExecuteTransaction;
  });

  // 1. Successful conversion of approved quotation
  await t.test('1. Approved quotation converts to Sales Order and updates status to converted_to_so', async () => {
    const tenantId = '00000000-0000-4000-8000-000000000001';
    const quotationId = 101;
    const userId = 5;

    let updateStatusCalled = false;
    let soInsertCalled = false;

    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('SELECT * FROM quotations') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: quotationId,
              number: 'QUO-2026-00001',
              status: 'approved',
              client_id: '42',
              deal_id: 10,
              tenant_id: tenantId,
              branch_id: null,
              notes: 'Special discount'
            }]
          };
        }
        if (sql.includes('SELECT * FROM sales_orders') && sql.includes('quotation_id')) {
          return { rows: [] }; // No existing SO
        }
        if (sql.includes('SELECT * FROM quotation_items')) {
          return {
            rows: [
              { id: 1, product_id: '12', description: 'Office Chair', quantity: 2, unit_price: 150 },
              { id: 2, product_id: '15', description: 'Desk', quantity: 1, unit_price: 300 }
            ]
          };
        }
        if (sql.includes('document_sequences')) {
          return { rows: [{ last_sequence: 1, prefix: 'SO' }] };
        }
        if (sql.includes('INSERT INTO sales_orders')) {
          soInsertCalled = true;
          return {
            rows: [{
              id: 'so-uuid-1',
              number: 'SO-2026-00001',
              quotation_id: quotationId,
              customer_id: 42,
              status: 'draft',
              total_amount: 600,
              tenant_id: tenantId
            }]
          };
        }
        if (sql.includes('INSERT INTO sales_order_items')) {
          return { rows: [{ id: 'soi-uuid-1' }] };
        }
        if (sql.includes('UPDATE quotations') && sql.includes("status = 'converted_to_so'")) {
          updateStatusCalled = true;
          return { rows: [{ id: quotationId, status: 'converted_to_so' }] };
        }
        if (sql.includes('transactional_outbox')) {
          return { rows: [{ id: 'event-1' }] };
        }
        return { rows: [] };
      }
    };

    TransactionEngine.executeTransaction = async (handler) => handler(mockClient);

    const result = await SalesOrderService.convertQuotationToSalesOrder(tenantId, null, quotationId, userId);

    assert.equal(soInsertCalled, true, 'Must insert new Sales Order');
    assert.equal(updateStatusCalled, true, 'Must update quotation status to converted_to_so');
    assert.equal(result.id, 'so-uuid-1');
    assert.equal(result.number, 'SO-2026-00001');
    assert.equal(result._alreadyConverted, undefined);
  });

  // 2. Reject unapproved quotation statuses
  await t.test('2. Quotation with draft, rejected, or cancelled status is rejected with descriptive error', async () => {
    const tenantId = '00000000-0000-4000-8000-000000000001';

    for (const testStatus of ['draft', 'rejected', 'cancelled', 'expired']) {
      const mockClient = {
        query: async (sql, params) => {
          if (sql.includes('SELECT * FROM quotations')) {
            return {
              rows: [{
                id: 202,
                status: testStatus,
                client_id: '42',
                tenant_id: tenantId
              }]
            };
          }
          return { rows: [] };
        }
      };

      TransactionEngine.executeTransaction = async (handler) => handler(mockClient);

      await assert.rejects(
        async () => {
          await SalesOrderService.convertQuotationToSalesOrder(tenantId, null, 202, 1);
        },
        (err) => {
          assert.match(err.message, /Cannot convert Quotation/);
          assert.match(err.message, new RegExp(testStatus));
          return true;
        }
      );
    }
  });

  // 3. Reject Quotation without Customer or without Items
  await t.test('3. Quotation without customer or without items is rejected with validation error', async () => {
    const tenantId = '00000000-0000-4000-8000-000000000001';

    // A: Missing customer
    const mockClientNoCust = {
      query: async (sql) => {
        if (sql.includes('SELECT * FROM quotations')) {
          return { rows: [{ id: 301, status: 'approved', client_id: null, tenant_id: tenantId }] };
        }
        if (sql.includes('SELECT * FROM sales_orders')) return { rows: [] };
        return { rows: [] };
      }
    };
    TransactionEngine.executeTransaction = async (handler) => handler(mockClientNoCust);

    await assert.rejects(
      async () => await SalesOrderService.convertQuotationToSalesOrder(tenantId, null, 301, 1),
      /Quotation must have a valid customer associated/
    );

    // B: Missing items
    const mockClientNoItems = {
      query: async (sql) => {
        if (sql.includes('SELECT * FROM quotations')) {
          return { rows: [{ id: 302, status: 'approved', client_id: '10', tenant_id: tenantId }] };
        }
        if (sql.includes('SELECT * FROM sales_orders')) return { rows: [] };
        if (sql.includes('SELECT * FROM quotation_items')) return { rows: [] };
        return { rows: [] };
      }
    };
    TransactionEngine.executeTransaction = async (handler) => handler(mockClientNoItems);

    await assert.rejects(
      async () => await SalesOrderService.convertQuotationToSalesOrder(tenantId, null, 302, 1),
      /Quotation contains no items to convert/
    );
  });

  // 4. Repeated Request Idempotency
  await t.test('4. Repeated conversion returns existing active Sales Order with _alreadyConverted flag', async () => {
    const tenantId = '00000000-0000-4000-8000-000000000001';
    const quotationId = 404;

    const existingSO = {
      id: 'so-existing-99',
      number: 'SO-2026-00099',
      quotation_id: quotationId,
      customer_id: 42,
      status: 'draft',
      total_amount: 1500,
      tenant_id: tenantId
    };

    let insertSoCalled = false;
    let updateQuoCalled = false;

    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('SELECT * FROM quotations')) {
          return {
            rows: [{
              id: quotationId,
              status: 'converted_to_so',
              client_id: '42',
              tenant_id: tenantId
            }]
          };
        }
        if (sql.includes('SELECT * FROM sales_orders') && sql.includes('quotation_id')) {
          return { rows: [existingSO] };
        }
        if (sql.includes('INSERT INTO sales_orders')) {
          insertSoCalled = true;
          return { rows: [] };
        }
        if (sql.includes('UPDATE quotations')) {
          updateQuoCalled = true;
          return { rows: [] };
        }
        return { rows: [] };
      }
    };

    TransactionEngine.executeTransaction = async (handler) => handler(mockClient);

    const result = await SalesOrderService.convertQuotationToSalesOrder(tenantId, null, quotationId, 1);

    assert.equal(result._alreadyConverted, true, 'Result must indicate already converted');
    assert.equal(result.id, 'so-existing-99');
    assert.equal(insertSoCalled, false, 'Must NOT insert new Sales Order');
    assert.equal(updateQuoCalled, false, 'Must NOT update quotation when already converted');
  });

  // 5. Controller handles idempotent response with HTTP 200 vs 201
  await t.test('5. salesController.convertQuotation responds with 200 for idempotent and 201 for new', async () => {
    const originalConvert = SalesOrderService.convertQuotationToSalesOrder;

    try {
      // Test A: Newly created (201)
      SalesOrderService.convertQuotationToSalesOrder = async () => ({ id: 'so-1', number: 'SO-001' });
      let statusA = null;
      let jsonA = null;
      await salesController.convertQuotation(
        { user: { tenant_id: 't-1', id: 1 }, branchId: null, params: { quotationId: 10 } },
        { status: (s) => { statusA = s; return { json: (j) => { jsonA = j; } }; } }
      );
      assert.equal(statusA, 201);
      assert.equal(jsonA.data.id, 'so-1');

      // Test B: Idempotent replay (200)
      SalesOrderService.convertQuotationToSalesOrder = async () => ({ id: 'so-1', number: 'SO-001', _alreadyConverted: true });
      let statusB = null;
      let jsonB = null;
      await salesController.convertQuotation(
        { user: { tenant_id: 't-1', id: 1 }, branchId: null, params: { quotationId: 10 } },
        { status: (s) => { statusB = s; return { json: (j) => { jsonB = j; } }; } }
      );
      assert.equal(statusB, 200);
      assert.equal(jsonB.data._alreadyConverted, true);
    } finally {
      SalesOrderService.convertQuotationToSalesOrder = originalConvert;
    }
  });

  // 6. Tenant Isolation
  await t.test('6. Tenant Isolation: Quotation from Tenant A cannot be converted by Tenant B', async () => {
    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('SELECT * FROM quotations')) {
          // No quotation found because tenant_id does not match
          return { rows: [] };
        }
        return { rows: [] };
      }
    };
    TransactionEngine.executeTransaction = async (handler) => handler(mockClient);

    await assert.rejects(
      async () => await SalesOrderService.convertQuotationToSalesOrder('tenant-B', null, 999, 1),
      /Quotation not found/
    );
  });

  // 7. Re-conversion allowed if prior Sales Order was cancelled
  await t.test('7. If prior Sales Order was cancelled, re-conversion is permitted and generates a new Sales Order', async () => {
    const tenantId = '00000000-0000-4000-8000-000000000001';
    const quotationId = 505;

    let newSoInserted = false;

    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('SELECT * FROM quotations')) {
          return {
            rows: [{
              id: quotationId,
              status: 'converted_to_so',
              client_id: '42',
              tenant_id: tenantId
            }]
          };
        }
        if (sql.includes('SELECT * FROM sales_orders') && sql.includes("status != 'cancelled'")) {
          // Prior SO was cancelled, so active query returns empty
          return { rows: [] };
        }
        if (sql.includes('SELECT * FROM quotation_items')) {
          return { rows: [{ id: 1, product_id: '12', description: 'Item A', quantity: 1, unit_price: 100 }] };
        }
        if (sql.includes('document_sequences')) {
          return { rows: [{ last_sequence: 2, prefix: 'SO' }] };
        }
        if (sql.includes('INSERT INTO sales_orders')) {
          newSoInserted = true;
          return {
            rows: [{
              id: 'so-new-2',
              number: 'SO-2026-00002',
              quotation_id: quotationId,
              customer_id: 42,
              status: 'draft'
            }]
          };
        }
        if (sql.includes('INSERT INTO sales_order_items')) return { rows: [{ id: 'soi-2' }] };
        if (sql.includes('UPDATE quotations')) return { rows: [] };
        if (sql.includes('transactional_outbox')) return { rows: [{ id: 'evt-2' }] };
        return { rows: [] };
      }
    };

    TransactionEngine.executeTransaction = async (handler) => handler(mockClient);

    const result = await SalesOrderService.convertQuotationToSalesOrder(tenantId, null, quotationId, 1);
    assert.equal(newSoInserted, true, 'New Sales Order must be created when prior one was cancelled');
    assert.equal(result.id, 'so-new-2');
  });
});
