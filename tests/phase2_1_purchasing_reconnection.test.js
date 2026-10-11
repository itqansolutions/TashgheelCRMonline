const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');

// Original db handles
const originalDbQuery = db.query;
const originalDbConnect = db.connect;
const originalPool = db.pool;

test('Phase 2.1: Purchasing Workflow Reconnection Test Suite', async (t) => {
  t.beforeEach(() => {
    const dummyClient = {
      query: async () => ({ rows: [] }),
      release: () => {}
    };
    db.connect = async () => dummyClient;
    db.pool = { connect: async () => dummyClient };
    db.query = async () => ({ rows: [] });
  });

  t.afterEach(() => {
    db.query = originalDbQuery;
    db.connect = originalDbConnect;
    db.pool = originalPool;
  });

  const purchaseOrdersController = require('../controllers/purchaseOrdersController');
  const purchasesController = require('../controllers/purchasesController');
  const purchaseRequestsController = require('../controllers/purchaseRequestsController');

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 1: Direct Purchase Request (PR) -> Purchase Order (PO) Conversion
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test('1. PR -> PO Direct Conversion & Idempotency', async (t2) => {

    await t2.test('Approved PR converts directly to PO, copies items, and updates PR status to converted_to_po', async () => {
      let prUpdated = false;
      let poInserted = false;
      let itemsInserted = [];

      const mockClient = {
        query: async (sql, params) => {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };

          // 1. Concurrency safe PO number
          if (sql.includes('SELECT po_number FROM purchase_orders')) {
            return { rows: [{ po_number: 'PO-26-0005' }] };
          }

          // 2. Lock PR
          if (sql.includes('SELECT * FROM purchase_requests') && sql.includes('FOR UPDATE')) {
            return {
              rows: [{
                id: 42,
                request_number: 'PR-26-0010',
                status: 'approved',
                warehouse_id: 3,
                branch_id: 'b-1',
                tenant_id: 'tenant-100'
              }]
            };
          }

          // 3. Existing PO check (idempotency)
          if (sql.includes('SELECT id, po_number FROM purchase_orders') && sql.includes('purchase_request_id = $1')) {
            return { rows: [] }; // No existing PO
          }

          // 4. Vendor check
          if (sql.includes('SELECT id FROM vendors')) {
            return { rows: [{ id: 8 }] };
          }

          // 5. Warehouse check
          if (sql.includes('SELECT id FROM warehouses')) {
            return { rows: [{ id: 3 }] };
          }

          // 6. PR items
          if (sql.includes('FROM purchase_request_items')) {
            return {
              rows: [
                { id: 1, request_id: 42, product_id: 101, quantity: '15.000', estimated_unit_price: '50.00', product_name: 'Item A' },
                { id: 2, request_id: 42, product_id: 102, quantity: '20.000', estimated_unit_price: '100.00', product_name: 'Item B' }
              ]
            };
          }

          // 7. Insert PO header
          if (sql.includes('INSERT INTO purchase_orders')) {
            poInserted = true;
            return {
              rows: [{
                id: 99,
                po_number: 'PO-26-0006',
                purchase_request_id: 42,
                status: 'draft',
                vendor_id: 8,
                warehouse_id: 3,
                total_amount: '2750.00'
              }]
            };
          }

          // 8. Update PR status
          if (sql.includes('UPDATE purchase_requests') && sql.includes("status = 'converted_to_po'")) {
            prUpdated = true;
            return { rows: [{ id: 42, status: 'converted_to_po' }] };
          }

          // 9. Insert PO items
          if (sql.includes('INSERT INTO purchase_order_items')) {
            itemsInserted.push(params);
            return { rows: [{ id: itemsInserted.length }] };
          }

          return { rows: [] };
        },
        release: () => {}
      };

      db.connect = async () => mockClient;

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (d) => { jsonBody = d; } };
        }
      };

      await purchaseOrdersController.createPurchaseOrder({
        body: {
          purchase_request_id: 42,
          vendor_id: 8
        },
        user: { id: 1, tenant_id: 'tenant-100', role: 'admin' },
        branchId: 'b-1'
      }, res);

      assert.equal(statusCode, 201);
      assert.equal(jsonBody.success, true);
      assert.equal(poInserted, true);
      assert.equal(prUpdated, true);
      assert.equal(itemsInserted.length, 2);
      // Verify initial quantities in inserted items: quantity, received_quantity = 0.000, invoiced_quantity = 0.000
      assert.equal(jsonBody.data.items[0].received_quantity, 0.000);
      assert.equal(jsonBody.data.items[0].invoiced_quantity, 0.000);
    });

    await t2.test('Unapproved PR is rejected with 400', async () => {
      const mockClient = {
        query: async (sql) => {
          if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
          if (sql.includes('SELECT * FROM purchase_requests')) {
            return {
              rows: [{
                id: 43,
                request_number: 'PR-26-0011',
                status: 'submitted', // Not approved
                tenant_id: 'tenant-100'
              }]
            };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.connect = async () => mockClient;

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (d) => { jsonBody = d; } };
        }
      };

      await purchaseOrdersController.createPurchaseOrder({
        body: {
          purchase_request_id: 43,
          vendor_id: 8
        },
        user: { id: 1, tenant_id: 'tenant-100', role: 'admin' }
      }, res);

      assert.equal(statusCode, 400);
      assert.equal(jsonBody.success, false);
      assert.match(jsonBody.message, /Only 'approved' purchase requests/);
    });

    await t2.test('Duplicate PR conversion is rejected (Idempotency check)', async () => {
      const mockClient = {
        query: async (sql) => {
          if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
          if (sql.includes('SELECT * FROM purchase_requests')) {
            return {
              rows: [{
                id: 44,
                request_number: 'PR-26-0012',
                status: 'approved',
                tenant_id: 'tenant-100'
              }]
            };
          }
          if (sql.includes('SELECT id, po_number FROM purchase_orders') && sql.includes('purchase_request_id = $1')) {
            return { rows: [{ id: 88, po_number: 'PO-26-0001' }] }; // Existing PO already generated
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.connect = async () => mockClient;

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (d) => { jsonBody = d; } };
        }
      };

      await purchaseOrdersController.createPurchaseOrder({
        body: {
          purchase_request_id: 44,
          vendor_id: 8
        },
        user: { id: 1, tenant_id: 'tenant-100', role: 'admin' }
      }, res);

      assert.equal(statusCode, 400);
      assert.equal(jsonBody.success, false);
      assert.match(jsonBody.message, /Duplicate conversion is not allowed/);
    });

    await t2.test('RFQ-based PO creation is safely rejected with deprecation message', async () => {
      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (d) => { jsonBody = d; } };
        }
      };

      await purchaseOrdersController.createPurchaseOrder({
        body: {
          rfq_id: 10,
          vendor_quotation_id: 20
        },
        user: { id: 1, tenant_id: 'tenant-100', role: 'admin' }
      }, res);

      assert.equal(statusCode, 400);
      assert.equal(jsonBody.success, false);
      assert.match(jsonBody.message, /RFQ-based purchase order generation is deprecated/);
    });

    await t2.test('Tampering with invoiced_quantity during PO creation is rejected', async () => {
      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (d) => { jsonBody = d; } };
        }
      };

      await purchaseOrdersController.createPurchaseOrder({
        body: {
          vendor_id: 1,
          warehouse_id: 1,
          items: [{ product_id: 5, quantity: 10, invoiced_quantity: 5 }]
        },
        user: { id: 1, tenant_id: 'tenant-100', role: 'admin' }
      }, res);

      assert.equal(statusCode, 400);
      assert.equal(jsonBody.success, false);
      assert.match(jsonBody.message, /invoiced_quantity cannot be set during Purchase Order creation/);
    });

    await t2.test('Cancelling PR that was already converted_to_po is rejected', async () => {
      const mockClient = {
        query: async (sql) => {
          if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
          if (sql.includes('SELECT * FROM purchase_requests')) {
            return {
              rows: [{
                id: 50,
                status: 'converted_to_po',
                tenant_id: 'tenant-100'
              }]
            };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.connect = async () => mockClient;
      db.pool = { connect: async () => mockClient };

      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (d) => { jsonBody = d; } };
        }
      };

      await purchaseRequestsController.cancelPurchaseRequest({
        params: { id: 50 },
        user: { id: 1, tenant_id: 'tenant-100' }
      }, res);

      assert.equal(statusCode, 400);
      assert.equal(jsonBody.status, 'error');
      assert.match(jsonBody.message, /Cannot cancel a request that is already 'converted_to_po'/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 2: Supplier Invoicing strictly from Received Quantities
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test('2. Supplier Invoicing strictly against Goods Receipts', async (t2) => {

    await t2.test('Invoicing PO before receiving items (e.g. status draft/sent_to_vendor) is rejected', async () => {
      const mockClient = {
        query: async (sql) => {
          if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
          if (sql.includes('SELECT * FROM purchase_orders')) {
            return {
              rows: [{
                id: 10,
                po_number: 'PO-26-0010',
                status: 'sent_to_vendor', // No items received yet!
                tenant_id: 'tenant-100'
              }]
            };
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
          return { json: (d) => { jsonBody = d; } };
        }
      };

      await purchasesController.createInvoiceFromPurchaseOrder({
        params: { id: 10 },
        body: {},
        user: { id: 1, tenant_id: 'tenant-100' }
      }, res);

      assert.equal(statusCode, 400);
      assert.equal(jsonBody.status, 'error');
      assert.match(jsonBody.message, /Goods must be received before creating a supplier invoice/);
    });

    await t2.test('Invoicing cancelled PO is rejected', async () => {
      const mockClient = {
        query: async (sql) => {
          if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
          if (sql.includes('SELECT * FROM purchase_orders')) {
            return {
              rows: [{
                id: 11,
                po_number: 'PO-26-0011',
                status: 'cancelled',
                tenant_id: 'tenant-100'
              }]
            };
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
          return { json: (d) => { jsonBody = d; } };
        }
      };

      await purchasesController.createInvoiceFromPurchaseOrder({
        params: { id: 11 },
        body: {},
        user: { id: 1, tenant_id: 'tenant-100' }
      }, res);

      assert.equal(statusCode, 400);
      assert.equal(jsonBody.status, 'error');
      assert.match(jsonBody.message, /Cannot create an invoice for a cancelled Purchase Order/);
    });

    await t2.test('Full Invoicing of received quantities creates invoice with purchase_order_id and ZERO stock movements', async () => {
      let stockMovementCreated = false;
      let invoiceCreated = false;
      let invoiceItemsCreated = [];
      let poItemQtyUpdated = [];

      const mockClient = {
        query: async (sql, params) => {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };

          if (sql.includes('stock_movements')) {
            stockMovementCreated = true;
          }

          if (sql.includes('SELECT * FROM purchase_orders') && sql.includes('FOR UPDATE')) {
            return {
              rows: [{
                id: 20,
                po_number: 'PO-26-0020',
                status: 'completed',
                vendor_id: 5,
                warehouse_id: 2,
                branch_id: 'branch-1',
                tenant_id: 'tenant-100'
              }]
            };
          }

          if (sql.includes('SELECT * FROM purchase_order_items') && sql.includes('FOR UPDATE')) {
            return {
              rows: [
                {
                  id: 101,
                  po_id: 20,
                  product_id: 501,
                  quantity: '10.000',
                  received_quantity: '10.000',
                  invoiced_quantity: '0.000',
                  unit_price: '25.00',
                  discount_pct: '0.00',
                  tax_pct: '15.00'
                },
                {
                  id: 102,
                  po_id: 20,
                  product_id: 502,
                  quantity: '5.000',
                  received_quantity: '5.000',
                  invoiced_quantity: '0.000',
                  unit_price: '100.00',
                  discount_pct: '10.00',
                  tax_pct: '0.00'
                }
              ]
            };
          }

          if (sql.includes('INSERT INTO purchase_invoices')) {
            invoiceCreated = true;
            return {
              rows: [{
                id: 888,
                invoice_number: params[0],
                purchase_order_id: 20,
                vendor_id: 5,
                warehouse_id: 2,
                total_amount: params[6],
                status: 'unpaid'
              }]
            };
          }

          if (sql.includes('INSERT INTO purchase_invoice_items')) {
            invoiceItemsCreated.push(params);
            return { rows: [{ id: invoiceItemsCreated.length }] };
          }

          if (sql.includes('UPDATE purchase_order_items') && sql.includes('invoiced_quantity = invoiced_quantity + $1')) {
            poItemQtyUpdated.push(params);
            return { rows: [{ id: params[1] }] };
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
          return { json: (d) => { jsonBody = d; } };
        }
      };

      await purchasesController.createInvoiceFromPurchaseOrder({
        params: { id: 20 },
        body: { notes: 'Invoiced full receipt' },
        user: { id: 1, tenant_id: 'tenant-100' },
        branchId: 'branch-1'
      }, res);

      assert.equal(statusCode, 201);
      assert.equal(jsonBody.status, 'success');
      assert.equal(invoiceCreated, true);
      assert.equal(stockMovementCreated, false, 'STRICT INVARIANT: No stock movements must be generated during invoice creation!');
      assert.equal(invoiceItemsCreated.length, 2);
      assert.equal(poItemQtyUpdated.length, 2);
      assert.equal(poItemQtyUpdated[0][0], 10); // Updated by remaining 10 units
      assert.equal(poItemQtyUpdated[1][0], 5);  // Updated by remaining 5 units
    });

    await t2.test('Partial invoicing: Invoice 40 of 100 received units, second invoice 60 units, third attempt rejected', async () => {
      // Step A: Partial invoice for 40 units
      let invoicedDeltaA = null;
      const mockClientA = {
        query: async (sql, params) => {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
          if (sql.includes('SELECT * FROM purchase_orders')) {
            return {
              rows: [{
                id: 30,
                po_number: 'PO-26-0030',
                status: 'partially_received',
                vendor_id: 7,
                warehouse_id: 1,
                tenant_id: 'tenant-100'
              }]
            };
          }
          if (sql.includes('SELECT * FROM purchase_order_items')) {
            return {
              rows: [{
                id: 201,
                po_id: 30,
                product_id: 701,
                quantity: '100.000',
                received_quantity: '100.000',
                invoiced_quantity: '0.000',
                unit_price: '10.00',
                discount_pct: '0.00',
                tax_pct: '0.00'
              }]
            };
          }
          if (sql.includes('INSERT INTO purchase_invoices')) {
            return { rows: [{ id: 901, total_amount: 400.00 }] };
          }
          if (sql.includes('UPDATE purchase_order_items')) {
            invoicedDeltaA = params[0];
            return { rows: [{ id: 201 }] };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.pool = { connect: async () => mockClientA };

      let resA = {
        statusCode: null,
        status(c) { this.statusCode = c; return this; },
        json(d) { this.data = d; }
      };

      await purchasesController.createInvoiceFromPurchaseOrder({
        params: { id: 30 },
        body: {
          items: [{ po_item_id: 201, quantity: 40 }]
        },
        user: { id: 1, tenant_id: 'tenant-100' }
      }, resA);

      assert.equal(resA.statusCode, 201);
      assert.equal(invoicedDeltaA, 40);

      // Step B: Second partial invoice for remaining 60 units
      let invoicedDeltaB = null;
      const mockClientB = {
        query: async (sql, params) => {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
          if (sql.includes('SELECT * FROM purchase_orders')) {
            return {
              rows: [{
                id: 30,
                po_number: 'PO-26-0030',
                status: 'completed',
                vendor_id: 7,
                warehouse_id: 1,
                tenant_id: 'tenant-100'
              }]
            };
          }
          if (sql.includes('SELECT * FROM purchase_order_items')) {
            return {
              rows: [{
                id: 201,
                po_id: 30,
                product_id: 701,
                quantity: '100.000',
                received_quantity: '100.000',
                invoiced_quantity: '40.000', // Already 40 invoiced
                unit_price: '10.00',
                discount_pct: '0.00',
                tax_pct: '0.00'
              }]
            };
          }
          if (sql.includes('INSERT INTO purchase_invoices')) {
            return { rows: [{ id: 902, total_amount: 600.00 }] };
          }
          if (sql.includes('UPDATE purchase_order_items')) {
            invoicedDeltaB = params[0];
            return { rows: [{ id: 201 }] };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.pool = { connect: async () => mockClientB };

      let resB = {
        statusCode: null,
        status(c) { this.statusCode = c; return this; },
        json(d) { this.data = d; }
      };

      await purchasesController.createInvoiceFromPurchaseOrder({
        params: { id: 30 },
        body: {
          items: [{ po_item_id: 201, quantity: 60 }]
        },
        user: { id: 1, tenant_id: 'tenant-100' }
      }, resB);

      assert.equal(resB.statusCode, 201);
      assert.equal(invoicedDeltaB, 60);

      // Step C: Third attempt when all 100 are already invoiced -> Must be rejected with 400
      const mockClientC = {
        query: async (sql) => {
          if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
          if (sql.includes('SELECT * FROM purchase_orders')) {
            return {
              rows: [{
                id: 30,
                po_number: 'PO-26-0030',
                status: 'completed',
                tenant_id: 'tenant-100'
              }]
            };
          }
          if (sql.includes('SELECT * FROM purchase_order_items')) {
            return {
              rows: [{
                id: 201,
                po_id: 30,
                product_id: 701,
                quantity: '100.000',
                received_quantity: '100.000',
                invoiced_quantity: '100.000', // All 100 already invoiced
                unit_price: '10.00'
              }]
            };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.pool = { connect: async () => mockClientC };

      let resC = {
        statusCode: null,
        status(c) { this.statusCode = c; return this; },
        json(d) { this.data = d; }
      };

      await purchasesController.createInvoiceFromPurchaseOrder({
        params: { id: 30 },
        body: {
          items: [{ po_item_id: 201, quantity: 10 }]
        },
        user: { id: 1, tenant_id: 'tenant-100' }
      }, resC);

      assert.equal(resC.statusCode, 400);
      assert.equal(resC.data.status, 'error');
      assert.match(resC.data.message, /already fully invoiced/);
    });

    await t2.test('Over-invoicing beyond received quantity is rejected with 400', async () => {
      const mockClient = {
        query: async (sql) => {
          if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
          if (sql.includes('SELECT * FROM purchase_orders')) {
            return {
              rows: [{
                id: 31,
                po_number: 'PO-26-0031',
                status: 'partially_received',
                tenant_id: 'tenant-100'
              }]
            };
          }
          if (sql.includes('SELECT * FROM purchase_order_items')) {
            return {
              rows: [{
                id: 301,
                po_id: 31,
                product_id: 801,
                quantity: '50.000',
                received_quantity: '20.000', // Only 20 received so far
                invoiced_quantity: '0.000',
                unit_price: '10.00'
              }]
            };
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
          return { json: (d) => { jsonBody = d; } };
        }
      };

      await purchasesController.createInvoiceFromPurchaseOrder({
        params: { id: 31 },
        body: {
          items: [{ po_item_id: 301, quantity: 25 }] // Trying to invoice 25 when only 20 received
        },
        user: { id: 1, tenant_id: 'tenant-100' }
      }, res);

      assert.equal(statusCode, 400);
      assert.equal(jsonBody.status, 'error');
      assert.match(jsonBody.message, /Maximum uninvoiced received quantity is 20/);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. RFQ Operational Deprecation, Historical Read & RE Decoupling
  // ─────────────────────────────────────────────────────────────
  await t.test('3. RFQ Operational Deprecation, Historical Read & RE Decoupling', async (t3) => {
    const rfqController = require('../controllers/rfqController');

    await t3.test('createRfq returns 400 deprecation error', async () => {
      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (d) => { jsonBody = d; } };
        }
      };
      await rfqController.createRfq({ body: {}, user: { tenant_id: 't-1' } }, res);
      assert.equal(statusCode, 400);
      assert.equal(jsonBody.success, false);
      assert.match(jsonBody.message, /RFQ operational cycle is deprecated/);
    });

    await t3.test('createVendorQuotation returns 400 deprecation error', async () => {
      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (d) => { jsonBody = d; } };
        }
      };
      await rfqController.createVendorQuotation({ params: { id: 1 }, body: {}, user: { tenant_id: 't-1' } }, res);
      assert.equal(statusCode, 400);
      assert.equal(jsonBody.success, false);
      assert.match(jsonBody.message, /Vendor quotation submission is deprecated/);
    });

    await t3.test('awardQuotation returns 400 deprecation error', async () => {
      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (d) => { jsonBody = d; } };
        }
      };
      await rfqController.awardQuotation({ params: { id: 1 }, body: {}, user: { tenant_id: 't-1', role: 'admin' } }, res);
      assert.equal(statusCode, 400);
      assert.equal(jsonBody.success, false);
      assert.match(jsonBody.message, /RFQ award is deprecated/);
    });

    await t3.test('getRfqs preserves historical read queries without failure', async () => {
      db.query = async (sql) => {
        if (sql.includes('FROM rfqs')) {
          return {
            rows: [{
              id: 1,
              rfq_number: 'RFQ-2026-0001',
              status: 'awarded',
              notes: 'Historical procurement record'
            }]
          };
        }
        return { rows: [] };
      };

      let jsonBody = null;
      const res = {
        json: (d) => { jsonBody = d; }
      };

      await rfqController.getRfqs({ query: {}, user: { tenant_id: 't-1' } }, res);
      assert.equal(jsonBody.success, true);
      assert.equal(jsonBody.data.length, 1);
      assert.equal(jsonBody.data[0].rfq_number, 'RFQ-2026-0001');
    });

    await t3.test('Zero leakage: Procurement workflows execute without touching Real Estate tables', async () => {
      const executedSqls = [];
      const trackingClient = {
        query: async (sql) => {
          executedSqls.push(sql);
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
          if (sql.includes('SELECT * FROM purchase_requests')) {
            return {
              rows: [{
                id: 101,
                request_number: 'PR-ISO-01',
                status: 'approved',
                tenant_id: 'tenant-iso',
                warehouse_id: 1
              }]
            };
          }
          if (sql.includes('SELECT id FROM vendors')) return { rows: [{ id: 5 }] };
          if (sql.includes('SELECT id FROM warehouses')) return { rows: [{ id: 1 }] };
          if (sql.includes('SELECT pri.*, p.name AS product_name')) {
            return {
              rows: [{
                id: 1,
                request_id: 101,
                product_id: 10,
                quantity: 5,
                estimated_unit_price: 100,
                product_name: 'Industrial Widget'
              }]
            };
          }
          if (sql.includes('INSERT INTO purchase_orders')) {
            return {
              rows: [{
                id: 501,
                po_number: 'PO-ISO-01',
                purchase_request_id: 101,
                status: 'draft'
              }]
            };
          }
          if (sql.includes('INSERT INTO purchase_order_items')) {
            return {
              rows: [{ id: 1001, po_id: 501, product_id: 10, quantity: 5 }]
            };
          }
          if (sql.includes('UPDATE purchase_requests')) {
            return { rows: [{ id: 101, status: 'converted_to_po' }] };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      db.connect = async () => trackingClient;

      const res = {
        status: () => ({ json: () => {} })
      };

      await purchaseOrdersController.createPurchaseOrder({
        body: { purchase_request_id: 101, vendor_id: 5, warehouse_id: 1 },
        user: { id: 1, tenant_id: 'tenant-iso', role: 'admin' }
      }, res);

      // Verify that NO query targeted re_units, re_contracts, re_reservations, or re_installments
      const reTouches = executedSqls.filter(q => /re_(units|contracts|reservations|installments|payments|handovers)/i.test(q));
      assert.equal(reTouches.length, 0, 'Procurement workflow must never access Real Estate tables');
    });
  });
});
