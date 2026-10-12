/**
 * salesController.js — ERP Sales Suite REST API Controller
 */

const db = require('../config/db');
const SalesOrderService = require('../src/domains/sales/SalesOrderService');
const DeliveryNoteService = require('../src/domains/sales/DeliveryNoteService');
const SalesReturnService = require('../src/domains/sales/SalesReturnService');
const salesService = require('../services/salesService');
const salesTargetService = require('../services/salesTargetService');
const accessScopeService = require('../services/accessScopeService');

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
    const statusCode = data && data._alreadyConverted ? 200 : 201;
    const message = data && data._alreadyConverted ? 'Quotation already converted to Sales Order.' : 'Quotation converted to Sales Order.';
    res.status(statusCode).json({ status: 'success', message, data });
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

// ── DELIVERY RETURNS (Stock IN) ──

exports.getSalesReturns = async (req, res) => {
  try {
    const data = await SalesReturnService.getSalesReturns(req.user.tenant_id, req.branchId);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[salesController] getSalesReturns error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createSalesReturn = async (req, res) => {
  try {
    const data = await SalesReturnService.createSalesReturn(req.user.tenant_id, req.branchId, req.body, req.user.id);
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    console.error('[salesController] createSalesReturn error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.confirmSalesReturn = async (req, res) => {
  try {
    const data = await SalesReturnService.confirmSalesReturn(req.user.tenant_id, req.branchId, req.params.id, req.user.id);
    res.json({ status: 'success', message: 'Sales Return confirmed and Stock IN recorded.', data });
  } catch (err) {
    console.error('[salesController] confirmSalesReturn error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.getDeliveryNoteNetDelivered = async (req, res) => {
  try {
    const data = await SalesReturnService.getDeliveryNoteNetDelivered(req.user.tenant_id, req.params.deliveryNoteId);
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[salesController] getDeliveryNoteNetDelivered error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ── SALES TARGETS ──

exports.getMyTargetProgress = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { period } = req.query;

  try {
    const targets = await salesTargetService.getTargetsWithProgress({
      tenant_id,
      user_id: req.user.id,
      period: period || null
    });
    res.json({ status: 'success', data: targets });
  } catch (err) {
    console.error('[salesController] getMyTargetProgress error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.getTargets = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  const { period, target_scope, user_id, department_id } = req.query;
  const userRole = req.user.role;

  try {
    let filterUserId = user_id ? parseInt(user_id, 10) : null;
    let filterDeptIds = null;
    let filterBranchId = branch_id;

    if (userRole === 'admin') {
      // Admin: Unrestricted scope, can filter by any requested parameters
      if (department_id) {
        filterDeptIds = [parseInt(department_id, 10)];
      }
      if (req.query.branch_id) {
        filterBranchId = req.query.branch_id;
      }
    } else if (userRole === 'manager' || userRole === 'supervisor') {
      // Manager / Supervisor: Restricted to accessible departments within branch
      const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
      if (department_id) {
        const requestedDeptId = parseInt(department_id, 10);
        if (accessibleDeptIds && !accessibleDeptIds.includes(requestedDeptId)) {
          return res.status(403).json({
            status: 'error',
            message: 'You are not authorized to view targets for this department.'
          });
        }
        filterDeptIds = [requestedDeptId];
      } else {
        filterDeptIds = accessibleDeptIds;
      }
    } else {
      // Sales / Employee: Strictly own individual targets
      filterUserId = req.user.id;
    }

    const targets = await salesTargetService.getTargetsWithProgress({
      tenant_id,
      branch_id: filterBranchId,
      period: period || null,
      target_scope: target_scope || null,
      user_id: filterUserId,
      department_ids: filterDeptIds
    });

    res.json({ status: 'success', data: targets });
  } catch (err) {
    console.error('[salesController] getTargets error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.createTarget = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.body.branch_id || req.branchId || req.user?.branch_id;
  const userRole = req.user.role;
  const {
    user_id,
    department_id,
    target_scope = 'individual',
    period,
    target_amount,
    commission_rate,
    bonus_threshold,
    notes
  } = req.body;

  try {
    // Role-based scope authorization checks for managers
    if (userRole !== 'admin') {
      const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);

      if (target_scope === 'department') {
        const targetDeptId = parseInt(department_id, 10);
        if (!accessibleDeptIds || !accessibleDeptIds.includes(targetDeptId)) {
          return res.status(403).json({
            status: 'error',
            message: 'You are not authorized to create targets for this department.'
          });
        }
      } else if (target_scope === 'individual') {
        const targetUserId = parseInt(user_id, 10);
        // Verify user belongs to manager's accessible department
        const uCheck = await db.query(
          `SELECT id, department_id, branch_id FROM users WHERE id = $1 AND tenant_id::text = $2::text`,
          [targetUserId, tenant_id]
        );
        if (uCheck.rows.length === 0) {
          return res.status(404).json({ status: 'error', message: 'Target user not found.' });
        }
        const targetUser = uCheck.rows[0];
        if (
          targetUser.id !== req.user.id &&
          (!accessibleDeptIds || !accessibleDeptIds.includes(targetUser.department_id))
        ) {
          return res.status(403).json({
            status: 'error',
            message: 'You are not authorized to set targets for an employee outside your managed departments.'
          });
        }
      } else if (target_scope === 'branch' || target_scope === 'company') {
        return res.status(403).json({
          status: 'error',
          message: 'Only tenant administrators can set company or branch targets.'
        });
      }
    }

    const newTarget = await salesTargetService.createTarget(
      {
        tenant_id,
        branch_id: branch_id || null,
        target_scope,
        user_id,
        department_id,
        period,
        target_amount,
        commission_rate,
        bonus_threshold,
        notes
      },
      req.user
    );

    res.status(201).json({ status: 'success', data: newTarget });
  } catch (err) {
    console.error('[salesController] createTarget error:', err.message);
    const statusCode = err.statusCode || 400;
    res.status(statusCode).json({ status: 'error', message: err.message });
  }
};

exports.updateTarget = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const targetId = parseInt(req.params.id, 10);
  const userRole = req.user.role;

  try {
    // If manager, check if target is within accessible scope
    if (userRole !== 'admin') {
      const targetRes = await db.query(
        `SELECT st.*, u.department_id as user_dept_id
         FROM sales_targets st
         LEFT JOIN users u ON st.user_id = u.id
         WHERE st.id = $1 AND st.tenant_id::text = $2::text AND st.deleted_at IS NULL`,
        [targetId, tenant_id]
      );
      if (targetRes.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Target not found.' });
      }
      const t = targetRes.rows[0];
      const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);

      if (t.target_scope === 'branch' || t.target_scope === 'company') {
        return res.status(403).json({ status: 'error', message: 'Only administrators can modify company or branch targets.' });
      }
      if (t.target_scope === 'department' && (!accessibleDeptIds || !accessibleDeptIds.includes(t.department_id))) {
        return res.status(403).json({ status: 'error', message: 'You are not authorized to modify this department target.' });
      }
      if (t.target_scope === 'individual') {
        if (t.user_id !== req.user.id && (!accessibleDeptIds || !accessibleDeptIds.includes(t.user_dept_id))) {
          return res.status(403).json({ status: 'error', message: 'You are not authorized to modify this employee target.' });
        }
      }
    }

    const updated = await salesTargetService.updateTarget({
      target_id: targetId,
      tenant_id,
      updateData: req.body,
      actor: req.user
    });

    res.json({ status: 'success', data: updated });
  } catch (err) {
    console.error('[salesController] updateTarget error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.deleteTarget = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const targetId = parseInt(req.params.id, 10);
  const userRole = req.user.role;

  try {
    if (userRole !== 'admin') {
      const targetRes = await db.query(
        `SELECT st.*, u.department_id as user_dept_id
         FROM sales_targets st
         LEFT JOIN users u ON st.user_id = u.id
         WHERE st.id = $1 AND st.tenant_id::text = $2::text AND st.deleted_at IS NULL`,
        [targetId, tenant_id]
      );
      if (targetRes.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Target not found.' });
      }
      const t = targetRes.rows[0];
      const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);

      if (t.target_scope === 'branch' || t.target_scope === 'company') {
        return res.status(403).json({ status: 'error', message: 'Only administrators can deactivate company or branch targets.' });
      }
      if (t.target_scope === 'department' && (!accessibleDeptIds || !accessibleDeptIds.includes(t.department_id))) {
        return res.status(403).json({ status: 'error', message: 'You are not authorized to deactivate this department target.' });
      }
      if (t.target_scope === 'individual') {
        if (t.user_id !== req.user.id && (!accessibleDeptIds || !accessibleDeptIds.includes(t.user_dept_id))) {
          return res.status(403).json({ status: 'error', message: 'You are not authorized to deactivate this employee target.' });
        }
      }
    }

    await salesTargetService.softDeleteTarget({
      target_id: targetId,
      tenant_id,
      actor: req.user
    });

    res.json({ status: 'success', message: 'Target deactivated successfully' });
  } catch (err) {
    console.error('[salesController] deleteTarget error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
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
      LEFT JOIN deals d ON d.assigned_to = u.id AND d.tenant_id::text = u.tenant_id::text
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

    // 4. Delivery Notes (Phase G-6 Documents Hub)
    const dnRes = await db.query(`
      SELECT dn.id, dn.number, dn.delivery_date, dn.created_at, dn.status,
             COALESCE(c.name, 'Customer') as customer_name,
             COALESCE(SUM(dni.quantity_delivered * dni.unit_cost), 0) as total_amount
      FROM delivery_notes dn
      LEFT JOIN customers c ON dn.customer_id = c.id
      LEFT JOIN delivery_note_items dni ON dni.delivery_note_id = dn.id
      WHERE dn.tenant_id::text = $1::text
      GROUP BY dn.id, dn.number, dn.delivery_date, dn.created_at, dn.status, c.name
      ORDER BY dn.created_at DESC LIMIT 50
    `, [tenant_id]).catch(() => ({ rows: [] }));

    dnRes.rows.forEach(dn => {
      documents.push({
        id: `dn-${dn.id}`,
        doc_no: dn.number || `DN-${dn.id}`,
        title: `Delivery Note - ${dn.customer_name}`,
        type: 'Delivery Note',
        customer: dn.customer_name,
        total_amount: parseFloat(dn.total_amount || 0),
        status: dn.status || 'draft',
        date: dn.delivery_date ? new Date(dn.delivery_date).toISOString().split('T')[0] : (dn.created_at ? new Date(dn.created_at).toISOString().split('T')[0] : ''),
        view_url: `/sales/orders`
      });
    });

    // 5. Sales Returns (Phase G-6 Documents Hub)
    const srRes = await db.query(`
      SELECT sr.id, sr.number, sr.return_date, sr.created_at, sr.status, sr.total_amount,
             COALESCE(c.name, 'Customer') as customer_name
      FROM sales_returns sr
      LEFT JOIN customers c ON sr.customer_id = c.id
      WHERE sr.tenant_id::text = $1::text
      ORDER BY sr.created_at DESC LIMIT 50
    `, [tenant_id]).catch(() => ({ rows: [] }));

    srRes.rows.forEach(sr => {
      documents.push({
        id: `sr-${sr.id}`,
        doc_no: sr.number || `SR-${sr.id}`,
        title: `Sales Return - ${sr.customer_name}`,
        type: 'Sales Return',
        customer: sr.customer_name,
        total_amount: parseFloat(sr.total_amount || 0),
        status: sr.status || 'draft',
        date: sr.return_date ? new Date(sr.return_date).toISOString().split('T')[0] : (sr.created_at ? new Date(sr.created_at).toISOString().split('T')[0] : ''),
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
