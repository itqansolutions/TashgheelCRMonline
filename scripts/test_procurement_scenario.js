const db = require('../config/db');
const prController = require('../controllers/purchaseRequestsController');
const poController = require('../controllers/purchaseOrdersController');
const purchasesController = require('../controllers/purchasesController');
const financeController = require('../controllers/financeController');

async function testScenario() {
  console.log('=== RUNNING PROCUREMENT SCENARIO AUDIT ===');
  const tenantId = '33333333-3333-3333-3333-333333333333';
  const branchId = '11111111-1111-1111-1111-111111111111';
  const userId = 52;
  const user = { id: userId, tenant_id: tenantId, role: 'admin' };

  // Setup test warehouse, product, vendor, treasury account
  const whRes = await db.query('SELECT id FROM warehouses WHERE tenant_id::text = $1 LIMIT 1', [tenantId]);
  let warehouseId;
  if (whRes.rows.length === 0) {
    const nw = await db.query('INSERT INTO warehouses (name, code, tenant_id, is_active) VALUES (\'Procurement Test WH\', \'PWH-1\', $1, true) RETURNING id', [tenantId]);
    warehouseId = nw.rows[0].id;
  } else {
    warehouseId = whRes.rows[0].id;
  }

  // Create clean isolated test product
  const sku = 'TEST-PROD-' + Date.now().toString().slice(-4);
  const pRes = await db.query('INSERT INTO products (name, sku, unit, cost_price, selling_price, tenant_id) VALUES (\'Test Product\', $1, \'pcs\', 100, 150, $2) RETURNING id', [sku, tenantId]);
  const productId = pRes.rows[0].id;

  // Create clean isolated test vendor
  const vRes = await db.query('INSERT INTO vendors (name, phone, tenant_id) VALUES (\'Test Supplier\', \'01099999999\', $1) RETURNING id', [tenantId]);
  const vendorId = vRes.rows[0].id;

  // Ensure default cash treasury account with 5000 opening balance
  const taRes = await db.query('SELECT id FROM treasury_accounts WHERE tenant_id::text = $1 AND type = \'cash\'', [tenantId]);
  let treasuryAccountId;
  if (taRes.rows.length === 0) {
    const nta = await db.query('INSERT INTO treasury_accounts (name, type, opening_balance, is_default, is_active, tenant_id) VALUES (\'Main Treasury\', \'cash\', 5000, true, true, $1) RETURNING id', [tenantId]);
    treasuryAccountId = nta.rows[0].id;
  } else {
    treasuryAccountId = taRes.rows[0].id;
  }

  console.log('Setup IDs:', { warehouseId, productId, vendorId, treasuryAccountId });

  // Initial stock check
  const initStock = await getProductStock(productId, warehouseId, tenantId);
  console.log('1. Initial Stock:', initStock, '(Expected 0)');

  // Helper response mock
  function createMockRes() {
    return {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.data = data; return this; }
    };
  }

  // A) Purchase Request
  console.log('\n--- A) Purchase Request ---');
  const reqPR = {
    user,
    branchId,
    body: {
      warehouse_id: warehouseId,
      department: 'Procurement',
      priority: 'normal',
      items: [{ product_id: productId, quantity: 10, estimated_unit_price: 100 }]
    }
  };
  const resPR = createMockRes();
  await prController.createPurchaseRequest(reqPR, resPR);
  const pr = resPR.data?.data;
  console.log('PR Created:', resPR.statusCode, pr?.request_number, pr?.status);

  // Submit PR
  const resSubmit = createMockRes();
  await prController.submitPurchaseRequest({ user, params: { id: pr.id } }, resSubmit);
  console.log('PR Submitted:', resSubmit.statusCode, resSubmit.data?.data?.status);

  // Approve PR
  const resApprove = createMockRes();
  await prController.approvePurchaseRequest({ user, params: { id: pr.id } }, resApprove);
  console.log('PR Approved:', resApprove.statusCode, resApprove.data?.data?.status);

  const stockAfterPR = await getProductStock(productId, warehouseId, tenantId);
  console.log('Stock after PR:', stockAfterPR, '(Expected 0)');

  // B) Purchase Order
  console.log('\n--- B) Purchase Order ---');
  const reqPO = {
    user,
    branchId,
    body: {
      vendor_id: vendorId,
      warehouse_id: warehouseId,
      items: [{ product_id: productId, quantity: 10, unit_price: 100, discount_pct: 0, tax_pct: 0 }]
    }
  };
  const resPO = createMockRes();
  await poController.createPurchaseOrder(reqPO, resPO);
  const po = resPO.data?.data;
  console.log('PO Created:', resPO.statusCode, po?.po_number, po?.status, 'Total:', po?.total_amount);

  // Approve PO
  const resApprovePO = createMockRes();
  await poController.approvePurchaseOrder({ user, branchId, params: { id: po.id } }, resApprovePO);
  console.log('PO Approved:', resApprovePO.statusCode, resApprovePO.data?.data?.status);

  // Send PO to vendor
  const resSendPO = createMockRes();
  await poController.sendPurchaseOrder({ user, branchId, params: { id: po.id } }, resSendPO);
  console.log('PO Sent to Vendor:', resSendPO.statusCode, resSendPO.data?.data?.status);

  const stockAfterPO = await getProductStock(productId, warehouseId, tenantId);
  console.log('Stock after PO:', stockAfterPO, '(Expected 0)');

  // C) Purchase Invoice
  console.log('\n--- C) Purchase Invoice ---');
  const reqPI = {
    user,
    branchId,
    body: {
      vendor_id: vendorId,
      warehouse_id: warehouseId,
      items: [{ product_id: productId, quantity: 10, unit_price: 100 }]
    }
  };
  const resPI = createMockRes();
  await purchasesController.createPurchaseInvoice(reqPI, resPI);
  const pi = resPI.data?.data;
  console.log('PI Created:', resPI.statusCode, pi?.invoice_number, pi?.total_amount, pi?.status);

  const stockAfterPI = await getProductStock(productId, warehouseId, tenantId);
  console.log('Stock after PI:', stockAfterPI, '(Expected 0)');

  // Vendor Account after Invoice
  const resStmt1 = createMockRes();
  await purchasesController.getVendorStatement({ user, params: { id: vendorId } }, resStmt1);
  const stmt1 = resStmt1.data?.data?.summary;
  console.log('Vendor Summary after PI:', stmt1, '(Expected outstanding 1000)');

  // D) Stock IN
  console.log('\n--- D) Stock IN ---');
  const reqReceive = {
    user,
    branchId,
    params: { id: po.id },
    body: {
      warehouse_id: warehouseId,
      items: [{ product_id: productId, quantity: 10 }]
    }
  };
  const resReceive = createMockRes();
  await poController.receivePurchaseOrderItems(reqReceive, resReceive);
  console.log('Stock IN Received:', resReceive.statusCode, resReceive.data?.data?.status);

  const stockAfterReceive = await getProductStock(productId, warehouseId, tenantId);
  console.log('Stock after Stock IN:', stockAfterReceive, '(Expected 10)');

  // E) Vendor Account verification
  console.log('\n--- E) Vendor Account Verification ---');
  const resStmt2 = createMockRes();
  await purchasesController.getVendorStatement({ user, params: { id: vendorId } }, resStmt2);
  const stmt2 = resStmt2.data?.data?.summary;
  console.log('Vendor Summary after Stock IN:', stmt2, '(Expected outstanding still 1000)');

  // F) Vendor Payment: pay 400 EGP
  console.log('\n--- F) Vendor Payment ---');
  // Check Treasury before payment
  const treasBefore = await getTreasuryBalance(treasuryAccountId);
  console.log('Treasury Balance before payment:', treasBefore);

  const reqPay = {
    user,
    branchId,
    params: { id: vendorId },
    body: {
      amount: 400,
      payment_method: 'cash',
      treasury_account_id: treasuryAccountId,
      purchase_invoice_id: pi.id
    }
  };
  const resPay = createMockRes();
  await purchasesController.recordVendorPayment(reqPay, resPay);
  console.log('Vendor Payment recorded:', resPay.statusCode, resPay.data?.data?.voucher_number, resPay.data?.data?.amount);

  const resStmt3 = createMockRes();
  await purchasesController.getVendorStatement({ user, params: { id: vendorId } }, resStmt3);
  const stmt3 = resStmt3.data?.data?.summary;
  console.log('Vendor Summary after 400 EGP Payment:', stmt3, '(Expected outstanding 600)');

  const treasAfter = await getTreasuryBalance(treasuryAccountId);
  console.log('Treasury Balance after payment:', treasAfter, '(Expected decreased by 400 = ' + (treasBefore - 400) + ')');

  const stockFinal = await getProductStock(productId, warehouseId, tenantId);
  console.log('Final Stock after Payment:', stockFinal, '(Expected still 10)');

  // Cleanup test product and movements to avoid polluting DB
  await db.query('DELETE FROM finance_vouchers WHERE id = $1', [resPay.data?.data?.id]);
  await db.query('DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = $1', [pi.id]);
  await db.query('DELETE FROM purchase_invoices WHERE id = $1', [pi.id]);
  await db.query('DELETE FROM stock_movements WHERE reference_type = \'purchase_order\' AND reference_id = $1', [String(po.id)]);
  await db.query('DELETE FROM purchase_order_items WHERE po_id = $1', [po.id]);
  await db.query('DELETE FROM purchase_orders WHERE id = $1', [po.id]);
  await db.query('DELETE FROM purchase_request_items WHERE request_id = $1', [pr.id]);
  await db.query('DELETE FROM purchase_requests WHERE id = $1', [pr.id]);
  await db.query('DELETE FROM products WHERE id = $1', [productId]);
  await db.query('DELETE FROM vendors WHERE id = $1', [vendorId]);

  console.log('=== TEST SCENARIO FINISHED SUCCESSFULLY ===');
  process.exit(0);
}

