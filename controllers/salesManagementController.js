/**
 * salesManagementController.js — Unified Sales Management Cockpit Backend Engine
 * 
 * Supports both General Business and Real Estate tracks:
 * - Aggregates team performance, active vs overdue deals, and target progression without duplicating calculation engines.
 * - Identifies pipeline bottlenecks (stage duration, missed follow-ups, >48h inactivity, loss/blocker reasons).
 * - Provides 360° individual sales rep view.
 * - Reuses accessScopeService for hierarchical manager scoping and multi-tenant isolation.
 */

const db = require('../config/db');
const accessScopeService = require('../services/accessScopeService');
const salesTargetService = require('../services/salesTargetService');
const reTargetService = require('../services/reTargetService');
const dealSlaService = require('../services/dealSlaService');

// @desc    Get Sales Management Dashboard Overview & Bottlenecks
// @route   GET /api/sales-management/overview
// @access  Private (Admin, Manager, Supervisor)
exports.getOverview = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const userRole = req.user.role;
  const isRealEstate = req.user?.template_name === 'real_estate' || req.query.track === 'real_estate';
  const branch_id = req.branchId || req.query.branch_id;
  const period = req.query.period || new Date().toISOString().slice(0, 7); // YYYY-MM default

  try {
    // 1. Resolve Manager Scope
    let scopeUserIds = null;
    if (userRole !== 'admin') {
      const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
      if (accessibleDeptIds && accessibleDeptIds.length > 0) {
        const teamUsersRes = await db.query(
          `SELECT id FROM users WHERE tenant_id::text = $1::text AND (department_id = ANY($2::int[]) OR id = $3)`,
          [tenant_id, accessibleDeptIds, req.user.id]
        );
        scopeUserIds = teamUsersRes.rows.map(r => r.id);
      } else {
        scopeUserIds = [req.user.id];
      }
    }

    // 2. Base deal filter
    let dealWhere = [`d.tenant_id::text = $1::text`];
    let dealParams = [tenant_id];

    if (scopeUserIds) {
      dealParams.push(scopeUserIds);
      dealWhere.push(`d.assigned_to = ANY($${dealParams.length}::int[])`);
    }

    if (branch_id && branch_id !== 'ALL') {
      dealParams.push(String(branch_id));
      dealWhere.push(`(d.branch_id::text = $${dealParams.length}::text OR d.branch_id IS NULL)`);
    }

    // 3. Fetch Deals Pipeline Summary & Stage Breakdown
    const stageSummaryRes = await db.query(`
      SELECT 
        d.pipeline_stage,
        COUNT(d.id)::int as count,
        COALESCE(SUM(d.value), 0) as total_value,
        AVG(EXTRACT(EPOCH FROM (NOW() - d.updated_at)) / 86400)::numeric(10,1) as avg_days_in_stage
      FROM deals d
      WHERE ${dealWhere.join(' AND ')}
      GROUP BY d.pipeline_stage
    `, dealParams);

    // 4. Bottlenecks Analysis:
    // a) Deals with no activity > 48 hours (Overdue SLA)
    let scopedOverdueDeals = [];
    try {
      const overdueDeals = await dealSlaService.getOverdueDeals(tenant_id, branch_id);
      scopedOverdueDeals = scopeUserIds 
        ? overdueDeals.filter(d => scopeUserIds.includes(d.assigned_to))
        : overdueDeals;
    } catch (slaErr) {
      console.warn('[dealSlaService.getOverdueDeals error]:', slaErr.message);
    }

    // b) Missed follow-ups & overdue tasks
    let taskWhere = [
      `t.tenant_id::text = $1::text`,
      `t.due_date < CURRENT_DATE`,
      `t.status != 'completed'`
    ];
    let taskParams = [tenant_id];
    if (scopeUserIds) {
      taskParams.push(scopeUserIds);
      taskWhere.push(`t.assigned_to = ANY($${taskParams.length}::int[])`);
    }
    const overdueTasksRes = await db.query(`
      SELECT COUNT(*)::int as count
      FROM tasks t
      WHERE ${taskWhere.join(' AND ')}
    `, taskParams).catch(() => ({ rows: [{ count: 0 }] }));

    // c) Stagnant deals (> 14 days without stage change)
    const stagnantDealsRes = await db.query(`
      SELECT d.id, d.title, d.value, d.pipeline_stage, d.assigned_to, u.name as salesman_name,
             EXTRACT(EPOCH FROM (NOW() - d.updated_at)) / 86400 as days_stagnant,
             d.custom_fields->>'blocker_reason' as blocker_reason
      FROM deals d
      LEFT JOIN users u ON d.assigned_to = u.id
      WHERE ${dealWhere.join(' AND ')}
        AND d.pipeline_stage NOT IN ('won', 'lost', 'cancelled')
        AND d.updated_at < NOW() - INTERVAL '14 days'
      ORDER BY d.updated_at ASC
      LIMIT 10
    `, dealParams).catch(() => ({ rows: [] }));

    // d) Lost reasons distribution
    const lostReasonsRes = await db.query(`
      SELECT 
        COALESCE(d.custom_fields->>'lost_reason', 'Unspecified') as reason,
        COUNT(*)::int as count,
        COALESCE(SUM(d.value), 0) as lost_value
      FROM deals d
      WHERE ${dealWhere.join(' AND ')}
        AND d.pipeline_stage = 'lost'
      GROUP BY COALESCE(d.custom_fields->>'lost_reason', 'Unspecified')
      ORDER BY count DESC
    `, dealParams).catch(() => ({ rows: [] }));

    // 5. Team Target & Revenue / Collection Aggregation
    let targetSummary = { target_amount: 0, achieved_amount: 0, achievement_rate: 0 };
    try {
      if (isRealEstate) {
        const reTargetRes = await db.query(`
          SELECT 
            COALESCE(SUM(target_amount), 0) as target_amount,
            COALESCE(SUM(achieved_amount), 0) as achieved_amount,
            COALESCE(SUM(target_units), 0) as target_units,
            COALESCE(SUM(achieved_units_count), 0) as achieved_units_count
          FROM re_targets
          WHERE tenant_id::text = $1::text
            AND is_active = true AND deleted_at IS NULL
            AND period = $2
            AND ($3::text IS NULL OR branch_id::text = $3::text)
        `, [tenant_id, period, branch_id && branch_id !== 'ALL' ? String(branch_id) : null]).catch(() => ({ rows: [] }));

        const row = reTargetRes.rows[0] || {};
        const targetAmount = parseFloat(row.target_amount || 0);
        const achievedAmount = parseFloat(row.achieved_amount || 0);
        targetSummary = {
          target_amount: targetAmount,
          achieved_amount: achievedAmount,
          target_units: parseInt(row.target_units || 0, 10),
          achieved_units_count: parseInt(row.achieved_units_count || 0, 10),
          achievement_rate: targetAmount > 0 ? Math.round((achievedAmount / targetAmount) * 100) : 0
        };
      } else {
        const genTargetRes = await db.query(`
          SELECT 
            COALESCE(SUM(target_amount), 0) as target_amount,
            COALESCE(SUM(achieved_amount), 0) as achieved_amount
          FROM sales_targets
          WHERE tenant_id::text = $1::text
            AND is_active = true AND deleted_at IS NULL
            AND (period = $2 OR legacy_period = $2)
            AND ($3::text IS NULL OR branch_id::text = $3::text)
        `, [tenant_id, period, branch_id && branch_id !== 'ALL' ? String(branch_id) : null]).catch(() => ({ rows: [] }));

        const row = genTargetRes.rows[0] || {};
        const targetAmount = parseFloat(row.target_amount || 0);
        const achievedAmount = parseFloat(row.achieved_amount || 0);
        targetSummary = {
          target_amount: targetAmount,
          achieved_amount: achievedAmount,
          achievement_rate: targetAmount > 0 ? Math.round((achievedAmount / targetAmount) * 100) : 0
        };
      }
    } catch (targetErr) {
      console.warn('[salesManagementController target aggregation warning]:', targetErr.message);
    }

    // 6. Win Rate & Average Closing Days
    const winRateRes = await db.query(`
      SELECT 
        COUNT(d.id) FILTER (WHERE d.pipeline_stage = 'won')::int as won_count,
        COUNT(d.id) FILTER (WHERE d.pipeline_stage = 'lost')::int as lost_count,
        AVG(EXTRACT(EPOCH FROM (d.updated_at - d.created_at)) / 86400) FILTER (WHERE d.pipeline_stage = 'won')::numeric(10,1) as avg_closing_days
      FROM deals d
      WHERE ${dealWhere.join(' AND ')}
    `, dealParams);

    const wonCount = winRateRes.rows[0]?.won_count || 0;
    const lostCount = winRateRes.rows[0]?.lost_count || 0;
    const closedCount = wonCount + lostCount;
    const winRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0;
    const avgClosingDays = parseFloat(winRateRes.rows[0]?.avg_closing_days || 0);

    res.json({
      status: 'success',
      data: {
        track: isRealEstate ? 'real_estate' : 'general',
        period,
        kpis: {
          ...targetSummary,
          open_deals_count: stageSummaryRes.rows.filter(s => !['won', 'lost', 'cancelled'].includes(s.pipeline_stage)).reduce((acc, s) => acc + s.count, 0),
          open_deals_value: stageSummaryRes.rows.filter(s => !['won', 'lost', 'cancelled'].includes(s.pipeline_stage)).reduce((acc, s) => acc + parseFloat(s.total_value), 0),
          overdue_deals_count: scopedOverdueDeals.length,
          overdue_tasks_count: overdueTasksRes.rows[0]?.count || 0,
          win_rate_pct: winRate,
          avg_closing_days: avgClosingDays
        },
        pipeline_stages: stageSummaryRes.rows,
        bottlenecks: {
          overdue_sla_deals: scopedOverdueDeals.slice(0, 10),
          stagnant_deals: stagnantDealsRes.rows,
          lost_reasons: lostReasonsRes.rows
        }
      }
    });

  } catch (err) {
    console.error('[salesManagementController.getOverview error]:', err);
    res.status(500).json({ status: 'error', message: 'Failed to load sales management overview.' });
  }
};

