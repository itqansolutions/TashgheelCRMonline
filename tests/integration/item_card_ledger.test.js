const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config({ path: '.env.test' });

// SAFETY GATE: isolated test PostgreSQL only (never production).
function verifySafetyGate() {
  const testDbUrl = process.env.DATABASE_URL_TEST;
  if (!testDbUrl) throw new Error('SAFETY GATE: DATABASE_URL_TEST is not configured in .env.test. Aborting!');
  if (testDbUrl.includes('reseau.proxy.rlwy.net')) {
    throw new Error('SAFETY GATE VIOLATION: DATABASE_URL_TEST points to PRODUCTION. Aborting immediately!');
  }
  return testDbUrl;
}

const connectionString = verifySafetyGate();
process.env.DATABASE_URL = connectionString;

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

const inventoryStockService = require('../../services/inventoryStockService');
const inventoryController = require('../../controllers/inventoryController');

function mockReqRes({ user, params = {}, query = {}, branchId = null }) {
  const req = { user, params, query, branchId };
  let statusCode = 200;
  let data = null;
  const res = {
    status(c) { statusCode = c; return this; },
    json(d) { data = d; return this; }
  };
  return { req, res, status: () => statusCode, body: () => data };
}

const day = (n) => new Date(Date.UTC(2026, 0, n, 12, 0, 0)).toISOString();

