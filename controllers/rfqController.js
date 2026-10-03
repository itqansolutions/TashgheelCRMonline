const db = require('../config/database');

/**
 * Helper: Generate unique, tenant-scoped RFQ number (RFQ-YY-XXXX)
 */
async function generateRfqNumber(client, tenantId) {
  const currentYear = new Date().getFullYear().toString().slice(-2); // e.g. "26"
  const prefix = `RFQ-${currentYear}-`;

  const query = `
    SELECT rfq_number 
    FROM rfqs 
    WHERE tenant_id = $1 AND rfq_number LIKE $2 
    ORDER BY id DESC 
    LIMIT 1 
    FOR UPDATE
  `;
  const result = await client.query(query, [tenantId, `${prefix}%`]);

  let nextSequence = 1;
  if (result.rows.length > 0) {
    const lastNum = result.rows[0].rfq_number;
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
 * Helper: Generate unique, tenant-scoped Vendor Quotation number (VQ-YY-XXXX) if none provided
 */
async function generateQuotationNumber(client, tenantId) {
  const currentYear = new Date().getFullYear().toString().slice(-2);
  const prefix = `VQ-${currentYear}-`;

  const query = `
    SELECT quotation_number 
    FROM vendor_quotations 
    WHERE tenant_id = $1 AND quotation_number LIKE $2 
    ORDER BY id DESC 
    LIMIT 1 
    FOR UPDATE
  `;
  const result = await client.query(query, [tenantId, `${prefix}%`]);

  let nextSeq = 1;
  if (result.rows.length > 0) {
    const lastNum = result.rows[0].quotation_number;
    const parts = lastNum.split('-');
    if (parts.length === 3) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed)) nextSeq = parsed + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * GET /api/rfqs
 * List RFQs with tenant/branch scoping, vendor counts, quotation counts
 */
exports.getRfqs = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { status, vendor_id, purchase_request_id, search, priority } = req.query;

    let query = `
      SELECT 
        r.id,
        r.rfq_number,
        r.purchase_request_id,
        pr.request_number AS purchase_request_number,
        pr.department AS pr_department,
        r.issue_date,
        r.deadline_date,
        r.status,
        r.notes,
        r.branch_id,
        r.created_at,
        r.updated_at,
        u.name AS created_by_name,
        COUNT(DISTINCT ri.id)::int AS items_count,
        COUNT(DISTINCT rv.id)::int AS vendors_count,
        COUNT(DISTINCT vq.id)::int AS quotations_count,
        (
          SELECT v.name 
          FROM vendor_quotations vq_sel 
          JOIN vendors v ON v.id = vq_sel.vendor_id 
          WHERE vq_sel.rfq_id = r.id AND vq_sel.selection_status = 'selected' 
          LIMIT 1
        ) AS awarded_vendor_name,
        (
          SELECT vq_sel.total_amount 
          FROM vendor_quotations vq_sel 
          WHERE vq_sel.rfq_id = r.id AND vq_sel.selection_status = 'selected' 
          LIMIT 1
        ) AS awarded_amount
      FROM rfqs r
      LEFT JOIN purchase_requests pr ON pr.id = r.purchase_request_id
      LEFT JOIN users u ON u.id = r.created_by
      LEFT JOIN rfq_items ri ON ri.rfq_id = r.id
      LEFT JOIN rfq_vendors rv ON rv.rfq_id = r.id
      LEFT JOIN vendor_quotations vq ON vq.rfq_id = r.id
      WHERE r.tenant_id = $1
    `;
    const params = [tenantId];
    let paramIndex = 2;

    if (req.branchId) {
      query += ` AND (r.branch_id = $${paramIndex} OR r.branch_id IS NULL)`;
      params.push(req.branchId);
      paramIndex++;
    }

    if (status && status !== 'all') {
      query += ` AND r.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (purchase_request_id) {
      query += ` AND r.purchase_request_id = $${paramIndex}`;
      params.push(purchase_request_id);
      paramIndex++;
    }

    if (vendor_id) {
      query += ` AND EXISTS (SELECT 1 FROM rfq_vendors rv2 WHERE rv2.rfq_id = r.id AND rv2.vendor_id = $${paramIndex})`;
      params.push(vendor_id);
      paramIndex++;
    }

    if (search) {
      query += ` AND (r.rfq_number ILIKE $${paramIndex} OR r.notes ILIKE $${paramIndex} OR pr.request_number ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += `
      GROUP BY r.id, pr.request_number, pr.department, u.name
      ORDER BY r.id DESC
    `;

    const result = await db.query(query, params);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[getRfqs] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch RFQs' });
  }
};

/**
 * GET /api/rfqs/:id
 * Detailed RFQ view with items, invited vendors, received quotations
 */
exports.getRfqById = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;

    const rfqQuery = `
      SELECT 
        r.*,
        pr.request_number AS purchase_request_number,
        pr.department AS pr_department,
        pr.notes AS pr_notes,
        u.name AS created_by_name
      FROM rfqs r
      LEFT JOIN purchase_requests pr ON pr.id = r.purchase_request_id
      LEFT JOIN users u ON u.id = r.created_by
      WHERE r.id = $1 AND r.tenant_id = $2
    `;
    const rfqResult = await db.query(rfqQuery, [id, tenantId]);
    if (rfqResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'RFQ not found' });
    }
    const rfq = rfqResult.rows[0];

    // Fetch items
    const itemsQuery = `
      SELECT 
        ri.*,
        p.name AS product_name,
        p.sku,
        p.unit
      FROM rfq_items ri
      JOIN products p ON p.id = ri.product_id
      WHERE ri.rfq_id = $1
      ORDER BY ri.id ASC
    `;
    const itemsResult = await db.query(itemsQuery, [id]);
    rfq.items = itemsResult.rows;

    // Fetch invited vendors
    const vendorsQuery = `
      SELECT 
        rv.id AS rfq_vendor_id,
        rv.vendor_id,
        rv.invitation_status,
        rv.created_at AS invited_at,
        v.name AS vendor_name,
        v.contact_name,
        v.phone,
        v.email,
        v.tax_number,
        (
          SELECT COUNT(*)::int 
          FROM vendor_quotations vq 
          WHERE vq.rfq_id = $1 AND vq.vendor_id = rv.vendor_id
        ) AS quotes_count
      FROM rfq_vendors rv
      JOIN vendors v ON v.id = rv.vendor_id
      WHERE rv.rfq_id = $1
      ORDER BY v.name ASC
    `;
    const vendorsResult = await db.query(vendorsQuery, [id]);
    rfq.vendors = vendorsResult.rows;

    // Fetch received quotations
    const quotationsQuery = `
      SELECT 
        vq.*,
        v.name AS vendor_name,
        v.contact_name,
        v.phone,
        v.email,
        u.name AS awarded_by_name,
        COUNT(vqi.id)::int AS items_count
      FROM vendor_quotations vq
      JOIN vendors v ON v.id = vq.vendor_id
      LEFT JOIN users u ON u.id = vq.awarded_by
      LEFT JOIN vendor_quotation_items vqi ON vqi.quotation_id = vq.id
      WHERE vq.rfq_id = $1 AND vq.tenant_id = $2
      GROUP BY vq.id, v.name, v.contact_name, v.phone, v.email, u.name
      ORDER BY vq.total_amount ASC
    `;
    const quotationsResult = await db.query(quotationsQuery, [id, tenantId]);
    rfq.quotations = quotationsResult.rows;

    return res.json({ success: true, data: rfq });
  } catch (err) {
    console.error('[getRfqById] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch RFQ details' });
  }
};

