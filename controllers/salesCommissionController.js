/**
 * salesCommissionController.js — Phase 3.3C: Sales Commissions & Earnings Lifecycle
 *
 * Implements endpoints for commission accruals, monthly settlements, approval SoD,
 * payout vouchers, and rule management.
 */

const salesCommissionService = require('../services/salesCommissionService');
const accessScopeService = require('../services/accessScopeService');
const db = require('../config/db');

exports.getMyCommissions = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const user_id = req.user.id;
  const { period, status } = req.query;

  try {
    const list = await salesCommissionService.getCommissions({
      tenant_id,
      user_id,
      period: period || null,
      status: status || null
    });
    res.json({ status: 'success', data: list });
  } catch (err) {
    console.error('[salesCommissionController] getMyCommissions error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.getMySettlements = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const user_id = req.user.id;
  const { period, status } = req.query;

  try {
    const list = await salesCommissionService.getSettlements({
      tenant_id,
      user_id,
      period: period || null,
      status: status || null
    });
    res.json({ status: 'success', data: list });
  } catch (err) {
    console.error('[salesCommissionController] getMySettlements error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.getCommissions = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const userRole = req.user.role;
  const { user_id, branch_id, period, status } = req.query;

  try {
    let targetUserId = user_id ? parseInt(user_id, 10) : null;

    if (userRole !== 'admin' && userRole !== 'finance_manager') {
      if (!targetUserId) {
        // Default to self for non-managers
        if (userRole === 'sales' || userRole === 'employee') {
          targetUserId = req.user.id;
        }
      } else if (targetUserId !== req.user.id) {
        // If viewing another user, verify manager has access to that user's department
        const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
        const uRes = await db.query('SELECT department_id FROM users WHERE id = $1 AND tenant_id::text = $2::text', [targetUserId, tenant_id]);
        if (uRes.rows.length === 0 || !accessibleDeptIds.includes(uRes.rows[0].department_id)) {
          return res.status(403).json({ status: 'error', message: 'You are not authorized to view this user commissions.' });
        }
      }
    }

    const list = await salesCommissionService.getCommissions({
      tenant_id,
      branch_id: branch_id || null,
      user_id: targetUserId,
      period: period || null,
      status: status || null
    });

    res.json({ status: 'success', data: list });
  } catch (err) {
    console.error('[salesCommissionController] getCommissions error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.getSettlements = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const userRole = req.user.role;
  const { user_id, branch_id, period, status } = req.query;

  try {
    let targetUserId = user_id ? parseInt(user_id, 10) : null;

    if (userRole !== 'admin' && userRole !== 'finance_manager') {
      if (!targetUserId) {
        if (userRole === 'sales' || userRole === 'employee') {
          targetUserId = req.user.id;
        }
      } else if (targetUserId !== req.user.id) {
        const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
        const uRes = await db.query('SELECT department_id FROM users WHERE id = $1 AND tenant_id::text = $2::text', [targetUserId, tenant_id]);
        if (uRes.rows.length === 0 || !accessibleDeptIds.includes(uRes.rows[0].department_id)) {
          return res.status(403).json({ status: 'error', message: 'You are not authorized to view this user settlements.' });
        }
      }
    }

    const list = await salesCommissionService.getSettlements({
      tenant_id,
      branch_id: branch_id || null,
      user_id: targetUserId,
      period: period || null,
      status: status || null
    });

    res.json({ status: 'success', data: list });
  } catch (err) {
    console.error('[salesCommissionController] getSettlements error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.generateSettlement = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const userRole = req.user.role;
  const { user_id, period, branch_id } = req.body;

  if (!user_id || !period) {
    return res.status(400).json({ status: 'error', message: 'user_id and period are required.' });
  }

  try {
    const targetUserId = parseInt(user_id, 10);

    // Permission check for managers
    if (userRole !== 'admin' && userRole !== 'finance_manager') {
      const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
      const uRes = await db.query('SELECT department_id FROM users WHERE id = $1 AND tenant_id::text = $2::text', [targetUserId, tenant_id]);
      if (uRes.rows.length === 0 || !accessibleDeptIds.includes(uRes.rows[0].department_id)) {
        return res.status(403).json({ status: 'error', message: 'You are not authorized to generate settlements for this user.' });
      }
    }

    const result = await salesCommissionService.generateMonthlySettlement({
      tenant_id,
      branch_id: branch_id || null,
      period,
      user_id: targetUserId,
      actor: req.user
    });

    res.status(result.existing ? 200 : 201).json({
      status: 'success',
      data: result.settlement,
      message: result.existing ? 'Existing settlement retrieved.' : 'Settlement generated successfully.'
    });
  } catch (err) {
    console.error('[salesCommissionController] generateSettlement error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.approveSettlement = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const settlement_id = parseInt(req.params.id, 10);

  try {
    const approved = await salesCommissionService.approveSettlement({
      settlement_id,
      tenant_id,
      actor: req.user
    });

    res.json({ status: 'success', data: approved, message: 'Settlement approved successfully.' });
  } catch (err) {
    console.error('[salesCommissionController] approveSettlement error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.payoutSettlement = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const settlement_id = parseInt(req.params.id, 10);
  const { treasury_account_id, payment_method, notes } = req.body;

  try {
    const result = await salesCommissionService.payoutSettlement({
      settlement_id,
      tenant_id,
      treasury_account_id,
      payment_method,
      actor: req.user,
      notes
    });

    res.json({
      status: 'success',
      data: result,
      message: `Payout completed with voucher ${result.voucher.voucher_number}.`
    });
  } catch (err) {
    console.error('[salesCommissionController] payoutSettlement error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.createRule = async (req, res) => {
  const tenant_id = req.user.tenant_id;

  try {
    const rule = await salesCommissionService.createRule({
      ...req.body,
      tenant_id
    }, req.user);

    res.status(201).json({ status: 'success', data: rule });
  } catch (err) {
    console.error('[salesCommissionController] createRule error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.setRuleTiers = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const rule_id = parseInt(req.params.id, 10);
  const { tiers } = req.body;

  if (!Array.isArray(tiers) || tiers.length === 0) {
    return res.status(400).json({ status: 'error', message: 'Tiers must be a non-empty array.' });
  }

  try {
    const createdTiers = await salesCommissionService.setRuleTiers(rule_id, tenant_id, tiers);
    res.json({ status: 'success', data: createdTiers });
  } catch (err) {
    console.error('[salesCommissionController] setRuleTiers error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};
