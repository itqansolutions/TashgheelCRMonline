const db = require('../config/db');

/**
 * Round utility to 2 decimal places
 */
function round2(val) {
  return Math.round((parseFloat(val || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Concurrency-safe PO Number Generator: PO-YY-XXXX (e.g. PO-26-0001)
 */
async function generatePoNumber(client, tenantId) {
  const currentYear = new Date().getFullYear().toString().slice(-2); // e.g. "26"
  const prefix = `PO-${currentYear}-`;

  const query = `
    SELECT po_number 
    FROM purchase_orders 
    WHERE tenant_id = $1 AND po_number LIKE $2 
    ORDER BY id DESC 
    LIMIT 1 
    FOR UPDATE
  `;
  const result = await client.query(query, [tenantId, `${prefix}%`]);

  let nextSequence = 1;
  if (result.rows.length > 0) {
    const lastNum = result.rows[0].po_number;
    const parts = lastNum.split('-');
    if (parts.length === 3) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed)) {
        nextSequence = parsed + 1;
      }
    }
  }

  const paddedSequence = String(nextSequence).padStart(4, '0');
  return `${prefix}${paddedSequence}`;
}

/**
 * GET /api/purchase-orders
 * List purchase orders with tenant/branch scoping, vendor, warehouse, item aggregates
 */
exports.getPurchaseOrders = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { status, vendor_id, warehouse_id, rfq_id, search, date_from, date_to } = req.query;

    let query = `
      SELECT 
        po.id,
        po.po_number,
        po.rfq_id,
        r.rfq_number,
        po.vendor_quotation_id,
        vq.quotation_number,
        po.vendor_id,
        v.name AS vendor_name,
        v.phone AS vendor_phone,
        v.contact_name AS vendor_contact,
        po.warehouse_id,
        w.name AS warehouse_name,
        po.order_date,
        po.expected_delivery_date,
        po.payment_terms,
        po.shipping_terms,
        po.subtotal,
        po.discount_amount,
        po.tax_amount,
        po.shipping_cost,
        po.total_amount,
        po.status,
        po.notes,
        po.approved_by,
        u.name AS approved_by_name,
        po.approved_at,
        po.tenant_id,
        po.branch_id,
        po.created_at,
        po.updated_at,
        COUNT(poi.id)::int AS items_count,
        COALESCE(SUM(poi.quantity), 0)::numeric(12, 3) AS total_ordered_qty,
        COALESCE(SUM(poi.received_quantity), 0)::numeric(12, 3) AS total_received_qty,
        CASE 
          WHEN po.vendor_quotation_id IS NOT NULL THEN 'awarded_quotation'
          ELSE 'direct_po'
        END AS po_source
      FROM purchase_orders po
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN warehouses w ON w.id = po.warehouse_id
      LEFT JOIN rfqs r ON r.id = po.rfq_id
      LEFT JOIN vendor_quotations vq ON vq.id = po.vendor_quotation_id
      LEFT JOIN users u ON u.id = po.approved_by
      LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
      WHERE po.tenant_id = $1
    `;
    const params = [tenantId];
    let paramIndex = 2;

    if (req.branchId) {
      query += ` AND (po.branch_id = $${paramIndex} OR po.branch_id IS NULL)`;
      params.push(req.branchId);
      paramIndex++;
    }

    if (status && status !== 'all') {
      query += ` AND po.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (vendor_id) {
      query += ` AND po.vendor_id = $${paramIndex}`;
      params.push(vendor_id);
      paramIndex++;
    }

    if (warehouse_id) {
      query += ` AND po.warehouse_id = $${paramIndex}`;
      params.push(warehouse_id);
      paramIndex++;
    }

    if (rfq_id) {
      query += ` AND po.rfq_id = $${paramIndex}`;
      params.push(rfq_id);
      paramIndex++;
    }

    if (date_from) {
      query += ` AND po.order_date >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      query += ` AND po.order_date <= $${paramIndex}`;
      params.push(date_to);
      paramIndex++;
    }

    if (search) {
      query += ` AND (
        po.po_number ILIKE $${paramIndex} OR 
        v.name ILIKE $${paramIndex} OR 
        po.notes ILIKE $${paramIndex} OR 
        r.rfq_number ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += `
      GROUP BY 
        po.id, r.rfq_number, vq.quotation_number, 
        v.name, v.phone, v.contact_name, 
        w.name, u.name
      ORDER BY po.id DESC
    `;

    const result = await db.query(query, params);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[getPurchaseOrders] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve purchase orders' });
  }
};

/**
 * GET /api/purchase-orders/:id
 * Retrieve single purchase order with vendor, warehouse, approver, items with product details
 */
exports.getPurchaseOrderById = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;

    const poRes = await db.query(
      `SELECT 
        po.*,
        v.name AS vendor_name,
        v.phone AS vendor_phone,
        v.email AS vendor_email,
        v.address AS vendor_address,
        v.tax_no AS vendor_tax_no,
        v.contact_name AS vendor_contact,
        w.name AS warehouse_name,
        w.code AS warehouse_code,
        r.rfq_number,
        vq.quotation_number,
        u.name AS approved_by_name,
        CASE 
          WHEN po.vendor_quotation_id IS NOT NULL THEN 'awarded_quotation'
          ELSE 'direct_po'
        END AS po_source
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id = po.vendor_id
       LEFT JOIN warehouses w ON w.id = po.warehouse_id
       LEFT JOIN rfqs r ON r.id = po.rfq_id
       LEFT JOIN vendor_quotations vq ON vq.id = po.vendor_quotation_id
       LEFT JOIN users u ON u.id = po.approved_by
       WHERE po.id = $1 AND po.tenant_id = $2`,
      [id, tenantId]
    );

    if (poRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Purchase order not found' });
    }

    const po = poRes.rows[0];

    // Branch scoping
    if (req.branchId && po.branch_id && String(po.branch_id) !== String(req.branchId)) {
      return res.status(403).json({ success: false, message: 'Access denied: PO belongs to another branch.' });
    }

    // Fetch items with product metadata
    const itemsRes = await db.query(
      `SELECT 
        poi.*,
        p.name AS product_name,
        p.sku,
        p.unit
       FROM purchase_order_items poi
       JOIN products p ON p.id = poi.product_id
       WHERE poi.po_id = $1
       ORDER BY poi.id ASC`,
      [id]
    );

    po.items = itemsRes.rows;

    return res.json({ success: true, data: po });
  } catch (err) {
    console.error('[getPurchaseOrderById] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve purchase order details' });
  }
};

/**
 * POST /api/purchase-orders
 * Create Purchase Order via Route A (from Awarded Quotation) or Route B (Direct PO)
 */
exports.createPurchaseOrder = async (req, res) => {
  const client = await db.connect();
  try {
    const tenantId = req.user.tenant_id;
    const branchId = req.branchId || req.user.branch_id || null;
    const {
      rfq_id,
      vendor_quotation_id,
      vendor_id,
      warehouse_id,
      order_date,
      expected_delivery_date,
      payment_terms,
      shipping_terms,
      shipping_cost,
      notes,
      items
    } = req.body;

    // Check if received_quantity was attempted in any input
    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (item.received_quantity !== undefined && item.received_quantity !== null && Number(item.received_quantity) !== 0) {
          return res.status(400).json({
            success: false,
            message: 'received_quantity cannot be set during Purchase Order creation. Initial received quantity is strictly 0.000.'
          });
        }
      }
    }

    // Reject hybrid route: one of rfq_id / vendor_quotation_id without the other
    if ((rfq_id && !vendor_quotation_id) || (!rfq_id && vendor_quotation_id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid parameters: Both rfq_id and vendor_quotation_id must be provided together for quotation-based PO, or neither for Direct PO.'
      });
    }

    await client.query('BEGIN');

    let poVendorId = vendor_id;
    let poWarehouseId = warehouse_id;
    let poPaymentTerms = payment_terms;
    let poShippingTerms = shipping_terms;
    let poShippingCost = round2(shipping_cost || 0);
    let poExpectedDeliveryDate = expected_delivery_date || null;
    let poSubtotal = 0;
    let poDiscountAmount = 0;
    let poTaxAmount = 0;
    let poTotalAmount = 0;
    let finalItems = [];

    // ─────────────────────────────────────────────────────────────
    // ROUTE A: FROM AWARDED QUOTATION
    // ─────────────────────────────────────────────────────────────
    if (vendor_quotation_id && rfq_id) {
      // 1. Lock and validate Quotation
      const quoteRes = await client.query(
        `SELECT vq.*, r.status AS rfq_status, r.branch_id AS rfq_branch_id
         FROM vendor_quotations vq
         JOIN rfqs r ON r.id = vq.rfq_id
         WHERE vq.id = $1 AND vq.rfq_id = $2 AND vq.tenant_id = $3
         FOR UPDATE OF vq`,
        [vendor_quotation_id, rfq_id, tenantId]
      );

      if (quoteRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Vendor quotation or matching RFQ not found.' });
      }

      const quote = quoteRes.rows[0];

      // Branch check
      if (branchId && quote.branch_id && String(quote.branch_id) !== String(branchId)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ success: false, message: 'Branch mismatch: Quotation belongs to another branch.' });
      }

      // RFQ must be 'awarded'
      if (quote.rfq_status !== 'awarded') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Cannot create PO: RFQ status is '${quote.rfq_status}'. RFQ must be 'awarded'.`
        });
      }

      // Quotation must be 'selected'
      if (quote.selection_status !== 'selected') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Cannot create PO: Quotation selection status is '${quote.selection_status}'. Only 'selected' quotations can generate a Purchase Order.`
        });
      }

      // Enforce strictly 1 PO per quotation
      const existingPoRes = await client.query(
        `SELECT id, po_number FROM purchase_orders 
         WHERE vendor_quotation_id = $1 AND tenant_id = $2 
         FOR UPDATE`,
        [vendor_quotation_id, tenantId]
      );
      if (existingPoRes.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `A Purchase Order (${existingPoRes.rows[0].po_number}) has already been generated for this quotation. Exactly one PO per awarded quotation is allowed.`
        });
      }

      // Validate warehouse
      if (!poWarehouseId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'warehouse_id is required to receive items under this purchase order.' });
      }
      const whRes = await client.query(
        `SELECT id FROM warehouses WHERE id = $1 AND tenant_id = $2`,
        [poWarehouseId, tenantId]
      );
      if (whRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Warehouse not found or invalid.' });
      }

      // Copy commercial snapshot from quotation
      poVendorId = quote.vendor_id;
      poPaymentTerms = quote.payment_terms || poPaymentTerms || null;
      poShippingTerms = quote.warranty_terms || poShippingTerms || null;
      poShippingCost = round2(quote.shipping_cost || 0);
      poSubtotal = round2(quote.subtotal);
      poDiscountAmount = round2(quote.discount_amount);
      poTaxAmount = round2(quote.tax_amount);
      poTotalAmount = round2(quote.total_amount);

      if (!poExpectedDeliveryDate && quote.delivery_time_days) {
        const expectedDateObj = new Date();
        expectedDateObj.setDate(expectedDateObj.getDate() + parseInt(quote.delivery_time_days, 10));
        poExpectedDeliveryDate = expectedDateObj.toISOString().split('T')[0];
      }

      // Fetch quotation items
      const quoteItemsRes = await client.query(
        `SELECT * FROM vendor_quotation_items WHERE quotation_id = $1 ORDER BY id ASC`,
        [vendor_quotation_id]
      );
      if (quoteItemsRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Quotation has no items to copy into Purchase Order.' });
      }

      finalItems = quoteItemsRes.rows.map(item => ({
        product_id: item.product_id,
        quantity: parseFloat(item.quantity),
        received_quantity: 0.000,
        unit_price: round2(item.unit_price),
        discount_pct: round2(item.discount_pct || 0),
        tax_pct: round2(item.tax_pct || 0),
        subtotal: round2(item.subtotal)
      }));

    } else {
      // ─────────────────────────────────────────────────────────────
      // ROUTE B: DIRECT PURCHASE ORDER
      // ─────────────────────────────────────────────────────────────
      // BACKEND ROLE AUTHORIZATION: ONLY ADMIN / MANAGER
      if (req.user.role !== 'admin' && req.user.role !== 'manager') {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          message: 'Access Denied: Only managers and administrators have authorization to create direct purchase orders.'
        });
      }

      if (!poVendorId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'vendor_id is required for Direct Purchase Order.' });
      }

      if (!poWarehouseId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'warehouse_id is required for Direct Purchase Order.' });
      }

      if (!items || !Array.isArray(items) || items.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Direct Purchase Order must contain at least one item.' });
      }

      // Validate vendor
      const vRes = await client.query(
        `SELECT id FROM vendors WHERE id = $1 AND tenant_id = $2`,
        [poVendorId, tenantId]
      );
      if (vRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Vendor not found or does not belong to this tenant.' });
      }

      // Validate warehouse
      const wRes = await client.query(
        `SELECT id FROM warehouses WHERE id = $1 AND tenant_id = $2`,
        [poWarehouseId, tenantId]
      );
      if (wRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Warehouse not found or does not belong to this tenant.' });
      }

      let sumNet = 0;
      let sumDiscount = 0;
      let sumTax = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const qty = parseFloat(item.quantity);
        const price = parseFloat(item.unit_price);
        const discPct = parseFloat(item.discount_pct || 0);
        const taxPct = parseFloat(item.tax_pct || 0);

        if (!item.product_id) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: `Item at line ${i + 1} requires product_id.` });
        }
        if (isNaN(qty) || qty <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: `Item at line ${i + 1} must have quantity > 0.` });
        }
        if (isNaN(price) || price < 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: `Item at line ${i + 1} must have unit_price >= 0.` });
        }
        if (isNaN(discPct) || discPct < 0 || discPct > 100) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: `Item at line ${i + 1} discount must be between 0% and 100%.` });
        }
        if (isNaN(taxPct) || taxPct < 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: `Item at line ${i + 1} tax_pct must be >= 0.` });
        }

        // Validate product
        const pRes = await client.query(
          `SELECT id FROM products WHERE id = $1 AND tenant_id = $2`,
          [item.product_id, tenantId]
        );
        if (pRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: `Product ID ${item.product_id} at line ${i + 1} not found.` });
        }

        // Accurate math
        const gross = round2(qty * price);
        const discount = round2(gross * (discPct / 100));
        const net = round2(gross - discount);
        const tax = round2(net * (taxPct / 100));
        const itemSubtotal = round2(net + tax);

        sumNet += net;
        sumDiscount += discount;
        sumTax += tax;

        finalItems.push({
          product_id: item.product_id,
          quantity: qty,
          received_quantity: 0.000,
          unit_price: round2(price),
          discount_pct: round2(discPct),
          tax_pct: round2(taxPct),
          subtotal: itemSubtotal
        });
      }

      poSubtotal = round2(sumNet);
      poDiscountAmount = round2(sumDiscount);
      poTaxAmount = round2(sumTax);
      poTotalAmount = round2(poSubtotal + poTaxAmount + poShippingCost);
    }

    // Generate concurrency-safe PO number
    const poNumber = await generatePoNumber(client, tenantId);

    // Insert purchase_orders header
    const insertPoQuery = `
      INSERT INTO purchase_orders (
        po_number,
        rfq_id,
        vendor_quotation_id,
        vendor_id,
        warehouse_id,
        order_date,
        expected_delivery_date,
        payment_terms,
        shipping_terms,
        subtotal,
        discount_amount,
        tax_amount,
        shipping_cost,
        total_amount,
        status,
        notes,
        tenant_id,
        branch_id
      ) VALUES (
        $1, $2, $3, $4, $5, 
        COALESCE($6, CURRENT_DATE), $7, $8, $9, $10, 
        $11, $12, $13, $14, 'draft', $15, 
        $16, $17
      ) RETURNING *
    `;

    const poResult = await client.query(insertPoQuery, [
      poNumber,
      rfq_id || null,
      vendor_quotation_id || null,
      poVendorId,
      poWarehouseId,
      order_date || null,
      poExpectedDeliveryDate,
      poPaymentTerms,
      poShippingTerms,
      poSubtotal,
      poDiscountAmount,
      poTaxAmount,
      poShippingCost,
      poTotalAmount,
      notes || null,
      tenantId,
      branchId
    ]);

    const createdPo = poResult.rows[0];

    // Insert line items
    for (const item of finalItems) {
      await client.query(
        `INSERT INTO purchase_order_items (
          po_id,
          product_id,
          quantity,
          received_quantity,
          unit_price,
          discount_pct,
          tax_pct,
          subtotal
        ) VALUES ($1, $2, $3, 0.000, $4, $5, $6, $7)`,
        [
          createdPo.id,
          item.product_id,
          item.quantity,
          item.unit_price,
          item.discount_pct,
          item.tax_pct,
          item.subtotal
        ]
      );
    }

    await client.query('COMMIT');

    createdPo.items = finalItems;
    return res.status(201).json({
      success: true,
      message: `Purchase Order ${poNumber} created successfully in draft status.`,
      data: createdPo
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[createPurchaseOrder] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create purchase order: ' + err.message });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/purchase-orders/:id
 * Update draft purchase order.
 * Strictly forbidden once approved or sent.
 * Strictly rejects any modification to received_quantity or status.
 */
exports.updatePurchaseOrder = async (req, res) => {
  const client = await db.connect();
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;
    const {
      warehouse_id,
      vendor_id,
      order_date,
      expected_delivery_date,
      payment_terms,
      shipping_terms,
      shipping_cost,
      notes,
      items,
      status,
      received_quantity
    } = req.body;

    // Strict guard: received_quantity cannot be edited
    if (received_quantity !== undefined) {
      return res.status(400).json({
        success: false,
        message: 'received_quantity cannot be modified via Purchase Orders API. Initial quantity is strictly 0.000.'
      });
    }

    // Strict guard: status transitions to partially_received or completed cannot be done here
    if (status && (status === 'partially_received' || status === 'completed')) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition '${status}'. Receiving transitions are strictly reserved for Phase 5B.4 GRN.`
      });
    }

    if (items && Array.isArray(items)) {
      for (const it of items) {
        if (it.received_quantity !== undefined && it.received_quantity !== null && Number(it.received_quantity) !== 0) {
          return res.status(400).json({
            success: false,
            message: 'received_quantity cannot be modified via Purchase Orders API.'
          });
        }
      }
    }

    await client.query('BEGIN');

    // Lock and inspect current PO
    const poRes = await client.query(
      `SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, tenantId]
    );

    if (poRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Purchase order not found.' });
    }

    const currentPo = poRes.rows[0];

    // Branch scoping
    if (req.branchId && currentPo.branch_id && String(currentPo.branch_id) !== String(req.branchId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Branch mismatch: PO belongs to another branch.' });
    }

    // Must be in draft status to modify
    if (currentPo.status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot edit purchase order with status '${currentPo.status}'. Only draft purchase orders can be modified.`
      });
    }

    // Validate warehouse if updating
    let targetWarehouseId = currentPo.warehouse_id;
    if (warehouse_id && warehouse_id !== currentPo.warehouse_id) {
      const wRes = await client.query(
        `SELECT id FROM warehouses WHERE id = $1 AND tenant_id = $2`,
        [warehouse_id, tenantId]
      );
      if (wRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Warehouse not found or belongs to another tenant.' });
      }
      targetWarehouseId = warehouse_id;
    }

    let poSubtotal = parseFloat(currentPo.subtotal);
    let poDiscountAmount = parseFloat(currentPo.discount_amount);
    let poTaxAmount = parseFloat(currentPo.tax_amount);
    let poShippingCost = shipping_cost !== undefined ? round2(shipping_cost) : parseFloat(currentPo.shipping_cost);
    let poVendorId = currentPo.vendor_id;

    // Direct PO: allow recalculation if items are modified
    if (!currentPo.vendor_quotation_id && items && Array.isArray(items)) {
      if (items.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Direct Purchase Order must have at least one item.' });
      }

      if (vendor_id && vendor_id !== currentPo.vendor_id) {
        const vRes = await client.query(
          `SELECT id FROM vendors WHERE id = $1 AND tenant_id = $2`,
          [vendor_id, tenantId]
        );
        if (vRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: 'Vendor not found.' });
        }
        poVendorId = vendor_id;
      }

      let sumNet = 0;
      let sumDiscount = 0;
      let sumTax = 0;
      const updatedItems = [];

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const qty = parseFloat(it.quantity);
        const price = parseFloat(it.unit_price);
        const discPct = parseFloat(it.discount_pct || 0);
        const taxPct = parseFloat(it.tax_pct || 0);

        if (!it.product_id) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: `Item at line ${i + 1} requires product_id.` });
        }
        if (isNaN(qty) || qty <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: `Item at line ${i + 1} must have quantity > 0.` });
        }
        if (isNaN(price) || price < 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: `Item at line ${i + 1} must have unit_price >= 0.` });
        }
        if (isNaN(discPct) || discPct < 0 || discPct > 100) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: `Item at line ${i + 1} discount must be between 0% and 100%.` });
        }
        if (isNaN(taxPct) || taxPct < 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: `Item at line ${i + 1} tax_pct must be >= 0.` });
        }

        const pRes = await client.query(
          `SELECT id FROM products WHERE id = $1 AND tenant_id = $2`,
          [it.product_id, tenantId]
        );
        if (pRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: `Product ID ${it.product_id} at line ${i + 1} not found.` });
        }

        const gross = round2(qty * price);
        const discount = round2(gross * (discPct / 100));
        const net = round2(gross - discount);
        const tax = round2(net * (taxPct / 100));
        const itemSubtotal = round2(net + tax);

        sumNet += net;
        sumDiscount += discount;
        sumTax += tax;

        updatedItems.push({
          product_id: it.product_id,
          quantity: qty,
          unit_price: round2(price),
          discount_pct: round2(discPct),
          tax_pct: round2(taxPct),
          subtotal: itemSubtotal
        });
      }

      poSubtotal = round2(sumNet);
      poDiscountAmount = round2(sumDiscount);
      poTaxAmount = round2(sumTax);

      // Delete existing items and insert refreshed items
      await client.query(`DELETE FROM purchase_order_items WHERE po_id = $1`, [id]);
      for (const it of updatedItems) {
        await client.query(
          `INSERT INTO purchase_order_items (
            po_id, product_id, quantity, received_quantity, unit_price, discount_pct, tax_pct, subtotal
          ) VALUES ($1, $2, $3, 0.000, $4, $5, $6, $7)`,
          [id, it.product_id, it.quantity, it.unit_price, it.discount_pct, it.tax_pct, it.subtotal]
        );
      }
    }

    const poTotalAmount = round2(poSubtotal + poTaxAmount + poShippingCost);

    // Update PO header
    const updateRes = await client.query(
      `UPDATE purchase_orders
       SET 
         vendor_id = $1,
         warehouse_id = $2,
         order_date = COALESCE($3, order_date),
         expected_delivery_date = $4,
         payment_terms = $5,
         shipping_terms = $6,
         shipping_cost = $7,
         subtotal = $8,
         discount_amount = $9,
         tax_amount = $10,
         total_amount = $11,
         notes = $12,
         updated_at = NOW()
       WHERE id = $13 AND tenant_id = $14
       RETURNING *`,
      [
        poVendorId,
        targetWarehouseId,
        order_date || null,
        expected_delivery_date !== undefined ? expected_delivery_date : currentPo.expected_delivery_date,
        payment_terms !== undefined ? payment_terms : currentPo.payment_terms,
        shipping_terms !== undefined ? shipping_terms : currentPo.shipping_terms,
        poShippingCost,
        poSubtotal,
        poDiscountAmount,
        poTaxAmount,
        poTotalAmount,
        notes !== undefined ? notes : currentPo.notes,
        id,
        tenantId
      ]
    );

    await client.query('COMMIT');
    return res.json({
      success: true,
      message: 'Purchase order updated successfully.',
      data: updateRes.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[updatePurchaseOrder] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update purchase order: ' + err.message });
  } finally {
    client.release();
  }
};

