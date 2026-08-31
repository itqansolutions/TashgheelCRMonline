/**
 * salesController.js — ERP Sales Suite REST API Controller
 */

const db = require('../config/db');
const SalesOrderService = require('../src/domains/sales/SalesOrderService');
const DeliveryNoteService = require('../src/domains/sales/DeliveryNoteService');
const salesService = require('../services/salesService');

// ── SALES ORDERS ──

exports.getSalesOrders = async (req, res) => {
  try {
    const data = await SalesOrderService.getSalesOrders(req.user.tenant_id, req.branchId);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[salesController] getSalesOrders error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createSalesOrder = async (req, res) => {
  try {
    const data = await SalesOrderService.createSalesOrder(req.user.tenant_id, req.branchId, req.body, req.user.id);
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    console.error('[salesController] createSalesOrder error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.confirmSalesOrder = async (req, res) => {
  try {
    const data = await SalesOrderService.confirmSalesOrder(req.user.tenant_id, req.params.id, req.user.id);
    res.json({ status: 'success', message: 'Sales Order confirmed.', data });
  } catch (err) {
    console.error('[salesController] confirmSalesOrder error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.convertQuotation = async (req, res) => {
  try {
    const data = await SalesOrderService.convertQuotationToSalesOrder(req.user.tenant_id, req.branchId, req.params.quotationId, req.user.id);
    res.status(201).json({ status: 'success', message: 'Quotation converted to Sales Order.', data });
  } catch (err) {
    console.error('[salesController] convertQuotation error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.convertSalesOrderToInvoice = async (req, res) => {
  try {
    const data = await salesService.convertSalesOrderToInvoice(req.params.id, req.user.tenant_id);
    res.status(201).json({ status: 'success', message: 'Sales Order converted to Invoice.', data });
  } catch (err) {
    console.error('[salesController] convertSalesOrderToInvoice error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// ── DELIVERY NOTES ──

exports.getDeliveryNotes = async (req, res) => {
  try {
    const data = await DeliveryNoteService.getDeliveryNotes(req.user.tenant_id, req.branchId);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[salesController] getDeliveryNotes error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createDeliveryNote = async (req, res) => {
  try {
    const data = await DeliveryNoteService.createDeliveryNote(req.user.tenant_id, req.branchId, req.body, req.user.id);
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    console.error('[salesController] createDeliveryNote error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.confirmDeliveryNote = async (req, res) => {
  try {
    const data = await DeliveryNoteService.confirmDeliveryNote(req.user.tenant_id, req.branchId, req.params.id, req.user.id);
    res.json({ status: 'success', message: 'Delivery Note confirmed and COGS posted.', data });
  } catch (err) {
    console.error('[salesController] confirmDeliveryNote error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// ── SALES TARGETS ──

exports.getTargets = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { period } = req.query;

  try {
    let query = `
      SELECT st.*, u.name as salesman_name, u.email as salesman_email, u.phone as salesman_phone
      FROM sales_targets st
      JOIN users u ON st.user_id = u.id
      WHERE st.tenant_id::text = $1::text
    `;
    const params = [tenant_id];

    if (period) {
      query += ` AND st.period = $2`;
      params.push(period);
    }

    query += ` ORDER BY st.created_at DESC`;

    const result = await db.query(query, params);

    // Calculate actual achieved revenue per target from closed deals & confirmed sales orders
    const targets = await Promise.all(result.rows.map(async (t) => {
      const dealsRes = await db.query(
        `SELECT COALESCE(SUM(value), 0) as closed_val
         FROM deals
         WHERE user_id = $1 AND tenant_id::text = $2::text AND pipeline_stage = 'won'`,
        [t.user_id, tenant_id]
      );
      const ordersRes = await db.query(
        `SELECT COALESCE(SUM(total_amount), 0) as orders_val
         FROM sales_orders
         WHERE assigned_to = $1 AND tenant_id::text = $2::text AND status IN ('confirmed', 'delivered', 'invoiced')`,
        [t.user_id, tenant_id]
      );

      const achievedFromDB = parseFloat(dealsRes.rows[0].closed_val) + parseFloat(ordersRes.rows[0].orders_val);
      const finalAchieved = achievedFromDB > 0 ? achievedFromDB : parseFloat(t.achieved_amount || 0);
      const commRate = parseFloat(t.commission_rate || 0);
      const commissionEarned = Math.round((finalAchieved * commRate) / 100);

      return {
        ...t,
        target_amount: parseFloat(t.target_amount || 0),
        achieved_amount: finalAchieved,
        commission_earned: commissionEarned,
        bonus_threshold: parseFloat(t.bonus_threshold || 0)
      };
    }));

    res.json({ status: 'success', data: targets });
  } catch (err) {
    console.error('[salesController] getTargets error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createTarget = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  const { user_id, period, target_amount, commission_rate, bonus_threshold, notes } = req.body;

  if (!user_id) return res.status(400).json({ status: 'error', message: 'Sales representative is required' });
  if (!period) return res.status(400).json({ status: 'error', message: 'Target period is required' });
  if (!target_amount || parseFloat(target_amount) <= 0) return res.status(400).json({ status: 'error', message: 'Valid target amount is required' });

  try {
    const result = await db.query(`
      INSERT INTO sales_targets
        (tenant_id, branch_id, user_id, period, target_amount, commission_rate, bonus_threshold, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      tenant_id,
      branch_id || null,
      parseInt(user_id),
      period.trim(),
      parseFloat(target_amount),
      parseFloat(commission_rate) || 0,
      parseFloat(bonus_threshold) || 0,
      notes || null
    ]);

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[salesController] createTarget error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.updateTarget = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { user_id, period, target_amount, achieved_amount, commission_rate, bonus_threshold, notes } = req.body;

  try {
    const result = await db.query(`
      UPDATE sales_targets SET
        user_id = COALESCE($1, user_id),
        period = COALESCE($2, period),
        target_amount = COALESCE($3, target_amount),
        achieved_amount = COALESCE($4, achieved_amount),
        commission_rate = COALESCE($5, commission_rate),
        bonus_threshold = COALESCE($6, bonus_threshold),
        notes = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 AND tenant_id::text = $9::text
      RETURNING *
    `, [
      user_id ? parseInt(user_id) : null,
      period || null,
      target_amount !== undefined ? parseFloat(target_amount) : null,
      achieved_amount !== undefined ? parseFloat(achieved_amount) : null,
      commission_rate !== undefined ? parseFloat(commission_rate) : null,
      bonus_threshold !== undefined ? parseFloat(bonus_threshold) : null,
      notes || null,
      req.params.id,
      tenant_id
    ]);

    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Target not found' });
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[salesController] updateTarget error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.deleteTarget = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(
      `DELETE FROM sales_targets WHERE id = $1 AND tenant_id::text = $2::text RETURNING id`,
      [req.params.id, tenant_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Target not found' });
    res.json({ status: 'success', message: 'Target deleted successfully' });
  } catch (err) {
    console.error('[salesController] deleteTarget error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ── PRICE TIERS ──

exports.getPriceTiers = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(
      `SELECT * FROM sales_price_tiers WHERE tenant_id::text = $1::text ORDER BY min_order_quantity ASC, created_at DESC`,
      [tenant_id]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('[salesController] getPriceTiers error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createPriceTier = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { name, code, discount_percentage, min_order_quantity, description, is_active } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ status: 'error', message: 'Tier name is required' });

  try {
    const result = await db.query(`
      INSERT INTO sales_price_tiers
        (tenant_id, name, code, discount_percentage, min_order_quantity, description, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      tenant_id,
      name.trim(),
      code ? code.trim() : `TIER-${Date.now().toString().slice(-4)}`,
      parseFloat(discount_percentage) || 0,
      parseInt(min_order_quantity) || 1,
      description || null,
      is_active !== false
    ]);

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[salesController] createPriceTier error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.updatePriceTier = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { name, code, discount_percentage, min_order_quantity, description, is_active } = req.body;

  try {
    const result = await db.query(`
      UPDATE sales_price_tiers SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        discount_percentage = COALESCE($3, discount_percentage),
        min_order_quantity = COALESCE($4, min_order_quantity),
        description = $5,
        is_active = COALESCE($6, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7 AND tenant_id::text = $8::text
      RETURNING *
    `, [
      name ? name.trim() : null,
      code ? code.trim() : null,
      discount_percentage !== undefined ? parseFloat(discount_percentage) : null,
      min_order_quantity !== undefined ? parseInt(min_order_quantity) : null,
      description || null,
      is_active !== undefined ? is_active : null,
      req.params.id,
      tenant_id
    ]);

    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Price tier not found' });
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[salesController] updatePriceTier error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.deletePriceTier = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(
      `DELETE FROM sales_price_tiers WHERE id = $1 AND tenant_id::text = $2::text RETURNING id`,
      [req.params.id, tenant_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Price tier not found' });
    res.json({ status: 'success', message: 'Price tier deleted successfully' });
  } catch (err) {
    console.error('[salesController] deletePriceTier error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ── SALESMEN / SALES REPRESENTATIVES ──

exports.getSalesmen = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const usersRes = await db.query(`
      SELECT u.id, u.name, u.email, u.phone, u.role, u.is_working,
             COALESCE(SUM(CASE WHEN d.pipeline_stage = 'won' THEN d.value ELSE 0 END), 0) as total_sales,
             COUNT(d.id) FILTER (WHERE d.pipeline_stage != 'won' AND d.pipeline_stage != 'lost') as active_deals
      FROM users u
      LEFT JOIN deals d ON d.user_id = u.id AND d.tenant_id::text = u.tenant_id::text
      WHERE u.tenant_id::text = $1::text
      GROUP BY u.id, u.name, u.email, u.phone, u.role, u.is_working
      ORDER BY total_sales DESC, u.name ASC
    `, [tenant_id]);

    const salesmen = usersRes.rows.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone || 'N/A',
      territory: 'Assigned Territory',
      commission_rate: 3.5,
      total_sales: parseFloat(u.total_sales || 0),
      active_deals: parseInt(u.active_deals || 0),
      is_active: u.is_working !== false
    }));

    res.json({ status: 'success', data: salesmen });
  } catch (err) {
    console.error('[salesController] getSalesmen error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ── SALES DOCUMENTS HUB ──

exports.getSalesDocuments = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const documents = [];

    // 1. Quotations
    const qRes = await db.query(`
      SELECT q.id, q.created_at, q.total_amount, q.status,
             COALESCE(c.name, 'Customer') as customer_name
      FROM quotations q
      LEFT JOIN customers c ON q.client_id::text = c.id::text
      WHERE q.tenant_id::text = $1::text
      ORDER BY q.created_at DESC LIMIT 50
    `, [tenant_id]).catch(() => ({ rows: [] }));

    qRes.rows.forEach(q => {
      documents.push({
        id: `q-${q.id}`,
        doc_no: `QT-${String(q.id).padStart(4, '0')}`,
        title: `Quotation - ${q.customer_name}`,
        type: 'Quotation',
        customer: q.customer_name,
        total_amount: parseFloat(q.total_amount || 0),
        status: q.status || 'Draft',
        date: q.created_at ? new Date(q.created_at).toISOString().split('T')[0] : '',
        view_url: `/finance/quotation-preview/${q.id}`
      });
    });

    // 2. Invoices
    const invRes = await db.query(`
      SELECT i.id, i.invoice_number, i.created_at, i.total_amount, i.status,
             COALESCE(c.name, 'Customer') as customer_name
      FROM invoices i
      LEFT JOIN customers c ON i.client_id::text = c.id::text
      WHERE i.tenant_id::text = $1::text
      ORDER BY i.created_at DESC LIMIT 50
    `, [tenant_id]).catch(() => ({ rows: [] }));

    invRes.rows.forEach(inv => {
      documents.push({
        id: `inv-${inv.id}`,
        doc_no: inv.invoice_number || `INV-${inv.id}`,
        title: `Commercial Invoice - ${inv.customer_name}`,
        type: 'Invoice',
        customer: inv.customer_name,
        total_amount: parseFloat(inv.total_amount || 0),
        status: inv.status || 'Unpaid',
        date: inv.created_at ? new Date(inv.created_at).toISOString().split('T')[0] : '',
        view_url: `/finance/invoice-preview/${inv.id}`
      });
    });

    // 3. Sales Orders
    const soRes = await db.query(`
      SELECT so.id, so.number, so.order_number, so.created_at, so.total_amount, so.status,
             COALESCE(c.name, 'Customer') as customer_name
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      WHERE so.tenant_id::text = $1::text
      ORDER BY so.created_at DESC LIMIT 50
    `, [tenant_id]).catch(() => ({ rows: [] }));

    soRes.rows.forEach(so => {
      documents.push({
        id: `so-${so.id}`,
        doc_no: so.order_number || so.number || `SO-${so.id}`,
        title: `Sales Order - ${so.customer_name}`,
        type: 'Sales Order',
        customer: so.customer_name,
        total_amount: parseFloat(so.total_amount || 0),
        status: so.status || 'Draft',
        date: so.created_at ? new Date(so.created_at).toISOString().split('T')[0] : '',
        view_url: `/sales/orders`
      });
    });

    // Sort all documents by date descending
    documents.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    res.json({ status: 'success', data: documents });
  } catch (err) {
    console.error('[salesController] getSalesDocuments error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};
