const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');
const customersController = require('../controllers/customersController');

// Save original db methods
const originalDbQuery = db.query;

test('Phase G-6.5: Customer 360 Aggregation Suite', async (t) => {

  t.afterEach(() => {
    db.query = originalDbQuery;
  });

  // 1. Security & Isolation: Requires branch context
  await t.test('1. Security: Rejects request if branch context is missing', async () => {
    const req = {
      user: { id: 'usr-1', tenant_id: 'tenant-100' },
      params: { id: 'cust-1' }
    };
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };

    await customersController.getCustomer360(req, res);
    assert.equal(statusCode, 400);
    assert.equal(jsonBody.status, 'error');
    assert.match(jsonBody.message, /Branch context required/);
  });

  // 2. Tenant & Branch Isolation: Returns 404 if customer not found in caller tenant/branch
  await t.test('2. Tenant & Branch Isolation: Returns 404 when customer does not belong to tenant/branch', async () => {
    const req = {
      user: { id: 'usr-1', tenant_id: 'tenant-100', branch_id: 'branch-1' },
      branchId: 'branch-1',
      params: { id: 'cust-999' }
    };
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };

    db.query = async (sql, params) => {
      // Column guard ALTER TABLE queries
      if (typeof sql === 'string' && sql.includes('ALTER TABLE')) return { rows: [] };
      if (typeof sql === 'string' && sql.includes('CREATE TABLE')) return { rows: [] };
      // Customer lookup query
      if (typeof sql === 'string' && sql.includes('FROM customers c')) {
        assert.equal(params[0], 'cust-999');
        assert.equal(params[1], 'tenant-100');
        assert.equal(params[2], 'branch-1');
        return { rows: [] };
      }
      return { rows: [] };
    };

    await customersController.getCustomer360(req, res);
    assert.equal(statusCode, 404);
    assert.equal(jsonBody.status, 'error');
  });

  // 3. Financial calculations & Zero Double Counting Verification
  await t.test('3. Financial Source of Truth: Total Invoiced, Collections, and Outstanding Balance match exactly', async () => {
    const req = {
      user: { id: 'usr-1', tenant_id: 'tenant-100', branch_id: 'branch-1' },
      branchId: 'branch-1',
      params: { id: 'cust-1' }
    };
    let jsonBody = null;
    const res = {
      status: () => res,
      json: (data) => { jsonBody = data; return res; }
    };

    db.query = async (sql, params) => {
      if (typeof sql === 'string' && (sql.includes('ALTER TABLE') || sql.includes('CREATE TABLE'))) {
        return { rows: [] };
      }
      if (sql.includes('FROM customers c')) {
        return { rows: [{ id: 'cust-1', name: 'Al-Amal Corp', tenant_id: 'tenant-100', branch_id: 'branch-1', entity_type: 'customer' }] };
      }
      if (sql.includes('FROM deals d')) {
        return { rows: [{ id: 'deal-1', title: 'Deal Alpha', value: 50000, pipeline_stage: 'Won', created_at: '2026-10-01' }] };
      }
      if (sql.includes('FROM quotations q')) {
        return { rows: [{ id: 'quot-1', total_amount: 50000, status: 'accepted', created_at: '2026-10-02' }] };
      }
      if (sql.includes('FROM sales_orders so')) {
        return { rows: [{ id: 'so-1', number: 'SO-101', total_amount: 50000, status: 'confirmed', created_at: '2026-10-03' }] };
      }
      if (sql.includes('FROM delivery_notes dn')) {
        return { rows: [{ id: 'dn-1', number: 'DN-101', status: 'delivered', created_at: '2026-10-04' }] };
      }
      if (sql.includes('FROM invoices inv')) {
        return {
          rows: [
            { id: 'inv-1', invoice_number: 'INV-101', total_amount: 30000, status: 'partially_paid', due_date: '2026-09-01', created_at: '2026-10-04' },
            { id: 'inv-2', invoice_number: 'INV-102', total_amount: 20000, status: 'unpaid', due_date: '2026-11-01', created_at: '2026-10-05' }
          ]
        };
      }
      if (sql.includes('FROM sales_returns sr')) {
        return { rows: [] };
      }
      if (sql.includes('FROM payments p')) {
        // Linked payment to Invoice 1
        return { rows: [{ id: 'pmt-1', invoice_id: 'inv-1', amount: 15000, payment_method: 'Bank Transfer', voucher_number: 'RV-101', payment_date: '2026-10-05' }] };
      }
      if (sql.includes('FROM finance_vouchers fv')) {
        // On-Account advance receipt
        return { rows: [{ id: 'vouch-1', voucher_number: 'RV-102', amount: 5000, payment_method: 'Cash', voucher_date: '2026-10-06' }] };
      }
      if (sql.includes('FROM activities a')) {
        return { rows: [{ id: 'act-1', action: 'called', meta: { changes: { note: { to: 'Customer confirmed payment' } } }, created_at: '2026-10-06' }] };
      }
      if (sql.includes('FROM re_contracts c')) {
        return { rows: [] };
      }
      if (sql.includes('FROM re_installments inst')) {
        return { rows: [] };
      }
      if (sql.includes('FROM re_handovers h')) {
        return { rows: [] };
      }
      return { rows: [] };
    };

    await customersController.getCustomer360(req, res);

    assert.equal(jsonBody.status, 'success');
    const { summary, finance } = jsonBody.data;

    // Total Invoiced = 30,000 + 20,000 = 50,000
    assert.equal(summary.total_invoiced, 50000);
    // Total Collected = 15,000 (linked payment) + 5,000 (on-account voucher) = 20,000
    assert.equal(summary.total_collected, 20000);
    // Outstanding = 50,000 - 20,000 = 30,000
    assert.equal(summary.outstanding_balance, 30000);
    // Overdue = inv-1 (30,000) because due_date (2026-09-01) is past
    assert.equal(summary.overdue_amount, 30000);
    // Finance section mirrors exactly
    assert.equal(finance.total_invoiced, 50000);
    assert.equal(finance.total_collected, 20000);
    assert.equal(finance.outstanding_balance, 30000);
  });

  // 4. Unified Chronological Timeline Synthesis
  await t.test('4. Unified Timeline: Merges CRM activities and business documents in chronological order', async () => {
    const req = {
      user: { id: 'usr-1', tenant_id: 'tenant-100', branch_id: 'branch-1' },
      branchId: 'branch-1',
      params: { id: 'cust-1' }
    };
    let jsonBody = null;
    const res = {
      status: () => res,
      json: (data) => { jsonBody = data; return res; }
    };

    db.query = async (sql, params) => {
      if (typeof sql === 'string' && (sql.includes('ALTER TABLE') || sql.includes('CREATE TABLE'))) {
        return { rows: [] };
      }
      if (sql.includes('FROM customers c')) {
        return { rows: [{ id: 'cust-1', name: 'Client Test', tenant_id: 'tenant-100', branch_id: 'branch-1' }] };
      }
      if (sql.includes('FROM deals d')) {
        return { rows: [{ id: 'd-1', title: 'Deal 1', value: 1000, pipeline_stage: 'Won', created_at: '2026-10-01T10:00:00Z' }] };
      }
      if (sql.includes('FROM quotations q')) {
        return { rows: [{ id: 'q-1', total_amount: 1000, status: 'sent', created_at: '2026-10-02T10:00:00Z' }] };
      }
      if (sql.includes('FROM sales_orders so')) {
        return { rows: [{ id: 'so-1', number: 'SO-1', total_amount: 1000, status: 'confirmed', created_at: '2026-10-03T10:00:00Z' }] };
      }
      if (sql.includes('FROM delivery_notes dn')) {
        return { rows: [{ id: 'dn-1', number: 'DN-1', status: 'delivered', created_at: '2026-10-04T10:00:00Z' }] };
      }
      if (sql.includes('FROM invoices inv')) {
        return { rows: [{ id: 'inv-1', invoice_number: 'INV-1', total_amount: 1000, status: 'paid', created_at: '2026-10-05T10:00:00Z' }] };
      }
      if (sql.includes('FROM sales_returns sr')) {
        return { rows: [] };
      }
      if (sql.includes('FROM payments p')) {
        return { rows: [{ id: 'p-1', amount: 1000, payment_method: 'Cash', voucher_number: 'V-1', payment_date: '2026-10-06T10:00:00Z' }] };
      }
      if (sql.includes('FROM finance_vouchers fv')) {
        return { rows: [] };
      }
      if (sql.includes('FROM activities a')) {
        return { rows: [{ id: 'act-1', action: 'called', meta: { changes: { note: { to: 'Follow up after payment' } } }, created_at: '2026-10-07T10:00:00Z' }] };
      }
      return { rows: [] };
    };

    await customersController.getCustomer360(req, res);
    assert.equal(jsonBody.status, 'success');
    const { timeline } = jsonBody.data;

    // Timeline should have 7 entries
    assert.equal(timeline.length, 7);

    // Timeline must be sorted descending (newest first)
    assert.equal(timeline[0].source, 'crm');         // Oct 07
    assert.equal(timeline[1].source, 'payment');     // Oct 06
    assert.equal(timeline[2].source, 'invoice');     // Oct 05
    assert.equal(timeline[3].source, 'delivery_note'); // Oct 04
    assert.equal(timeline[4].source, 'sales_order'); // Oct 03
    assert.equal(timeline[5].source, 'quotation');   // Oct 02
    assert.equal(timeline[6].source, 'deal');        // Oct 01
  });

  // 5. Adaptive Real Estate Module Visibility
  await t.test('5. Adaptive Module: Sets has_real_estate to false for purely commercial customers', async () => {
    const req = {
      user: { id: 'usr-1', tenant_id: 'tenant-100', branch_id: 'branch-1' },
      branchId: 'branch-1',
      params: { id: 'cust-1' }
    };
    let jsonBody = null;
    const res = {
      status: () => res,
      json: (data) => { jsonBody = data; return res; }
    };

    db.query = async (sql) => {
      if (typeof sql === 'string' && (sql.includes('ALTER TABLE') || sql.includes('CREATE TABLE'))) {
        return { rows: [] };
      }
      if (sql.includes('FROM customers c')) {
        return { rows: [{ id: 'cust-1', name: 'Commercial Corp', tenant_id: 'tenant-100', branch_id: 'branch-1' }] };
      }
      if (sql.includes('FROM deals d')) {
        return { rows: [{ id: 'd-1', title: 'Trading Deal', value: 1000, pipeline_stage: 'Won', unit_id: null, project_id: null }] };
      }
      return { rows: [] };
    };

    await customersController.getCustomer360(req, res);
    assert.equal(jsonBody.status, 'success');
    assert.equal(jsonBody.data.summary.has_real_estate, false);
  });

  // 6. Real Estate Comprehensive Data: Reservations, Contracts, Installments, Collections, Handovers
  await t.test('6. Real Estate: Returns reservations, contracts, installments, collections, and handovers', async () => {
    const req = {
      user: { id: 'usr-1', tenant_id: 'tenant-100', branch_id: 'branch-1' },
      branchId: 'branch-1',
      params: { id: 'cust-1' }
    };
    let jsonBody = null;
    const res = {
      status: () => res,
      json: (data) => { jsonBody = data; return res; }
    };

    db.query = async (sql) => {
      if (typeof sql === 'string' && (sql.includes('ALTER TABLE') || sql.includes('CREATE TABLE'))) {
        return { rows: [] };
      }
      if (sql.includes('FROM customers c')) {
        return { rows: [{ id: 'cust-1', name: 'Buyer Test', tenant_id: 'tenant-100', branch_id: 'branch-1' }] };
      }
      if (sql.includes('FROM deals d')) {
        return {
          rows: [
            { id: 'd-1', title: 'Unit 101 Reservation', value: 2500000, pipeline_stage: 'Reservation', unit_id: 'u-1', unit_number: '101', unit_status: 'Reserved', unit_reservation_expires_at: '2026-10-15' }
          ]
        };
      }
      if (sql.includes('FROM re_contracts c')) {
        return {
          rows: [
            { id: 'c-1', contract_number: 'CNT-2026-01', contract_value: 2500000, status: 'Active', unit_number: '101' }
          ]
        };
      }
      if (sql.includes('FROM re_installments inst')) {
        return {
          rows: [
            { id: 'inst-1', installment_number: 1, amount: 250000, status: 'Paid', due_date: '2026-10-01' }
          ]
        };
      }
      if (sql.includes('FROM re_handovers h')) {
        return {
          rows: [
            { id: 'h-1', unit_number: '101', status: 'Pending' }
          ]
        };
      }
      if (sql.includes('FROM finance_vouchers fv') && sql.includes('contract_id IS NOT NULL')) {
        return {
          rows: [
            { id: 'fv-1', voucher_number: 'RV-RE-01', amount: 250000, payment_method: 'Bank Transfer', voucher_date: '2026-10-01', contract_number: 'CNT-2026-01', unit_number: '101' }
          ]
        };
      }
      return { rows: [] };
    };

    await customersController.getCustomer360(req, res);
    assert.equal(jsonBody.status, 'success');
    const { summary, real_estate } = jsonBody.data;

    assert.equal(summary.has_real_estate, true);
    assert.equal(summary.reservations_count, 1);
    assert.equal(real_estate.reservations.length, 1);
    assert.equal(real_estate.reservations[0].unit_number, '101');
    assert.equal(real_estate.contracts.length, 1);
    assert.equal(real_estate.installments.length, 1);
    assert.equal(real_estate.collections.length, 1);
    assert.equal(real_estate.collections[0].voucher_number, 'RV-RE-01');
    assert.equal(real_estate.handovers.length, 1);
  });
});
