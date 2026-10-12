const fs = require('fs');
const dotenv = require('dotenv');
// Pre-load .env.test and override DATABASE_URL before ANY module is imported
const envTestContent = fs.readFileSync('.env.test', 'utf8');
const envTest = dotenv.parse(envTestContent);
if (!envTest.DATABASE_URL_TEST || envTest.DATABASE_URL_TEST.includes('reseau.proxy.rlwy.net')) {
  throw new Error('SAFETY GATE: Invalid or production DATABASE_URL_TEST');
}
process.env.DATABASE_URL = envTest.DATABASE_URL_TEST;
process.env.DATABASE_URL_TEST = envTest.DATABASE_URL_TEST;

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');

// ============================================================================
// SAFETY GATE: ONLY ISOLATED TEST DB
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

// Import services under test AFTER pointing DATABASE_URL to isolated test DB
const salesService = require('../../services/salesService');
const invoicesController = require('../../controllers/invoicesController');
const SalesOrderService = require('../../src/domains/sales/SalesOrderService');

const crypto = require('crypto');

test('Phase 3.2B: Quotation -> Invoice Lifecycle & Settlement Suite (Real PostgreSQL)', async (t) => {
  const testTenantId = crypto.randomUUID();
  const otherTenantId = crypto.randomUUID();
  const testBranchId = crypto.randomUUID();
  const secondBranchId = crypto.randomUUID();
  
  let testCustomerId = null;
  let testProductId1 = null;
  let testProductId2 = null;

  const createdQuotationIds = [];
  const createdSalesOrderIds = [];
  const createdInvoiceIds = [];

  // Setup fixtures
  await t.test('Setup: Create test tenant, branch, customer, and products in isolated test DB', async () => {
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status) VALUES 
       ($1, 'Phase 3.2B Tenant', $2, 'enterprise', 'active'),
       ($3, 'Other Tenant', $4, 'enterprise', 'active')`,
      [testTenantId, `slug-${testTenantId.slice(0, 8)}`, otherTenantId, `slug-${otherTenantId.slice(0, 8)}`]
    );

    await pool.query('INSERT INTO branches (id, tenant_id, name) VALUES ($1, $2, $3)', [
      testBranchId, testTenantId, 'Branch 32B Primary'
    ]);
    await pool.query('INSERT INTO branches (id, tenant_id, name) VALUES ($1, $2, $3)', [
      secondBranchId, testTenantId, 'Branch 32B Secondary'
    ]);

    const custRes = await pool.query(
      'INSERT INTO customers (name, tenant_id, branch_id) VALUES ($1, $2, $3) RETURNING id',
      ['Customer 32B', testTenantId, testBranchId]
    );
    testCustomerId = custRes.rows[0].id;

    const p1 = await pool.query(
      `INSERT INTO products (name, sku, cost_price, selling_price, tenant_id, branch_id, is_inventory_item)
       VALUES ('Item Alpha', $1, 50.00, 100.00, $2, $3, true) RETURNING id`,
      [`SKU-A-${Date.now()}`, testTenantId, testBranchId]
    );
    testProductId1 = p1.rows[0].id;

    const p2 = await pool.query(
      `INSERT INTO products (name, sku, cost_price, selling_price, tenant_id, branch_id, is_inventory_item)
       VALUES ('Item Beta', $1, 100.00, 250.00, $2, $3, true) RETURNING id`,
      [`SKU-B-${Date.now()}`, testTenantId, testBranchId]
    );
    testProductId2 = p2.rows[0].id;

    assert.ok(testCustomerId && testProductId1 && testProductId2);
  });

  // 1. Success path: Quotation -> Sales Order -> Invoice with full line items copied
  await t.test('1. Successful conversion: Approved quotation converts to invoice with full line items copied', async () => {
    // Create quotation
    const qRes = await pool.query(`
      INSERT INTO quotations (number, tenant_id, branch_id, client_id, status, total_amount)
      VALUES ($1, $2, $3, $4, 'approved', $5)
      RETURNING id
    `, [`QUO-${Date.now()}-${Math.floor(Math.random()*1000)}`, testTenantId, testBranchId, testCustomerId, 450.00]);
    const quotationId = qRes.rows[0].id;
    createdQuotationIds.push(quotationId);

    // Insert 2 items
    await pool.query(`
      INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, subtotal, tenant_id, branch_id)
      VALUES 
        ($1, $2, 'Item Alpha desc', 2, 100.00, 200.00, $3, $4),
        ($1, $5, 'Item Beta desc', 1, 250.00, 250.00, $3, $4)
    `, [quotationId, testProductId1, testTenantId, testBranchId, testProductId2]);

    // Convert via orchestrator
    const invoice = await salesService.convertQuotationToInvoice(quotationId, testTenantId, { userId: 1, branchId: testBranchId });
    assert.ok(invoice && invoice.id, 'Invoice should be created');
    createdInvoiceIds.push(invoice.id);

    // Verify Sales Order was created
    const soRes = await pool.query('SELECT * FROM sales_orders WHERE quotation_id = $1', [quotationId]);
    assert.equal(soRes.rows.length, 1, 'Sales Order must be created');
    createdSalesOrderIds.push(soRes.rows[0].id);

    // Verify invoice items match quotation items
    const invItemsRes = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [invoice.id]);
    assert.equal(invItemsRes.rows.length, 2, 'Invoice must contain exactly 2 copied items');
    const alpha = invItemsRes.rows.find(i => i.description === 'Item Alpha desc');
    const beta = invItemsRes.rows.find(i => i.description === 'Item Beta desc');
    assert.ok(alpha, 'Item Alpha must exist on invoice');
    assert.ok(beta, 'Item Beta must exist on invoice');
    assert.equal(Number(alpha.quantity), 2);
    assert.equal(Number(alpha.unit_price), 100.00);
    assert.equal(Number(alpha.subtotal), 200.00);
    assert.equal(Number(beta.quantity), 1);
    assert.equal(Number(beta.unit_price), 250.00);
    assert.equal(Number(beta.subtotal), 250.00);

    // Total invoice amount must match
    assert.equal(Number(invoice.total_amount), 450.00);

    // Quotation status must be 'invoiced'
    const qCheck = await pool.query('SELECT status FROM quotations WHERE id = $1', [quotationId]);
    assert.equal(qCheck.rows[0].status, 'invoiced');
  });

  // 2. Idempotency: Repeated conversion returns existing active invoice and does not duplicate
  await t.test('2. Idempotency: Repeated conversion returns existing active invoice without duplicate records', async () => {
    const quotationId = createdQuotationIds[0];
    const initialInvoiceId = createdInvoiceIds[0];

    // Convert again
    const secondCall = await salesService.convertQuotationToInvoice(quotationId, testTenantId, { userId: 1 });
    assert.ok(secondCall, 'Should return invoice');
    assert.equal(secondCall.id, initialInvoiceId, 'Should return the exact same invoice ID');
    assert.ok(secondCall._alreadyExists || secondCall._alreadyConverted, 'Should flag as already existing');

    // Verify DB still only has 1 invoice
    const countRes = await pool.query('SELECT COUNT(*)::int as count FROM invoices WHERE quotation_id = $1', [quotationId]);
    assert.equal(countRes.rows[0].count, 1, 'Should NOT create a duplicate invoice');
  });

  // 3. Concurrency: Parallel simultaneous conversion requests on the same quotation produce exactly 1 Sales Order and 1 Invoice
  await t.test('3. Concurrency: Parallel simultaneous conversion requests on the same quotation produce exactly 1 Sales Order and 1 Invoice', async () => {
    const qRes = await pool.query(`
      INSERT INTO quotations (number, tenant_id, branch_id, client_id, status, total_amount)
      VALUES ($1, $2, $3, $4, 'approved', 350.00)
      RETURNING id
    `, [`QUO-CONC-${Date.now()}`, testTenantId, testBranchId, testCustomerId]);
    const quotationId = qRes.rows[0].id;
    createdQuotationIds.push(quotationId);

    await pool.query(`
      INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, subtotal, tenant_id, branch_id)
      VALUES 
        ($1, $2, 'Parallel Item 1', 1, 100.00, 100.00, $3, $4),
        ($1, $5, 'Parallel Item 2', 1, 250.00, 250.00, $3, $4)
    `, [quotationId, testProductId1, testTenantId, testBranchId, testProductId2]);

    // Fire 2 concurrent requests at the exact same moment
    const [res1, res2] = await Promise.all([
      salesService.convertQuotationToInvoice(quotationId, testTenantId, { userId: 1, branchId: testBranchId }),
      salesService.convertQuotationToInvoice(quotationId, testTenantId, { userId: 1, branchId: testBranchId })
    ]);

    assert.ok(res1 && res1.id, 'Response 1 should return an invoice');
    assert.ok(res2 && res2.id, 'Response 2 should return an invoice');
    assert.equal(res1.id, res2.id, 'Both concurrent calls must return the exact same invoice ID');

    // Verify DB integrity: exactly 1 Sales Order and 1 Invoice exist
    const soCount = await pool.query('SELECT COUNT(*)::int as count FROM sales_orders WHERE quotation_id = $1', [quotationId]);
    assert.equal(soCount.rows[0].count, 1, 'Database must contain exactly 1 Sales Order');

    const invCount = await pool.query('SELECT COUNT(*)::int as count FROM invoices WHERE quotation_id = $1', [quotationId]);
    assert.equal(invCount.rows[0].count, 1, 'Database must contain exactly 1 Invoice');
  });

  // 4. Rejection: Quotation with no items must fail atomically
  await t.test('4. Rejection: Quotation without items is rejected cleanly without partial records', async () => {
    const qRes = await pool.query(`
      INSERT INTO quotations (number, tenant_id, branch_id, client_id, status, total_amount)
      VALUES ($1, $2, $3, $4, 'approved', 0.00)
      RETURNING id
    `, [`QUO-4-${Date.now()}`, testTenantId, testBranchId, testCustomerId]);
    const quotationId = qRes.rows[0].id;
    createdQuotationIds.push(quotationId);

    await assert.rejects(
      async () => await salesService.convertQuotationToInvoice(quotationId, testTenantId),
      /no items/i
    );

    // Verify neither Sales Order nor Invoice was created
    const soRes = await pool.query('SELECT COUNT(*)::int as count FROM sales_orders WHERE quotation_id = $1', [quotationId]);
    assert.equal(soRes.rows[0].count, 0, 'No SO should be created');

    const invRes = await pool.query('SELECT COUNT(*)::int as count FROM invoices WHERE quotation_id = $1', [quotationId]);
    assert.equal(invRes.rows[0].count, 0, 'No invoice should be created');
  });

  // 5. Rejection: Unapproved quotation (draft / rejected / cancelled) must be rejected
  await t.test('5. Rejection: Unapproved quotation cannot be converted to invoice', async () => {
    const qRes = await pool.query(`
      INSERT INTO quotations (number, tenant_id, branch_id, client_id, status, total_amount)
      VALUES ($1, $2, $3, $4, 'draft', 100.00)
      RETURNING id
    `, [`QUO-5-${Date.now()}`, testTenantId, testBranchId, testCustomerId]);
    const quotationId = qRes.rows[0].id;
    createdQuotationIds.push(quotationId);

    await pool.query(`
      INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, subtotal, tenant_id)
      VALUES ($1, $2, 'Item Alpha desc', 1, 100.00, 100.00, $3)
    `, [quotationId, testProductId1, testTenantId]);

    await assert.rejects(
      async () => await salesService.convertQuotationToInvoice(quotationId, testTenantId),
      /must be approved/i
    );
  });

  // 6. Strict Real Estate Isolation: quotation linked to real estate unit cannot be converted through general sales
  await t.test('6. Real Estate Isolation: Quotation linked to a real estate unit is rejected from general invoicing', async () => {
    const qRes = await pool.query(`
      INSERT INTO quotations (number, tenant_id, branch_id, client_id, status, total_amount, unit_id)
      VALUES ($1, $2, $3, $4, 'approved', 1000000.00, 'unit-re-99')
      RETURNING id
    `, [`QUO-6-${Date.now()}`, testTenantId, testBranchId, testCustomerId]);
    const quotationId = qRes.rows[0].id;
    createdQuotationIds.push(quotationId);

    await assert.rejects(
      async () => await salesService.convertQuotationToInvoice(quotationId, testTenantId),
      /Real Estate unit/i
    );
  });

  // 7. Cross-Tenant Protection: cannot convert another tenant's quotation
  await t.test('7. Cross-Tenant Protection: Cannot convert another tenant quotation', async () => {
    const quotationId = createdQuotationIds[0];

    await assert.rejects(
      async () => await salesService.convertQuotationToInvoice(quotationId, otherTenantId),
      /Quotation not found or unauthorized/i
    );
  });

  // 8. Branch Isolation: Cannot convert quotation of Branch A using Branch B credentials
  await t.test('8. Branch Isolation: Reject conversion when caller branch does not match quotation branch', async () => {
    const quotationId = createdQuotationIds[0];

    await assert.rejects(
      async () => await salesService.convertQuotationToInvoice(quotationId, testTenantId, { branchId: secondBranchId }),
      /Branch isolation violation/i
    );
  });

  // 9. Atomic Rollback: Error during invoice item insertion rolls back everything cleanly
  await t.test('9. Atomic Rollback: Simulated failure rolls back quotation status and creates no orphans', async () => {
    const qRes = await pool.query(`
      INSERT INTO quotations (number, tenant_id, branch_id, client_id, status, total_amount)
      VALUES ($1, $2, $3, $4, 'approved', 300.00)
      RETURNING id
    `, [`QUO-9-${Date.now()}`, testTenantId, testBranchId, testCustomerId]);
    const quotationId = qRes.rows[0].id;
    createdQuotationIds.push(quotationId);

    // Product ID that does not exist in products table or violates foreign key if simulated
    await pool.query(`
      INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, subtotal, tenant_id)
      VALUES ($1, $2, 'Valid Item', 1, 300.00, 300.00, $3)
    `, [quotationId, testProductId1, testTenantId]);

    // Force an error inside convertSalesOrderToInvoice by passing invalid client/mock
    const origConvertSO = salesService.convertSalesOrderToInvoice;
    salesService.convertSalesOrderToInvoice = async () => {
      throw new Error('Simulated atomic failure during invoice generation');
    };

    try {
      await assert.rejects(
        async () => await salesService.convertQuotationToInvoice(quotationId, testTenantId),
        /Simulated atomic failure/
      );

      // Verify rollback: status must NOT be invoiced
      const qCheck = await pool.query('SELECT status FROM quotations WHERE id = $1', [quotationId]);
      assert.notEqual(qCheck.rows[0].status, 'invoiced', 'Quotation status must NOT be marked invoiced on failure');

      // Verify no orphan invoice was created
      const invCheck = await pool.query('SELECT COUNT(*)::int as count FROM invoices WHERE quotation_id = $1', [quotationId]);
      assert.equal(invCheck.rows[0].count, 0, 'No orphan invoice should exist');
    } finally {
      salesService.convertSalesOrderToInvoice = origConvertSO;
    }
  });

  // 10. Controller Endpoint Compatibility: POST /api/invoices/from-quotation/:quotationId
  await t.test('10. Controller Compatibility: createInvoiceFromQuotation responds 201 for new and 200 for repeat', async () => {
    const qRes = await pool.query(`
      INSERT INTO quotations (number, tenant_id, branch_id, client_id, status, total_amount)
      VALUES ($1, $2, $3, $4, 'approved', 100.00)
      RETURNING id
    `, [`QUO-8-${Date.now()}`, testTenantId, testBranchId, testCustomerId]);
    const quotationId = qRes.rows[0].id;
    createdQuotationIds.push(quotationId);

    await pool.query(`
      INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, subtotal, tenant_id)
      VALUES ($1, $2, 'Single Item', 1, 100.00, 100.00, $3)
    `, [quotationId, testProductId1, testTenantId]);

    // First call (New)
    let statusCode1 = null;
    let jsonResult1 = null;
    const req1 = {
      params: { quotationId },
      user: { id: 1, tenant_id: testTenantId },
      branchId: testBranchId,
      headers: { 'x-forwarded-for': '127.0.0.1' },
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' }
    };
    const res1 = {
      status: (c) => { statusCode1 = c; return res1; },
      json: (d) => { jsonResult1 = d; return res1; }
    };

    await invoicesController.createInvoiceFromQuotation(req1, res1);
    assert.equal(statusCode1, 201, 'First call should return 201 Created');
    assert.ok(jsonResult1 && jsonResult1.data && jsonResult1.data.id);
    createdInvoiceIds.push(jsonResult1.data.id);

    // Second call (Repeat / Idempotent)
    let statusCode2 = null;
    let jsonResult2 = null;
    const req2 = {
      params: { quotationId },
      user: { id: 1, tenant_id: testTenantId },
      branchId: testBranchId,
      headers: { 'x-forwarded-for': '127.0.0.1' },
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' }
    };
    const res2 = {
      status: (c) => { statusCode2 = c; return res2; },
      json: (d) => { jsonResult2 = d; return res2; }
    };

    await invoicesController.createInvoiceFromQuotation(req2, res2);
    assert.equal(statusCode2, 200, 'Repeat call should return 200 OK (idempotent)');
    assert.equal(jsonResult2.data.id, jsonResult1.data.id, 'Repeat call returns identical invoice');
  });

  // Teardown
  await t.test('Teardown: Clean up test fixtures', async () => {
    // Allow pending background async loggers (setImmediate in loggerService) to flush
    await new Promise((r) => setTimeout(r, 300));

    try {
      await pool.query('DELETE FROM invoice_items WHERE tenant_id IN ($1, $2)', [testTenantId, otherTenantId]);
      await pool.query('DELETE FROM invoices WHERE tenant_id IN ($1, $2)', [testTenantId, otherTenantId]);
      await pool.query('DELETE FROM sales_order_items WHERE tenant_id IN ($1, $2)', [testTenantId, otherTenantId]);
      await pool.query('DELETE FROM sales_orders WHERE tenant_id IN ($1, $2)', [testTenantId, otherTenantId]);
      await pool.query('DELETE FROM quotation_items WHERE tenant_id IN ($1, $2)', [testTenantId, otherTenantId]);
      await pool.query('DELETE FROM quotations WHERE tenant_id IN ($1, $2)', [testTenantId, otherTenantId]);
      await pool.query('DELETE FROM customers WHERE tenant_id IN ($1, $2)', [testTenantId, otherTenantId]);
      await pool.query('DELETE FROM products WHERE tenant_id IN ($1, $2)', [testTenantId, otherTenantId]);
      await pool.query('DELETE FROM branches WHERE tenant_id IN ($1, $2)', [testTenantId, otherTenantId]);
      try {
        await pool.query('DELETE FROM outbox_events WHERE tenant_id IN ($1, $2)', [testTenantId, otherTenantId]);
      } catch (_) {}
      await pool.query('DELETE FROM system_logs WHERE tenant_id IN ($1, $2)', [testTenantId, otherTenantId]);
      await pool.query('DELETE FROM tenants WHERE id IN ($1, $2)', [testTenantId, otherTenantId]);
    } finally {
      await pool.end();
    }
  });
});