/**
 * POST /api/purchase-orders/:id/approve
 * Transition: draft -> approved
 * Restricted to admin or manager.
 */
exports.approvePurchaseOrder = async (req, res) => {
  // CRITICAL AUTHORIZATION CHECK: ONLY ADMIN OR MANAGER
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: Only managers and administrators have authorization to approve purchase orders.'
    });
  }

  const client = await db.connect();
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;

    await client.query('BEGIN');

    const poRes = await client.query(
      `SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, tenantId]
    );

    if (poRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Purchase order not found.' });
    }

    const po = poRes.rows[0];

    // Branch scoping
    if (req.branchId && po.branch_id && String(po.branch_id) !== String(req.branchId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Branch mismatch: PO belongs to another branch.' });
    }

    // Must be in draft to approve
    if (po.status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot approve purchase order with status '${po.status}'. Only draft orders can be approved.`
      });
    }

    const updateRes = await client.query(
      `UPDATE purchase_orders 
       SET 
         status = 'approved',
         approved_by = $1,
         approved_at = NOW(),
         updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [req.user.id, id, tenantId]
    );

    await client.query('COMMIT');
    return res.json({
      success: true,
      message: `Purchase Order ${po.po_number} has been approved.`,
      data: updateRes.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[approvePurchaseOrder] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to approve purchase order: ' + err.message });
  } finally {
    client.release();
  }
};

/**
 * POST /api/purchase-orders/:id/send
 * Transition: approved -> sent_to_vendor
 * Restricted to admin or manager.
 */
exports.sendPurchaseOrder = async (req, res) => {
  // CRITICAL AUTHORIZATION CHECK: ONLY ADMIN OR MANAGER
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: Only managers and administrators have authorization to send purchase orders to vendors.'
    });
  }

  const client = await db.connect();
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;

    await client.query('BEGIN');

    const poRes = await client.query(
      `SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, tenantId]
    );

    if (poRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Purchase order not found.' });
    }

    const po = poRes.rows[0];

    // Branch scoping
    if (req.branchId && po.branch_id && String(po.branch_id) !== String(req.branchId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Branch mismatch: PO belongs to another branch.' });
    }

    // Must be in approved status to send
    if (po.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot send purchase order with status '${po.status}'. Order must be 'approved' before sending to vendor.`
      });
    }

    const updateRes = await client.query(
      `UPDATE purchase_orders 
       SET 
         status = 'sent_to_vendor',
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId]
    );

    await client.query('COMMIT');
    return res.json({
      success: true,
      message: `Purchase Order ${po.po_number} has been dispatched to vendor.`,
      data: updateRes.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[sendPurchaseOrder] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to send purchase order: ' + err.message });
  } finally {
    client.release();
  }
};

