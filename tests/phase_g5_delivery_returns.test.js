const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');

// Preserve original methods
const originalDbQuery = db.query;
const originalDbConnect = db.connect;
const originalPoolConnect = db.pool.connect;

test('Phase G-5: Delivery Returns & Stock IN Integrity Suite', async (t) => {
  t.beforeEach(() => {
    db.query = async () => ({ rows: [] });
  });

  t.afterEach(() => {
    db.query = originalDbQuery;
    db.connect = originalDbConnect;
    db.pool.connect = originalPoolConnect;
  });

  const SalesReturnService = require('../src/domains/sales/SalesReturnService');

  await t.test('1. Delivery Note validation: Rejects return if Delivery Note is not in "delivered" status', async () => {
    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('FROM delivery_notes dn') && sql.includes('FOR UPDATE OF dn')) {
          // Delivery Note is still 'draft' (not confirmed yet)
          return {
            rows: [{ id: 'dn-1', number: 'DN-001', status: 'draft', customer_id: 10 }]
          };
        }
        return { rows: [] };
      }
    };

    const TransactionEngine = require('../src/domains/shared/TransactionEngine');
    const origExecute = TransactionEngine.executeTransaction;
    TransactionEngine.executeTransaction = async (fn) => fn(mockClient);

    try {
      await assert.rejects(
        async () => {
          await SalesReturnService.createSalesReturn('tenant-1', 'branch-1', {
            delivery_note_id: 'dn-1',
            items: [{ delivery_note_item_id: 'dni-1', quantity_returned: 2 }]
          }, 1);
        },
        /Cannot return items for a Delivery Note in 'draft' status/
      );
    } finally {
      TransactionEngine.executeTransaction = origExecute;
    }
  });

  await t.test('2. Quantity Limit: Rejects return if quantity_returned exceeds remaining returnable quantity per item', async () => {
    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('FROM delivery_notes dn') && sql.includes('FOR UPDATE OF dn')) {
          return {
            rows: [{ id: 'dn-2', number: 'DN-002', status: 'delivered', customer_id: 10 }]
          };
        }
        if (sql.includes('FROM delivery_note_items dni') && sql.includes('FOR UPDATE OF dni')) {
          // Item has delivered 10, already returned 7 -> remaining returnable is 3
          return {
            rows: [
              {
                id: 'dni-10',
                product_id: 101,
                quantity_delivered: 10,
                already_returned: 7,
                unit_cost: 50.00
              }
            ]
          };
        }
        return { rows: [] };
      }
    };

    const TransactionEngine = require('../src/domains/shared/TransactionEngine');
    const origExecute = TransactionEngine.executeTransaction;
    TransactionEngine.executeTransaction = async (fn) => fn(mockClient);

    try {
      // Trying to return 5 when only 3 is available
      await assert.rejects(
        async () => {
          await SalesReturnService.createSalesReturn('tenant-1', 'branch-1', {
            delivery_note_id: 'dn-2',
            items: [{ delivery_note_item_id: 'dni-10', quantity_returned: 5 }]
          }, 1);
        },
        /Maximum returnable quantity for item dni-10 is 3/
      );
    } finally {
      TransactionEngine.executeTransaction = origExecute;
    }
  });

  await t.test('3. Stock IN & Inventory Restoration: Creates stock_movement IN and increments products.current_qty', async () => {
    let capturedStockMovement = null;
    let capturedProductUpdate = null;
    let capturedReturnUpdate = null;

    const mockClient = {
      query: async (sql, params) => {
        // Fetch Sales Return
        if (sql.includes('FROM sales_returns sr') && sql.includes('FOR UPDATE OF sr')) {
          return {
            rows: [
              {
                id: 'sr-100',
                number: 'SR-2026-001',
                delivery_note_id: 'dn-100',
                status: 'draft',
                items_json: [
                  {
                    id: 'sri-1',
                    sales_return_id: 'sr-100',
                    delivery_note_item_id: 'dni-100',
                    product_id: 500,
                    quantity_returned: 4,
                    unit_cost: 75.00
                  }
                ]
              }
            ]
          };
        }
        // Fetch Delivery Note
        if (sql.includes('FROM delivery_notes') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{ id: 'dn-100', warehouse_id: 'wh-1', status: 'delivered' }]
          };
        }
        // Re-verify DNI limits atomically
        if (sql.includes('FROM delivery_note_items dni') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{ id: 'dni-100', quantity_delivered: 10, already_returned: 0 }]
          };
        }
        // Lock Product
        if (sql.includes('FROM products') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{ id: 500, current_qty: 20, avg_cost: 75.00 }]
          };
        }
        // Insert Stock Movement
        if (sql.includes('INSERT INTO stock_movements')) {
          capturedStockMovement = { sql, params };
          return { rows: [] };
        }
        // Update product current_qty
        if (sql.includes('UPDATE products') && sql.includes('current_qty = COALESCE(current_qty, 0) + $1')) {
          capturedProductUpdate = { sql, params };
          return { rows: [] };
        }
        // Update sales_returns status to completed
        if (sql.includes('UPDATE sales_returns') && sql.includes("status = 'completed'")) {
          capturedReturnUpdate = { sql, params };
          return {
            rows: [{ id: 'sr-100', number: 'SR-2026-001', status: 'completed' }]
          };
        }
        return { rows: [] };
      }
    };

    const TransactionEngine = require('../src/domains/shared/TransactionEngine');
    const origExecute = TransactionEngine.executeTransaction;
    const origStage = TransactionEngine.stageOutboxEvent;
    TransactionEngine.executeTransaction = async (fn) => fn(mockClient);
    TransactionEngine.stageOutboxEvent = async () => {};

    try {
      const result = await SalesReturnService.confirmSalesReturn('tenant-1', 'branch-1', 'sr-100', 99);

      assert.equal(result.status, 'completed');

      // Verify Stock Movement IN parameters:
      // ('in', product_id, to_warehouse_id, quantity, unit_cost, 'approved', tenant_id, 'sales_return', sr.id, userId)
      assert.ok(capturedStockMovement, 'Stock movement must be inserted');
      assert.equal(capturedStockMovement.params[0], 500); // product_id
      assert.equal(capturedStockMovement.params[1], 'wh-1'); // to_warehouse_id
      assert.equal(capturedStockMovement.params[2], 4); // quantity
      assert.equal(capturedStockMovement.params[3], 75.00); // unit_cost
      assert.equal(capturedStockMovement.params[4], 'tenant-1'); // tenant_id
      assert.equal(capturedStockMovement.params[5], 'sr-100'); // reference_id
      assert.equal(capturedStockMovement.params[6], 99); // userId

      // Verify Product current_qty increment:
      assert.ok(capturedProductUpdate, 'Product current_qty must be updated');
      assert.equal(capturedProductUpdate.params[0], 4); // increment qty by 4
      assert.equal(capturedProductUpdate.params[1], '500'); // product_id

      // Verify status updated to completed:
      assert.ok(capturedReturnUpdate, 'Sales return must be marked completed');
      assert.equal(capturedReturnUpdate.params[0], 'sr-100');
    } finally {
      TransactionEngine.executeTransaction = origExecute;
      TransactionEngine.stageOutboxEvent = origStage;
    }
  });

  await t.test('4. Idempotency Guard: Re-confirming a completed Sales Return returns existing result without Stock IN repetition', async () => {
    let stockMovementCalled = false;

    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('FROM sales_returns sr') && sql.includes('FOR UPDATE OF sr')) {
          // Already completed
          return {
            rows: [
              {
                id: 'sr-101',
                number: 'SR-2026-002',
                status: 'completed',
                delivery_note_id: 'dn-101'
              }
            ]
          };
        }
        if (sql.includes('INSERT INTO stock_movements')) {
          stockMovementCalled = true;
        }
        return { rows: [] };
      }
    };

    const TransactionEngine = require('../src/domains/shared/TransactionEngine');
    const origExecute = TransactionEngine.executeTransaction;
    TransactionEngine.executeTransaction = async (fn) => fn(mockClient);

    try {
      const result = await SalesReturnService.confirmSalesReturn('tenant-1', 'branch-1', 'sr-101', 99);
      assert.equal(result.status, 'completed');
      assert.equal(result._already_confirmed, true);
      assert.equal(stockMovementCalled, false, 'Must NOT trigger additional stock movements');
    } finally {
      TransactionEngine.executeTransaction = origExecute;
    }
  });

  await t.test('5. Net Delivered Computation: Accurately preserves historical quantity_delivered while computing Net Delivered', async () => {
    db.query = async (sql, params) => {
      if (sql.includes('FROM delivery_note_items dni') && sql.includes('LEFT JOIN (')) {
        return {
          rows: [
            {
              delivery_note_item_id: 'dni-200',
              product_id: 10,
              product_name: 'Industrial Valve',
              quantity_delivered: '10.000',
              total_returned: '3.000',
              net_delivered: '7.000'
            },
            {
              delivery_note_item_id: 'dni-201',
              product_id: 11,
              product_name: 'Pressure Gauge',
              quantity_delivered: '5.000',
              total_returned: '0.000',
              net_delivered: '5.000'
            }
          ]
        };
      }
      return { rows: [] };
    };

    const result = await SalesReturnService.getDeliveryNoteNetDelivered('tenant-1', 'dn-200');

    assert.equal(result.length, 2);
    // Item 1: 10 delivered, 3 returned -> net 7
    assert.equal(parseFloat(result[0].quantity_delivered), 10);
    assert.equal(parseFloat(result[0].total_returned), 3);
    assert.equal(parseFloat(result[0].net_delivered), 7);

    // Item 2: 5 delivered, 0 returned -> net 5
    assert.equal(parseFloat(result[1].quantity_delivered), 5);
    assert.equal(parseFloat(result[1].total_returned), 0);
    assert.equal(parseFloat(result[1].net_delivered), 5);
  });
});