async function getProductStock(productId, warehouseId, tenantId) {
  const res = await db.query(`
    SELECT 
      (
        COALESCE(SUM(CASE WHEN m.type IN ('in', 'adjustment') AND m.to_warehouse_id = $1 THEN m.quantity ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN m.type IN ('out', 'adjustment') AND m.from_warehouse_id = $1 THEN m.quantity ELSE 0 END), 0)
      )::numeric as stock
    FROM products p
    LEFT JOIN stock_movements m ON p.id = m.product_id AND m.status = 'approved' AND (m.to_warehouse_id = $1 OR m.from_warehouse_id = $1)
    WHERE p.id = $2
    GROUP BY p.id
  `, [warehouseId, productId]);
  return parseFloat(res.rows[0]?.stock || 0);
}

async function getTreasuryBalance(accountId) {
  const res = await db.query(`
    SELECT
      ta.opening_balance +
      COALESCE((
        SELECT SUM(p.amount) FROM payments p 
        WHERE p.treasury_account_id = ta.id AND (COALESCE(p.status, 'active') != 'cancelled')
      ), 0) +
      COALESCE((
        SELECT SUM(fv.amount) FROM finance_vouchers fv 
        WHERE fv.treasury_account_id = ta.id AND fv.voucher_type = 'receipt' AND fv.invoice_id IS NULL AND (COALESCE(fv.status, 'active') != 'cancelled')
      ), 0) -
      COALESCE((
        SELECT SUM(e.amount) FROM expenses e 
        WHERE e.treasury_account_id = ta.id
      ), 0) -
      COALESCE((
        SELECT SUM(fv.amount) FROM finance_vouchers fv 
        WHERE fv.treasury_account_id = ta.id AND fv.voucher_type = 'payment' AND (COALESCE(fv.status, 'active') != 'cancelled')
      ), 0) AS current_balance
    FROM treasury_accounts ta
    WHERE ta.id = $1
  `, [accountId]);
  return parseFloat(res.rows[0]?.current_balance || 0);
}

testScenario().catch(e => { console.error('SCENARIO ERROR:', e); process.exit(1); });