/**
 * POST /api/rfqs
 * Create RFQ:
 * - Route A: From approved Purchase Request (copies items, validates status = 'approved')
 * - Route B: Direct RFQ with items
 */
exports.createRfq = async (req, res) => {
  const client = await db.connect();
  try {
    const tenantId = req.user.tenant_id;
    const branchId = req.branchId || req.body.branch_id || null;
    const userId = req.user.id;
    const {
      purchase_request_id,
      issue_date,
      deadline_date,
      notes,
      items,
      vendor_ids
    } = req.body;

    await client.query('BEGIN');

    let resolvedItems = [];
    let prId = null;

    // Route A: From Purchase Request
    if (purchase_request_id) {
      const prQuery = `
        SELECT * FROM purchase_requests 
        WHERE id = $1 AND tenant_id = $2
        FOR UPDATE
      `;
      const prResult = await client.query(prQuery, [purchase_request_id, tenantId]);
      if (prResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Purchase Request not found' });
      }

      const pr = prResult.rows[0];

      // CRITICAL VALIDATION: Purchase Request MUST be 'approved'
      if (pr.status !== 'approved') {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          message: `Cannot create RFQ from Purchase Request with status '${pr.status}'. Only 'approved' requests can generate an RFQ.` 
        });
      }

      prId = pr.id;

      // Copy PR items
      const prItemsQuery = `
        SELECT product_id, quantity, description 
        FROM purchase_request_items 
        WHERE request_id = $1
      `;
      const prItemsResult = await client.query(prItemsQuery, [pr.id]);
      if (prItemsResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'The referenced Purchase Request has no line items' });
      }

      resolvedItems = prItemsResult.rows.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        target_specs: item.description || ''
      }));

      // Mark PR status as 'converted_to_rfq'
      await client.query(
        `UPDATE purchase_requests SET status = 'converted_to_rfq', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [pr.id]
      );
    } else {
      // Route B: Direct RFQ
      if (!Array.isArray(items) || items.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'RFQ must contain at least one line item' });
      }
      resolvedItems = items;
    }

    // Validate item quantities and products
    for (const item of resolvedItems) {
      if (!item.product_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'All items must specify a valid product_id' });
      }
      if (parseFloat(item.quantity) <= 0 || isNaN(parseFloat(item.quantity))) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'All item quantities must be greater than zero' });
      }
    }

    // Generate unique RFQ number
    const rfqNumber = await generateRfqNumber(client, tenantId);

    // Insert RFQ header
    const insertRfqQuery = `
      INSERT INTO rfqs (
        rfq_number,
        purchase_request_id,
        issue_date,
        deadline_date,
        status,
        notes,
        created_by,
        tenant_id,
        branch_id
      ) VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8)
      RETURNING *
    `;
    const rfqResult = await client.query(insertRfqQuery, [
      rfqNumber,
      prId,
      issue_date || new Date().toISOString().split('T')[0],
      deadline_date || null,
      notes || null,
      userId,
      tenantId,
      branchId
    ]);
    const newRfq = rfqResult.rows[0];

    // Insert RFQ items
    for (const item of resolvedItems) {
      await client.query(
        `INSERT INTO rfq_items (rfq_id, product_id, quantity, target_specs) VALUES ($1, $2, $3, $4)`,
        [newRfq.id, item.product_id, item.quantity, item.target_specs || null]
      );
    }

    // Insert initial invited vendors if provided
    if (Array.isArray(vendor_ids) && vendor_ids.length > 0) {
      for (const vId of vendor_ids) {
        // Validate vendor belongs to tenant
        const vCheck = await client.query(
          `SELECT id FROM vendors WHERE id = $1 AND tenant_id = $2`,
          [vId, tenantId]
        );
        if (vCheck.rows.length > 0) {
          await client.query(
            `INSERT INTO rfq_vendors (rfq_id, vendor_id, invitation_status) 
             VALUES ($1, $2, 'sent')
             ON CONFLICT (rfq_id, vendor_id) DO NOTHING`,
            [newRfq.id, vId]
          );
        }
      }
    }

    await client.query('COMMIT');
    return res.status(201).json({
      success: true,
      message: 'RFQ created successfully',
      data: newRfq
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[createRfq] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create RFQ' });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/rfqs/:id
 * Update draft RFQ header and items
 */
exports.updateRfq = async (req, res) => {
  const client = await db.connect();
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;
    const { deadline_date, notes, items } = req.body;

    await client.query('BEGIN');

    const checkQuery = `
      SELECT status FROM rfqs 
      WHERE id = $1 AND tenant_id = $2 
      FOR UPDATE
    `;
    const checkRes = await client.query(checkQuery, [id, tenantId]);
    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'RFQ not found' });
    }

    if (checkRes.rows[0].status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        message: `Cannot edit RFQ with status '${checkRes.rows[0].status}'. Only draft RFQs can be modified.` 
      });
    }

    // Update header
    await client.query(
      `UPDATE rfqs SET deadline_date = $1, notes = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [deadline_date || null, notes || null, id]
    );

    // If items provided, replace them
    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        if (!item.product_id || parseFloat(item.quantity) <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'All items must have valid product and positive quantity' });
        }
      }

      await client.query(`DELETE FROM rfq_items WHERE rfq_id = $1`, [id]);
      for (const item of items) {
        await client.query(
          `INSERT INTO rfq_items (rfq_id, product_id, quantity, target_specs) VALUES ($1, $2, $3, $4)`,
          [id, item.product_id, item.quantity, item.target_specs || null]
        );
      }
    }

    await client.query('COMMIT');
    return res.json({ success: true, message: 'RFQ updated successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[updateRfq] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update RFQ' });
  } finally {
    client.release();
  }
};