// @desc    Get Salesmen Comparative Performance Matrix
// @route   GET /api/sales-management/performance
// @access  Private (Admin, Manager, Supervisor)
exports.getTeamPerformance = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const userRole = req.user.role;
  const isRealEstate = req.user?.template_name === 'real_estate' || req.query.track === 'real_estate';
  const branch_id = req.branchId || req.query.branch_id;
  const period = req.query.period || new Date().toISOString().slice(0, 7);

  try {
    let scopeUserIds = null;
    if (userRole !== 'admin') {
      const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
      if (accessibleDeptIds && accessibleDeptIds.length > 0) {
        const teamUsersRes = await db.query(
          `SELECT id FROM users WHERE tenant_id::text = $1::text AND (department_id = ANY($2::int[]) OR id = $3)`,
          [tenant_id, accessibleDeptIds, req.user.id]
        );
        scopeUserIds = teamUsersRes.rows.map(r => r.id);
      } else {
        scopeUserIds = [req.user.id];
      }
    }

    let userWhere = [
      `u.tenant_id::text = $1::text`,
      `COALESCE(u.is_working, true) = true`,
      `u.role IN ('sales', 'agent', 'manager', 'supervisor', 'employee', 'user', 'admin')`
    ];
    let userParams = [tenant_id];

    if (scopeUserIds) {
      userParams.push(scopeUserIds);
      userWhere.push(`u.id = ANY($${userParams.length}::int[])`);
    }

    if (branch_id && branch_id !== 'ALL') {
      userParams.push(String(branch_id));
      userWhere.push(`(u.branch_id::text = $${userParams.length}::text OR u.branch_id IS NULL)`);
    }

    const teamMembersRes = await db.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.role, u.branch_id,
        b.name as branch_name,
        d.name as department_name,
        -- Deals Counts
        COUNT(dl.id) FILTER (WHERE dl.pipeline_stage NOT IN ('won', 'lost', 'cancelled'))::int as open_deals,
        COUNT(dl.id) FILTER (WHERE dl.pipeline_stage = 'won')::int as won_deals,
        COUNT(dl.id) FILTER (WHERE dl.pipeline_stage = 'lost')::int as lost_deals,
        COALESCE(SUM(dl.value) FILTER (WHERE dl.pipeline_stage = 'won'), 0) as total_won_value,
        -- Assigned Customers / Leads
        (SELECT COUNT(*)::int FROM customers c WHERE c.assigned_to = u.id AND c.tenant_id::text = u.tenant_id::text) as total_leads,
        -- Overdue Tasks
        (SELECT COUNT(*)::int FROM tasks t WHERE t.assigned_to = u.id AND t.due_date < CURRENT_DATE AND t.status != 'completed' AND t.tenant_id::text = u.tenant_id::text) as overdue_tasks,
        -- Last Contact / Activity
        (SELECT MAX(a.created_at) FROM activities a WHERE a.user_id = u.id AND a.tenant_id::text = u.tenant_id::text) as last_activity_at
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN deals dl ON dl.assigned_to = u.id AND dl.tenant_id::text = u.tenant_id::text
      WHERE ${userWhere.join(' AND ')}
      GROUP BY u.id, b.name, d.name
      ORDER BY total_won_value DESC, u.name ASC
    `, userParams).catch(() => ({ rows: [] }));

    // Merge Target & Commission data for each member
    const performanceList = await Promise.all(teamMembersRes.rows.map(async (rep) => {
      let target = 0;
      let achieved = 0;
      let commission = 0;

      if (isRealEstate) {
        const reTargetRes = await db.query(
          `SELECT target_amount, achieved_amount, achieved_units_count FROM re_targets WHERE user_id = $1 AND period = $2 AND tenant_id::text = $3::text`,
          [rep.id, period, tenant_id]
        ).catch(() => ({ rows: [] }));
        target = parseFloat(reTargetRes.rows[0]?.target_amount || 0);
        achieved = parseFloat(reTargetRes.rows[0]?.achieved_amount || 0);

        const commRes = await db.query(
          `SELECT COALESCE(SUM(commission_amount), 0) as total FROM re_commissions WHERE beneficiary_user_id = $1 AND tenant_id::text = $2::text AND status = 'Approved'`,
          [rep.id, tenant_id]
        ).catch(() => ({ rows: [] }));
        commission = parseFloat(commRes.rows[0]?.total || 0);
      } else {
        const genTargetRes = await db.query(
          `SELECT target_amount, achieved_amount FROM sales_targets WHERE user_id = $1 AND period = $2 AND tenant_id::text = $3::text`,
          [rep.id, period, tenant_id]
        ).catch(() => ({ rows: [] }));
        target = parseFloat(genTargetRes.rows[0]?.target_amount || 0);
        achieved = parseFloat(genTargetRes.rows[0]?.achieved_amount || 0);

        const commRes = await db.query(
          `SELECT COALESCE(SUM(net_commission), 0) as total FROM sales_commissions WHERE user_id = $1 AND tenant_id::text = $2::text AND status = 'approved'`,
          [rep.id, tenant_id]
        ).catch(() => ({ rows: [] }));
        commission = parseFloat(commRes.rows[0]?.total || 0);
      }

      const closed = rep.won_deals + rep.lost_deals;
      const winRate = closed > 0 ? Math.round((rep.won_deals / closed) * 100) : 0;
      const achievementRate = target > 0 ? Math.round((achieved / target) * 100) : 0;

      return {
        ...rep,
        target_amount: target,
        achieved_amount: achieved,
        commission_amount: commission,
        achievement_rate: achievementRate,
        win_rate: winRate
      };
    }));

    res.json({
      status: 'success',
      data: performanceList
    });

  } catch (err) {
    console.error('[salesManagementController.getTeamPerformance error]:', err);
    res.status(500).json({ status: 'error', message: 'Failed to load team performance.' });
  }
};

// @desc    Get Salesman 360° Profile
// @route   GET /api/sales-management/salesman/:userId/360
// @access  Private (Admin, Manager, Supervisor)
exports.getSalesman360 = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const targetUserId = parseInt(req.params.userId, 10);
  const period = req.query.period || new Date().toISOString().slice(0, 7);

  try {
    // 1. Fetch user details
    const userRes = await db.query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.department_id, dep.name as department_name, u.branch_id, b.name as branch_name
       FROM users u
       LEFT JOIN departments dep ON u.department_id = dep.id
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.id = $1 AND u.tenant_id::text = $2::text`,
      [targetUserId, tenant_id]
    ).catch(() => ({ rows: [] }));

    if (userRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Sales representative not found.' });
    }

    const salesman = userRes.rows[0];

    // Authorization check: Admin, Manager, Supervisor or the rep themselves
    if (!['admin', 'manager', 'supervisor'].includes(req.user.role) && req.user.id !== targetUserId) {
      const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
      if (!accessibleDeptIds || !accessibleDeptIds.includes(salesman.department_id)) {
        return res.status(403).json({ status: 'error', message: 'You are not authorized to view this salesman dossier.' });
      }
    }

    // 2. Fetch assigned deals with SLA status, stage duration, customer, and unit/product details
    const dealsRes = await db.query(`
      SELECT 
        d.id, 
        d.title, 
        d.value, 
        d.pipeline_stage, 
        d.probability, 
        d.expected_close_date,
        d.custom_fields->>'lost_reason' as lost_reason,
        d.custom_fields->>'blocker_reason' as blocker_reason,
        c.name as customer_name, 
        c.phone as customer_phone,
        c.company_name as customer_company,
        ru.unit_number,
        ru.project_name as unit_project,
        p.name as product_name,
        EXTRACT(EPOCH FROM (NOW() - d.updated_at)) / 86400 as days_since_update,
        EXTRACT(EPOCH FROM (NOW() - d.created_at)) / 86400 as days_since_created,
        d.created_at, 
        d.updated_at,
        CASE 
          WHEN LOWER(COALESCE(d.pipeline_stage, '')) IN ('won', 'lost', 'cancelled', 'closed', 'closed won', 'closed lost') THEN false
          WHEN CURRENT_TIMESTAMP > COALESCE(
            NULLIF(d.custom_fields->>'sla_extended_until', '')::timestamptz,
            GREATEST(
              d.created_at,
              COALESCE(NULLIF(d.custom_fields->>'reassigned_at', '')::timestamptz, d.created_at)
            ) + INTERVAL '48 hours'
          ) THEN true
          ELSE false
        END as is_overdue,
        CASE
          WHEN LOWER(COALESCE(d.pipeline_stage, '')) NOT IN ('won', 'lost', 'cancelled', 'closed', 'closed won', 'closed lost') 
           AND EXTRACT(EPOCH FROM (NOW() - d.updated_at)) / 86400 > 7 THEN true
          ELSE false
        END as is_stagnant
      FROM deals d
      LEFT JOIN customers c ON d.client_id = c.id
      LEFT JOIN re_units ru ON d.unit_id::text = ru.id::text AND ru.tenant_id::text = d.tenant_id::text
      LEFT JOIN products p ON d.product_id = p.id
      WHERE d.assigned_to = $1 AND d.tenant_id::text = $2::text
      ORDER BY d.updated_at DESC
    `, [targetUserId, tenant_id]).catch((err) => {
      console.error('[getSalesman360 deals error]:', err.message);
      return { rows: [] };
    });

    // 3. Fetch overdue and upcoming tasks
    const tasksRes = await db.query(`
      SELECT t.id, t.title, t.due_date, t.priority, t.status, t.parent_type, t.parent_id
      FROM tasks t
      WHERE t.assigned_to = $1 AND t.tenant_id::text = $2::text AND t.status != 'completed'
      ORDER BY t.due_date ASC
    `, [targetUserId, tenant_id]).catch(() => ({ rows: [] }));

    // 4. Fetch recent activities (schema-accurate using action and meta)
    const activitiesRes = await db.query(`
      SELECT a.id, a.action, a.meta, a.created_at, a.entity_type, a.entity_id
      FROM activities a
      WHERE a.user_id = $1 AND a.tenant_id::text = $2::text
      ORDER BY a.created_at DESC
      LIMIT 20
    `, [targetUserId, tenant_id]).catch(() => ({ rows: [] }));

    const mappedActivities = activitiesRes.rows.map(a => {
      const meta = typeof a.meta === 'object' && a.meta !== null ? a.meta : {};
      return {
        id: a.id,
        type: a.action,
        description: meta.changes?.note?.to || meta.changes?.description || a.action,
        created_at: a.created_at,
        parent_type: a.entity_type,
        parent_id: a.entity_id
      };
    });

    res.json({
      status: 'success',
      data: {
        salesman,
        deals: dealsRes.rows,
        tasks: tasksRes.rows,
        recent_activities: mappedActivities
      }
    });

  } catch (err) {
    console.error('[salesManagementController.getSalesman360 error]:', err);
    res.status(500).json({ status: 'error', message: 'Failed to load salesman 360 profile.' });
  }
};
