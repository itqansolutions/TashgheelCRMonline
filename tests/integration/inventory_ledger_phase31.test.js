const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config({ path: '.env.test' });

// ============================================================================
// CRITICAL SAFETY GATE: STRICT EXECUTION AGAINST ISOLATED TEST POSTGRESQL ONLY
// ============================================================================
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

const inventoryStockService = require('../../services/inventoryStockService');
const movementService = require('../../services/movementService');
const inventoryController = require('../../controllers/inventoryController');
const purchaseOrdersController = require('../../controllers/purchaseOrdersController');

// Mock Express Helper
function createMockReqRes({ user, body = {}, params = {}, query = {}, branchId = null }) {
  const req = { user, body, params, query, branchId };
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

  return { req, res, getStatus: () => statusCode, getData: () => responseData };
}

test('Phase 3.1: Warehouse & Inventory Ledger Fix - Isolated PostgreSQL Suite', async (t) => {
  const tenantId = crypto.randomUUID();
  const branch1Id = crypto.randomUUID();
  const branch2Id = crypto.randomUUID();
  let warehouse1Id, warehouse2Id, warehouse3Id;
  let trackableProdId, nonTrackableProdId;
  let vendorId;
  let userId;

  // Cleanup handler
  t.after(async () => {
    try {
      await pool.query(`DELETE FROM stock_movements WHERE tenant_id = $1`, [tenantId]);
      await pool.query(`DELETE FROM purchase_order_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE tenant_id = $1)`, [tenantId]);
      await pool.query(`DELETE FROM purchase_orders WHERE tenant_id = $1`, [tenantId]);
      await pool.query(`DELETE FROM products WHERE tenant_id = $1`, [tenantId]);
      await pool.query(`DELETE FROM warehouses WHERE tenant_id = $1`, [tenantId]);
      await pool.query(`DELETE FROM vendors WHERE tenant_id = $1`, [tenantId]);
      await pool.query(`DELETE FROM users WHERE tenant_id = $1`, [tenantId]);
      await pool.query(`DELETE FROM branches WHERE tenant_id = $1`, [tenantId]);
      await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    } catch (err) {
      console.warn('Cleanup warning:', err.message);
    } finally {
      await pool.end();
    }
  });

  // Setup test environment
  await t.test('0. Setup isolated test branches, warehouses, and products', async () => {
    // 1. Create tenant, branches, and user
    await pool.query(`
      INSERT INTO tenants (id, name, slug, plan, status)
      VALUES ($1, 'Tenant Phase 3.1', $2, 'enterprise', 'active')
    `, [tenantId, `slug-${tenantId.slice(0, 8)}`]);

    await pool.query(`INSERT INTO branches (id, tenant_id, name) VALUES ($1, $2, 'Branch 1')`, [branch1Id, tenantId]);
    await pool.query(`INSERT INTO branches (id, tenant_id, name) VALUES ($1, $2, 'Branch 2')`, [branch2Id, tenantId]);

    const uRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, tenant_id, branch_id)
       VALUES ('Test User Phase31', $1, 'hash', 'admin', $2, $3) RETURNING id`,
      [`u-${Date.now()}@test.local`, tenantId, branch1Id]
    );
    userId = uRes.rows[0].id;

    // 2. Create warehouses: WH1 & WH3 in Branch 1, WH2 in Branch 2
    const wh1Res = await pool.query(
      `INSERT INTO warehouses (name, code, tenant_id, branch_id) VALUES ('WH 1 Main', 'WH1', $1, $2) RETURNING id`,
      [tenantId, branch1Id]
    );
    warehouse1Id = wh1Res.rows[0].id;

    const wh2Res = await pool.query(
      `INSERT INTO warehouses (name, code, tenant_id, branch_id) VALUES ('WH 2 Branch2', 'WH2', $1, $2) RETURNING id`,
      [tenantId, branch2Id]
    );
    warehouse2Id = wh2Res.rows[0].id;

    const wh3Res = await pool.query(
      `INSERT INTO warehouses (name, code, tenant_id, branch_id) VALUES ('WH 3 Secondary', 'WH3', $1, $2) RETURNING id`,
      [tenantId, branch1Id]
    );
    warehouse3Id = wh3Res.rows[0].id;

    // 3. Create products: 1 trackable good, 1 non-trackable service
    const p1Res = await pool.query(
      `INSERT INTO products (name, sku, cost_price, selling_price, tenant_id, branch_id, is_inventory_item)
       VALUES ('Hardware Server', 'SRV-01', 500.00, 800.00, $1, $2, true) RETURNING id`,
      [tenantId, branch1Id]
    );
    trackableProdId = p1Res.rows[0].id;

    const p2Res = await pool.query(
      `INSERT INTO products (name, sku, cost_price, selling_price, tenant_id, branch_id, is_inventory_item)
       VALUES ('Cloud Consulting Service', 'SRV-CONSULT', 100.00, 250.00, $1, $2, false) RETURNING id`,
      [tenantId, branch1Id]
    );
    nonTrackableProdId = p2Res.rows[0].id;

    // 4. Create vendor for procurement testing
    const vRes = await pool.query(
      `INSERT INTO vendors (tenant_id, name, contact_person, email)
       VALUES ($1, 'Tech Vendor 3.1', 'Vendor Manager', 'vendor31@example.com') RETURNING id`,
      [tenantId]
    );
    vendorId = vRes.rows[0].id;

    assert.ok(warehouse1Id && warehouse2Id && warehouse3Id, 'Warehouses created');
    assert.ok(trackableProdId && nonTrackableProdId, 'Products created');
    assert.ok(userId, 'Test user created');
  });

  // Test 1: Zero-movement product visibility
  await t.test('1. Products with zero movements appear in stock list with current_stock = 0', async () => {
    const stockList = await inventoryStockService.getStockList(tenantId, branch1Id);
    const item = stockList.find(p => p.product_id === trackableProdId);

    assert.ok(item, 'Trackable product must be present in stock list even with 0 movements');
    assert.equal(item.current_stock, 0, 'Current stock must be 0');
  });

  // Test 2: Non-trackable vs Trackable item PO receipt (Test C requested by user)
  await t.test('2. PO Receipt: Trackable creates stock_movement IN; Non-trackable creates NO movement', async () => {
    // Create PO with 2 items: 1 hardware server (qty 50) and 1 consulting service (qty 10)
    const poRes = await pool.query(`
      INSERT INTO purchase_orders (tenant_id, branch_id, po_number, vendor_id, warehouse_id, status, subtotal, total_amount)
      VALUES ($1, $2, 'PO-PHASE31-01', $3, $4, 'sent_to_vendor', 26000, 26000) RETURNING id
    `, [tenantId, branch1Id, vendorId, warehouse1Id]);
    const poId = poRes.rows[0].id;

    const poi1Res = await pool.query(`
      INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_price, subtotal, received_quantity)
      VALUES ($1, $2, 50, 500, 25000, 0) RETURNING id
    `, [poId, trackableProdId]);
    const poiTrackableId = poi1Res.rows[0].id;

    const poi2Res = await pool.query(`
      INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_price, subtotal, received_quantity)
      VALUES ($1, $2, 10, 100, 1000, 0) RETURNING id
    `, [poId, nonTrackableProdId]);
    const poiNonTrackableId = poi2Res.rows[0].id;

    // Receive both items into WH 1
    const { req, res, getStatus, getData } = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId: branch1Id,
      params: { id: poId },
      body: {
        warehouse_id: warehouse1Id,
        items: [
          { item_id: poiTrackableId, quantity: 20 },
          { item_id: poiNonTrackableId, quantity: 10 }
        ]
      }
    });

    await purchaseOrdersController.receiveItems(req, res);
    assert.equal(getStatus(), 200, `PO receive status must be 200, got: ${JSON.stringify(getData())}`);

    // Verify PO item received quantities
    const itemsRes = await pool.query(`SELECT id, product_id, received_quantity FROM purchase_order_items WHERE po_id = $1`, [poId]);
    const trackableItem = itemsRes.rows.find(r => r.id === poiTrackableId);
    const nonTrackableItem = itemsRes.rows.find(r => r.id === poiNonTrackableId);
    assert.equal(parseFloat(trackableItem.received_quantity), 20);
    assert.equal(parseFloat(nonTrackableItem.received_quantity), 10);

    // Verify movements: exactly 1 movement created for trackable item into WH 1; 0 movements for service item!
    const movesRes = await pool.query(
      `SELECT product_id, to_warehouse_id, quantity, type FROM stock_movements WHERE reference_type = 'purchase_order' AND reference_id = $1`,
      [String(poId)]
    );
    assert.equal(movesRes.rows.length, 1, 'Only trackable product must have a stock movement');
    assert.equal(movesRes.rows[0].product_id, trackableProdId);
    assert.equal(parseFloat(movesRes.rows[0].quantity), 20);
    assert.equal(movesRes.rows[0].to_warehouse_id, warehouse1Id);

    // Verify WH 1 stock
    const whStock = await inventoryStockService.getProductStock(tenantId, trackableProdId, { warehouseId: warehouse1Id });
    assert.equal(whStock.current_stock, 20, 'WH 1 stock must now be 20');
  });

  // Test 3: Approval of pending movement without FOR UPDATE aggregate error (Test A requested by user)
  await t.test('3. Approval of pending movement: locks product row and avoids FOR UPDATE aggregate syntax error', async () => {
    // Current stock in WH 1 is 20. Queue a manual pending outbound movement of 5 units from WH 1
    const pendingMove = await movementService.createMovement({
      tenant_id: tenantId,
      branch_id: branch1Id,
      product_id: trackableProdId,
      from_warehouse_id: warehouse1Id,
      to_warehouse_id: null,
      type: 'out',
      quantity: 5,
      source: 'manual'
    }, userId);

    assert.equal(pendingMove.status, 'pending');

    // Approve the movement: should execute without Postgres syntax error
    const approvedMove = await movementService.approveMovement(pendingMove.id, tenantId, userId);
    assert.equal(approvedMove.status, 'approved');

    // WH 1 stock should now be 20 - 5 = 15
    const whStock = await inventoryStockService.getProductStock(tenantId, trackableProdId, { warehouseId: warehouse1Id });
    assert.equal(whStock.current_stock, 15, 'WH 1 stock must be 15 after approved outbound movement');
  });

  // Test 4: Concurrent Transfers on Same Stock (Test B requested by user)
  await t.test('4. Concurrency: Two simultaneous transfers of 10 units when available stock is 15 -> exactly one succeeds, zero negative stock', async () => {
    // Current stock in WH 1 is 15.
    // Launch two concurrent transfer requests of 10 units each from WH1 to WH3
    const transferPayloadA = {
      tenantId, branchId: branch1Id, fromWarehouseId: warehouse1Id, toWarehouseId: warehouse3Id,
      productId: trackableProdId, quantity: 10, notes: 'Concurrent A', userId
    };
    const transferPayloadB = {
      tenantId, branchId: branch1Id, fromWarehouseId: warehouse1Id, toWarehouseId: warehouse3Id,
      productId: trackableProdId, quantity: 10, notes: 'Concurrent B', userId
    };

    const results = await Promise.allSettled([
      inventoryStockService.executeTransfer(transferPayloadA),
      inventoryStockService.executeTransfer(transferPayloadB)
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    assert.equal(successes.length, 1, 'Exactly one concurrent transfer must succeed');
    assert.equal(failures.length, 1, 'Exactly one concurrent transfer must fail');
    assert.match(failures[0].reason.message, /Insufficient stock/, 'Failure reason must be Insufficient stock');

    // Verify post-concurrency stock balances:
    // WH 1 started at 15 -> 15 - 10 = 5
    // WH 3 started at 0 -> 0 + 10 = 10
    const wh1Stock = await inventoryStockService.getProductStock(tenantId, trackableProdId, { warehouseId: warehouse1Id });
    const wh3Stock = await inventoryStockService.getProductStock(tenantId, trackableProdId, { warehouseId: warehouse3Id });

    assert.equal(wh1Stock.current_stock, 5, 'WH 1 stock must be exactly 5 (no negative stock!)');
    assert.equal(wh3Stock.current_stock, 10, 'WH 3 stock must be exactly 10');
  });

  // Test 5: Inter-Branch vs Intra-Branch Transfer Math
  await t.test('5. Inter-Branch Transfer: stock transfers across branches correctly updating branch totals and preserving tenant total', async () => {
    // Currently in Branch 1: WH1 has 5, WH3 has 10 -> Total Branch 1 = 15.
    // Currently in Branch 2: WH2 has 0 -> Total Branch 2 = 0.
    // Tenant total = 15.
    const b1Initial = await inventoryStockService.getProductStock(tenantId, trackableProdId, { branchId: branch1Id });
    const b2Initial = await inventoryStockService.getProductStock(tenantId, trackableProdId, { branchId: branch2Id });
    const tenantInitial = await inventoryStockService.getProductStock(tenantId, trackableProdId);

    assert.equal(b1Initial.current_stock, 15, 'Branch 1 initial stock must be 15');
    assert.equal(b2Initial.current_stock, 0, 'Branch 2 initial stock must be 0');
    assert.equal(tenantInitial.current_stock, 15, 'Tenant initial stock must be 15');

    // Transfer 4 units from WH 3 (Branch 1) to WH 2 (Branch 2)
    await inventoryStockService.executeTransfer({
      tenantId, branchId: branch1Id,
      fromWarehouseId: warehouse3Id,
      toWarehouseId: warehouse2Id,
      productId: trackableProdId,
      quantity: 4,
      notes: 'Inter-branch transfer to Branch 2',
      userId
    });

    // Check balances after inter-branch transfer:
    // WH 3 (Branch 1): 10 - 4 = 6
    // WH 1 (Branch 1): 5
    // Total Branch 1: 5 + 6 = 11
    // Total Branch 2 (WH 2): 4
    // Tenant Total: 11 + 4 = 15 (Preserved!)
    const b1After = await inventoryStockService.getProductStock(tenantId, trackableProdId, { branchId: branch1Id });
    const b2After = await inventoryStockService.getProductStock(tenantId, trackableProdId, { branchId: branch2Id });
    const tenantAfter = await inventoryStockService.getProductStock(tenantId, trackableProdId);

    assert.equal(b1After.current_stock, 11, 'Branch 1 stock must now be 11');
    assert.equal(b2After.current_stock, 4, 'Branch 2 stock must now be 4');
    assert.equal(tenantAfter.current_stock, 15, 'Tenant total stock must be unchanged at 15');
  });

  // Test 6: Rejection of Transfers for Non-Trackable Items
  await t.test('6. Non-Trackable Items: transferring or manually queueing stock movement is explicitly rejected', async () => {
    await assert.rejects(
      () => inventoryStockService.executeTransfer({
        tenantId, branchId: branch1Id, fromWarehouseId: warehouse1Id, toWarehouseId: warehouse2Id,
        productId: nonTrackableProdId, quantity: 1, userId
      }),
      /is a non-inventory item and cannot be transferred/
    );

    await assert.rejects(
      () => movementService.createMovement({
        tenant_id: tenantId, branch_id: branch1Id, product_id: nonTrackableProdId,
        from_warehouse_id: warehouse1Id, to_warehouse_id: null, type: 'out', quantity: 1
      }, userId),
      /is a non-inventory item and cannot have stock movements/
    );
  });

  // Test 7: Stock Taking (Stock Count) with Deficit and Surplus
  await t.test('7. Stock Take: surplus creates adjustment IN; deficit creates adjustment OUT; non-trackable is skipped', async () => {
    // Current stock in WH 1 is 5 units.
    // Counted physical: 7 units (surplus of +2)
    const { req, res, getStatus, getData } = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId: branch1Id,
      body: {
        warehouse_id: warehouse1Id,
        items: [
          { product_id: trackableProdId, actual_quantity: 7 },
          { product_id: nonTrackableProdId, actual_quantity: 99 } // Service item must be skipped
        ]
      }
    });

    await inventoryController.recordStockTake(req, res);
    assert.equal(getStatus(), 200, `Stock take status must be 200: ${JSON.stringify(getData())}`);

    // WH 1 stock should now be 7
    const wh1Stock = await inventoryStockService.getProductStock(tenantId, trackableProdId, { warehouseId: warehouse1Id });
    assert.equal(wh1Stock.current_stock, 7, 'WH 1 stock after surplus count must be 7');

    // Now count physical: 4 units (deficit of -3)
    const { req: req2, res: res2, getStatus: getStatus2 } = createMockReqRes({
      user: { id: userId, tenant_id: tenantId },
      branchId: branch1Id,
      body: {
        warehouse_id: warehouse1Id,
        items: [
          { product_id: trackableProdId, actual_quantity: 4 }
        ]
      }
    });

    await inventoryController.recordStockTake(req2, res2);
    assert.equal(getStatus2(), 200);

    const wh1StockAfterDeficit = await inventoryStockService.getProductStock(tenantId, trackableProdId, { warehouseId: warehouse1Id });
    assert.equal(wh1StockAfterDeficit.current_stock, 4, 'WH 1 stock after deficit count must be 4');
  });

  // Test 8: PO Receipt explicitly rejects non-existent or foreign tenant products
  await t.test('8. PO Receipt: Rejects foreign or non-existent product, returning 400 and creating 0 stock movements', async () => {
    // Create a PO
    const foreignPoRes = await pool.query(`
      INSERT INTO purchase_orders (tenant_id, branch_id, po_number, vendor_id, warehouse_id, status, total_amount, created_at)
      VALUES ($1, $2, $3, $4, $5, 'sent_to_vendor', 500, NOW()) RETURNING id
    `, [tenantId, branch1Id, `PO-FAIL-${Date.now()}`, vendorId, warehouse1Id]);
    const failPoId = foreignPoRes.rows[0].id;

    // Create a foreign tenant and foreign product
    const otherTenantId = crypto.randomUUID();
    let foreignProdId;
    try {
      await pool.query(
        `INSERT INTO tenants (id, name, slug, plan, status) VALUES ($1, 'Other Tenant', $2, 'enterprise', 'active')`,
        [otherTenantId, `other-${otherTenantId.slice(0, 8)}`]
      );

      const foreignProdRes = await pool.query(`
        INSERT INTO products (name, sku, cost_price, selling_price, tenant_id, is_inventory_item)
        VALUES ('Foreign Product', $1, 100, 200, $2, true) RETURNING id
      `, [`FOR-${Date.now()}`, otherTenantId]);
      foreignProdId = foreignProdRes.rows[0].id;

      // Insert an item with the foreign product ID into Tenant A's PO
      const poiRes = await pool.query(`
        INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_price, subtotal, received_quantity)
        VALUES ($1, $2, 5, 100, 500, 0) RETURNING id
      `, [failPoId, foreignProdId]);
      const failPoiId = poiRes.rows[0].id;

      const { req, res, getStatus, getData } = createMockReqRes({
        user: { id: userId, tenant_id: tenantId },
        branchId: branch1Id,
        params: { id: failPoId },
        body: {
          warehouse_id: warehouse1Id,
          items: [{ item_id: failPoiId, quantity: 5 }]
        }
      });

      await purchaseOrdersController.receiveItems(req, res);
      assert.equal(getStatus(), 400, 'Must return 400 for non-existent/foreign product');
      assert.match(getData().message, /not found or does not belong to this tenant/);

      // Verify 0 movements created
      const smRes = await pool.query(
        `SELECT id FROM stock_movements WHERE reference_type = 'purchase_order' AND reference_id = $1`,
        [String(failPoId)]
      );
      assert.equal(smRes.rows.length, 0, 'Zero stock movements must be created on failed validation');
    } finally {
      if (failPoId) {
        await pool.query(`DELETE FROM purchase_order_items WHERE po_id = $1`, [failPoId]);
        await pool.query(`DELETE FROM purchase_orders WHERE id = $1`, [failPoId]);
      }
      if (foreignProdId) await pool.query(`DELETE FROM products WHERE id = $1`, [foreignProdId]);
      await pool.query(`DELETE FROM tenants WHERE id = $1`, [otherTenantId]);
    }
  });

  // Test 9: Multi-Tenant Isolation
  await t.test('9. Multi-Tenant Isolation: Tenant B data cannot leak into Tenant A stock or ledger calculations', async () => {
    const tenantBId = crypto.randomUUID();
    const branchBId = crypto.randomUUID();
    let tenantBProdId;
    let whBId;

    try {
      await pool.query(`
        INSERT INTO tenants (id, name, slug, plan, status)
        VALUES ($1, 'Tenant B Phase 3.1', $2, 'enterprise', 'active')
      `, [tenantBId, `slug-b-${tenantBId.slice(0, 8)}`]);

      await pool.query(`INSERT INTO branches (id, tenant_id, name) VALUES ($1, $2, 'Branch B')`, [branchBId, tenantBId]);

      const whBRes = await pool.query(
        `INSERT INTO warehouses (name, code, tenant_id, branch_id) VALUES ('WH B Main', 'WHB', $1, $2) RETURNING id`,
        [tenantBId, branchBId]
      );
      whBId = whBRes.rows[0].id;

      const pBRes = await pool.query(
        `INSERT INTO products (name, sku, cost_price, selling_price, tenant_id, branch_id, is_inventory_item)
         VALUES ('Hardware Server', $1, 500.00, 800.00, $2, $3, true) RETURNING id`,
        [`SRV-TENANT-B-${Date.now()}`, tenantBId, branchBId]
      );
      tenantBProdId = pBRes.rows[0].id;

      // Create 100 units of approved stock in Tenant B
      await pool.query(`
        INSERT INTO stock_movements (tenant_id, branch_id, product_id, from_warehouse_id, to_warehouse_id, type, quantity, status, created_by, approved_by)
        VALUES ($1, $2, $3, NULL, $4, 'in', 100, 'approved', $5, $5)
      `, [tenantBId, branchBId, tenantBProdId, whBId, userId]);

      // Check Tenant A stock: must remain exactly 4 (unaffected by Tenant B)
      const tenantAStock = await inventoryStockService.getProductStock(tenantId, trackableProdId, { warehouseId: warehouse1Id });
      assert.equal(tenantAStock.current_stock, 4, 'Tenant A stock must remain exactly 4 units');

      // Check Tenant B stock: must be 100
      const tenantBStock = await inventoryStockService.getProductStock(tenantBId, tenantBProdId, { warehouseId: whBId });
      assert.equal(tenantBStock.current_stock, 100, 'Tenant B stock must be 100 units');

      // Attempt transfer by Tenant A trying to move from Tenant B warehouse: must fail
      await assert.rejects(
        inventoryStockService.executeTransfer({
          tenantId,
          branchId: branch1Id,
          fromWarehouseId: whBId,
          toWarehouseId: warehouse1Id,
          productId: trackableProdId,
          quantity: 1,
          userId
        }),
        /One or both warehouses were not found for this tenant/
      );
    } finally {
      await pool.query(`DELETE FROM stock_movements WHERE tenant_id = $1`, [tenantBId]);
      await pool.query(`DELETE FROM products WHERE tenant_id = $1`, [tenantBId]);
      await pool.query(`DELETE FROM warehouses WHERE tenant_id = $1`, [tenantBId]);
      await pool.query(`DELETE FROM branches WHERE tenant_id = $1`, [tenantBId]);
      await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantBId]);
    }
  });
});