test('Item Card ledger == Stock Balances (isolated test DB)', async (t) => {
  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  const b1 = crypto.randomUUID();
  const b2 = crypto.randomUUID();
  const bB = crypto.randomUUID();
  let whA1, whA2, whA3, whB1;
  let prodP, prodZero, prodService, prodNullCost, prodB;
  let userId;

  t.after(async () => {
    try {
      for (const tid of [tenantA, tenantB]) {
        await pool.query(`DELETE FROM stock_movements WHERE tenant_id = $1`, [tid]);
        await pool.query(`DELETE FROM products WHERE tenant_id = $1`, [tid]);
        await pool.query(`DELETE FROM warehouses WHERE tenant_id = $1`, [tid]);
        await pool.query(`DELETE FROM users WHERE tenant_id = $1`, [tid]);
        await pool.query(`DELETE FROM branches WHERE tenant_id = $1`, [tid]);
        await pool.query(`DELETE FROM tenants WHERE id = $1`, [tid]);
      }
    } catch (err) {
      console.warn('Cleanup warning:', err.message);
    } finally {
      await pool.end();
    }
  });

  const mv = (tenant, branch, product, from, to, type, qty, status, createdAt, ref) =>
    pool.query(
      `INSERT INTO stock_movements
        (tenant_id, branch_id, product_id, from_warehouse_id, to_warehouse_id, type, quantity,
         reference_type, reference_id, created_by, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [tenant, branch, product, from, to, type, qty, ref ? 'purchase' : 'manual', ref || null, userId, status, createdAt]
    );

  await t.test('0. setup', async () => {
    for (const [tid, n] of [[tenantA, 'A'], [tenantB, 'B']]) {
      await pool.query(`INSERT INTO tenants (id, name, slug, plan, status) VALUES ($1,$2,$3,'enterprise','active')`,
        [tid, `ItemCard Tenant ${n}`, `ic-${tid.slice(0, 8)}`]);
    }
    await pool.query(`INSERT INTO branches (id, tenant_id, name) VALUES ($1,$2,'Branch 1')`, [b1, tenantA]);
    await pool.query(`INSERT INTO branches (id, tenant_id, name) VALUES ($1,$2,'Branch 2')`, [b2, tenantA]);
    await pool.query(`INSERT INTO branches (id, tenant_id, name) VALUES ($1,$2,'Branch B')`, [bB, tenantB]);
    userId = (await pool.query(
      `INSERT INTO users (name, email, password_hash, role, tenant_id, branch_id)
       VALUES ('IC User', $1, 'hash', 'admin', $2, $3) RETURNING id`,
      [`ic-${Date.now()}@test.local`, tenantA, b1])).rows[0].id;

    const wh = async (name, code, tid, bid) => (await pool.query(
      `INSERT INTO warehouses (name, code, tenant_id, branch_id) VALUES ($1,$2,$3,$4) RETURNING id`,
      [name, code, tid, bid])).rows[0].id;
    whA1 = await wh('A WH1', 'AW1', tenantA, b1);
    whA3 = await wh('A WH3', 'AW3', tenantA, b1); // same branch as WH1
    whA2 = await wh('A WH2', 'AW2', tenantA, b2); // other branch
    whB1 = await wh('B WH1 SECRET', 'BW1', tenantB, bB);

    const prod = async (name, sku, cost, tid, bid, inv) => (await pool.query(
      `INSERT INTO products (name, sku, cost_price, selling_price, tenant_id, branch_id, is_inventory_item)
       VALUES ($1,$2,$3,10,$4,$5,$6) RETURNING id`, [name, sku, cost, tid, bid, inv])).rows[0].id;
    prodP = await prod('Widget', 'W-1', 12.5, tenantA, b1, true);
    prodZero = await prod('Zero Item', 'Z-1', 3, tenantA, b1, true);
    prodService = await prod('Service', 'S-1', 100, tenantA, b1, false);
    prodNullCost = await prod('NullCost Item', 'N-1', null, tenantA, b1, true);
    prodB = await prod('Other Tenant Item', 'B-1', 9, tenantB, bB, true);

    // Ledger for prodP (company expected 72; WH1=45; WH3=17; WH2=10; Branch1=62; Branch2=10)
    await mv(tenantA, b1, prodP, null, whA1, 'in', 100, 'approved', day(1), 'PO-1');
    await mv(tenantA, b1, prodP, whA1, null, 'out', 30, 'approved', day(2), 'INV-1');
    await mv(tenantA, b1, prodP, whA1, whA3, 'transfer', 20, 'approved', day(3));      // same branch
    await mv(tenantA, b1, prodP, whA1, whA2, 'transfer', 10, 'approved', day(4));      // cross-branch
    await mv(tenantA, b1, prodP, null, whA1, 'adjustment', 5, 'approved', day(5));     // surplus
    await mv(tenantA, b1, prodP, whA3, null, 'adjustment', 3, 'approved', day(6));     // deficit
    await mv(tenantA, b1, prodP, null, whA1, 'in', 50, 'pending', day(7));             // must be ignored
    await mv(tenantA, b1, prodP, whA1, null, 'out', 7, 'pending', day(8));             // must be ignored
    // Tenant B movement on its own product
    await mv(tenantB, bB, prodB, null, whB1, 'in', 999, 'approved', day(1));
    // Null-cost product with stock
    await mv(tenantA, b1, prodNullCost, null, whA1, 'in', 4, 'approved', day(1));
    // Service product with a (bogus) movement must still report no stock
    await mv(tenantA, b1, prodService, null, whA1, 'in', 5, 'approved', day(1));

    assert.ok(whA1 && whA2 && whA3 && whB1 && prodP && prodB);
  });

  await t.test('1. company scope equals getStockList(company) and getProductStock', async () => {
    const card = await inventoryStockService.getItemCard(tenantA, prodP);
    const list = await inventoryStockService.getStockList(tenantA, null);
    const row = list.find(r => r.product_id === prodP);
    const live = await inventoryStockService.getProductStock(tenantA, prodP);
    assert.equal(card.current_stock, 72);
    assert.equal(card.current_stock, row.current_stock);
    assert.equal(card.current_stock, live.current_stock);
  });

  await t.test('2. running balances, transfers not double-counted, pending excluded', async () => {
    const card = await inventoryStockService.getItemCard(tenantA, prodP);
    assert.deepEqual(card.movements.map(m => m.balance), [100, 70, 70, 70, 75, 72]);
    assert.equal(card.movements.length, 6, 'pending movements must not appear');
    assert.equal(card.movements.at(-1).balance, card.current_stock);
    const tr = card.movements.filter(m => m.type === 'transfer');
    assert.ok(tr.every(m => m.qty_in === 0 && m.qty_out === 0), 'company scope: transfers net to zero');
  });

  await t.test('3. warehouse scope equals getWarehouseStockList / getProductStock', async () => {
    const expected = { [whA1]: 45, [whA3]: 17, [whA2]: 10 };
    for (const wid of [whA1, whA3, whA2]) {
      const card = await inventoryStockService.getItemCard(tenantA, prodP, { warehouseId: wid });
      const wl = await inventoryStockService.getWarehouseStockList(tenantA, wid);
      const row = wl.find(r => r.product_id === prodP);
      const live = await inventoryStockService.getProductStock(tenantA, prodP, { warehouseId: wid });
      assert.equal(card.current_stock, expected[wid], `warehouse ${wid} expected`);
      assert.equal(card.current_stock, row.quantity, `warehouse ${wid} vs getWarehouseStockList`);
      assert.equal(card.current_stock, live.current_stock, `warehouse ${wid} vs getProductStock`);
    }
    const sum = 45 + 17 + 10;
    assert.equal(sum, 72, 'warehouse balances sum to company total (no double counting)');
  });

  await t.test('4. branch scope equals getStockList(branch) and getProductStock(branch)', async () => {
    for (const [bid, exp] of [[b1, 62], [b2, 10]]) {
      const card = await inventoryStockService.getItemCard(tenantA, prodP, { branchId: bid });
      const row = (await inventoryStockService.getStockList(tenantA, bid)).find(r => r.product_id === prodP);
      const live = await inventoryStockService.getProductStock(tenantA, prodP, { branchId: bid });
      assert.equal(card.current_stock, exp);
      assert.equal(card.current_stock, row.current_stock);
      assert.equal(card.current_stock, live.current_stock);
    }
  });

  await t.test('5. zero-stock product: 0 (not a fallback), no movements', async () => {
    const card = await inventoryStockService.getItemCard(tenantA, prodZero);
    assert.strictEqual(card.current_stock, 0);
    assert.deepEqual(card.movements, []);
    assert.strictEqual(card.is_inventory_item, true);
  });

  await t.test('6. service / non-stock product has no stock figure', async () => {
    const card = await inventoryStockService.getItemCard(tenantA, prodService);
    assert.strictEqual(card.is_inventory_item, false);
    assert.strictEqual(card.current_stock, null);
    assert.deepEqual(card.movements, []);
  });

  await t.test('7. cost_price is reported as stored; missing cost is null, not 0', async () => {
    const p = await inventoryStockService.getItemCard(tenantA, prodP);
    assert.equal(p.cost_price, 12.5);
    assert.equal(p.movements.at(-1).total_val, 72 * 12.5);
    const n = await inventoryStockService.getItemCard(tenantA, prodNullCost);
    assert.strictEqual(n.cost_price, null);
    assert.strictEqual(n.current_stock, 4);
    assert.strictEqual(n.movements[0].unit_price, null);
    assert.strictEqual(n.movements[0].total_val, null);
    assert.equal('avg_cost' in p, false, 'must not expose a fake average cost');
  });

  await t.test('8. date filter trims rows but keeps true running balance', async () => {
    const card = await inventoryStockService.getItemCard(tenantA, prodP, {
      from: new Date(day(5)), to: new Date(day(6))
    });
    assert.deepEqual(card.movements.map(m => m.balance), [75, 72]);
    assert.equal(card.current_stock, 72, 'current stock is all-time, not date-filtered');
    const none = await inventoryStockService.getItemCard(tenantA, prodP, {
      from: new Date('2027-01-01'), to: new Date('2027-01-02')
    });
    assert.deepEqual(none.movements, []);
  });

  await t.test('9. tenant isolation: foreign / unknown product ids', async () => {
    assert.equal(await inventoryStockService.getItemCard(tenantA, prodB), null, 'tenant A cannot read tenant B product');
    assert.equal(await inventoryStockService.getItemCard(tenantB, prodP), null, 'tenant B cannot read tenant A product');
    assert.equal(await inventoryStockService.getItemCard(tenantA, 2147483000), null);
    const own = await inventoryStockService.getItemCard(tenantB, prodB);
    assert.equal(own.current_stock, 999);
  });

  await t.test('10. foreign warehouseId leaks nothing', async () => {
    const card = await inventoryStockService.getItemCard(tenantA, prodP, { warehouseId: whB1 });
    assert.deepEqual(card.movements, []);
    assert.equal(card.current_stock, 0);
    assert.ok(!JSON.stringify(card).includes('SECRET'));
  });

  await t.test('11. controller: validation, 404/400 and tenant scoping', async () => {
    const user = { id: userId, tenant_id: tenantA };
    const call = async (params, query = {}, branchId = null) => {
      const m = mockReqRes({ user, params, query, branchId });
      await inventoryController.getItemCard(m.req, m.res);
      return m;
    };
    assert.equal((await call({ productId: 'abc' })).status(), 404);
    assert.equal((await call({ productId: '1; DROP TABLE products' })).status(), 404);
    assert.equal((await call({ productId: '99999999999' })).status(), 404);
    assert.equal((await call({ productId: String(prodB) })).status(), 404, 'cross-tenant product');
    assert.equal((await call({ productId: String(prodP) }, { warehouseId: 'x' })).status(), 400);
    assert.equal((await call({ productId: String(prodP) }, { from: 'not-a-date' })).status(), 400);
    const ok = await call({ productId: String(prodP) });
    assert.equal(ok.status(), 200);
    assert.equal(ok.body().data.current_stock, 72);
    const branch = await call({ productId: String(prodP) }, {}, b1);
    assert.equal(branch.body().data.current_stock, 62, 'uses req.branchId like /inventory/stock');
    const wh = await call({ productId: String(prodP) }, { warehouseId: String(whA1) }, b1);
    assert.equal(wh.body().data.current_stock, 45, 'warehouseId overrides branch scope');
  });
});
