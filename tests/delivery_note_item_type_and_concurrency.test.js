const test = require('node:test');
const assert = require('node:assert/strict');

const TransactionEngine = require('../src/domains/shared/TransactionEngine');
const DeliveryNoteService = require('../src/domains/sales/DeliveryNoteService');

function withTransaction(mockClient, fn) {
  const originalExecute = TransactionEngine.executeTransaction;
  const originalStage = TransactionEngine.stageOutboxEvent;
  TransactionEngine.executeTransaction = async (handler) => handler(mockClient);
  TransactionEngine.stageOutboxEvent = async () => {};
  return fn().finally(() => {
    TransactionEngine.executeTransaction = originalExecute;
    TransactionEngine.stageOutboxEvent = originalStage;
  });
}

test('DeliveryNoteService item_type and delivery integrity', async (t) => {
  // 1. Valid delivery (صرف صحيح)
  await t.test('1. Valid delivery: Successfully creates delivery note for confirmed inventory item', async () => {
    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('ALTER TABLE products')) return { rows: [] };
        if (sql.includes('FROM sales_orders')) {
          return { rows: [{ id: 'so-1', customer_id: 101, status: 'confirmed' }] };
        }
        if (sql.includes('FROM warehouses')) {
          return { rows: [{ id: 'wh-1' }] };
        }
        if (sql.includes('FROM sales_order_items')) {
          return {
            rows: [{
              id: 'soi-1',
              sales_order_id: 'so-1',
              product_id: 10,
              item_type: 'inventory',
              description: 'Valid Physical Product',
              quantity: 10,
              quantity_delivered: 2
            }]
          };
        }
        if (sql.includes('FROM products')) {
          return { rows: [{ id: 10, is_inventory_item: true }] };
        }
        if (sql.includes('document_sequences') || sql.includes('SELECT current_val FROM')) {
          return { rows: [{ next_val: 1, current_val: 1 }] };
        }
        if (sql.includes('INSERT INTO delivery_notes')) {
          return { rows: [{ id: 'dn-uuid-1', number: 'DN-2026-00001' }] };
        }
        if (sql.includes('INSERT INTO delivery_note_items')) {
          return { rows: [{ id: 'dni-uuid-1' }] };
        }
        return { rows: [] };
      }
    };

    await withTransaction(mockClient, async () => {
      const dn = await DeliveryNoteService.createDeliveryNote('tenant-1', 'branch-1', {
        sales_order_id: 'so-1',
        warehouse_id: 'wh-1',
        items: [{
          sales_order_item_id: 'soi-1',
          product_id: 10,
          quantity_delivered: 3
        }]
      }, 1);

      assert.equal(dn.id, 'dn-uuid-1');
      const itemInsert = executedQueries.find(q => q.sql.includes('INSERT INTO delivery_note_items'));
      assert.ok(itemInsert, 'Must insert into delivery_note_items');
      assert.equal(itemInsert.params[1], 'soi-1');
      assert.equal(itemInsert.params[2], 10);
      assert.equal(itemInsert.params[3], 3);
    });
  });

  // 2. Unclassified / Service / Non-inventory items (بند غير مصنف)
  await t.test('2. Rejects legacy_unclassified item from delivery note dispatch', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('ALTER TABLE products')) return { rows: [] };
        if (sql.includes('FROM sales_orders')) return { rows: [{ id: 'so-1', customer_id: 101, status: 'confirmed' }] };
        if (sql.includes('FROM warehouses')) return { rows: [{ id: 'wh-1' }] };
        if (sql.includes('FROM sales_order_items')) {
          return {
            rows: [{
              id: 'soi-legacy',
              sales_order_id: 'so-1',
              product_id: null,
              item_type: 'legacy_unclassified',
              description: 'system',
              quantity: 1,
              quantity_delivered: 0
            }]
          };
        }
        return { rows: [] };
      }
    };

    await withTransaction(mockClient, () =>
      assert.rejects(
        () => DeliveryNoteService.createDeliveryNote('tenant-1', 'branch-1', {
          sales_order_id: 'so-1',
          warehouse_id: 'wh-1',
          items: [{ sales_order_item_id: 'soi-legacy', quantity_delivered: 1 }]
        }, 1),
        /unclassified historical item and cannot be dispatched/
      )
    );
  });

  await t.test('3. Rejects service item from warehouse delivery note dispatch', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('ALTER TABLE products')) return { rows: [] };
        if (sql.includes('FROM sales_orders')) return { rows: [{ id: 'so-1', customer_id: 101, status: 'confirmed' }] };
        if (sql.includes('FROM warehouses')) return { rows: [{ id: 'wh-1' }] };
        if (sql.includes('FROM sales_order_items')) {
          return {
            rows: [{
              id: 'soi-srv',
              sales_order_id: 'so-1',
              product_id: null,
              item_type: 'service',
              description: 'Maintenance Service',
              quantity: 1,
              quantity_delivered: 0
            }]
          };
        }
        return { rows: [] };
      }
    };

    await withTransaction(mockClient, () =>
      assert.rejects(
        () => DeliveryNoteService.createDeliveryNote('tenant-1', 'branch-1', {
          sales_order_id: 'so-1',
          warehouse_id: 'wh-1',
          items: [{ sales_order_item_id: 'soi-srv', quantity_delivered: 1 }]
        }, 1),
        /is a service and does not require physical inventory delivery/
      )
    );
  });

  // 3. Product mismatch (منتج غير مطابق)
  await t.test('4. Rejects delivery note when requested product does not match sales order item product', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('ALTER TABLE products')) return { rows: [] };
        if (sql.includes('FROM sales_orders')) return { rows: [{ id: 'so-1', customer_id: 101, status: 'confirmed' }] };
        if (sql.includes('FROM warehouses')) return { rows: [{ id: 'wh-1' }] };
        if (sql.includes('FROM sales_order_items')) {
          return {
            rows: [{
              id: 'soi-1',
              sales_order_id: 'so-1',
              product_id: 10,
              item_type: 'inventory',
              quantity: 5,
              quantity_delivered: 0
            }]
          };
        }
        return { rows: [] };
      }
    };

    await withTransaction(mockClient, () =>
      assert.rejects(
        () => DeliveryNoteService.createDeliveryNote('tenant-1', 'branch-1', {
          sales_order_id: 'so-1',
          warehouse_id: 'wh-1',
          items: [{ sales_order_item_id: 'soi-1', product_id: 99, quantity_delivered: 1 }]
        }, 1),
        /Product mismatch: requested product 99 does not match Sales Order item product 10/
      )
    );
  });

  // 4. Excess quantity and decimal precision (كمية زائدة)
  await t.test('5. Rejects delivery quantity exceeding remaining deliverable quantity', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('ALTER TABLE products')) return { rows: [] };
        if (sql.includes('FROM sales_orders')) return { rows: [{ id: 'so-1', customer_id: 101, status: 'confirmed' }] };
        if (sql.includes('FROM warehouses')) return { rows: [{ id: 'wh-1' }] };
        if (sql.includes('FROM sales_order_items')) {
          return {
            rows: [{
              id: 'soi-1',
              sales_order_id: 'so-1',
              product_id: 10,
              item_type: 'inventory',
              quantity: 2,
              quantity_delivered: 1.5
            }]
          };
        }
        if (sql.includes('FROM products')) return { rows: [{ id: 10, is_inventory_item: true }] };
        return { rows: [] };
      }
    };

    await withTransaction(mockClient, () =>
      assert.rejects(
        () => DeliveryNoteService.createDeliveryNote('tenant-1', 'branch-1', {
          sales_order_id: 'so-1',
          warehouse_id: 'wh-1',
          items: [{ sales_order_item_id: 'soi-1', product_id: 10, quantity_delivered: 0.6 }]
        }, 1),
        /Delivery quantity \(0\.6\) exceeds remaining deliverable quantity \(0\.5\)/
      )
    );
  });

  await t.test('6. Supports decimal precision correctly (e.g. 0.1 + 0.2 = 0.3 without IEEE-754 overflow)', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('ALTER TABLE products')) return { rows: [] };
        if (sql.includes('FROM sales_orders')) return { rows: [{ id: 'so-1', customer_id: 101, status: 'confirmed' }] };
        if (sql.includes('FROM warehouses')) return { rows: [{ id: 'wh-1' }] };
        if (sql.includes('FROM sales_order_items')) {
          return {
            rows: [{
              id: 'soi-dec',
              sales_order_id: 'so-1',
              product_id: 10,
              item_type: 'inventory',
              quantity: 0.3,
              quantity_delivered: 0.1
            }]
          };
        }
        if (sql.includes('FROM products')) return { rows: [{ id: 10, is_inventory_item: true }] };
        if (sql.includes('document_sequences') || sql.includes('SELECT current_val FROM')) return { rows: [{ next_val: 1, current_val: 1 }] };
        if (sql.includes('INSERT INTO delivery_notes')) return { rows: [{ id: 'dn-dec-1' }] };
        if (sql.includes('INSERT INTO delivery_note_items')) return { rows: [{ id: 'dni-dec-1' }] };
        return { rows: [] };
      }
    };

    await withTransaction(mockClient, async () => {
      // 0.3 total - 0.1 delivered = 0.2 remaining. Requesting exactly 0.2 must not throw precision error.
      const dn = await DeliveryNoteService.createDeliveryNote('tenant-1', 'branch-1', {
        sales_order_id: 'so-1',
        warehouse_id: 'wh-1',
        items: [{ sales_order_item_id: 'soi-dec', product_id: 10, quantity_delivered: 0.2 }]
      }, 1);
      assert.equal(dn.id, 'dn-dec-1');
    });
  });

  // 5. Ineligible sales order (أمر بيع غير مؤهل)
  await t.test('7. Rejects delivery for draft sales order', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('ALTER TABLE products')) return { rows: [] };
        if (sql.includes('FROM sales_orders')) return { rows: [{ id: 'so-draft', customer_id: 101, status: 'draft' }] };
        return { rows: [] };
      }
    };

    await withTransaction(mockClient, () =>
      assert.rejects(
        () => DeliveryNoteService.createDeliveryNote('tenant-1', 'branch-1', {
          sales_order_id: 'so-draft',
          warehouse_id: 'wh-1',
          items: [{ sales_order_item_id: 'soi-1', product_id: 10, quantity_delivered: 1 }]
        }, 1),
        /Cannot deliver Sales Order: Status is 'draft'/
      )
    );
  });

  await t.test('8. Rejects delivery for cancelled sales order', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('ALTER TABLE products')) return { rows: [] };
        if (sql.includes('FROM sales_orders')) return { rows: [{ id: 'so-cancelled', customer_id: 101, status: 'cancelled' }] };
        return { rows: [] };
      }
    };

    await withTransaction(mockClient, () =>
      assert.rejects(
        () => DeliveryNoteService.createDeliveryNote('tenant-1', 'branch-1', {
          sales_order_id: 'so-cancelled',
          warehouse_id: 'wh-1',
          items: [{ sales_order_item_id: 'soi-1', product_id: 10, quantity_delivered: 1 }]
        }, 1),
        /Cannot deliver Sales Order: Status is 'cancelled'/
      )
    );
  });

  // 6. Concurrency & duplicate delivery prevention (طلبان متزامنان)
  await t.test('9. Prevents duplicate / concurrent delivery beyond remaining quantity', async () => {
    let currentDelivered = 0;
    const totalOrderQty = 10;

    // Simulate database state that gets updated atomically between two concurrent requests
    const createMockClient = () => ({
      query: async (sql) => {
        if (sql.includes('ALTER TABLE products')) return { rows: [] };
        if (sql.includes('FROM sales_orders')) return { rows: [{ id: 'so-conc', customer_id: 101, status: 'confirmed' }] };
        if (sql.includes('FROM warehouses')) return { rows: [{ id: 'wh-1' }] };
        if (sql.includes('FROM sales_order_items')) {
          return {
            rows: [{
              id: 'soi-conc',
              sales_order_id: 'so-conc',
              product_id: 10,
              item_type: 'inventory',
              quantity: totalOrderQty,
              quantity_delivered: currentDelivered
            }]
          };
        }
        if (sql.includes('FROM products')) return { rows: [{ id: 10, is_inventory_item: true }] };
        if (sql.includes('document_sequences') || sql.includes('SELECT current_val FROM')) return { rows: [{ next_val: 1, current_val: 1 }] };
        if (sql.includes('INSERT INTO delivery_notes')) return { rows: [{ id: 'dn-conc-1' }] };
        if (sql.includes('INSERT INTO delivery_note_items')) {
          // Simulate first transaction successfully reserving/delivering 10 units
          currentDelivered += 10;
          return { rows: [{ id: 'dni-conc-1' }] };
        }
        return { rows: [] };
      }
    });

    // Request 1: successfully dispatches 10 units
    await withTransaction(createMockClient(), async () => {
      const dn1 = await DeliveryNoteService.createDeliveryNote('tenant-1', 'branch-1', {
        sales_order_id: 'so-conc',
        warehouse_id: 'wh-1',
        items: [{ sales_order_item_id: 'soi-conc', product_id: 10, quantity_delivered: 10 }]
      }, 1);
      assert.equal(dn1.id, 'dn-conc-1');
    });

    // Request 2 (concurrent or immediately following): attempts to dispatch 10 units again
    // Must be blocked because remaining quantity is now 0
    await withTransaction(createMockClient(), () =>
      assert.rejects(
        () => DeliveryNoteService.createDeliveryNote('tenant-1', 'branch-1', {
          sales_order_id: 'so-conc',
          warehouse_id: 'wh-1',
          items: [{ sales_order_item_id: 'soi-conc', product_id: 10, quantity_delivered: 10 }]
        }, 1),
        /has already been fully delivered/
      )
    );
  });
});
