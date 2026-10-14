/**
 * tests/integration/po_receiving_concurrency.test.js
 * 
 * PO RECEIVING INTEGRITY, CONCURRENCY & IDEMPOTENCY TEST SUITE
 * 
 * Safety Policy:
 *   - Strictly operates against isolated test database (DATABASE_URL_TEST).
 *   - Strictly refuses to run against production host ("reseau.proxy.rlwy.net").
 *   - Uses an isolated unique test tenant UUID and cleans up after test completion.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config({ path: '.env.test' });

function verifySafetyGate() {
  const testDbUrl = process.env.DATABASE_URL_TEST;
  if (!testDbUrl) {
    throw new Error('SAFETY GATE: DATABASE_URL_TEST is not configured in .env.test. Aborting!');
  }
  if (testDbUrl.includes('reseau.proxy.rlwy.net')) {
    throw new Error('SAFETY GATE VIOLATION: DATABASE_URL_TEST points to PRODUCTION. Aborting immediately!');
  }
  return testDbUrl;
}

const connectionString = verifySafetyGate();
process.env.DATABASE_URL = connectionString;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const purchaseOrdersController = require('../../controllers/purchaseOrdersController');
const inventoryStockService = require('../../services/inventoryStockService');

function createMockReqRes({ user, body = {}, params = {}, query = {}, branchId = null, headers = {} }) {
  const req = { user, body, params, query, branchId, headers };
  let responseData = null;
  let statusCode = 200;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };

  return {
    req,
    res,
    getStatus: () => statusCode,
    getData: () => responseData
  };
}

test('PO Receiving Concurrency, Atomicity, and Idempotency Suite', async (t) => {
  const tenantId = crypto.randomUUID();
  const branchId = crypto.randomUUID();
  const otherTenantId = crypto.randomUUID();
  const otherBranchId = crypto.randomUUID();

  let userId, warehouseId, otherBranchWarehouseId, trackableProdId, nonTrackableProdId, vendorId;

  await t.test('0. Setup isolated test environment in real PostgreSQL', async () => {
    // Seed test tenant & other tenant
    await pool.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, 'PO Receive Test Tenant', $2)`, [tenantId, `tenant-slug-${Date.now()}`]);
    await pool.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, 'PO Receive Other Tenant', $2)`, [otherTenantId, `other-slug-${Date.now()}`]);

    // Seed test branches
    await pool.query(`INSERT INTO branches (id, tenant_id, name) VALUES ($1, $2, 'Main Branch')`, [branchId, tenantId]);
    await pool.query(`INSERT INTO branches (id, tenant_id, name) VALUES ($1, $2, 'Other Branch')`, [otherBranchId, tenantId]);

    // Seed test user
    const uRes = await pool.query(`
      INSERT INTO users (name, email, password_hash, role, tenant_id)
      VALUES ('PO Tester', $1, 'hashed_pwd', 'admin', $2)
      RETURNING id
    `, [`po_tester_${Date.now()}@test.local`, tenantId]);
    userId = uRes.rows[0].id;

    // Seed warehouses
    const w1 = await pool.query(`
      INSERT INTO warehouses (name, code, is_active, tenant_id, branch_id)
      VALUES ('Main Receive WH', $1, true, $2, $3)
      RETURNING id
    `, [`WH-RCV-${Date.now()}`, tenantId, branchId]);
    warehouseId = w1.rows[0].id;

    const w2 = await pool.query(`
      INSERT INTO warehouses (name, code, is_active, tenant_id, branch_id)
      VALUES ('Other Branch WH', $1, true, $2, $3)
      RETURNING id
    `, [`WH-OTH-${Date.now()}`, tenantId, otherBranchId]);
    otherBranchWarehouseId = w2.rows[0].id;

    // Seed products (trackable & non-trackable)
    const p1 = await pool.query(`
      INSERT INTO products (name, sku, cost_price, selling_price, is_inventory_item, tenant_id, branch_id)
      VALUES ('Trackable Goods', $1, 100, 150, true, $2, $3)
      RETURNING id
    `, [`SKU-TRK-${Date.now()}`, tenantId, branchId]);
    trackableProdId = p1.rows[0].id;

    const p2 = await pool.query(`
      INSERT INTO products (name, sku, cost_price, selling_price, is_inventory_item, tenant_id, branch_id)
      VALUES ('Non-Trackable Service', $1, 50, 80, false, $2, $3)
      RETURNING id
    `, [`SKU-NTRK-${Date.now()}`, tenantId, branchId]);
    nonTrackableProdId = p2.rows[0].id;

    // Seed vendor
    const vRes = await pool.query(`
      INSERT INTO vendors (name, phone, tenant_id)
      VALUES ('Receive Test Vendor', '0100000000', $1)
      RETURNING id
    `, [tenantId]);
    vendorId = vRes.rows[0].id;

    assert.ok(userId && warehouseId && trackableProdId && vendorId);
  });

  // Helper to create PO in DB
  async function createTestPo({ status = 'sent_to_vendor', items = [{ product_id: trackableProdId, quantity: 20 }] }) {
    const poNum = `PO-TEST-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const poRes = await pool.query(`
      INSERT INTO purchase_orders (
        po_number, vendor_id, warehouse_id, order_date, subtotal, total_amount, status, tenant_id, branch_id
      ) VALUES ($1, $2, $3, CURRENT_DATE, 1000, 1000, $4, $5, $6)
      RETURNING id, po_number
    `, [poNum, vendorId, warehouseId, status, tenantId, branchId]);

    const poId = poRes.rows[0].id;

    for (const it of items) {
      const qty = Number(it.quantity);
      await pool.query(`
        INSERT INTO purchase_order_items (
          po_id, product_id, quantity, received_quantity, unit_price, subtotal
        ) VALUES ($1, $2, $3::numeric, 0.000, 50.00, ($3::numeric * 50.00))
      `, [poId, it.product_id, qty]);
    }

    return poId;
  }

  await t.test('1. Full receipt creates exactly one stock movement and updates status to completed', async () => {
    const poId = await createTestPo({ items: [{ product_id: trackableProdId, quantity: 25 }] });

    const { req, res, getStatus, getData } = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId,
      params: { id: poId },
      body: {
        warehouse_id: warehouseId,
        items: [{ product_id: trackableProdId, quantity: 25 }]
      }
    });

    await purchaseOrdersController.receivePurchaseOrderItems(req, res);

    assert.equal(getStatus(), 200);
    assert.equal(getData().success, true);
    assert.equal(getData().data.status, 'completed');

    // Assert database state: exactly 1 stock movement
    const moves = await pool.query(`
      SELECT * FROM stock_movements WHERE reference_type = 'purchase_order' AND reference_id = $1
    `, [String(poId)]);
    assert.equal(moves.rows.length, 1);
    assert.equal(Number(moves.rows[0].quantity), 25);
    assert.equal(moves.rows[0].type, 'in');

    // Assert PO item received_quantity
    const poi = await pool.query(`SELECT received_quantity, quantity FROM purchase_order_items WHERE po_id = $1`, [poId]);
    assert.equal(Number(poi.rows[0].received_quantity), 25);
  });

  await t.test('2. Partial receipt creates one movement for accepted quantity, updates status to partially_received', async () => {
    const poId = await createTestPo({ items: [{ product_id: trackableProdId, quantity: 30 }] });

    const { req, res, getStatus, getData } = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId,
      params: { id: poId },
      body: {
        warehouse_id: warehouseId,
        items: [{ product_id: trackableProdId, quantity: 12 }]
      }
    });

    await purchaseOrdersController.receivePurchaseOrderItems(req, res);

    assert.equal(getStatus(), 200);
    assert.equal(getData().data.status, 'partially_received');

    const moves = await pool.query(`
      SELECT * FROM stock_movements WHERE reference_type = 'purchase_order' AND reference_id = $1
    `, [String(poId)]);
    assert.equal(moves.rows.length, 1);
    assert.equal(Number(moves.rows[0].quantity), 12);

    const poi = await pool.query(`SELECT received_quantity FROM purchase_order_items WHERE po_id = $1`, [poId]);
    assert.equal(Number(poi.rows[0].received_quantity), 12);
  });

  await t.test('3. Second legitimate partial receipt creates one additional movement and completes PO', async () => {
    const poId = await createTestPo({ items: [{ product_id: trackableProdId, quantity: 20 }] });

    // 1st receipt: 8 units
    const mock1 = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId,
      params: { id: poId },
      body: { warehouse_id: warehouseId, items: [{ product_id: trackableProdId, quantity: 8 }] }
    });
    await purchaseOrdersController.receivePurchaseOrderItems(mock1.req, mock1.res);
    assert.equal(mock1.getStatus(), 200);

    // 2nd receipt: 12 units (remaining)
    const mock2 = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId,
      params: { id: poId },
      body: { warehouse_id: warehouseId, items: [{ product_id: trackableProdId, quantity: 12 }] }
    });
    await purchaseOrdersController.receivePurchaseOrderItems(mock2.req, mock2.res);
    assert.equal(mock2.getStatus(), 200);
    assert.equal(mock2.getData().data.status, 'completed');

    // Verify exactly 2 movements: 8 and 12 (total 20)
    const moves = await pool.query(`
      SELECT quantity FROM stock_movements WHERE reference_type = 'purchase_order' AND reference_id = $1 ORDER BY id ASC
    `, [String(poId)]);
    assert.equal(moves.rows.length, 2);
    assert.equal(Number(moves.rows[0].quantity), 8);
    assert.equal(Number(moves.rows[1].quantity), 12);

    const poi = await pool.query(`SELECT received_quantity, quantity FROM purchase_order_items WHERE po_id = $1`, [poId]);
    assert.equal(Number(poi.rows[0].received_quantity), 20);
    assert.equal(Number(poi.rows[0].received_quantity), Number(poi.rows[0].quantity));
  });

  await t.test('4. Over-receipt is rejected without changing stock or received quantities', async () => {
    const poId = await createTestPo({ items: [{ product_id: trackableProdId, quantity: 10 }] });

    const { req, res, getStatus, getData } = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId,
      params: { id: poId },
      body: {
        warehouse_id: warehouseId,
        items: [{ product_id: trackableProdId, quantity: 15 }] // Trying to receive 15 when ordered is 10
      }
    });

    await purchaseOrdersController.receivePurchaseOrderItems(req, res);

    assert.equal(getStatus(), 400);
    assert.match(getData().message, /Cannot receive 15 units. Remaining quantity is only 10 units/);

    // Assert zero stock movements
    const moves = await pool.query(`
      SELECT * FROM stock_movements WHERE reference_type = 'purchase_order' AND reference_id = $1
    `, [String(poId)]);
    assert.equal(moves.rows.length, 0);

    // Assert received_quantity remains 0
    const poi = await pool.query(`SELECT received_quantity FROM purchase_order_items WHERE po_id = $1`, [poId]);
    assert.equal(Number(poi.rows[0].received_quantity), 0);
  });

  await t.test('5. Completed PO cannot be received again', async () => {
    const poId = await createTestPo({ status: 'completed', items: [{ product_id: trackableProdId, quantity: 10 }] });
    // Manually mark received_quantity as 10
    await pool.query(`UPDATE purchase_order_items SET received_quantity = 10 WHERE po_id = $1`, [poId]);

    const { req, res, getStatus, getData } = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId,
      params: { id: poId },
      body: {
        warehouse_id: warehouseId,
        items: [{ product_id: trackableProdId, quantity: 5 }]
      }
    });

    await purchaseOrdersController.receivePurchaseOrderItems(req, res);

    assert.equal(getStatus(), 400);
    assert.match(getData().message, /already been fully received/);

    const moves = await pool.query(`
      SELECT * FROM stock_movements WHERE reference_type = 'purchase_order' AND reference_id = $1
    `, [String(poId)]);
    assert.equal(moves.rows.length, 0);
  });

  await t.test('6. In-payload duplicate items are aggregated and cannot bypass remaining limit', async () => {
    const poId = await createTestPo({ items: [{ product_id: trackableProdId, quantity: 10 }] });

    // Payload tries to send 6 and 6 for the same item (total 12 > 10)
    const { req, res, getStatus, getData } = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId,
      params: { id: poId },
      body: {
        warehouse_id: warehouseId,
        items: [
          { product_id: trackableProdId, quantity: 6 },
          { product_id: trackableProdId, quantity: 6 }
        ]
      }
    });

    await purchaseOrdersController.receivePurchaseOrderItems(req, res);

    assert.equal(getStatus(), 400);
    assert.match(getData().message, /Cannot receive 12 units. Remaining quantity is only 10 units/);

    const moves = await pool.query(`
      SELECT * FROM stock_movements WHERE reference_type = 'purchase_order' AND reference_id = $1
    `, [String(poId)]);
    assert.equal(moves.rows.length, 0);
  });

  await t.test('7. In-payload duplicate items within limits are combined into exactly one movement', async () => {
    const poId = await createTestPo({ items: [{ product_id: trackableProdId, quantity: 10 }] });

    // Payload sends 3 and 4 for the same item (total 7 <= 10)
    const { req, res, getStatus } = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId,
      params: { id: poId },
      body: {
        warehouse_id: warehouseId,
        items: [
          { product_id: trackableProdId, quantity: 3 },
          { product_id: trackableProdId, quantity: 4 }
        ]
      }
    });

    await purchaseOrdersController.receivePurchaseOrderItems(req, res);

    assert.equal(getStatus(), 200);

    // Assert exactly 1 movement of 7 units (not 2 movements)
    const moves = await pool.query(`
      SELECT * FROM stock_movements WHERE reference_type = 'purchase_order' AND reference_id = $1
    `, [String(poId)]);
    assert.equal(moves.rows.length, 1);
    assert.equal(Number(moves.rows[0].quantity), 7);
  });

  await t.test('8. Idempotency Key prevents duplicate stock movements upon repeated request', async () => {
    const poId = await createTestPo({ items: [{ product_id: trackableProdId, quantity: 20 }] });
    const idempKey = `IDEMP-${Date.now()}-${Math.random()}`;

    // 1st request with idempotency key
    const mock1 = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId,
      params: { id: poId },
      headers: { 'idempotency-key': idempKey },
      body: { warehouse_id: warehouseId, items: [{ product_id: trackableProdId, quantity: 10 }] }
    });
    await purchaseOrdersController.receivePurchaseOrderItems(mock1.req, mock1.res);
    assert.equal(mock1.getStatus(), 200);

    // 2nd identical request with same idempotency key (simulating retry / double click)
    const mock2 = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId,
      params: { id: poId },
      headers: { 'idempotency-key': idempKey },
      body: { warehouse_id: warehouseId, items: [{ product_id: trackableProdId, quantity: 10 }] }
    });
    await purchaseOrdersController.receivePurchaseOrderItems(mock2.req, mock2.res);
    assert.equal(mock2.getStatus(), 200);
    assert.equal(mock2.getData().data.idempotent_replay, true);

    // Assert database state: STILL EXACTLY ONE stock movement of 10 units!
    const moves = await pool.query(`
      SELECT * FROM stock_movements WHERE reference_type = 'purchase_order' AND reference_id = $1
    `, [String(poId)]);
    assert.equal(moves.rows.length, 1);
    assert.equal(Number(moves.rows[0].quantity), 10);

    const poi = await pool.query(`SELECT received_quantity FROM purchase_order_items WHERE po_id = $1`, [poId]);
    assert.equal(Number(poi.rows[0].received_quantity), 10);
  });

  await t.test('9. Genuinely concurrent requests cannot over-receive or create duplicate movements', async () => {
    const poId = await createTestPo({ items: [{ product_id: trackableProdId, quantity: 10 }] });

    // Two simultaneous requests both asking to receive 8 units (total 16 > 10)
    const mockA = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId,
      params: { id: poId },
      body: { warehouse_id: warehouseId, items: [{ product_id: trackableProdId, quantity: 8 }] }
    });

    const mockB = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId,
      params: { id: poId },
      body: { warehouse_id: warehouseId, items: [{ product_id: trackableProdId, quantity: 8 }] }
    });

    // Execute genuinely concurrently
    const [resA, resB] = await Promise.allSettled([
      purchaseOrdersController.receivePurchaseOrderItems(mockA.req, mockA.res),
      purchaseOrdersController.receivePurchaseOrderItems(mockB.req, mockB.res)
    ]);

    assert.equal(resA.status, 'fulfilled');
    assert.equal(resB.status, 'fulfilled');

    // Exactly one must succeed (200) and one must be rejected (400)
    const statuses = [mockA.getStatus(), mockB.getStatus()].sort();
    assert.deepEqual(statuses, [200, 400]);

    // Assert final database state: exactly 8 units received, exactly 1 stock movement
    const moves = await pool.query(`
      SELECT * FROM stock_movements WHERE reference_type = 'purchase_order' AND reference_id = $1
    `, [String(poId)]);
    assert.equal(moves.rows.length, 1);
    assert.equal(Number(moves.rows[0].quantity), 8);

    const poi = await pool.query(`SELECT received_quantity FROM purchase_order_items WHERE po_id = $1`, [poId]);
    assert.equal(Number(poi.rows[0].received_quantity), 8);
  });

  await t.test('10. Mismatched warehouse branch is rejected with 400 and zero stock movements', async () => {
    const poId = await createTestPo({ items: [{ product_id: trackableProdId, quantity: 10 }] });

    const { req, res, getStatus, getData } = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId,
      params: { id: poId },
      body: {
        warehouse_id: otherBranchWarehouseId, // Belongs to other branch!
        items: [{ product_id: trackableProdId, quantity: 5 }]
      }
    });

    await purchaseOrdersController.receivePurchaseOrderItems(req, res);

    assert.equal(getStatus(), 400);
    assert.match(getData().message, /belongs to another branch/);

    const moves = await pool.query(`
      SELECT * FROM stock_movements WHERE reference_type = 'purchase_order' AND reference_id = $1
    `, [String(poId)]);
    assert.equal(moves.rows.length, 0);
  });

  await t.test('11. Non-trackable products update PO received_quantity but create ZERO stock movements', async () => {
    const poId = await createTestPo({ items: [{ product_id: nonTrackableProdId, quantity: 15 }] });

    const { req, res, getStatus, getData } = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId,
      params: { id: poId },
      body: {
        warehouse_id: warehouseId,
        items: [{ product_id: nonTrackableProdId, quantity: 15 }]
      }
    });

    await purchaseOrdersController.receivePurchaseOrderItems(req, res);

    assert.equal(getStatus(), 200);
    assert.equal(getData().data.status, 'completed');

    // Received quantity is updated
    const poi = await pool.query(`SELECT received_quantity FROM purchase_order_items WHERE po_id = $1`, [poId]);
    assert.equal(Number(poi.rows[0].received_quantity), 15);

    // Stock movements MUST BE ZERO for non-trackable items
    const moves = await pool.query(`
      SELECT * FROM stock_movements WHERE reference_type = 'purchase_order' AND reference_id = $1
    `, [String(poId)]);
    assert.equal(moves.rows.length, 0);
  });

  await t.test('99. Teardown isolated test tenant', async () => {
    await pool.query(`DELETE FROM stock_movements WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM purchase_order_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE tenant_id = $1)`, [tenantId]);
    await pool.query(`DELETE FROM purchase_orders WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM products WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM warehouses WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM vendors WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM users WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM branches WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [tenantId, otherTenantId]);
  });
});
