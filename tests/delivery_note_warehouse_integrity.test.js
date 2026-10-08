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

test('Delivery Note warehouse integrity', async (t) => {
  await t.test('creation requires a source warehouse for inventory items', async () => {
    await withTransaction({
      query: async (sql) => ({
        rows: sql.includes('FROM sales_orders')
          ? [{ customer_id: 1 }]
          : (sql.includes('FROM products') ? [{ is_inventory_item: true }] : [])
      })
    }, () => assert.rejects(
      () => DeliveryNoteService.createDeliveryNote('tenant-1', 'branch-1', {
        sales_order_id: 'so-1', items: [{ sales_order_item_id: 'soi-1', product_id: 10, quantity_delivered: 1 }]
      }, 1),
      /warehouse_id is required/
    ));
  });

  await t.test('confirmation rejects an empty selected warehouse even when global product stock exists', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FROM delivery_notes dn')) {
          return { rows: [{
            id: 'dn-1', sales_order_id: 'so-1', warehouse_id: 'wh-1', branch_id: 'branch-1', status: 'draft',
            items_json: [{ id: 'dni-1', sales_order_item_id: 'soi-1', product_id: 10, quantity_delivered: 3 }]
          }] };
        }
        if (sql.includes('FROM warehouses')) return { rows: [{ id: 'wh-1' }] };
        if (sql.includes('FROM products') && sql.includes('FOR UPDATE')) return { rows: [{ avg_cost: 12 }] };
        if (sql.includes('AS current_stock')) return { rows: [{ current_stock: 2 }] };
        return { rows: [] };
      }
    };

    await withTransaction(mockClient, () => assert.rejects(
      () => DeliveryNoteService.confirmDeliveryNote('tenant-1', 'branch-1', 'dn-1', 9),
      /has 2 available in the selected warehouse; 3 requested/
    ));
  });

  await t.test('confirmation records the selected warehouse and branch on the outbound movement', async () => {
    let movement;
    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('FROM delivery_notes dn')) {
          return { rows: [{
            id: 'dn-2', sales_order_id: 'so-2', warehouse_id: 'wh-2', branch_id: 'branch-1', status: 'draft',
            items_json: [{ id: 'dni-2', sales_order_item_id: 'soi-2', product_id: 20, quantity_delivered: 3 }]
          }] };
        }
        if (sql.includes('FROM warehouses')) return { rows: [{ id: 'wh-2' }] };
        if (sql.includes('FROM products') && sql.includes('FOR UPDATE')) return { rows: [{ avg_cost: 12 }] };
        if (sql.includes('AS current_stock')) return { rows: [{ current_stock: 3 }] };
        if (sql.includes('FROM sales_order_items') && sql.includes('FOR UPDATE')) return { rows: [{ quantity: 3, quantity_delivered: 0 }] };
        if (sql.includes('INSERT INTO stock_movements')) { movement = { sql, params }; return { rows: [] }; }
        if (sql.includes('UPDATE delivery_notes')) return { rows: [{ id: 'dn-2', status: 'delivered' }] };
        return { rows: [] };
      }
    };

    await withTransaction(mockClient, () => DeliveryNoteService.confirmDeliveryNote('tenant-1', 'branch-1', 'dn-2', 9));
    assert.ok(movement);
    assert.equal(movement.params[1], 'wh-2');
    assert.equal(movement.params[5], 'branch-1');
  });

  await t.test('confirmation rejects a quantity beyond the remaining Sales Order quantity', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FROM delivery_notes dn')) {
          return { rows: [{
            id: 'dn-3', sales_order_id: 'so-3', warehouse_id: 'wh-3', branch_id: 'branch-1', status: 'draft',
            items_json: [{ id: 'dni-3', sales_order_item_id: 'soi-3', product_id: 30, quantity_delivered: 2 }]
          }] };
        }
        if (sql.includes('FROM warehouses')) return { rows: [{ id: 'wh-3' }] };
        if (sql.includes('FROM products') && sql.includes('FOR UPDATE')) return { rows: [{ avg_cost: 10 }] };
        if (sql.includes('AS current_stock')) return { rows: [{ current_stock: 10 }] };
        if (sql.includes('FROM sales_order_items') && sql.includes('FOR UPDATE')) return { rows: [{ quantity: 5, quantity_delivered: 4 }] };
        return { rows: [] };
      }
    };

    await withTransaction(mockClient, () => assert.rejects(
      () => DeliveryNoteService.confirmDeliveryNote('tenant-1', 'branch-1', 'dn-3', 9),
      /exceeds the remaining Sales Order quantity/
    ));
  });

  await t.test('a service Delivery Note confirms without a stock movement or warehouse', async () => {
    let stockMovementCreated = false;
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FROM delivery_notes dn')) {
          return { rows: [{
            id: 'dn-service', sales_order_id: 'so-service', warehouse_id: null, branch_id: 'branch-1', status: 'draft',
            items_json: [{ id: 'dni-service', sales_order_item_id: 'soi-service', product_id: 40, quantity_delivered: 1 }]
          }] };
        }
        if (sql.includes('FROM products') && sql.includes('FOR UPDATE')) return { rows: [{ avg_cost: 0, is_inventory_item: false }] };
        if (sql.includes('FROM sales_order_items') && sql.includes('FOR UPDATE')) return { rows: [{ quantity: 1, quantity_delivered: 0 }] };
        if (sql.includes('INSERT INTO stock_movements')) stockMovementCreated = true;
        if (sql.includes('UPDATE delivery_notes')) return { rows: [{ id: 'dn-service', status: 'delivered' }] };
        return { rows: [] };
      }
    };

    await withTransaction(mockClient, () => DeliveryNoteService.confirmDeliveryNote('tenant-1', 'branch-1', 'dn-service', 9));
    assert.equal(stockMovementCreated, false);
  });
});
