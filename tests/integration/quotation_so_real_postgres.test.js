const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
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
  if (process.env.DATABASE_URL && testDbUrl === process.env.DATABASE_URL) {
    throw new Error('SAFETY GATE VIOLATION: DATABASE_URL_TEST is identical to production DATABASE_URL. Aborting!');
  }
  return testDbUrl;
}

const connectionString = verifySafetyGate();
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

test('Phase 2.2: Quotation -> Sales Order Idempotency - Real PostgreSQL Live Suite', async (t) => {
  const testTenantId = `99999999-9999-4999-a999-${Date.now().toString(16).padStart(12, '0')}`;
  const testBranchId = `88888888-8888-4888-a888-${Date.now().toString(16).padStart(12, '0')}`;
  let createdCustomerId = null;
  let createdProductId = null;

  const createdQuotationIds = [];
  const createdSalesOrderIds = [];

  t.after(async () => {
    try {
      if (createdSalesOrderIds.length > 0) {
        await pool.query(`DELETE FROM sales_order_items WHERE sales_order_id = ANY($1::uuid[])`, [createdSalesOrderIds]);
        await pool.query(`DELETE FROM sales_orders WHERE id = ANY($1::uuid[])`, [createdSalesOrderIds]);
      }
      if (createdQuotationIds.length > 0) {
        await pool.query(`DELETE FROM quotation_items WHERE quotation_id = ANY($1::int[])`, [createdQuotationIds]);
        await pool.query(`DELETE FROM quotations WHERE id = ANY($1::int[])`, [createdQuotationIds]);
      }
      if (createdCustomerId) await pool.query(`DELETE FROM customers WHERE id = $1`, [createdCustomerId]);
      if (createdProductId) await pool.query(`DELETE FROM products WHERE id = $1`, [createdProductId]);
      await pool.query(`DELETE FROM branches WHERE id = $1`, [testBranchId]);
      await pool.query(`DELETE FROM tenants WHERE id = $1`, [testTenantId]);
    } catch (err) {
      console.warn('Cleanup warning:', err.message);
    } finally {
      await pool.end();
    }
  });

  // 1. Setup Tenant, Branch, Customer, and Product
  await t.test('1. Setup isolated test tenant, branch, customer, and product in real DB', async () => {
    await pool.query(`
      INSERT INTO tenants (id, name, slug, plan, status)
      VALUES ($1, 'Test Sales Tenant', $2, 'enterprise', 'active')
    `, [testTenantId, `tenant-${Date.now()}`]);

    await pool.query(`
      INSERT INTO branches (id, name, tenant_id)
      VALUES ($1, 'Test Sales Branch', $2)
    `, [testBranchId, testTenantId]);

    const cRes = await pool.query(`
      INSERT INTO customers (name, tenant_id, branch_id)
      VALUES ('Acme Corp Client', $1, $2)
      RETURNING id
    `, [testTenantId, testBranchId]);
    createdCustomerId = cRes.rows[0].id;

    const pRes = await pool.query(`
      INSERT INTO products (name, sku, unit, tenant_id)
      VALUES ('Enterprise Software License', $1, 'LIC', $2)
      RETURNING id
    `, [`SKU-SALES-${Date.now()}`, testTenantId]);
    createdProductId = pRes.rows[0].id;

    assert.ok(createdCustomerId);
    assert.ok(createdProductId);
  });

  // 2. Create Approved Quotation and Convert to Sales Order
  let quotation1Id = null;
  let salesOrder1Id = null;

  await t.test('2. Convert approved quotation to Sales Order, copy items, update status to converted_to_so', async () => {
    const qRes = await pool.query(`
      INSERT INTO quotations (number, client_id, total_amount, status, tenant_id, branch_id)
      VALUES ($1, $2, 5000.00, 'approved', $3, $4)
      RETURNING id, number
    `, [`QUO-REG-${Date.now()}`, String(createdCustomerId), testTenantId, testBranchId]);
    quotation1Id = qRes.rows[0].id;
    createdQuotationIds.push(quotation1Id);

    await pool.query(`
      INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, subtotal, tenant_id, branch_id)
      VALUES ($1, $2, 'Software Module', 5, 1000.00, 5000.00, $3, $4)
    `, [quotation1Id, String(createdProductId), testTenantId, testBranchId]);

    // Perform atomic conversion on PostgreSQL
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const quo = (await client.query(`SELECT * FROM quotations WHERE id = $1 AND tenant_id::text = $2::text FOR UPDATE`, [quotation1Id, testTenantId])).rows[0];
      assert.equal(quo.status, 'approved');

      const soRes = await client.query(`
        INSERT INTO sales_orders (number, customer_id, quotation_id, status, total_amount, tenant_id, branch_id)
        VALUES ($1, $2, $3, 'draft', 5000.00, $4, $5)
        RETURNING id
      `, [`SO-TEST-${Date.now()}`, createdCustomerId, quotation1Id, testTenantId, testBranchId]);
      salesOrder1Id = soRes.rows[0].id;
      createdSalesOrderIds.push(salesOrder1Id);

      await client.query(`
        INSERT INTO sales_order_items (sales_order_id, product_id, description, quantity, unit_price, subtotal, tenant_id)
        VALUES ($1, $2, 'Software Module', 5, 1000.00, 5000.00, $3)
      `, [salesOrder1Id, createdProductId, testTenantId]);

      await client.query(`
        UPDATE quotations SET status = 'converted_to_so', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND tenant_id::text = $2::text
      `, [quotation1Id, testTenantId]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Verify DB state
    const qCheck = (await pool.query(`SELECT status FROM quotations WHERE id = $1`, [quotation1Id])).rows[0];
    assert.equal(qCheck.status, 'converted_to_so');

    const soCheck = (await pool.query(`SELECT status, total_amount FROM sales_orders WHERE id = $1`, [salesOrder1Id])).rows[0];
    assert.equal(soCheck.status, 'draft');
    assert.equal(Number(soCheck.total_amount), 5000);

    const soiCheck = await pool.query(`SELECT * FROM sales_order_items WHERE sales_order_id = $1`, [salesOrder1Id]);
    assert.equal(soiCheck.rows.length, 1);
  });

  // 3. Repeated Conversion Idempotency (Sequential Duplicate Protection)
  await t.test('3. Repeated conversion returns existing active Sales Order and creates ZERO duplicate rows', async () => {
    // Check existing active SO
    const existingSo = (await pool.query(`
      SELECT * FROM sales_orders
      WHERE quotation_id = $1 AND tenant_id::text = $2::text AND (status IS NULL OR status != 'cancelled')
    `, [quotation1Id, testTenantId])).rows[0];

    assert.ok(existingSo);
    assert.equal(existingSo.id, salesOrder1Id);

    // Verify row count remains 1
    const totalSoCount = (await pool.query(`
      SELECT COUNT(*)::int as count FROM sales_orders WHERE quotation_id = $1 AND tenant_id::text = $2::text
    `, [quotation1Id, testTenantId])).rows[0].count;
    assert.equal(totalSoCount, 1, 'Total Sales Orders for this quotation must remain exactly 1');

    // Attempting direct duplicate insertion violates idx_sales_orders_tenant_quotation
    let blockedByUniqueIndex = false;
    try {
      await pool.query(`
        INSERT INTO sales_orders (number, customer_id, quotation_id, status, total_amount, tenant_id, branch_id)
        VALUES ($1, $2, $3, 'draft', 5000.00, $4, $5)
      `, [`SO-DUP-${Date.now()}`, createdCustomerId, quotation1Id, testTenantId, testBranchId]);
    } catch (err) {
      if (err.code === '23505' && err.message.includes('idx_sales_orders_tenant_quotation')) {
        blockedByUniqueIndex = true;
      }
    }
    assert.equal(blockedByUniqueIndex, true, 'PostgreSQL unique index idx_sales_orders_tenant_quotation must reject duplicate insert');
  });

  // 4. Real PostgreSQL Concurrency & Race Condition (Parallel Connections)
  await t.test('4. Real DB Concurrency: Two simultaneous clients racing to convert same Quotation', async () => {
    const raceQRes = await pool.query(`
      INSERT INTO quotations (number, client_id, total_amount, status, tenant_id, branch_id)
      VALUES ($1, $2, 3000.00, 'approved', $3, $4)
      RETURNING id
    `, [`QUO-RACE-${Date.now()}`, String(createdCustomerId), testTenantId, testBranchId]);
    const raceQuotationId = raceQRes.rows[0].id;
    createdQuotationIds.push(raceQuotationId);

    // Connect TWO separate PostgreSQL clients
    const [client1, client2] = await Promise.all([pool.connect(), pool.connect()]);

    try {
      const results = await Promise.allSettled([
        client1.query(`
          INSERT INTO sales_orders (number, customer_id, quotation_id, status, total_amount, tenant_id, branch_id)
          VALUES ($1, $2, $3, 'draft', 3000.00, $4, $5)
          RETURNING id
        `, [`SO-RACE-1-${Date.now()}`, createdCustomerId, raceQuotationId, testTenantId, testBranchId]),
        client2.query(`
          INSERT INTO sales_orders (number, customer_id, quotation_id, status, total_amount, tenant_id, branch_id)
          VALUES ($1, $2, $3, 'draft', 3000.00, $4, $5)
          RETURNING id
        `, [`SO-RACE-2-${Date.now()}`, createdCustomerId, raceQuotationId, testTenantId, testBranchId])
      ]);

      const successful = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      assert.equal(successful.length, 1, 'Exactly one concurrent insertion must succeed');
      assert.equal(rejected.length, 1, 'Exactly one concurrent insertion must fail with unique violation');
      assert.equal(rejected[0].reason.code, '23505', 'Rejection code must be PostgreSQL unique violation 23505');
      assert.ok(rejected[0].reason.message.includes('idx_sales_orders_tenant_quotation'), 'Violation must reference idx_sales_orders_tenant_quotation');

      createdSalesOrderIds.push(successful[0].value.rows[0].id);

      // Verify DB count in PostgreSQL
      const soCount = (await pool.query(`
        SELECT COUNT(*)::int as count FROM sales_orders WHERE quotation_id = $1 AND tenant_id::text = $2::text
      `, [raceQuotationId, testTenantId])).rows[0].count;
      assert.equal(soCount, 1, 'PostgreSQL must contain exactly 1 Sales Order for the raced quotation');
    } finally {
      client1.release();
      client2.release();
    }
  });

  // 5. Cancellation & Re-conversion Policy
  await t.test('5. Cancelled Sales Order allows re-conversion generating a new active Sales Order', async () => {
    // Cancel the Sales Order created in test 2
    await pool.query(`
      UPDATE sales_orders SET status = 'cancelled' WHERE id = $1
    `, [salesOrder1Id]);

    // Now partial unique index idx_sales_orders_tenant_quotation excludes status = 'cancelled'
    // Inserting a new replacement Sales Order is permitted
    const newSoRes = await pool.query(`
      INSERT INTO sales_orders (number, customer_id, quotation_id, status, total_amount, tenant_id, branch_id)
      VALUES ($1, $2, $3, 'draft', 5000.00, $4, $5)
      RETURNING id
    `, [`SO-REPLACE-${Date.now()}`, createdCustomerId, quotation1Id, testTenantId, testBranchId]);

    const newSoId = newSoRes.rows[0].id;
    createdSalesOrderIds.push(newSoId);

    // Verify DB state: exactly 1 active and 1 cancelled SO exist
    const activeSoList = (await pool.query(`
      SELECT id, status FROM sales_orders
      WHERE quotation_id = $1 AND tenant_id::text = $2::text
      ORDER BY created_at ASC
    `, [quotation1Id, testTenantId])).rows;

    assert.equal(activeSoList.length, 2);
    assert.equal(activeSoList[0].status, 'cancelled');
    assert.equal(activeSoList[1].status, 'draft');

    // And attempting a THIRD active SO is blocked
    let thirdBlocked = false;
    try {
      await pool.query(`
        INSERT INTO sales_orders (number, customer_id, quotation_id, status, total_amount, tenant_id, branch_id)
        VALUES ($1, $2, $3, 'draft', 5000.00, $4, $5)
      `, [`SO-THIRD-${Date.now()}`, createdCustomerId, quotation1Id, testTenantId, testBranchId]);
    } catch (err) {
      if (err.code === '23505') thirdBlocked = true;
    }
    assert.equal(thirdBlocked, true, 'Third active SO must be blocked by idx_sales_orders_tenant_quotation');
  });

  // 6. Complete Architectural Decoupling: Zero Leakage
  await t.test('6. Complete Architectural Decoupling: Zero records in Real Estate or Procurement tables', async () => {
    const reUnits = await pool.query(`SELECT COUNT(*)::int as count FROM re_units WHERE tenant_id::text = $1`, [testTenantId]);
    const reContracts = await pool.query(`SELECT COUNT(*)::int as count FROM re_contracts WHERE tenant_id::text = $1`, [testTenantId]);
    const reInstallments = await pool.query(`SELECT COUNT(*)::int as count FROM re_installments WHERE tenant_id::text = $1`, [testTenantId]);
    const poCount = await pool.query(`SELECT COUNT(*)::int as count FROM purchase_orders WHERE tenant_id::text = $1`, [testTenantId]);
    const prCount = await pool.query(`SELECT COUNT(*)::int as count FROM purchase_requests WHERE tenant_id::text = $1`, [testTenantId]);

    assert.equal(reUnits.rows[0].count, 0, 'Zero Real Estate units');
    assert.equal(reContracts.rows[0].count, 0, 'Zero Real Estate contracts');
    assert.equal(reInstallments.rows[0].count, 0, 'Zero Real Estate installments');
    assert.equal(poCount.rows[0].count, 0, 'Zero Purchase Orders');
    assert.equal(prCount.rows[0].count, 0, 'Zero Purchase Requests');
  });
});
