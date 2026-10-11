/**
 * tests/integration/purchasing_real_postgres.test.js
 * 
 * REAL POSTGRESQL INTEGRATION TEST SUITE FOR PHASE 2.1 & RFQ DEPRECATION
 * 
 * Safety Policy:
 *   - Only runs against isolated test database (DATABASE_URL_TEST).
 *   - Strictly refuses to run against production host ("reseau.proxy.rlwy.net").
 *   - Uses an isolated unique test tenant UUID and cleans up afterwards.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.test' });

const PROD_HOST = 'reseau.proxy.rlwy.net';
const testDbUrl = process.env.DATABASE_URL_TEST;
const prodDbUrl = process.env.DATABASE_URL;

function verifySafetyGate() {
  if (!testDbUrl) {
    return { ok: false, reason: 'DATABASE_URL_TEST is not set in .env.test. Skipping live DB test.' };
  }
  if (testDbUrl === prodDbUrl) {
    return { ok: false, reason: 'FATAL: DATABASE_URL_TEST matches production DATABASE_URL. Refusing execution.' };
  }
  if (testDbUrl.includes(PROD_HOST)) {
    return { ok: false, reason: `FATAL: DATABASE_URL_TEST points to production host (${PROD_HOST}). Refusing execution.` };
  }
  return { ok: true };
}

const safety = verifySafetyGate();

if (!safety.ok) {
  test('Purchasing Real PostgreSQL Suite (Skipped by Safety Guard)', (t) => {
    t.skip(safety.reason);
  });
} else {
  const pool = new Pool({
    connectionString: testDbUrl,
    ssl: { rejectUnauthorized: false }
  });

  test('Phase 2.1 & RFQ Deprecation - Real PostgreSQL Live Integration Suite', async (t) => {
    const testTenantId = `99999999-9999-4999-a999-${Date.now().toString(16).padStart(12, '0')}`;
    let createdProductId = null;
    let createdWarehouseId = null;
    let createdVendorId = null;
    let createdPrId = null;
    let createdPoId = null;
    const createdPrIds = [];
    const createdPoIds = [];
    let createdPoItemId = null;
    const createdInvoiceIds = [];

    t.after(async () => {
      // Clean up isolated test tenant records in correct FK dependency order
      try {
        if (createdInvoiceIds.length > 0) {
          await pool.query(`DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = ANY($1::int[])`, [createdInvoiceIds]);
          await pool.query(`DELETE FROM purchase_invoices WHERE id = ANY($1::int[])`, [createdInvoiceIds]);
        }
        if (createdPoIds.length > 0) {
          await pool.query(`DELETE FROM purchase_order_items WHERE po_id = ANY($1::int[])`, [createdPoIds]);
          await pool.query(`DELETE FROM purchase_orders WHERE id = ANY($1::int[])`, [createdPoIds]);
        }
        if (createdPrIds.length > 0) {
          await pool.query(`DELETE FROM purchase_request_items WHERE request_id = ANY($1::int[])`, [createdPrIds]);
          await pool.query(`DELETE FROM purchase_requests WHERE id = ANY($1::int[])`, [createdPrIds]);
        }
        if (createdProductId) await pool.query(`DELETE FROM products WHERE id = $1`, [createdProductId]);
        if (createdWarehouseId) await pool.query(`DELETE FROM warehouses WHERE id = $1`, [createdWarehouseId]);
        if (createdVendorId) await pool.query(`DELETE FROM vendors WHERE id = $1`, [createdVendorId]);
        await pool.query(`DELETE FROM tenants WHERE id = $1`, [testTenantId]);
      } catch (err) {
        console.warn('Cleanup warning:', err.message);
      } finally {
        await pool.end();
      }
    });

    // 1. Setup Tenant and Master Data
    await t.test('1. Setup isolated test tenant, warehouse, product, and vendor in real DB', async () => {
      await pool.query(`
        INSERT INTO tenants (id, name, slug, plan, status)
        VALUES ($1, 'Test Purchasing Tenant', $2, 'enterprise', 'active')
        ON CONFLICT DO NOTHING
      `, [testTenantId, `slug-${Date.now()}`]);

      const wRes = await pool.query(`
        INSERT INTO warehouses (name, code, tenant_id, is_active)
        VALUES ('Central Test Warehouse', $1, $2, true)
        RETURNING id
      `, [`WH-${Date.now()}`, testTenantId]);
      createdWarehouseId = wRes.rows[0].id;

      const pRes = await pool.query(`
        INSERT INTO products (name, sku, unit, tenant_id)
        VALUES ('Test Industrial Material', $1, 'PCS', $2)
        RETURNING id
      `, [`SKU-${Date.now()}`, testTenantId]);
      createdProductId = pRes.rows[0].id;

      const vRes = await pool.query(`
        INSERT INTO vendors (name, tenant_id)
        VALUES ('Global Test Supplier', $1)
        RETURNING id
      `, [testTenantId]);
      createdVendorId = vRes.rows[0].id;

      assert.ok(createdWarehouseId);
      assert.ok(createdProductId);
      assert.ok(createdVendorId);
    });

    // 2. Migration 012 Constraint Verification: 'converted_to_po' status accepted, invalid rejected
    await t.test('2. Real DB Check Constraint: chk_purchase_requests_status enforces valid statuses', async () => {
      // A: Insert with valid status 'approved'
      const prRes = await pool.query(`
        INSERT INTO purchase_requests (request_number, status, warehouse_id, tenant_id)
        VALUES ($1, 'approved', $2, $3)
        RETURNING id
      `, [`PR-REG-${Date.now()}`, createdWarehouseId, testTenantId]);
      createdPrId = prRes.rows[0].id;
      createdPrIds.push(createdPrId);

      await pool.query(`
        INSERT INTO purchase_request_items (request_id, product_id, quantity, estimated_unit_price)
        VALUES ($1, $2, 100.000, 50.00)
      `, [createdPrId, createdProductId]);

      // B: Transition to 'converted_to_po' (allowed by Migration 012)
      const updateRes = await pool.query(`
        UPDATE purchase_requests SET status = 'converted_to_po' WHERE id = $1 RETURNING status
      `, [createdPrId]);
      assert.equal(updateRes.rows[0].status, 'converted_to_po');

      // C: Prohibited illegal status rejected by constraint
      let rejected = false;
      try {
        await pool.query(`
          UPDATE purchase_requests SET status = 'illegal_stage' WHERE id = $1
        `, [createdPrId]);
      } catch (err) {
        if (err.message.includes('status') || err.code === '23514') {
          rejected = true;
        }
      }
      assert.equal(rejected, true, 'Real PostgreSQL constraint must reject illegal status');

      // Reset to approved for PO conversion
      await pool.query(`UPDATE purchase_requests SET status = 'approved' WHERE id = $1`, [createdPrId]);
    });

    // 3. PR -> Direct PO Conversion and Unique Partial Index Concurrency Guard
    await t.test('3. Real DB Unique Index: idx_po_tenant_pr blocks duplicate conversion concurrently', async () => {
      // A: Create PO referencing PR
      const poRes = await pool.query(`
        INSERT INTO purchase_orders (po_number, purchase_request_id, vendor_id, warehouse_id, status, subtotal, total_amount, tenant_id)
        VALUES ($1, $2, $3, $4, 'draft', 5000.00, 5000.00, $5)
        RETURNING id, po_number
      `, [`PO-REG-${Date.now()}`, createdPrId, createdVendorId, createdWarehouseId, testTenantId]);
      createdPoId = poRes.rows[0].id;
      createdPoIds.push(createdPoId);

      const poiRes = await pool.query(`
        INSERT INTO purchase_order_items (po_id, product_id, quantity, received_quantity, invoiced_quantity, unit_price, subtotal)
        VALUES ($1, $2, 100.000, 0.000, 0.000, 50.00, 5000.00)
        RETURNING id
      `, [createdPoId, createdProductId]);
      createdPoItemId = poiRes.rows[0].id;

      await pool.query(`UPDATE purchase_requests SET status = 'converted_to_po' WHERE id = $1`, [createdPrId]);

      // B: Attempt duplicate PO creation pointing to the same PR in the same tenant (sequential attempt)
      let duplicateBlocked = false;
      try {
        await pool.query(`
          INSERT INTO purchase_orders (po_number, purchase_request_id, vendor_id, warehouse_id, status, subtotal, total_amount, tenant_id)
          VALUES ($1, $2, $3, $4, 'draft', 5000.00, 5000.00, $5)
        `, [`PO-DUP-${Date.now()}`, createdPrId, createdVendorId, createdWarehouseId, testTenantId]);
      } catch (err) {
        if (err.code === '23505' && err.message.includes('idx_po_tenant_pr')) {
          duplicateBlocked = true;
        }
      }
      assert.equal(duplicateBlocked, true, 'PostgreSQL unique index idx_po_tenant_pr must block duplicate PO generation');

      // C: Real concurrent race condition: Two separate DB clients attempting simultaneous PO insert for the same PR
      const racePrRes = await pool.query(`
        INSERT INTO purchase_requests (request_number, status, warehouse_id, tenant_id)
        VALUES ($1, 'approved', $2, $3)
        RETURNING id
      `, [`PR-RACE-${Date.now()}`, createdWarehouseId, testTenantId]);
      const racePrId = racePrRes.rows[0].id;
      createdPrIds.push(racePrId);

      const [client1, client2] = await Promise.all([pool.connect(), pool.connect()]);
      try {
        const results = await Promise.allSettled([
          client1.query(`
            INSERT INTO purchase_orders (po_number, purchase_request_id, vendor_id, warehouse_id, status, subtotal, total_amount, tenant_id)
            VALUES ($1, $2, $3, $4, 'draft', 1000.00, 1000.00, $5)
            RETURNING id
          `, [`PO-RACE1-${Date.now()}`, racePrId, createdVendorId, createdWarehouseId, testTenantId]),
          client2.query(`
            INSERT INTO purchase_orders (po_number, purchase_request_id, vendor_id, warehouse_id, status, subtotal, total_amount, tenant_id)
            VALUES ($1, $2, $3, $4, 'draft', 1000.00, 1000.00, $5)
            RETURNING id
          `, [`PO-RACE2-${Date.now()}`, racePrId, createdVendorId, createdWarehouseId, testTenantId])
        ]);

        const successful = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        assert.equal(successful.length, 1, 'Exactly one concurrent insertion must succeed in race condition');
        assert.equal(rejected.length, 1, 'Exactly one concurrent insertion must fail in race condition');
        assert.equal(rejected[0].reason.code, '23505', 'Rejection must be PostgreSQL unique violation 23505');
        assert.ok(rejected[0].reason.message.includes('idx_po_tenant_pr'), 'Violation must reference idx_po_tenant_pr');

        createdPoIds.push(successful[0].value.rows[0].id);
      } finally {
        client1.release();
        client2.release();
      }
    });

    // 4. Goods Receipt & Received Quantity Constraints in Live DB
    await t.test('4. Real DB Constraint: chk_poi_received_qty accepts received <= qty and rejects received > qty', async () => {
      // A: Over-receipt rejected by DB constraint
      let overReceiptBlocked = false;
      try {
        await pool.query(`
          UPDATE purchase_order_items SET received_quantity = 101.000 WHERE id = $1
        `, [createdPoItemId]);
      } catch (err) {
        if (err.code === '23514') {
          overReceiptBlocked = true;
        }
      }
      assert.equal(overReceiptBlocked, true, 'PostgreSQL constraint must reject received_quantity > quantity');

      // B: Valid receipt of 100 units
      await pool.query(`
        UPDATE purchase_order_items SET received_quantity = 100.000 WHERE id = $1
      `, [createdPoItemId]);
      await pool.query(`UPDATE purchase_orders SET status = 'completed' WHERE id = $1`, [createdPoId]);

      const poi = (await pool.query(`SELECT received_quantity, invoiced_quantity FROM purchase_order_items WHERE id = $1`, [createdPoItemId])).rows[0];
      assert.equal(Number(poi.received_quantity), 100);
      assert.equal(Number(poi.invoiced_quantity), 0);
    });

    // 5. Partial Invoicing strictly against Received Quantity
    await t.test('5. Real DB Invoicing: Progressive invoiced_quantity and negative quantity rejection', async () => {
      // A: First partial invoice for 40 units
      const inv1Res = await pool.query(`
        INSERT INTO purchase_invoices (invoice_number, purchase_order_id, vendor_id, warehouse_id, total_amount, status, tenant_id)
        VALUES ($1, $2, $3, $4, 2000.00, 'posted', $5)
        RETURNING id
      `, [`PINV-1-${Date.now()}`, createdPoId, createdVendorId, createdWarehouseId, testTenantId]);
      createdInvoiceIds.push(inv1Res.rows[0].id);

      await pool.query(`
        INSERT INTO purchase_invoice_items (purchase_invoice_id, po_item_id, product_id, quantity, unit_price, subtotal)
        VALUES ($1, $2, $3, 40.000, 50.00, 2000.00)
      `, [inv1Res.rows[0].id, createdPoItemId, createdProductId]);

      await pool.query(`
        UPDATE purchase_order_items SET invoiced_quantity = invoiced_quantity + 40.000 WHERE id = $1
      `, [createdPoItemId]);

      let check1 = (await pool.query(`SELECT invoiced_quantity FROM purchase_order_items WHERE id = $1`, [createdPoItemId])).rows[0];
      assert.equal(Number(check1.invoiced_quantity), 40);

      // B: Second partial invoice for remaining 60 units
      const inv2Res = await pool.query(`
        INSERT INTO purchase_invoices (invoice_number, purchase_order_id, vendor_id, warehouse_id, total_amount, status, tenant_id)
        VALUES ($1, $2, $3, $4, 3000.00, 'posted', $5)
        RETURNING id
      `, [`PINV-2-${Date.now()}`, createdPoId, createdVendorId, createdWarehouseId, testTenantId]);
      createdInvoiceIds.push(inv2Res.rows[0].id);

      await pool.query(`
        INSERT INTO purchase_invoice_items (purchase_invoice_id, po_item_id, product_id, quantity, unit_price, subtotal)
        VALUES ($1, $2, $3, 60.000, 50.00, 3000.00)
      `, [inv2Res.rows[0].id, createdPoItemId, createdProductId]);

      await pool.query(`
        UPDATE purchase_order_items SET invoiced_quantity = invoiced_quantity + 60.000 WHERE id = $1
      `, [createdPoItemId]);

      let check2 = (await pool.query(`SELECT invoiced_quantity FROM purchase_order_items WHERE id = $1`, [createdPoItemId])).rows[0];
      assert.equal(Number(check2.invoiced_quantity), 100);

      // C: chk_poi_invoiced_qty constraint rejects negative invoiced_quantity
      let negativeBlocked = false;
      try {
        await pool.query(`
          UPDATE purchase_order_items SET invoiced_quantity = -5.000 WHERE id = $1
        `, [createdPoItemId]);
      } catch (err) {
        if (err.code === '23514' && err.message.includes('chk_poi_invoiced_qty')) {
          negativeBlocked = true;
        }
      }
      assert.equal(negativeBlocked, true, 'PostgreSQL constraint chk_poi_invoiced_qty must reject negative quantities');
    });

    // 6. Strict Real Estate Isolation: Zero Leakage
    await t.test('6. Complete Architectural Decoupling: Zero rows created in Real Estate tables', async () => {
      const reUnits = await pool.query(`SELECT COUNT(*)::int as count FROM re_units WHERE tenant_id = $1`, [testTenantId]);
      const reContracts = await pool.query(`SELECT COUNT(*)::int as count FROM re_contracts WHERE tenant_id = $1`, [testTenantId]);
      const reInstallments = await pool.query(`SELECT COUNT(*)::int as count FROM re_installments WHERE tenant_id = $1`, [testTenantId]);

      assert.equal(reUnits.rows[0].count, 0, 'Real Estate units must have zero records in purchasing test');
      assert.equal(reContracts.rows[0].count, 0, 'Real Estate contracts must have zero records in purchasing test');
      assert.equal(reInstallments.rows[0].count, 0, 'Real Estate installments must have zero records in purchasing test');
    });
  });
}