/**
 * POST /api/rfqs/:id/send
 * Transitions RFQ from 'draft' to 'sent'.
 * Validates that at least 1 vendor and at least 1 item are present.
 */
exports.sendRfq = async (req, res) => {
  const client = await db.connect();
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;

    await client.query('BEGIN');

    const checkRes = await client.query(
      `SELECT status FROM rfqs WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, tenantId]
    );
    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'RFQ not found' });
    }

    const currentStatus = checkRes.rows[0].status;
    if (currentStatus !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `Only draft RFQs can be sent. Current status: ${currentStatus}` });
    }

    // Verify items exist
    const itemsCountRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM rfq_items WHERE rfq_id = $1`,
      [id]
    );
    if (itemsCountRes.rows[0].count === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Cannot send an RFQ with no items' });
    }

    // Verify at least one vendor is invited
    const vendorsCountRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM rfq_vendors WHERE rfq_id = $1`,
      [id]
    );
    if (vendorsCountRes.rows[0].count === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Please invite at least one vendor before sending the RFQ' });
    }

    // Update status to 'sent'
    await client.query(
      `UPDATE rfqs SET status = 'sent', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');
    return res.json({ success: true, message: 'RFQ marked as Sent to invited vendors' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[sendRfq] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to send RFQ' });
  } finally {
    client.release();
  }
};

/**
 * POST /api/rfqs/:id/cancel
 * Cancel RFQ (only allowed if not yet awarded or closed)
 */
exports.cancelRfq = async (req, res) => {
  const client = await db.connect();
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;

    await client.query('BEGIN');

    const checkRes = await client.query(
      `SELECT status FROM rfqs WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, tenantId]
    );
    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'RFQ not found' });
    }

    const status = checkRes.rows[0].status;
    if (status === 'awarded' || status === 'closed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `Cannot cancel an RFQ that is already ${status}` });
    }

    await client.query(
      `UPDATE rfqs SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');
    return res.json({ success: true, message: 'RFQ cancelled successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[cancelRfq] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to cancel RFQ' });
  } finally {
    client.release();
  }
};

/**
 * POST /api/rfqs/:id/vendors
 * Add an invited vendor to RFQ
 */
exports.addVendorToRfq = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;
    const { vendor_id } = req.body;

    if (!vendor_id) {
      return res.status(400).json({ success: false, message: 'vendor_id is required' });
    }

    // Check RFQ
    const rfqRes = await db.query(
      `SELECT status FROM rfqs WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (rfqRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'RFQ not found' });
    }
    if (rfqRes.rows[0].status === 'awarded' || rfqRes.rows[0].status === 'closed' || rfqRes.rows[0].status === 'cancelled') {
      return res.status(400).json({ success: false, message: `Cannot add vendors to RFQ in '${rfqRes.rows[0].status}' status` });
    }

    // Check Vendor belongs to tenant
    const vRes = await db.query(
      `SELECT id, name FROM vendors WHERE id = $1 AND tenant_id = $2`,
      [vendor_id, tenantId]
    );
    if (vRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor not found or does not belong to your company' });
    }

    // Insert or ignore if duplicate
    const insertRes = await db.query(
      `INSERT INTO rfq_vendors (rfq_id, vendor_id, invitation_status) 
       VALUES ($1, $2, 'sent')
       ON CONFLICT (rfq_id, vendor_id) DO NOTHING
       RETURNING *`,
      [id, vendor_id]
    );

    if (insertRes.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Vendor is already invited to this RFQ' });
    }

    return res.status(201).json({ success: true, message: 'Vendor invited to RFQ', data: insertRes.rows[0] });
  } catch (err) {
    console.error('[addVendorToRfq] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to add vendor to RFQ' });
  }
};

/**
 * DELETE /api/rfqs/:id/vendors/:vendorId
 * Remove an invited vendor (only if no quotation submitted)
 */
exports.removeVendorFromRfq = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id, vendorId } = req.params;

    // Check if quotation exists
    const qRes = await db.query(
      `SELECT id FROM vendor_quotations WHERE rfq_id = $1 AND vendor_id = $2 AND tenant_id = $3`,
      [id, vendorId, tenantId]
    );
    if (qRes.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot remove vendor because a quotation has already been submitted by this vendor' 
      });
    }

    const delRes = await db.query(
      `DELETE FROM rfq_vendors WHERE rfq_id = $1 AND vendor_id = $2 RETURNING *`,
      [id, vendorId]
    );

    if (delRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor not found on this RFQ' });
    }

    return res.json({ success: true, message: 'Vendor removed from RFQ' });
  } catch (err) {
    console.error('[removeVendorFromRfq] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to remove vendor from RFQ' });
  }
};

/**
 * POST /api/rfqs/:id/quotations
 * Submit a Vendor Quotation for an RFQ
 * CRITICAL:
 * - Vendor MUST be invited to this RFQ (in rfq_vendors)
 * - Line items calculate totals backend-side
 * - Status transitions RFQ to 'quotes_received'
 */
exports.createVendorQuotation = async (req, res) => {
  const client = await db.connect();
  try {
    const tenantId = req.user.tenant_id;
    const branchId = req.branchId || req.body.branch_id || null;
    const { id: rfqId } = req.params;
    const {
      vendor_id,
      quotation_number,
      quotation_date,
      valid_until,
      currency,
      payment_terms,
      delivery_time_days,
      warranty_terms,
      shipping_cost,
      selection_notes,
      items
    } = req.body;

    if (!vendor_id) {
      return res.status(400).json({ success: false, message: 'vendor_id is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Quotation must include at least one item' });
    }

    await client.query('BEGIN');

    // 1. Verify RFQ exists and allows quotation
    const rfqRes = await client.query(
      `SELECT * FROM rfqs WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [rfqId, tenantId]
    );
    if (rfqRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'RFQ not found' });
    }
    const rfq = rfqRes.rows[0];
    if (rfq.status === 'awarded' || rfq.status === 'closed' || rfq.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        message: `Cannot add quotations to RFQ with status '${rfq.status}'` 
      });
    }

    // 2. CRITICAL VALIDATION: Vendor MUST be invited to this RFQ
    const invitedRes = await client.query(
      `SELECT id, invitation_status FROM rfq_vendors WHERE rfq_id = $1 AND vendor_id = $2`,
      [rfqId, vendor_id]
    );
    if (invitedRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        message: 'This vendor was never invited to this RFQ. You must invite the vendor first.' 
      });
    }

    // 3. Resolve quotation number
    let finalQNum = (quotation_number || '').trim();
    if (!finalQNum) {
      finalQNum = await generateQuotationNumber(client, tenantId);
    }

    // Check uniqueness per (tenant, vendor, quotation_number)
    const dupCheck = await client.query(
      `SELECT id FROM vendor_quotations WHERE tenant_id = $1 AND vendor_id = $2 AND quotation_number = $3`,
      [tenantId, vendor_id, finalQNum]
    );
    if (dupCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        message: `Quotation number '${finalQNum}' has already been registered for this vendor.` 
      });
    }

    // 4. Calculate item lines and totals server-side
    let calculatedSubtotal = 0;
    let calculatedDiscount = 0;
    let calculatedTax = 0;
    const resolvedShipping = Math.max(0, parseFloat(shipping_cost) || 0);

    const calculatedItems = [];
    for (const item of items) {
      const pId = parseInt(item.product_id, 10);
      const qty = parseFloat(item.quantity);
      const price = parseFloat(item.unit_price);
      const discPct = Math.min(100, Math.max(0, parseFloat(item.discount_pct) || 0));
      const taxPct = Math.max(0, parseFloat(item.tax_pct) || 0);

      if (!pId || isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid item values: product, positive quantity, and non-negative unit price are required.' 
        });
      }

      const gross = qty * price;
      const lineDisc = gross * (discPct / 100);
      const net = gross - lineDisc;
      const lineTax = net * (taxPct / 100);
      const lineSubtotal = net + lineTax;

      calculatedSubtotal += net;
      calculatedDiscount += lineDisc;
      calculatedTax += lineTax;

      calculatedItems.push({
        product_id: pId,
        quantity: qty,
        unit_price: price,
        discount_pct: discPct,
        tax_pct: taxPct,
        subtotal: parseFloat(lineSubtotal.toFixed(2))
      });
    }

    const calculatedTotal = parseFloat((calculatedSubtotal + calculatedTax + resolvedShipping).toFixed(2));

    // 5. Insert Vendor Quotation
    const insertQQuery = `
      INSERT INTO vendor_quotations (
        quotation_number,
        rfq_id,
        vendor_id,
        quotation_date,
        valid_until,
        currency,
        payment_terms,
        delivery_time_days,
        warranty_terms,
        subtotal,
        discount_amount,
        tax_amount,
        shipping_cost,
        total_amount,
        selection_status,
        selection_notes,
        tenant_id,
        branch_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'under_review', $15, $16, $17)
      RETURNING *
    `;
    const qResult = await client.query(insertQQuery, [
      finalQNum,
      rfqId,
      vendor_id,
      quotation_date || new Date().toISOString().split('T')[0],
      valid_until || null,
      currency || 'EGP',
      payment_terms || null,
      parseInt(delivery_time_days, 10) || 0,
      warranty_terms || null,
      parseFloat(calculatedSubtotal.toFixed(2)),
      parseFloat(calculatedDiscount.toFixed(2)),
      parseFloat(calculatedTax.toFixed(2)),
      resolvedShipping,
      calculatedTotal,
      selection_notes || null,
      tenantId,
      branchId
    ]);
    const newQuotation = qResult.rows[0];

    // 6. Insert Quotation Items
    for (const ci of calculatedItems) {
      await client.query(
        `INSERT INTO vendor_quotation_items (
          quotation_id, product_id, quantity, unit_price, discount_pct, tax_pct, subtotal
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newQuotation.id, ci.product_id, ci.quantity, ci.unit_price, ci.discount_pct, ci.tax_pct, ci.subtotal]
      );
    }

    // 7. Update vendor invitation status to 'quoted'
    await client.query(
      `UPDATE rfq_vendors SET invitation_status = 'quoted' WHERE rfq_id = $1 AND vendor_id = $2`,
      [rfqId, vendor_id]
    );

    // 8. Update RFQ status to 'quotes_received' if it was 'sent' or 'draft'
    if (rfq.status === 'sent' || rfq.status === 'draft') {
      await client.query(
        `UPDATE rfqs SET status = 'quotes_received', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [rfqId]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({
      success: true,
      message: 'Vendor quotation registered successfully',
      data: newQuotation
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[createVendorQuotation] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to register vendor quotation' });
  } finally {
    client.release();
  }
};

/**
 * GET /api/rfqs/:id/compare
 * Retrieve comprehensive side-by-side comparison matrix of all quotations for an RFQ
 */
exports.compareQuotations = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;

    // Fetch RFQ
    const rfqRes = await db.query(
      `SELECT r.*, pr.request_number AS purchase_request_number 
       FROM rfqs r 
       LEFT JOIN purchase_requests pr ON pr.id = r.purchase_request_id
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [id, tenantId]
    );
    if (rfqRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'RFQ not found' });
    }
    const rfq = rfqRes.rows[0];

    // Fetch RFQ items
    const rfqItemsRes = await db.query(
      `SELECT ri.*, p.name AS product_name, p.sku, p.unit
       FROM rfq_items ri
       JOIN products p ON p.id = ri.product_id
       WHERE ri.rfq_id = $1
       ORDER BY ri.id ASC`,
      [id]
    );
    const rfqItems = rfqItemsRes.rows;

    // Fetch all quotations with items
    const quotesRes = await db.query(
      `SELECT 
        vq.*,
        v.name AS vendor_name,
        v.contact_name,
        v.phone,
        v.email
       FROM vendor_quotations vq
       JOIN vendors v ON v.id = vq.vendor_id
       WHERE vq.rfq_id = $1 AND vq.tenant_id = $2
       ORDER BY vq.total_amount ASC`,
      [id, tenantId]
    );
    const quotations = quotesRes.rows;

    // For each quotation, fetch item details
    for (const q of quotations) {
      const qItemsRes = await db.query(
        `SELECT vqi.*, p.name AS product_name, p.sku, p.unit
         FROM vendor_quotation_items vqi
         JOIN products p ON p.id = vqi.product_id
         WHERE vqi.quotation_id = $1`,
        [q.id]
      );
      q.items = qItemsRes.rows;
    }

    // Determine metric benchmarks (lowest total, fastest delivery, etc.)
    let lowestTotal = null;
    let fastestDelivery = null;

    if (quotations.length > 0) {
      lowestTotal = Math.min(...quotations.map(q => parseFloat(q.total_amount)));
      fastestDelivery = Math.min(...quotations.map(q => q.delivery_time_days || 9999));
    }

    return res.json({
      success: true,
      data: {
        rfq,
        rfq_items: rfqItems,
        quotations,
        benchmarks: {
          lowest_total: lowestTotal,
          fastest_delivery_days: fastestDelivery === 9999 ? 0 : fastestDelivery
        }
      }
    });
  } catch (err) {
    console.error('[compareQuotations] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load quotation comparison matrix' });
  }
};

/**
 * POST /api/rfqs/:id/award
 * CRITICAL SELECTION / AWARD ACTION:
 * - Backend role authorization strictly enforced (admin or manager required).
 * - Atomic FOR UPDATE locks on RFQ and selected Quotation.
 * - Selected quotation marked 'selected'.
 * - Other quotations marked 'rejected'.
 * - RFQ marked 'awarded'.
 * - Zero inventory, zero payments, zero payables.
 */
exports.awardQuotation = async (req, res) => {
  // CRITICAL BACKEND AUTHORIZATION CHECK
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: Only managers and administrators have authorization to award quotations.'
    });
  }

  const client = await db.connect();
  try {
    const tenantId = req.user.tenant_id;
    const { id: rfqId } = req.params;
    const { quotation_id, notes } = req.body;

    if (!quotation_id) {
      return res.status(400).json({ success: false, message: 'quotation_id is required for awarding' });
    }

    await client.query('BEGIN');

    // 1. Lock and validate RFQ
    const rfqRes = await client.query(
      `SELECT * FROM rfqs WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [rfqId, tenantId]
    );
    if (rfqRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'RFQ not found' });
    }
    const rfq = rfqRes.rows[0];

    // Must be in valid state to award
    if (rfq.status !== 'sent' && rfq.status !== 'quotes_received') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot award RFQ with current status '${rfq.status}'. RFQ must be 'sent' or 'quotes_received'.`
      });
    }

    // 2. Lock and validate Selected Quotation
    const qRes = await client.query(
      `SELECT * FROM vendor_quotations 
       WHERE id = $1 AND rfq_id = $2 AND tenant_id = $3 
       FOR UPDATE`,
      [quotation_id, rfqId, tenantId]
    );
    if (qRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Selected quotation not found on this RFQ' });
    }
    const selectedQuotation = qRes.rows[0];

    // 3. Mark chosen quotation as 'selected'
    await client.query(
      `UPDATE vendor_quotations 
       SET selection_status = 'selected',
           selection_notes = $1,
           awarded_by = $2,
           awarded_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [notes || null, req.user.id, selectedQuotation.id]
    );

    // 4. Mark all other quotations on this RFQ as 'rejected'
    await client.query(
      `UPDATE vendor_quotations 
       SET selection_status = 'rejected',
           updated_at = CURRENT_TIMESTAMP
       WHERE rfq_id = $1 AND id != $2 AND selection_status = 'under_review'`,
      [rfqId, selectedQuotation.id]
    );

    // 5. Update RFQ status to 'awarded'
    await client.query(
      `UPDATE rfqs 
       SET status = 'awarded',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [rfqId]
    );

    await client.query('COMMIT');
    return res.json({
      success: true,
      message: 'Quotation awarded successfully! RFQ is now marked as Awarded and ready for Purchase Order generation (Phase 5B.3).',
      data: {
        rfq_id: rfq.id,
        awarded_quotation_id: selectedQuotation.id,
        status: 'awarded'
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[awardQuotation] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to award quotation' });
  } finally {
    client.release();
  }
};
