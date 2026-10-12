/**
 * salesTargetService.js — Phase 3.3B: Sales Metrics & Targets Engine
 *
 * Core domain service for managing sales targets, resolving Egypt business-local
 * period boundaries, and calculating canonical collected cash metrics.
 */

const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');

class SalesTargetService {
  /**
   * Normalizes period strings (canonicalizing legacy formats like 'Q3 2026' or 'FY 2026')
   * @param {string} period
   * @returns {string}
   */
  normalizePeriod(period) {
    if (!period || typeof period !== 'string') {
      throw new Error('Target period is required and must be a string.');
    }
    const trimmed = period.trim();

    // Check Quarterly legacy format: 'Q3 2026' or 'q3 2026'
    const qLegacyMatch = trimmed.match(/^Q([1-4])\s+(\d{4})$/i);
    if (qLegacyMatch) {
      return `${qLegacyMatch[2]}-Q${qLegacyMatch[1]}`;
    }

    // Check Yearly legacy format: 'FY 2026' or 'fy 2026'
    const fyLegacyMatch = trimmed.match(/^FY\s+(\d{4})$/i);
    if (fyLegacyMatch) {
      return `${fyLegacyMatch[1]}`;
    }

    return trimmed;
  }

  /**
   * Validates period format and calculates local start and end bounds in Africa/Cairo.
   * Half-open interval: [startLocal, endLocal)
   * @param {string} periodStr
   * @param {string} timezone
   * @returns {{ normalizedPeriod: string, periodType: string, startLocal: string, endLocal: string, timezone: string }}
   */
  resolvePeriodBounds(periodStr, timezone = 'Africa/Cairo') {
    const normalized = this.normalizePeriod(periodStr);

    // 1. Monthly: YYYY-MM
    const monthlyMatch = normalized.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (monthlyMatch) {
      const year = parseInt(monthlyMatch[1], 10);
      const month = parseInt(monthlyMatch[2], 10);

      const startLocal = `${year}-${String(month).padStart(2, '0')}-01 00:00:00`;
      let nextYear = year;
      let nextMonth = month + 1;
      if (nextMonth > 12) {
        nextYear += 1;
        nextMonth = 1;
      }
      const endLocal = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01 00:00:00`;

      return {
        normalizedPeriod: normalized,
        periodType: 'monthly',
        startLocal,
        endLocal,
        timezone
      };
    }

    // 2. Quarterly: YYYY-Q[1-4]
    const quarterlyMatch = normalized.match(/^(\d{4})-Q([1-4])$/);
    if (quarterlyMatch) {
      const year = parseInt(quarterlyMatch[1], 10);
      const quarter = parseInt(quarterlyMatch[2], 10);

      const quarterStartMonths = { 1: 1, 2: 4, 3: 7, 4: 10 };
      const startMonth = quarterStartMonths[quarter];
      const startLocal = `${year}-${String(startMonth).padStart(2, '0')}-01 00:00:00`;

      let endYear = year;
      let endMonth = startMonth + 3;
      if (endMonth > 12) {
        endYear += 1;
        endMonth = 1;
      }
      const endLocal = `${endYear}-${String(endMonth).padStart(2, '0')}-01 00:00:00`;

      return {
        normalizedPeriod: normalized,
        periodType: 'quarterly',
        startLocal,
        endLocal,
        timezone
      };
    }

    // 3. Yearly: YYYY
    const yearlyMatch = normalized.match(/^(\d{4})$/);
    if (yearlyMatch) {
      const year = parseInt(yearlyMatch[1], 10);
      const startLocal = `${year}-01-01 00:00:00`;
      const endLocal = `${year + 1}-01-01 00:00:00`;

      return {
        normalizedPeriod: normalized,
        periodType: 'yearly',
        startLocal,
        endLocal,
        timezone
      };
    }

    throw new Error(
      `Invalid period format: '${periodStr}'. Supported formats are: 'YYYY-MM' (e.g. 2026-05), 'YYYY-Q[1-4]' (e.g. 2026-Q2), or 'YYYY' (e.g. 2026).`
    );
  }

  /**
   * Calculates actual collected cash for a given scope and period.
   *
   * Attribution hierarchy:
   * - Sales Order priority: so.assigned_to
   * - Fallback to Deal: d.assigned_to
   * - Standalone invoice (so.assigned_to IS NULL and d.assigned_to IS NULL):
   *   Included ONLY for Branch/Company targets. NEVER credited to an individual salesperson!
   *
   * Filters out:
   * - Cancelled payments (p.cancelled_at IS NOT NULL or p.status = 'cancelled')
   * - Cancelled invoices (i.status = 'cancelled')
   * - Real estate invoices/deals (i.unit_id IS NOT NULL or d.unit_id IS NOT NULL)
   *
   * @param {Object} params
   * @returns {Promise<number>}
   */
  async calculateAchievement({
    tenant_id,
    branch_id = null,
    target_scope = 'individual',
    user_id = null,
    department_id = null,
    period,
    timezone = 'Africa/Cairo',
    client = null
  }) {
    const runner = client || db;
    const bounds = this.resolvePeriodBounds(period, timezone);

    let scopePredicate = '';
    const queryParams = [
      tenant_id,                                           // $1
      branch_id ? String(branch_id) : null,                // $2
      bounds.startLocal,                                   // $3
      bounds.endLocal,                                     // $4
      bounds.timezone                                      // $5
    ];

    if (target_scope === 'individual') {
      if (!user_id) {
        throw new Error("Individual target calculation requires 'user_id'.");
      }
      queryParams.push(parseInt(user_id, 10)); // $6
      scopePredicate = `AND COALESCE(so.assigned_to, d.assigned_to) = $6::int`;
    } else if (target_scope === 'department') {
      if (!department_id) {
        throw new Error("Department target calculation requires 'department_id'.");
      }
      queryParams.push(parseInt(department_id, 10)); // $6
      scopePredicate = `AND COALESCE(so.assigned_to, d.assigned_to) IN (
        SELECT id FROM users WHERE department_id = $6::int AND tenant_id::text = $1::text
      )`;
    } else if (target_scope === 'branch') {
      // Branch targets include all branch sales, including house/direct sales without an assigned salesperson
      scopePredicate = '';
    } else if (target_scope === 'company') {
      // Company targets aggregate all sales across all branches in the tenant
      scopePredicate = '';
    } else {
      throw new Error(`Invalid target_scope: '${target_scope}'.`);
    }

    const effectiveBranchId = target_scope === 'company' ? null : (branch_id ? String(branch_id) : null);
    queryParams[1] = effectiveBranchId;

    const sql = `
      SELECT COALESCE(SUM(p.amount), 0) AS total_collected
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      LEFT JOIN sales_orders so ON i.sales_order_id = so.id::text
      LEFT JOIN deals d ON i.deal_id = d.id::text
      WHERE p.tenant_id::text = $1::text
        AND ($2::text IS NULL OR p.branch_id::text = $2::text)
        ${scopePredicate}
        AND COALESCE(p.status, 'active') = 'active'
        AND p.cancelled_at IS NULL
        AND (i.status IS NULL OR i.status != 'cancelled')
        AND i.unit_id IS NULL
        AND (d.id IS NULL OR d.unit_id IS NULL)
        AND COALESCE(p.payment_date, p.created_at) >= ($3::timestamp AT TIME ZONE $5)
        AND COALESCE(p.payment_date, p.created_at) < ($4::timestamp AT TIME ZONE $5)
    `;

    const res = await runner.query(sql, queryParams);
    return parseFloat(res.rows[0].total_collected || 0);
  }

  /**
   * Retrieves sales targets with dynamically computed achievement and progress.
   * Replaces legacy N+1 query loop with efficient target listing and progress calculation.
   *
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async getTargetsWithProgress({
    tenant_id,
    branch_id = null,
    period = null,
    target_scope = null,
    user_id = null,
    department_ids = null,
    includeInactive = false,
    client = null
  }) {
    const runner = client || db;

    let baseQuery = `
      SELECT 
        st.*,
        u.name as salesman_name,
        u.email as salesman_email,
        u.phone as salesman_phone,
        d.name as department_name,
        b.name as branch_name
      FROM sales_targets st
      LEFT JOIN users u ON st.user_id = u.id
      LEFT JOIN departments d ON st.department_id = d.id
      LEFT JOIN branches b ON st.branch_id = b.id
      WHERE st.tenant_id::text = $1::text
    `;
    const params = [tenant_id];
    let paramIndex = 2;

    if (!includeInactive) {
      baseQuery += ` AND st.deleted_at IS NULL AND st.is_active = true`;
    }

    if (period) {
      const normalized = this.normalizePeriod(period);
      baseQuery += ` AND (st.period = $${paramIndex} OR st.legacy_period = $${paramIndex})`;
      params.push(normalized);
      paramIndex++;
    }

    if (target_scope) {
      baseQuery += ` AND st.target_scope = $${paramIndex}`;
      params.push(target_scope);
      paramIndex++;
    }

    if (branch_id) {
      baseQuery += ` AND (st.branch_id IS NULL OR st.branch_id::text = $${paramIndex}::text)`;
      params.push(String(branch_id));
      paramIndex++;
    }

    if (user_id) {
      baseQuery += ` AND st.user_id = $${paramIndex}::int`;
      params.push(parseInt(user_id, 10));
      paramIndex++;
    }

    if (department_ids && Array.isArray(department_ids)) {
      if (department_ids.length > 0) {
        baseQuery += ` AND (st.department_id = ANY($${paramIndex}::int[]) OR st.user_id IN (
          SELECT id FROM users WHERE department_id = ANY($${paramIndex}::int[]) AND tenant_id::text = $1::text
        ))`;
        params.push(department_ids);
        paramIndex++;
      } else {
        // Empty array means user has no department scope and no personal targets match here
        baseQuery += ` AND 1=0`;
      }
    }

    baseQuery += ` ORDER BY st.created_at DESC`;

    const result = await runner.query(baseQuery, params);

    // Compute progress for each target
    const targets = await Promise.all(
      result.rows.map(async (t) => {
        let achieved = 0;
        try {
          achieved = await this.calculateAchievement({
            tenant_id: t.tenant_id,
            branch_id: t.branch_id,
            target_scope: t.target_scope,
            user_id: t.user_id,
            department_id: t.department_id,
            period: t.period,
            client: runner
          });
        } catch (calcErr) {
          console.warn(`[salesTargetService] Error calculating achievement for target ${t.id}:`, calcErr.message);
          achieved = parseFloat(t.achieved_amount || 0);
        }

        const targetAmount = parseFloat(t.target_amount || 0);
        const commRate = parseFloat(t.commission_rate || 0);
        const bonusThreshold = parseFloat(t.bonus_threshold || 0);
        const achievementPercentage = targetAmount > 0 ? Number(((achieved / targetAmount) * 100).toFixed(2)) : 0;
        const commissionEarned = Math.round((achieved * commRate) / 100);
        const bonusEligible = bonusThreshold > 0 && achieved >= bonusThreshold;

        return {
          ...t,
          target_amount: targetAmount,
          achieved_amount: achieved,
          achievement_percentage: achievementPercentage,
          commission_rate: commRate,
          commission_earned: commissionEarned,
          bonus_threshold: bonusThreshold,
          bonus_eligible: bonusEligible
        };
      })
    );

    return targets;
  }

  /**
   * Creates a new sales target inside a managed transaction with duplicate prevention
   * and atomic audit logging.
   *
   * @param {Object} targetData
   * @param {Object} actor
   * @returns {Promise<Object>}
   */
  async createTarget(targetData, actor) {
    const {
      tenant_id,
      branch_id = null,
      target_scope = 'individual',
      user_id = null,
      department_id = null,
      period,
      target_amount,
      commission_rate = 0,
      bonus_threshold = 0,
      notes = null
    } = targetData;

    if (!period) throw new Error('Target period is required.');
    const normalizedPeriod = this.normalizePeriod(period);
    // Validate bounds immediately
    this.resolvePeriodBounds(normalizedPeriod);

    const parsedAmount = parseFloat(target_amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Valid positive target amount is required.');
    }

    // Validate Scope and Subject
    let cleanUserId = null;
    let cleanDeptId = null;

    if (target_scope === 'individual') {
      if (!user_id) throw new Error("Individual target requires a valid 'user_id'.");
      cleanUserId = parseInt(user_id, 10);
    } else if (target_scope === 'department') {
      if (!department_id) throw new Error("Department target requires a valid 'department_id'.");
      cleanDeptId = parseInt(department_id, 10);
    } else if (target_scope === 'branch') {
      if (!branch_id) throw new Error("Branch target requires a valid 'branch_id'.");
    } else if (target_scope === 'company') {
      // Company targets apply to the entire tenant
      cleanUserId = null;
      cleanDeptId = null;
    } else {
      throw new Error(`Unsupported target_scope: '${target_scope}'. Must be 'individual', 'department', 'branch', or 'company'.`);
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Check duplicate active targets (explicit application guard before DB constraint)
      let dupCheckSql = `
        SELECT id FROM sales_targets 
        WHERE tenant_id::text = $1::text 
          AND period = $2 
          AND target_scope = $3 
          AND deleted_at IS NULL 
          AND is_active = true
      `;
      const dupParams = [tenant_id, normalizedPeriod, target_scope];

      if (target_scope === 'individual') {
        dupCheckSql += ` AND user_id = $4::int`;
        dupParams.push(cleanUserId);
      } else if (target_scope === 'department') {
        dupCheckSql += ` AND department_id = $4::int`;
        dupParams.push(cleanDeptId);
      } else if (target_scope === 'branch') {
        dupCheckSql += ` AND branch_id::text = $4::text`;
        dupParams.push(String(branch_id));
      } else if (target_scope === 'company') {
        // Company targets are unique per (tenant_id, period)
      }

      const dupRes = await client.query(dupCheckSql, dupParams);
      if (dupRes.rows.length > 0) {
        const err = new Error(
          `An active target already exists for this ${target_scope} in period '${normalizedPeriod}'. Target ID: ${dupRes.rows[0].id}.`
        );
        err.statusCode = 409;
        throw err;
      }

      const insertSql = `
        INSERT INTO sales_targets (
          tenant_id, branch_id, target_scope, user_id, department_id,
          period, target_amount, commission_rate, bonus_threshold, notes, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
        RETURNING *
      `;
      const insertParams = [
        tenant_id,
        branch_id ? String(branch_id) : null,
        target_scope,
        cleanUserId,
        cleanDeptId,
        normalizedPeriod,
        parsedAmount,
        parseFloat(commission_rate) || 0,
        parseFloat(bonus_threshold) || 0,
        notes || null
      ];

      const res = await client.query(insertSql, insertParams);
      const newTarget = res.rows[0];

      // Atomic Audit Log to activities within transaction
      const auditMeta = {
        user_snapshot: {
          user_id: actor?.id || null,
          user_name: actor?.name || 'System',
          user_role: actor?.role || 'System'
        },
        changes: {
          target_scope,
          target_amount: parsedAmount,
          period: normalizedPeriod,
          user_id: cleanUserId,
          department_id: cleanDeptId,
          branch_id: branch_id || null
        }
      };

      await client.query(`
        INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, meta)
        VALUES ($1, $2, 'sales_target', $3, 'target_created', $4)
      `, [tenant_id, actor?.id || null, String(newTarget.id), JSON.stringify(auditMeta)]);

      await client.query('COMMIT');
      return newTarget;
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        err.statusCode = 409;
        err.message = `An active target already exists for this ${target_scope} in period '${normalizedPeriod}'.`;
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Updates an existing target with transactional audit trail and previous-value capture.
   *
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async updateTarget({ target_id, tenant_id, updateData, actor }) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // 1. Fetch current target state
      const existingRes = await client.query(`
        SELECT * FROM sales_targets 
        WHERE id = $1 AND tenant_id::text = $2::text AND deleted_at IS NULL AND is_active = true
        FOR UPDATE
      `, [target_id, tenant_id]);

      if (existingRes.rows.length === 0) {
        const err = new Error('Sales target not found or has been deactivated.');
        err.statusCode = 404;
        throw err;
      }

      const current = existingRes.rows[0];
      const changes = {};

      let newPeriod = current.period;
      if (updateData.period && updateData.period !== current.period) {
        newPeriod = this.normalizePeriod(updateData.period);
        this.resolvePeriodBounds(newPeriod);
        changes.period = { from: current.period, to: newPeriod };
      }

      let newAmount = current.target_amount;
      if (updateData.target_amount !== undefined && updateData.target_amount !== null) {
        const pAmount = parseFloat(updateData.target_amount);
        if (isNaN(pAmount) || pAmount <= 0) {
          throw new Error('Valid positive target amount is required.');
        }
        if (pAmount !== parseFloat(current.target_amount)) {
          changes.target_amount = { from: parseFloat(current.target_amount), to: pAmount };
          newAmount = pAmount;
        }
      }

      let newCommRate = current.commission_rate;
      if (updateData.commission_rate !== undefined && updateData.commission_rate !== null) {
        const pRate = parseFloat(updateData.commission_rate);
        if (!isNaN(pRate) && pRate !== parseFloat(current.commission_rate)) {
          changes.commission_rate = { from: parseFloat(current.commission_rate), to: pRate };
          newCommRate = pRate;
        }
      }

      let newBonusThreshold = current.bonus_threshold;
      if (updateData.bonus_threshold !== undefined && updateData.bonus_threshold !== null) {
        const pBonus = parseFloat(updateData.bonus_threshold);
        if (!isNaN(pBonus) && pBonus !== parseFloat(current.bonus_threshold)) {
          changes.bonus_threshold = { from: parseFloat(current.bonus_threshold), to: pBonus };
          newBonusThreshold = pBonus;
        }
      }

      let newNotes = updateData.notes !== undefined ? updateData.notes : current.notes;
      if (newNotes !== current.notes) {
        changes.notes = { from: current.notes, to: newNotes };
      }

      if (updateData.reason) {
        changes.reason = updateData.reason;
      }

      // Update target
      const updateRes = await client.query(`
        UPDATE sales_targets SET
          period = $1,
          target_amount = $2,
          commission_rate = $3,
          bonus_threshold = $4,
          notes = $5,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $6 AND tenant_id::text = $7::text
        RETURNING *
      `, [newPeriod, newAmount, newCommRate, newBonusThreshold, newNotes, target_id, tenant_id]);

      const updatedTarget = updateRes.rows[0];

      // Atomic Audit Log
      const auditMeta = {
        user_snapshot: {
          user_id: actor?.id || null,
          user_name: actor?.name || 'System',
          user_role: actor?.role || 'System'
        },
        changes
      };

      await client.query(`
        INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, meta)
        VALUES ($1, $2, 'sales_target', $3, 'target_updated', $4)
      `, [tenant_id, actor?.id || null, String(target_id), JSON.stringify(auditMeta)]);

      await client.query('COMMIT');
      return updatedTarget;
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        err.statusCode = 409;
        err.message = `An active target already exists for this scope in period '${newPeriod}'.`;
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Soft-deactivates an existing target, preserving audit trail and freeing the unique index
   * constraint for future replacement targets.
   *
   * @param {Object} params
   * @returns {Promise<boolean>}
   */
  async softDeleteTarget({ target_id, tenant_id, actor }) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existingRes = await client.query(`
        SELECT * FROM sales_targets 
        WHERE id = $1 AND tenant_id::text = $2::text AND deleted_at IS NULL AND is_active = true
        FOR UPDATE
      `, [target_id, tenant_id]);

      if (existingRes.rows.length === 0) {
        const err = new Error('Sales target not found or already deactivated.');
        err.statusCode = 404;
        throw err;
      }

      const target = existingRes.rows[0];

      await client.query(`
        UPDATE sales_targets SET
          is_active = false,
          deleted_at = CURRENT_TIMESTAMP,
          deleted_by = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND tenant_id::text = $3::text
      `, [actor?.id || null, target_id, tenant_id]);

      // Atomic Audit Log
      const auditMeta = {
        user_snapshot: {
          user_id: actor?.id || null,
          user_name: actor?.name || 'System',
          user_role: actor?.role || 'System'
        },
        changes: {
          action: 'deactivated',
          target_id,
          target_scope: target.target_scope,
          user_id: target.user_id,
          department_id: target.department_id,
          period: target.period,
          target_amount: parseFloat(target.target_amount)
        }
      };

      await client.query(`
        INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, meta)
        VALUES ($1, $2, 'sales_target', $3, 'target_deactivated', $4)
      `, [tenant_id, actor?.id || null, String(target_id), JSON.stringify(auditMeta)]);

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new SalesTargetService();
