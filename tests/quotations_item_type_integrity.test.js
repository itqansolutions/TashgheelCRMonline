const test = require('node:test');
const assert = require('node:assert/strict');
const quotationsController = require('../controllers/quotationsController');
const db = require('../config/db');
const loggerService = require('../services/loggerService');
loggerService.logCreate = () => {};

function mockReqRes({ body = {}, user = { tenant_id: 'c3df623d-84d6-45bc-a6d0-74df507ef5d4', branch_id: 'branch-1' }, branchId = 'branch-1' } = {}) {
  const req = {
    body,
    user,
    branchId,
    headers: {}
  };

  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    }
  };

  return { req, res };
}

test('quotationsController item_type classification integrity', async (t) => {
  const origConnect = db.connect;
  const origPool = db.pool;

  t.afterEach(() => {
    db.connect = origConnect;
    db.pool = origPool;
  });

  await t.test('1. Verified physical inventory product inherits item_type = "inventory"', async () => {
    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM customers')) return { rows: [{ id: 1 }] };
        if (sql.includes('FROM products')) {
          return { rows: [{ id: 10, is_inventory_item: true }] };
        }
        if (sql.includes('document_sequences') || sql.includes('SELECT current_val FROM')) {
          return { rows: [{ next_val: 1, current_val: 1 }] };
        }
        if (sql.includes('INSERT INTO quotations')) {
          return { rows: [{ id: 'quo-1', number: 'QUO-2026-00001' }] };
        }
        if (sql.includes('INSERT INTO quotation_items')) {
          return { rows: [{ id: 'qi-1' }] };
        }
        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;
    db.pool = { connect: async () => mockClient };

    const { req, res } = mockReqRes({
      body: {
        client_id: 1,
        items: [{ product_id: 10, description: 'Physical Goods', quantity: 2, unit_price: 50 }]
      }
    });

    await quotationsController.createQuotation(req, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.data.status, 'success');

    const itemInsert = executedQueries.find(q => q.sql.includes('INSERT INTO quotation_items'));
    assert.ok(itemInsert, 'quotation_items must be inserted');
    assert.equal(itemInsert.params[3], 'inventory', 'item_type must be inventory');
  });

  await t.test('2. Non-inventory product requires and accepts explicit "service" or "non_inventory"', async () => {
    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM customers')) return { rows: [{ id: 1 }] };
        if (sql.includes('FROM products')) {
          return { rows: [{ id: 20, is_inventory_item: false }] };
        }
        if (sql.includes('document_sequences') || sql.includes('SELECT current_val FROM')) {
          return { rows: [{ next_val: 2, current_val: 2 }] };
        }
        if (sql.includes('INSERT INTO quotations')) {
          return { rows: [{ id: 'quo-2', number: 'QUO-2026-00002' }] };
        }
        if (sql.includes('INSERT INTO quotation_items')) {
          return { rows: [{ id: 'qi-2' }] };
        }
        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;
    db.pool = { connect: async () => mockClient };

    const { req, res } = mockReqRes({
      body: {
        client_id: 1,
        items: [{ product_id: 20, item_type: 'service', description: 'Consulting Service', quantity: 1, unit_price: 200 }]
      }
    });

    await quotationsController.createQuotation(req, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.data.status, 'success');

    const itemInsert = executedQueries.find(q => q.sql.includes('INSERT INTO quotation_items'));
    assert.ok(itemInsert, 'quotation_items must be inserted');
    assert.equal(itemInsert.params[3], 'service', 'item_type must be service');
  });

  await t.test('3. Rejects custom item without explicit item_type', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM customers')) return { rows: [{ id: 1 }] };
        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;
    db.pool = { connect: async () => mockClient };

    const { req, res } = mockReqRes({
      body: {
        client_id: 1,
        items: [{ product_id: null, description: 'Custom unclassified item', quantity: 1, unit_price: 100 }]
      }
    });

    await quotationsController.createQuotation(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.data.message, /requires an explicit item_type/);
  });

  await t.test('4. Rejects physical inventory product classified as service', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM customers')) return { rows: [{ id: 1 }] };
        if (sql.includes('FROM products')) {
          return { rows: [{ id: 10, is_inventory_item: true }] };
        }
        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;
    db.pool = { connect: async () => mockClient };

    const { req, res } = mockReqRes({
      body: {
        client_id: 1,
        items: [{ product_id: 10, item_type: 'service', description: 'Attempted misclassification', quantity: 1, unit_price: 100 }]
      }
    });

    await quotationsController.createQuotation(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.data.message, /is a physical inventory product; cannot be classified as 'service'/);
  });

  await t.test('5. Rejects legacy_unclassified on new quotation items', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM customers')) return { rows: [{ id: 1 }] };
        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;
    db.pool = { connect: async () => mockClient };

    const { req, res } = mockReqRes({
      body: {
        client_id: 1,
        items: [{ item_type: 'legacy_unclassified', description: 'Old style', quantity: 1, unit_price: 100 }]
      }
    });

    await quotationsController.createQuotation(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.data.message, /'legacy_unclassified' is restricted to historical records/);
  });

  await t.test('6. Accepts quotation with catalog service product AND custom manual service line item', async () => {
    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM customers')) return { rows: [{ id: 1 }] };
        if (sql.includes('FROM products')) {
          return { rows: [{ id: 50, is_inventory_item: false }] };
        }
        if (sql.includes('document_sequences') || sql.includes('SELECT current_val FROM')) {
          return { rows: [{ next_val: 6, current_val: 6 }] };
        }
        if (sql.includes('INSERT INTO quotations')) {
          return { rows: [{ id: 'quo-6', number: 'QUO-2026-00006' }] };
        }
        if (sql.includes('INSERT INTO quotation_items')) {
          return { rows: [{ id: 'qi-' + executedQueries.length }] };
        }
        return { rows: [] };
      },
      release: () => {}
    };

    db.connect = async () => mockClient;
    db.pool = { connect: async () => mockClient };

    const { req, res } = mockReqRes({
      body: {
        client_id: 1,
        items: [
          // 1. Catalog service item
          { product_id: 50, item_type: 'service', description: 'Consulting Package', quantity: 1, unit_price: 500 },
          // 2. Custom manual service line item on the fly
          { product_id: null, item_type: 'service', description: 'On-site Installation & Training', quantity: 2, unit_price: 250 }
        ]
      }
    });

    await quotationsController.createQuotation(req, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.data.status, 'success');

    const itemInserts = executedQueries.filter(q => q.sql.includes('INSERT INTO quotation_items'));
    assert.equal(itemInserts.length, 2, 'Both items must be inserted');
    assert.equal(itemInserts[0].params[3], 'service', 'Catalog item must be inserted as service');
    assert.equal(itemInserts[1].params[3], 'service', 'Custom manual line item must be inserted as service');
  });
});