/**
 * POST /api/purchase-orders/:id/cancel
 * Transition: draft or approved -> cancelled
 * Strictly forbidden once sent_to_vendor, partially_received, or completed.
 */
exports.cancelPurchaseOrder = async (req, res) => {
  const client = await db.connect();
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;
    const { reason } = req.body;

    await client.query('BEGIN');

    const poRes = await client.query(
      `SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, tenantId]
    );

    if (poRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Purchase order not found.' });
    }

    const po = poRes.rows[0];

    // Branch scoping
    if (req.branchId && po.branch_id && String(po.branch_id) !== String(req.branchId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Branch mismatch: PO belongs to another branch.' });
    }

    // Allowed ONLY from draft or approved
    if (po.status !== 'draft' && po.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot cancel purchase order with status '${po.status}'. Orders sent to vendor, partially received, completed, or already cancelled cannot be cancelled.`
      });
    }

    const cancellationNote = reason ? `${po.notes ? po.notes + ' | ' : ''}Cancellation Reason: ${reason}` : po.notes;

    const updateRes = await client.query(
      `UPDATE purchase_orders 
       SET 
         status = 'cancelled',
         notes = $1,
         updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [cancellationNote, id, tenantId]
    );

    await client.query('COMMIT');
    return res.json({
      success: true,
      message: `Purchase Order ${po.po_number} has been cancelled.`,
      data: updateRes.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[cancelPurchaseOrder] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to cancel purchase order: ' + err.message });
  } finally {
    client.release();
  }
};

/**
 * POST /api/purchase-orders/:id/receive
 * Phase 5B.4: Receive Items against CRM Purchase Order
 * 
 * Flow:
 * - Single ACID transaction with FOR UPDATE row locking on both purchase_orders and purchase_order_items.
 * - Enforces PO status in ('sent_to_vendor', 'partially_received').
 * - Validates warehouse belongs to tenant and is active.
 * - Validates every item: 0 < received_now <= (quantity - received_quantity).
 * - Inserts stock_movements (type: 'in', reference_type: 'purchase_order', status: 'approved').
 * - Updates purchase_order_items.received_quantity.
 * - Recalculates PO status: if sum(received_quantity) == sum(quantity) -> 'completed', else 'partially_received'.
 * - 0 finance vouchers, 0 purchase invoices, 0 payments, 0 ERP modification.
 * - Rollback on any failure.
 */
exports.receivePurchaseOrderItems = async (req, res) => {
  const client = await db.connect();
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;
    const { items, warehouse_id, notes } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one item must be specified for receiving.'
      });
    }

    await client.query('BEGIN');

    // 1. Lock and validate PO
    const poRes = await client.query(
      `SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, tenantId]
    );

    if (poRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Purchase order not found.' });
    }

    const po = poRes.rows[0];

    // Branch scoping
    if (req.branchId && po.branch_id && String(po.branch_id) !== String(req.branchId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Branch mismatch: PO belongs to another branch.' });
    }

    // Status validation: Allowed ONLY if sent_to_vendor or partially_received
    if (po.status === 'draft' || po.status === 'approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Purchase Order must be sent to vendor before receiving items. Current status: '${po.status}'.`
      });
    }

    if (po.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Cannot receive items for a cancelled purchase order.'
      });
    }

    if (po.status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'This purchase order has already been fully received (completed).'
      });
    }

    if (po.status !== 'sent_to_vendor' && po.status !== 'partially_received') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot receive items for purchase order with status '${po.status}'.`
      });
    }

    // 2. Validate receiving warehouse
    const targetWarehouseId = warehouse_id || po.warehouse_id;
    if (!targetWarehouseId) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Destination warehouse is required for receiving.'
      });
    }

    const whRes = await client.query(
      `SELECT id, name, is_active FROM warehouses WHERE id = $1 AND tenant_id::text = $2::text`,
      [targetWarehouseId, String(tenantId)]
    );

    if (whRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Specified warehouse was not found or does not belong to your organization.'
      });
    }

    if (whRes.rows[0].is_active === false) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Destination warehouse '${whRes.rows[0].name}' is inactive.`
      });
    }

    // 3. Lock PO items
    const poiRes = await client.query(
      `SELECT * FROM purchase_order_items WHERE po_id = $1 FOR UPDATE`,
      [id]
    );

    if (poiRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Purchase order has no items to receive.'
      });
    }

    const poiRows = poiRes.rows;
    const poiMap = new Map();
    poiRows.forEach(row => {
      poiMap.set(String(row.id), row);
      poiMap.set(`prod_${row.product_id}`, row);
    });

    // 4. Validate all receiving quantities before making any changes
    const validatedItems = [];

    for (let i = 0; i < items.length; i++) {
      const itm = items[i];
      const itemId = itm.item_id || itm.po_item_id || itm.id;
      let matchedPoi = null;

      if (itemId) {
        matchedPoi = poiMap.get(String(itemId));
      } else if (itm.product_id) {
        matchedPoi = poiMap.get(`prod_${itm.product_id}`);
      }

      if (!matchedPoi) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Item at index ${i} (ID: ${itemId || itm.product_id}) does not belong to this purchase order.`
        });
      }

      const receivedNowRaw = itm.quantity ?? itm.quantity_received ?? itm.received_now;
      const receivedNow = parseFloat(receivedNowRaw);

      if (isNaN(receivedNow) || receivedNow <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Received quantity must be greater than zero. Received: ${receivedNowRaw}`
        });
      }

      const orderedQty = parseFloat(matchedPoi.quantity);
      const alreadyReceived = parseFloat(matchedPoi.received_quantity || 0);
      const remainingQty = round2(orderedQty - alreadyReceived);

      if (remainingQty <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Item #${matchedPoi.id} is already fully received. Remaining quantity is 0.`
        });
      }

      if (receivedNow > remainingQty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Cannot receive ${receivedNow} units. Remaining quantity is only ${remainingQty} units.`
        });
      }

      validatedItems.push({
        poi: matchedPoi,
        receivedNow: round2(receivedNow)
      });
    }

    // 5. Apply receiving: insert stock_movements and update purchase_order_items
    const createdMovements = [];

    for (const v of validatedItems) {
      // Create stock movement (Immediate physical stock arrival into destination warehouse)
      const smRes = await client.query(
        `INSERT INTO stock_movements (
           tenant_id, branch_id, product_id, from_warehouse_id, to_warehouse_id,
           type, quantity, reference_type, reference_id, status, created_by, approved_by, created_at
         ) VALUES ($1, $2, $3, NULL, $4, 'in', $5, 'purchase_order', $6, 'approved', $7, $7, NOW())
         RETURNING id, product_id, quantity, to_warehouse_id`,
        [
          tenantId,
          po.branch_id || req.branchId || null,
          v.poi.product_id,
          targetWarehouseId,
          v.receivedNow,
          String(po.id),
          req.user.id
        ]
      );
      createdMovements.push(smRes.rows[0]);

      // Update PO item received quantity
      await client.query(
        `UPDATE purchase_order_items 
         SET received_quantity = received_quantity + $1
         WHERE id = $2`,
        [v.receivedNow, v.poi.id]
      );
    }

    // 6. Recalculate overall PO receiving status
    const statusQuery = await client.query(
      `SELECT 
         SUM(quantity) AS total_ordered,
         SUM(received_quantity) AS total_received,
         BOOL_AND(received_quantity >= quantity) AS all_completed
       FROM purchase_order_items
       WHERE po_id = $1`,
      [id]
    );

    const { total_ordered, total_received, all_completed } = statusQuery.rows[0];
    const totalOrderedNum = parseFloat(total_ordered || 0);
    const totalReceivedNum = parseFloat(total_received || 0);

    let nextStatus = 'partially_received';
    if (all_completed || totalReceivedNum >= totalOrderedNum) {
      nextStatus = 'completed';
    }

    const receivingNote = notes 
      ? `${po.notes ? po.notes + ' | ' : ''}Received Note: ${notes}` 
      : po.notes;

    const updatedPoRes = await client.query(
      `UPDATE purchase_orders
       SET 
         status = $1,
         warehouse_id = COALESCE(warehouse_id, $2),
         notes = $3,
         updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [nextStatus, targetWarehouseId, receivingNote, id, tenantId]
    );

    // Fetch refreshed items for response
    const refreshedItemsRes = await client.query(
      `SELECT poi.*, p.name AS product_name, p.sku AS product_sku, p.unit AS product_unit
       FROM purchase_order_items poi
       JOIN products p ON poi.product_id = p.id
       WHERE poi.po_id = $1
       ORDER BY poi.id ASC`,
      [id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'تم استلام البضاعة بنجاح.',
      data: {
        ...updatedPoRes.rows[0],
        items: refreshedItemsRes.rows,
        stock_movements: createdMovements
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[receivePurchaseOrderItems] Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to receive purchase order items: ' + err.message
    });
  } finally {
    client.release();
  }
};
