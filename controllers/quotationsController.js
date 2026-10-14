const db = require('../config/db');
const { logCreate, logUpdate, logDelete } = require('../services/loggerService');
const { nextSequence } = require('../src/infrastructure/sequencing/DocumentSequencer');

// @desc    Get all quotations
// @route   GET /api/quotations
// @access  Private
exports.getQuotations = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(`
      SELECT q.*, d.title as deal_title, COALESCE(c.name, c2.name, 'Generic Customer') as client_name,
             u.unit_number, u.project_name
      FROM quotations q
      LEFT JOIN deals d ON q.deal_id::text = d.id::text AND q.tenant_id::text = d.tenant_id::text
      LEFT JOIN customers c ON d.client_id::text = c.id::text
      LEFT JOIN customers c2 ON q.client_id::text = c2.id::text
      LEFT JOIN re_units u ON q.unit_id::text = u.id::text
      WHERE q.tenant_id::text = $1::text AND (q.branch_id::text = $2::text OR q.branch_id IS NULL OR $2 IS NULL)
      ORDER BY q.created_at DESC
    `, [tenant_id, branch_id || null]);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[Quotations API Error]', err.message);
    
    // Graceful degradation if table doesn't exist yet
    if (err.message.includes('relation') && err.message.includes('does not exist')) {
        return res.json({ 
            status: 'success', 
            data: [], 
            message: 'Quotations are being synchronized with the cloud. Please refresh in a moment.' 
        });
    }
    
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get single quotation
// @route   GET /api/quotations/:id
// @access  Private
exports.getQuotationById = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(
      `SELECT q.*, c.name as client_name, c.email as client_email, c.phone as client_phone,
              d.title as deal_title,
              u.unit_number, u.project_name 
       FROM quotations q 
       LEFT JOIN customers c ON q.client_id::text = c.id::text 
       LEFT JOIN deals d ON q.deal_id::text = d.id::text
       LEFT JOIN re_units u ON q.unit_id::text = u.id::text
       WHERE q.id = $1 AND q.tenant_id::text = $2::text AND (q.branch_id::text = $3::text OR q.branch_id IS NULL OR $3 IS NULL)`,
      [req.params.id, tenant_id, branch_id || null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Quotation not found or unauthorized' });
    }
    
    const quotation = result.rows[0];
    
    // Fetch items
    const itemsResult = await db.query(
      `SELECT qi.*, p.name as product_name 
       FROM quotation_items qi 
       LEFT JOIN products p ON qi.product_id::text = p.id::text 
       WHERE qi.quotation_id = $1`,
      [quotation.id]
    );
    
    quotation.items = itemsResult.rows;
    
    const tenantRes = await db.query('SELECT * FROM tenants WHERE id::text = $1::text', [tenant_id]);
    quotation.tenant = tenantRes.rows[0] || null;
    
    res.json({ status: 'success', data: quotation });
  } catch (err) {
    console.error('[Quotation Detail Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create quotation
// @route   POST /api/quotations
// @access  Private
exports.createQuotation = async (req, res) => {
  const { deal_id, client_id, unit_id, total_amount, valid_until, notes, items } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;

  const client = await (db.pool ? db.pool.connect() : db.connect());
  
  try {
    await client.query('BEGIN');

    // ── 1. Tenant Ownership & Consistency Validation ─────────────────────────
    // A. Validate Customer / Client (if supplied)
    if (client_id) {
      const clientRes = await client.query(
        'SELECT id FROM customers WHERE id = $1 AND tenant_id::text = $2::text',
        [client_id, String(tenant_id)]
      );
      if (clientRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ status: 'error', message: 'Client not found or belongs to another tenant' });
      }
    }

    // B. Validate Deal (if supplied) & check deal <-> client consistency
    if (deal_id) {
      const dealRes = await client.query(
        'SELECT id, client_id FROM deals WHERE id = $1 AND tenant_id::text = $2::text',
        [deal_id, String(tenant_id)]
      );
      if (dealRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ status: 'error', message: 'Deal not found or belongs to another tenant' });
      }

      const deal = dealRes.rows[0];
      // If both deal.client_id and client_id are present, they must match
      if (deal.client_id && client_id && String(deal.client_id) !== String(client_id)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          status: 'error',
          message: 'Deal client does not match the quotation client'
        });
      }
    }

    // C. Validate Real Estate Unit (if supplied in Real Estate path)
    if (unit_id) {
      const unitRes = await client.query(
        'SELECT id FROM re_units WHERE id::text = $1::text AND tenant_id::text = $2::text',
        [String(unit_id), String(tenant_id)]
      );
      if (unitRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ status: 'error', message: 'Unit not found or belongs to another tenant' });
      }
    }

    // D. Validate General Products & Classifications (if items supplied)
    const productMap = new Map();
    if (items && Array.isArray(items) && items.length > 0) {
      const productIds = items
        .map(i => i.product_id)
        .filter(pid => pid !== null && pid !== undefined && pid !== '');

      if (productIds.length > 0) {
        const uniquePids = [...new Set(productIds.map(p => parseInt(p, 10)).filter(p => !isNaN(p) && p > 0))];
        const prodRes = await client.query(
          'SELECT id, is_inventory_item FROM products WHERE id = ANY($1::int[]) AND tenant_id::text = $2::text',
          [uniquePids, String(tenant_id)]
        );

        if (prodRes.rows.length !== uniquePids.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            status: 'error',
            message: 'One or more products not found or belong to another tenant'
          });
        }
        for (const row of prodRes.rows) {
          productMap.set(String(row.id), row);
        }
      }
    }

    // E. Pre-validate each quotation item and resolve its item_type
    const validatedItems = [];
    if (items && Array.isArray(items)) {
      let rowIdx = 0;
      for (const item of items) {
        rowIdx++;
        let resolvedItemType = item.item_type ? String(item.item_type).trim().toLowerCase() : null;

        if (resolvedItemType === 'legacy_unclassified') {
          await client.query('ROLLBACK');
          return res.status(400).json({
            status: 'error',
            message: `Item #${rowIdx}: 'legacy_unclassified' is restricted to historical records and cannot be assigned to new quotation items.`
          });
        }

        const pid = (item.product_id !== null && item.product_id !== undefined && item.product_id !== '')
          ? String(item.product_id)
          : null;

        if (pid) {
          const prod = productMap.get(pid);
          if (!prod) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              status: 'error',
              message: `Item #${rowIdx}: Product ID ${pid} not found in this company's catalog.`
            });
          }

          if (prod.is_inventory_item === true) {
            // Verified physical inventory product inherits 'inventory'
            if (resolvedItemType && resolvedItemType !== 'inventory') {
              await client.query('ROLLBACK');
              return res.status(400).json({
                status: 'error',
                message: `Item #${rowIdx}: Product ID ${pid} is a physical inventory product; cannot be classified as '${resolvedItemType}'.`
              });
            }
            resolvedItemType = 'inventory';
          } else {
            // Non-inventory catalog product requires explicit classification: 'service' or 'non_inventory'
            if (!resolvedItemType || !['service', 'non_inventory'].includes(resolvedItemType)) {
              await client.query('ROLLBACK');
              return res.status(400).json({
                status: 'error',
                message: `Item #${rowIdx}: Product ID ${pid} is a non-inventory catalog product; explicit item_type ('service' or 'non_inventory') is required.`
              });
            }
          }
        } else {
          // Custom item without product requires explicit classification from user ('service' or 'non_inventory')
          if (!resolvedItemType || !['service', 'non_inventory'].includes(resolvedItemType)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              status: 'error',
              message: `Item #${rowIdx}: Custom line item requires an explicit item_type ('service' or 'non_inventory').`
            });
          }
          if (!item.description || String(item.description).trim() === '') {
            await client.query('ROLLBACK');
            return res.status(400).json({
              status: 'error',
              message: `Item #${rowIdx}: Line item requires a descriptive name or description.`
            });
          }
        }

        const qty = parseFloat(item.quantity) || 1;
        const price = parseFloat(item.unit_price) || 0;
        validatedItems.push({
          product_id: pid ? parseInt(pid, 10) : null,
          description: item.description ? String(item.description).trim() : '',
          item_type: resolvedItemType,
          quantity: qty,
          unit_price: price,
          subtotal: qty * price
        });
      }
    }

    // ── 2. Sequential Number Generation (Tenant-wide QUO namespace) ──────────
    const year = new Date().getFullYear();
    const number = await nextSequence(client, {
      tenantId: String(tenant_id),
      branchId: null, // Unified tenant-wide sequence to prevent branch counter collisions
      docType: 'QUO',
      fiscalYear: year
    });

    // ── 3. Insert Quotation Header ───────────────────────────────────────────
    const result = await client.query(
      `INSERT INTO quotations
        (number, deal_id, client_id, unit_id, total_amount, valid_until, notes, tenant_id, branch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        number,
        deal_id || null,
        client_id || null,
        unit_id || null,
        total_amount || 0,
        valid_until || null,
        notes || null,
        tenant_id,
        branch_id ? String(branch_id) : null
      ]
    );
    const quotation = result.rows[0];

    // ── 4. Insert Items (if any) ─────────────────────────────────────────────
    for (const item of validatedItems) {
      await client.query(
        `INSERT INTO quotation_items
          (quotation_id, product_id, description, item_type, quantity, unit_price, subtotal, tenant_id, branch_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          quotation.id,
          item.product_id || null,
          item.description || '',
          item.item_type,
          item.quantity,
          item.unit_price,
          item.subtotal,
          tenant_id,
          branch_id ? String(branch_id) : null
        ]
      );
    }

    await client.query('COMMIT');
    logCreate(req, 'Quotation', quotation.id, quotation);
    res.status(201).json({ status: 'success', data: quotation });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Quotation Create Error]', err.message);
    res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  } finally {
    if (client.release) client.release();
  }
};

// @desc    Approve quotation
// @route   PATCH /api/quotations/:id/approve
// @access  Private
exports.approveQuotation = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(
      "UPDATE quotations SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text RETURNING *",
      [req.params.id, tenant_id, branch_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Quotation not found or unauthorized' });
    }

    logUpdate(req, 'Quotation', req.params.id, { status: 'draft' }, result.rows[0]);

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Quotation Approve Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete quotation
// @route   DELETE /api/quotations/:id
// @access  Private
exports.deleteQuotation = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(
      'DELETE FROM quotations WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text RETURNING *',
      [req.params.id, tenant_id, branch_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Quotation not found or unauthorized' });
    }

    logDelete(req, 'Quotation', req.params.id, { deal_id: result.rows[0].deal_id });

    res.json({ status: 'success', message: 'Quotation deleted' });
  } catch (err) {
    console.error('[Quotation Delete Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
