const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');
const salesService = require('../services/salesService');

// Save original db methods
const originalDbQuery = db.query;
const originalDbConnect = db.connect;

test('Phase G-2: Sales Order -> Invoice Integrity Suite', async (t) => {

  t.afterEach(() => {
    db.query = originalDbQuery;
    db.connect = originalDbConnect;
  });

  // Mock mock-client generator for transaction testing
  const createMockClient = (customHandlers) => {
    return {
      query: async (sql, params) => {
        if (customHandlers && customHandlers(sql, params)) {
          return customHandlers(sql, params);
        }
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => {}
    };
  };

  // 1. Repeated Conversion returns existing active invoice (Idempotency)
  await t.test('Repeated conversion returns existing active invoice and does not insert duplicate', async () => {
    const existingInvoice = {
      id: 999,
      invoice_number: 'INV-0099',
      sales_order_id: '101',
      total_amount: 1500,
      status: 'unpaid'
    };

    let insertCalled = false;

    const mockClient = {
      query: async (sql, params) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT * FROM sales_orders') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 101,
              customer_id: 50,
              tenant_id: 'tenant-abc',
              branch_id: 'b-1',
              status: 'confirmed',
              total_amount: 1500
            }]
          };
        }
        if (sql.includes('SELECT * FROM invoices') && sql.includes('sales_order_id')) {
          // Returns active invoice already existing
          return { rows: [existingInvoice] };
        }
        if (sql.includes('INSERT INTO invoices')) {
          insertCalled = true;
          return { rows: [{ id: 1000 }] };
        }
        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;
    db.query = async (sql, params) => {
      // Mock ensureInvoicesTable DDL queries
      return { rows: [] };
    };

    const result = await salesService.convertSalesOrderToInvoice(101, 'tenant-abc');

    assert.equal(result._alreadyExists, true, 'Result must indicate invoice already existed');
    assert.equal(result.id, 999, 'Result must return existing invoice ID');
    assert.equal(insertCalled, false, 'Must NOT perform INSERT INTO invoices when invoice exists');
  });

  // 2. Line items copied to invoice_items and progressive quantity_invoiced updated
  await t.test('Line items are copied to invoice_items and progressive quantity_invoiced is updated', async () => {
    let insertedInvoice = null;
    let insertedItems = [];
    let updatedOrderItems = [];
    let orderStatusUpdated = null;

    const mockOrder = {
      id: 102,
      customer_id: 55,
      tenant_id: 'tenant-abc',
      branch_id: 'b-1',
      status: 'confirmed',
      total_amount: 500
    };

    const mockItems = [
      { id: 1, product_id: 201, description: 'Item 1', quantity: 10, unit_price: 20, quantity_invoiced: 0 },
      { id: 2, product_id: 202, description: 'Item 2', quantity: 5, unit_price: 60, quantity_invoiced: 2 } // 3 remaining
    ];

    const mockClient = {
      query: async (sql, params) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT * FROM sales_orders') && sql.includes('FOR UPDATE')) {
          return { rows: [mockOrder] };
        }
        if (sql.includes('SELECT * FROM invoices') && sql.includes('sales_order_id')) {
          return { rows: [] }; // No existing invoice
        }
        if (sql.includes('SELECT * FROM sales_order_items') && sql.includes('FOR UPDATE')) {
          return { rows: mockItems };
        }
        if (sql.includes('INSERT INTO invoices')) {
          insertedInvoice = { id: 701, invoice_number: params[2], sales_order_id: params[9] };
          return { rows: [insertedInvoice] };
        }
        if (sql.includes('INSERT INTO invoice_items')) {
          insertedItems.push({
            invoice_id: params[0],
            product_id: params[1],
            quantity: params[3],
            unit_price: params[4],
            subtotal: params[5]
          });
          return { rows: [{ id: insertedItems.length }] };
        }
        if (sql.includes('UPDATE sales_order_items') && sql.includes('SET quantity_invoiced')) {
          updatedOrderItems.push({ newInvoiced: params[0], itemId: params[1] });
          return { rows: [] };
        }
        if (sql.includes('UPDATE sales_orders') && sql.includes('SET status')) {
          orderStatusUpdated = params[0];
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;
    db.query = async (sql, params) => {
      // Mock generateInvoiceNumber & ensureInvoicesTable queries
      if (sql.includes('SELECT invoice_number FROM invoices')) return { rows: [] };
      if (sql.includes('SELECT id FROM invoices WHERE')) return { rows: [] };
      return { rows: [] };
    };

    const res = await salesService.convertSalesOrderToInvoice(102, 'tenant-abc');

    assert.ok(insertedInvoice, 'Invoice header must be inserted');
    assert.equal(insertedInvoice.sales_order_id, '102', 'Invoice must link sales_order_id');
    assert.equal(insertedItems.length, 2, 'Must insert 2 line items into invoice_items');

    // Item 1: was 0 invoiced, ordered 10 -> invoiced 10, total now 10
    assert.equal(insertedItems[0].quantity, 10);
    assert.equal(insertedItems[0].subtotal, 200);
    assert.equal(updatedOrderItems[0].newInvoiced, 10);

    // Item 2: was 2 invoiced, ordered 5 -> invoiced 3, total now 5
    assert.equal(insertedItems[1].quantity, 3);
    assert.equal(insertedItems[1].subtotal, 180);
    assert.equal(updatedOrderItems[1].newInvoiced, 5);

    assert.equal(orderStatusUpdated, 'invoiced', 'Order status must be updated to invoiced');
  });

  // 3. Re-invoicing after previous invoice cancelled creates new replacement invoice
  await t.test('Re-invoicing allows replacement invoice if previous invoice was cancelled', async () => {
    let insertCalled = false;

    const mockClient = {
      query: async (sql, params) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT * FROM sales_orders') && sql.includes('FOR UPDATE')) {
          return { rows: [{ id: 103, customer_id: 70, tenant_id: 't-1', total_amount: 300 }] };
        }
        if (sql.includes('SELECT * FROM invoices') && sql.includes('sales_order_id')) {
          // Query strictly filters: (status IS NULL OR status != 'cancelled')
          // Since previous invoice was cancelled, it returns 0 rows
          return { rows: [] };
        }
        if (sql.includes('SELECT * FROM sales_order_items')) {
          return { rows: [{ id: 5, product_id: 11, quantity: 1, quantity_invoiced: 0, unit_price: 300 }] };
        }
        if (sql.includes('INSERT INTO invoices')) {
          insertCalled = true;
          return { rows: [{ id: 888, invoice_number: 'INV-REPLACE' }] };
        }
        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;
    db.query = async () => ({ rows: [] });

    const result = await salesService.convertSalesOrderToInvoice(103, 't-1');
    assert.equal(insertCalled, true, 'Must allow generating replacement invoice if old one was cancelled');
    assert.equal(result.id, 888);
  });

  // 4. Fully invoiced sales order prevents re-invoicing with clean error
  await t.test('Fully invoiced order prevents duplicate billing if all items reached maximum quantity', async () => {
    const mockClient = {
      query: async (sql, params) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT * FROM sales_orders') && sql.includes('FOR UPDATE')) {
          return { rows: [{ id: 104, customer_id: 80, tenant_id: 't-1' }] };
        }
        if (sql.includes('SELECT * FROM invoices') && sql.includes('sales_order_id')) {
          return { rows: [] };
        }
        if (sql.includes('SELECT * FROM sales_order_items')) {
          // quantity === quantity_invoiced (fully invoiced)
          return { rows: [{ id: 9, product_id: 15, quantity: 5, quantity_invoiced: 5, unit_price: 10 }] };
        }
        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;
    db.query = async () => ({ rows: [] });

    await assert.rejects(
      async () => {
        await salesService.convertSalesOrderToInvoice(104, 't-1');
      },
      /All items for this Sales Order have already been fully invoiced/
    );
  });

  // 6. Phase G-3: Multiple Sales Orders for the same Deal can each generate their own active invoice
  await t.test('Phase G-3: Multiple Sales Orders for the same Deal can each generate their own active invoice', async () => {
    const dealId = 'deal-999';
    const tenantId = 'tenant-xyz';

    const order1 = { id: 201, customer_id: 10, deal_id: dealId, tenant_id: tenantId, status: 'confirmed', total_amount: 1000 };
    const order2 = { id: 202, customer_id: 10, deal_id: dealId, tenant_id: tenantId, status: 'confirmed', total_amount: 2000 };

    const invoicesGenerated = [];

    const mockClientForOrder = (order) => ({
      query: async (sql, params) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT * FROM sales_orders') && sql.includes('FOR UPDATE')) {
          return { rows: [order] };
        }
        if (sql.includes('SELECT * FROM invoices') && sql.includes('sales_order_id')) {
          // Check uniqueness by sales_order_id:
          // SO 202 will NOT match SO 201's invoice!
          const found = invoicesGenerated.filter(inv => String(inv.sales_order_id) === String(params[0]));
          return { rows: found };
        }
        if (sql.includes('SELECT * FROM sales_order_items')) {
          return { rows: [{ id: order.id * 10, product_id: 5, quantity: 1, quantity_invoiced: 0, unit_price: order.total_amount }] };
        }
        if (sql.includes('INSERT INTO invoices')) {
          const inv = { id: invoicesGenerated.length + 1, deal_id: params[7], sales_order_id: params[9], total_amount: params[3] };
          invoicesGenerated.push(inv);
          return { rows: [inv] };
        }
        return { rows: [] };
      },
      release: () => {}
    });

    db.query = async () => ({ rows: [] });

    // Convert SO 1 (Deal 999)
    db.connect = async () => mockClientForOrder(order1);
    const inv1 = await salesService.convertSalesOrderToInvoice(order1.id, tenantId);

    // Convert SO 2 (Same Deal 999)
    db.connect = async () => mockClientForOrder(order2);
    const inv2 = await salesService.convertSalesOrderToInvoice(order2.id, tenantId);

    assert.equal(invoicesGenerated.length, 2, 'Both sales orders under the same deal must generate active invoices');
    assert.equal(inv1.deal_id, dealId);
    assert.equal(inv2.deal_id, dealId);
    assert.equal(inv1.sales_order_id, '201');
    assert.equal(inv2.sales_order_id, '202');
    assert.notEqual(inv1.id, inv2.id);
  });

});

