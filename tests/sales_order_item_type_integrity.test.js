const test = require('node:test');
const assert = require('node:assert/strict');
const TransactionEngine = require('../src/domains/shared/TransactionEngine');
const SalesOrderService = require('../src/domains/sales/SalesOrderService');

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

test('SalesOrderService item_type and mathematical domain validation', async (t) => {
  await t.test('1. Rejects line item with quantity <= 0', async () => {
    await withTransaction({ query: async () => ({ rows: [] }) }, () =>
      assert.rejects(
        () => SalesOrderService.createSalesOrder('tenant-1', 'branch-1', {
          customer_id: 10,
          items: [{ item_type: 'service', description: 'Consulting', quantity: 0, unit_price: 100 }]
        }, 1),
        /Quantity must be a strictly positive number/
      )
    );
  });

  await t.test('2. Rejects line item with negative unit price', async () => {
    await withTransaction({ query: async () => ({ rows: [] }) }, () =>
      assert.rejects(
        () => SalesOrderService.createSalesOrder('tenant-1', 'branch-1', {
          customer_id: 10,
          items: [{ item_type: 'service', description: 'Consulting', quantity: 1, unit_price: -50 }]
        }, 1),
        /Price cannot be negative or NaN/
      )
    );
  });

  await t.test('3. Rejects legacy_unclassified from direct API creation', async () => {
    await withTransaction({ query: async () => ({ rows: [] }) }, () =>
      assert.rejects(
        () => SalesOrderService.createSalesOrder('tenant-1', 'branch-1', {
          customer_id: 10,
          items: [{ item_type: 'legacy_unclassified', description: 'Old item', quantity: 1, unit_price: 100 }]
        }, 1),
        /legacy_unclassified.*cannot be assigned to new order items/
      )
    );
  });

  await t.test('4. Rejects inventory item without valid product_id', async () => {
    await withTransaction({ query: async () => ({ rows: [] }) }, () =>
      assert.rejects(
        () => SalesOrderService.createSalesOrder('tenant-1', 'branch-1', {
          customer_id: 10,
          items: [{ item_type: 'inventory', description: 'Item without product', quantity: 1, unit_price: 100 }]
        }, 1),
        /has no valid product reference/
      )
    );
  });

  await t.test('5. Rejects non-inventory product classified as inventory', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FROM products')) {
          return { rows: [{ id: 99, is_inventory_item: false }] };
        }
        return { rows: [] };
      }
    };

    await withTransaction(mockClient, () =>
      assert.rejects(
        () => SalesOrderService.createSalesOrder('tenant-1', 'branch-1', {
          customer_id: 10,
          items: [{ item_type: 'inventory', product_id: 99, quantity: 1, unit_price: 100 }]
        }, 1),
        /is not a physical inventory item/
      )
    );
  });

  await t.test('6. Rejects physical inventory product classified as service', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FROM products')) {
          return { rows: [{ id: 100, is_inventory_item: true }] };
        }
        return { rows: [] };
      }
    };

    await withTransaction(mockClient, () =>
      assert.rejects(
        () => SalesOrderService.createSalesOrder('tenant-1', 'branch-1', {
          customer_id: 10,
          items: [{ item_type: 'service', product_id: 100, quantity: 1, unit_price: 100 }]
        }, 1),
        /is an inventory item.*cannot be classified as 'service'/
      )
    );
  });

  await t.test('7. Accepts valid inventory item and creates order header and item with item_type', async () => {
    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM products')) {
          return { rows: [{ id: 10, is_inventory_item: true }] };
        }
        if (sql.includes('document_sequences') || sql.includes('SELECT current_val FROM')) {
          return { rows: [{ next_val: 1, current_val: 1 }] };
        }
        if (sql.includes('INSERT INTO sales_orders')) {
          return { rows: [{ id: 'so-uuid-1', number: 'SO-2026-00001' }] };
        }
        if (sql.includes('INSERT INTO sales_order_items')) {
          return { rows: [{ id: 'soi-uuid-1' }] };
        }
        return { rows: [{ next_val: 1, current_val: 1 }] };
      }
    };

    await withTransaction(mockClient, async () => {
      const order = await SalesOrderService.createSalesOrder('tenant-1', 'branch-1', {
        customer_id: 10,
        items: [{ item_type: 'inventory', product_id: 10, description: 'Test Goods', quantity: 2, unit_price: 50 }]
      }, 1);

      assert.equal(order.id, 'so-uuid-1');
      const itemInsert = executedQueries.find(q => q.sql.includes('INSERT INTO sales_order_items'));
      assert.ok(itemInsert, 'sales_order_items must be inserted');
      assert.equal(itemInsert.params[3], 'inventory', 'item_type param must be inventory');
      assert.equal(itemInsert.params[4], 2, 'quantity must be 2');
      assert.equal(itemInsert.params[5], 50, 'unit_price must be 50');
      assert.equal(itemInsert.params[6], 100, 'subtotal must be 100');
    });
  });

  await t.test('8. Quotation conversion allows legacy_unclassified when verified at item-level from quotation_items', async () => {
    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM quotations')) {
          return {
            rows: [{
              id: 'quo-1',
              number: 'QUO-001',
              client_id: 10,
              status: 'approved',
              notes: 'Historical quote'
            }]
          };
        }
        if (sql.includes('FROM sales_orders')) {
          return { rows: [] };
        }
        if (sql.includes('FROM quotation_items')) {
          return {
            rows: [{
              id: 'qi-101',
              quotation_id: 'quo-1',
              description: 'Historical service item',
              item_type: 'legacy_unclassified',
              product_id: null,
              quantity: 1,
              unit_price: 150
            }]
          };
        }
        if (sql.includes('document_sequences') || sql.includes('SELECT current_val FROM')) {
          return { rows: [{ next_val: 1, current_val: 1 }] };
        }
        if (sql.includes('INSERT INTO sales_orders')) {
          return { rows: [{ id: 'so-uuid-converted', number: 'SO-2026-00002' }] };
        }
        if (sql.includes('INSERT INTO sales_order_items')) {
          return { rows: [{ id: 'soi-uuid-legacy' }] };
        }
        if (sql.includes('UPDATE quotations')) {
          return { rows: [{ id: 'quo-1', status: 'converted_to_so' }] };
        }
        return { rows: [{ next_val: 1, current_val: 1 }] };
      }
    };

    await withTransaction(mockClient, async () => {
      const order = await SalesOrderService.convertQuotationToSalesOrder('tenant-1', 'branch-1', 'quo-1', 1);
      assert.equal(order.id, 'so-uuid-converted');

      const itemInsert = executedQueries.find(q => q.sql.includes('INSERT INTO sales_order_items'));
      assert.ok(itemInsert, 'sales_order_items must be inserted');
      assert.equal(itemInsert.params[3], 'legacy_unclassified', 'item_type must be legacy_unclassified');
      assert.equal(itemInsert.params[2], 'Historical service item');
    });
  });

  await t.test('9. Quotation conversion rejects unverified or spoofed legacy_unclassified item', async () => {
    // If an item claims legacy_unclassified without matching an item id from the verified quotation_items set
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FROM products')) {
          return { rows: [{ id: 10, is_inventory_item: true }] };
        }
        return { rows: [] };
      }
    };

    await withTransaction(mockClient, () =>
      assert.rejects(
        () => SalesOrderService.createSalesOrder('tenant-1', 'branch-1', {
          customer_id: 10,
          items: [{
            item_type: 'legacy_unclassified',
            quotation_item_id: 'forged-item-id',
            description: 'Forged legacy item',
            quantity: 1,
            unit_price: 100
          }]
        }, 1),
        /legacy_unclassified.*cannot be assigned to new order items/
      )
    );
  });

  await t.test('10. getSalesOrders applies explicit whitelist (confirmed, delivered, invoiced) and projects remaining_deliverable', async () => {
    const db = require('../config/db');
    const originalQuery = db.query;
    let capturedSql = null;
    let capturedParams = null;

    db.query = async (sql, params) => {
      capturedSql = sql;
      capturedParams = params;
      return { rows: [] };
    };

    try {
      await SalesOrderService.getSalesOrders('tenant-1', 'branch-1');
      assert.ok(capturedSql, 'Query must be executed');
      assert.ok(
        capturedSql.includes("so.status IN ('confirmed', 'delivered', 'invoiced')"),
        'Query must enforce explicit positive whitelist on order status for can_deliver'
      );
      assert.ok(
        !capturedSql.includes("so.status NOT IN ('draft', 'cancelled')"),
        'Query must NOT use loose negative check'
      );
      assert.ok(
        capturedSql.includes("'remaining_deliverable'"),
        'Query must project remaining_deliverable'
      );
      assert.ok(
        capturedSql.includes("'description', soi.description"),
        'Query must project item description'
      );
    } finally {
      db.query = originalQuery;
    }
  });

  await t.test('11. Direct Sales Order infers item_type = "inventory" when product_id is verified physical inventory and item_type is omitted', async () => {
    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM products')) {
          return { rows: [{ id: 55, is_inventory_item: true }] };
        }
        if (sql.includes('document_sequences') || sql.includes('SELECT current_val FROM')) {
          return { rows: [{ next_val: 1, current_val: 1 }] };
        }
        if (sql.includes('INSERT INTO sales_orders')) {
          return { rows: [{ id: 'so-inferred-1', number: 'SO-2026-00055' }] };
        }
        if (sql.includes('INSERT INTO sales_order_items')) {
          return { rows: [{ id: 'soi-inferred-1' }] };
        }
        return { rows: [{ next_val: 1, current_val: 1 }] };
      }
    };

    await withTransaction(mockClient, async () => {
      // Sending item WITHOUT item_type, but with product_id 55 (is_inventory_item = true)
      const order = await SalesOrderService.createSalesOrder('tenant-1', 'branch-1', {
        customer_id: 10,
        items: [{ product_id: 55, description: 'Auto Inventory SKU', quantity: 3, unit_price: 25 }]
      }, 1);

      assert.equal(order.id, 'so-inferred-1');
      const itemInsert = executedQueries.find(q => q.sql.includes('INSERT INTO sales_order_items'));
      assert.ok(itemInsert, 'sales_order_items must be inserted');
      assert.equal(itemInsert.params[3], 'inventory', 'item_type must be inferred as inventory');
      assert.equal(itemInsert.params[4], 3, 'quantity must be 3');
      assert.equal(itemInsert.params[6], 75, 'subtotal must be 75');
    });
  });

  await t.test('12. Direct Sales Order rejects item without item_type when product is non-inventory or custom item', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FROM products')) {
          return { rows: [{ id: 88, is_inventory_item: false }] };
        }
        return { rows: [] };
      }
    };

    await withTransaction(mockClient, () =>
      assert.rejects(
        () => SalesOrderService.createSalesOrder('tenant-1', 'branch-1', {
          customer_id: 10,
          items: [{ product_id: 88, description: 'Non-inventory item without explicit type', quantity: 1, unit_price: 100 }]
        }, 1),
        /must specify a valid item_type/
      )
    );
  });
});

