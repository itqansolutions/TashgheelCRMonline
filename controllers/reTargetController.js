/**
 * reTargetController.js — Real Estate Targets & Performance Controller
 *
 * Implements endpoints for Real Estate Quotas, Target Achievement Tracking,
 * and Salesman Performance Detail drill-downs.
 */

const reTargetService = require('../services/reTargetService');
const accessScopeService = require('../services/accessScopeService');
const db = require('../config/db');

exports.getTargets = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;
  const userRole = req.user.role;
  const { period, user_id, target_scope } = req.query;

  try {
    let targetUserId = user_id ? parseInt(user_id, 10) : null;

    // Non-managers can only see their own targets
    if (['sales', 'agent', 'employee'].includes(userRole)) {
      targetUserId = req.user.id;
    } else if (userRole !== 'admin' && targetUserId && targetUserId !== req.user.id) {
      // Check department scoping for managers
      const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
      const uRes = await db.query('SELECT department_id FROM users WHERE id = $1 AND tenant_id::text = $2::text', [targetUserId, tenant_id]);
      if (uRes.rows.length === 0 || !accessibleDeptIds.includes(uRes.rows[0].department_id)) {
        return res.status(403).json({ status: 'error', message: 'You are not authorized to view targets for this user.' });
      }
    }

    const targets = await reTargetService.getTargetsWithProgress({
      tenant_id,
      branch_id: branch_id || null,
      period: period || null,
      user_id: targetUserId,
      target_scope: target_scope || null
    });

    res.json({ status: 'success', data: targets });
  } catch (err) {
    console.error('[reTargetController] getTargets error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.getMyTargetProgress = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const user_id = req.user.id;
  const { period } = req.query;

  try {
    const targets = await reTargetService.getTargetsWithProgress({
      tenant_id,
      user_id,
      period: period || null,
      target_scope: 'individual'
    });

    res.json({
      status: 'success',
      data: targets.length > 0 ? targets[0] : null
    });
  } catch (err) {
    console.error('[reTargetController] getMyTargetProgress error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.createTarget = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const userRole = req.user.role;
  const { user_id, branch_id, target_scope, period, target_amount, target_units, commission_rate, notes } = req.body;

  try {
    if (userRole !== 'admin' && user_id) {
      const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
      const uRes = await db.query('SELECT department_id FROM users WHERE id = $1 AND tenant_id::text = $2::text', [user_id, tenant_id]);
      if (uRes.rows.length === 0 || !accessibleDeptIds.includes(uRes.rows[0].department_id)) {
        return res.status(403).json({ status: 'error', message: 'You are not authorized to assign targets to this user.' });
      }
    }

    const target = await reTargetService.createTarget({
      tenant_id,
      branch_id: branch_id || req.branchId || req.user?.branch_id || null,
      user_id,
      target_scope: target_scope || 'individual',
      period,
      target_amount,
      target_units,
      commission_rate,
      notes
    }, req.user);

    res.status(201).json({ status: 'success', data: target, message: 'Real estate target created successfully.' });
  } catch (err) {
    console.error('[reTargetController] createTarget error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.updateTarget = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const updated = await reTargetService.updateTarget(id, req.body, req.user);
    res.json({ status: 'success', data: updated, message: 'Target updated successfully.' });
  } catch (err) {
    console.error('[reTargetController] updateTarget error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.deleteTarget = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const deleted = await reTargetService.deleteTarget(id, req.user);
    res.json({ status: 'success', data: deleted, message: 'Target deleted successfully.' });
  } catch (err) {
    console.error('[reTargetController] deleteTarget error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.getSalesmen = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const userRole = req.user.role;

  try {
    // 1. Strict Branch Scope Validation
    let effectiveBranchId = null;
    if (userRole === 'admin') {
      if (req.query.branch_id) {
        const bCheck = await db.query(
          `SELECT id FROM branches WHERE id::text = $1::text AND tenant_id::text = $2::text`,
          [req.query.branch_id, tenant_id]
        );
        if (bCheck.rows.length === 0) {
          return res.status(404).json({ status: 'error', message: 'Requested branch not found or unauthorized.' });
        }
        effectiveBranchId = bCheck.rows[0].id;
      }
    } else {
      const enforcedBranchId = req.branchId || req.user?.branch_id || null;
      if (req.query.branch_id) {
        if (enforcedBranchId && String(req.query.branch_id).trim() !== String(enforcedBranchId).trim()) {
          return res.status(403).json({
            status: 'error',
            message: 'Unauthorized branch access: You cannot query data outside your assigned branch.',
            code: 'UNAUTHORIZED_BRANCH_ACCESS'
          });
        }
        effectiveBranchId = req.query.branch_id;
      } else {
        effectiveBranchId = enforcedBranchId;
      }
    }

    // 2. Department & RBAC Scoping
    let accessibleDeptIds = null;
    let restrictToUserId = null;

    if (userRole === 'admin') {
      // Unrestricted
    } else if (userRole === 'manager' || userRole === 'supervisor') {
      accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
      if (!accessibleDeptIds || accessibleDeptIds.length === 0) {
        // Fail-closed: Manager with no assigned departments is strictly restricted to self
        restrictToUserId = req.user.id;
      }
    } else {
      // Sales / Agent / Employee: Strictly view only self by default
      restrictToUserId = req.user.id;
    }

    const salesmen = await reTargetService.getSalesmen({
      tenant_id,
      branch_id: effectiveBranchId,
      accessible_dept_ids: accessibleDeptIds,
      restrict_user_id: restrictToUserId,
      current_user_id: req.user.id
    });
    res.json({ status: 'success', data: salesmen });
  } catch (err) {
    console.error('[reTargetController] getSalesmen error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};

exports.getSalesmanPerformance = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const userRole = req.user.role;
  const targetUserId = parseInt(req.params.userId, 10);
  const { period } = req.query;

  if (!period) {
    return res.status(400).json({ status: 'error', message: 'period query parameter is required.' });
  }

  try {
    // 1. Strict Branch Scope Verification for Non-Admin
    const enforcedBranchId = req.branchId || req.user?.branch_id || null;
    if (userRole !== 'admin') {
      const uRes = await db.query(
        'SELECT id, department_id, branch_id FROM users WHERE id = $1 AND tenant_id::text = $2::text',
        [targetUserId, tenant_id]
      );
      if (uRes.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Target user not found or unauthorized.' });
      }

      const targetUser = uRes.rows[0];

      // Branch Check
      if (enforcedBranchId && targetUser.branch_id && String(targetUser.branch_id).trim() !== String(enforcedBranchId).trim()) {
        return res.status(403).json({
          status: 'error',
          message: 'Unauthorized branch access: You cannot view performance of a user outside your assigned branch.',
          code: 'UNAUTHORIZED_BRANCH_ACCESS'
        });
      }

      // Role & Department Check
      if (['sales', 'agent', 'employee'].includes(userRole) && targetUserId !== req.user.id) {
        return res.status(403).json({ status: 'error', message: 'You can only view your own performance.' });
      } else if (targetUserId !== req.user.id) {
        const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
        if (!accessibleDeptIds || !accessibleDeptIds.includes(targetUser.department_id)) {
          return res.status(403).json({ status: 'error', message: 'You are not authorized to view this user performance.' });
        }
      }
    }

    const detail = await reTargetService.getSalesmanPerformanceDetail({
      tenant_id,
      user_id: targetUserId,
      period,
      branch_id: enforcedBranchId
    });

    res.json({ status: 'success', data: detail });
  } catch (err) {
    console.error('[reTargetController] getSalesmanPerformance error:', err.message);
    res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
  }
};
