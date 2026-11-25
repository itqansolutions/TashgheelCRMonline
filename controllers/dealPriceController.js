'use strict';
const db = require('../config/db');
const priceService = require('../services/dealPriceService');

const send = (res, err) => {
  if (err instanceof priceService.PriceError) return res.status(err.status).json({ status: 'error', code: err.code, message: err.message });
  console.error('[DealPrice]', err.message);
  return res.status(500).json({ status: 'error', message: 'Server error' });
};

// GET /api/deals/:id/price-history  (any user who can view the deal; row scope enforced via deals visibility)
exports.getPriceHistory = async (req, res) => {
  try {
    const accessScopeService = require('../services/accessScopeService');
    const scope = await accessScopeService.buildScopePredicate({ user: req.user, tableAlias: 'deals', assigneeCol: 'assigned_to', paramIndex: 3 });
    let sql = 'SELECT id FROM deals WHERE id::text = $1::text AND tenant_id::text = $2::text';
    const params = [req.params.id, String(req.user.tenant_id)];
    if (scope.sql && scope.sql !== '1=1') { sql += ` AND ${scope.sql}`; params.push(...scope.params); }
    const ok = await db.query(sql, params);
    if (ok.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
    const data = await priceService.listForDeal(db, ok.rows[0].id, req.user.tenant_id);
    const pending = data.approvals.find(a => a.status === 'pending') || null;
    res.json({ status: 'success', data: { ...data, pending, can_decide: pending ? priceService.canDecide(req.user, pending) : false } });
  } catch (e) { send(res, e); }
};

// GET /api/deals/price-approvals/pending : requests waiting for the current user
exports.listPendingForMe = async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const r = await db.query(
      `SELECT a.*, d.title AS deal_title FROM deal_price_approvals a JOIN deals d ON d.id = a.deal_id
       WHERE a.tenant_id::text = $1::text AND a.status = 'pending' AND (a.approver_user_id = $2 OR ($3 AND a.approver_user_id IS NULL))
       ORDER BY a.requested_at`, [String(req.user.tenant_id), req.user.id, isAdmin]);
    res.json({ status: 'success', data: r.rows });
  } catch (e) { send(res, e); }
};

const decideHandler = (decision) => async (req, res) => {
  try {
    const result = await priceService.decide({ approvalId: req.params.approvalId, user: req.user, tenantId: req.user.tenant_id, decision, note: (req.body && req.body.note) ? String(req.body.note).slice(0, 500) : null });
    res.json({ status: 'success', data: result });
  } catch (e) { send(res, e); }
};
exports.approve = decideHandler('approve');
exports.reject = decideHandler('reject');
