/**
 * reTargetService.js — Real Estate Targets & Performance Engine
 *
 * Core domain service for managing Real Estate sales quotas and calculating
 * 3D performance metrics:
 * 1. Contracted Sales Value (قيمة العقود الموقعة) from re_contracts
 * 2. Units Sold Count (عدد الوحدات المتعاقد عليها) from re_contracts & re_units
 * 3. Actual Cash Collections (التحصيل الفعلي) from down payments and installment cash
 *
 * Implements strict isolation from General Business (zero overlap with invoices/general sales orders),
 * robust Africa/Cairo period resolution, and transparent cancellation adjustments.
 */

const db = require('../config/db');

class ReTargetService {
  /**
   * Normalizes period strings (e.g. 'Q3 2026' -> '2026-Q3', 'FY 2026' -> '2026')
   * @param {string} period
   * @returns {string}
   */
  normalizePeriod(period) {
    if (!period || typeof period !== 'string') {
      throw new Error('Target period is required and must be a string.');
    }
    const trimmed = period.trim();

    const qMatch = trimmed.match(/^Q([1-4])\s+(\d{4})$/i);
    if (qMatch) return `${qMatch[2]}-Q${qMatch[1]}`;

    const fyMatch = trimmed.match(/^FY\s+(\d{4})$/i);
    if (fyMatch) return `${fyMatch[1]}`;

    return trimmed;
  }

  /**
   * Resolves local start and end bounds in Africa/Cairo for half-open interval [startLocal, endLocal)
   * Supports:
   * - Monthly: YYYY-MM
   * - Quarterly: YYYY-Q[1-4]
   * - Yearly: YYYY
   *
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

    throw new Error(`Invalid target period format: '${periodStr}'. Expected 'YYYY-MM', 'YYYY-Q1..Q4', or 'YYYY'.`);
  }

  /**
   * Creates a new real estate target.
   *
   * @param {Object} data
   * @param {Object} actor
   * @param {Object} [client]
   * @returns {Promise<Object>}
   */
  async createTarget(data, actor, client = null) {
    const runner = client || db;
    const {
      tenant_id,
      branch_id = null,
      user_id = null,
      target_scope = 'individual',
      period,
      target_amount = 0,
      target_units = 0,
      commission_rate = 0,
      notes = null
    } = data;

    if (!tenant_id || !period) {
      const err = new Error('tenant_id and period are required.');
      err.statusCode = 400;
      throw err;
    }

    if (target_scope === 'individual' && !user_id) {
      const err = new Error('user_id is required for individual target scope.');
      err.statusCode = 400;
      throw err;
    }

    if (target_scope === 'branch' && !branch_id) {
      const err = new Error('branch_id is required for branch target scope.');
      err.statusCode = 400;
      throw err;
    }

    const { normalizedPeriod, periodType } = this.resolvePeriodBounds(period);
    const numAmount = parseFloat(target_amount) || 0;
    const numUnits = parseInt(target_units, 10) || 0;
    const numCommRate = parseFloat(commission_rate) || 0;

    if (numAmount < 0 || numUnits < 0) {
      const err = new Error('Target amount and units count must be non-negative.');
      err.statusCode = 400;
      throw err;
    }

    const sql = `
      INSERT INTO re_targets (
        tenant_id, branch_id, user_id, target_scope, period, period_type,
        target_amount, target_units, commission_rate, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    try {
      const res = await runner.query(sql, [
        tenant_id,
        branch_id ? String(branch_id) : null,
        user_id ? parseInt(user_id, 10) : null,
        target_scope,
        normalizedPeriod,
        periodType,
        numAmount,
        numUnits,
        numCommRate,
        notes,
        actor?.id || null
      ]);

      const created = res.rows[0];

      // Audit log
      await runner.query(`
        INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, meta)
        VALUES ($1, $2, 're_target', $3, 'target_created', $4)
      `, [tenant_id, actor?.id || null, String(created.id), JSON.stringify({ period: normalizedPeriod, target_amount: numAmount, target_units: numUnits })]);

      return created;
    } catch (err) {
      if (err.code === '23505') {
        const conflictErr = new Error(`An active target already exists for this scope and period (${normalizedPeriod}).`);
        conflictErr.statusCode = 409;
        throw conflictErr;
      }
      throw err;
    }
  }

  /**
   * Updates an existing real estate target.
   *
   * @param {number} id
   * @param {Object} data
   * @param {Object} actor
   * @param {Object} [client]
   * @returns {Promise<Object>}
   */
  async updateTarget(id, data, actor, client = null) {
    const runner = client || db;
    const { target_amount, target_units, commission_rate, notes } = data;

    const targetRes = await runner.query('SELECT * FROM re_targets WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (targetRes.rows.length === 0) {
      const err = new Error(`Target #${id} not found.`);
      err.statusCode = 404;
      throw err;
    }

    const current = targetRes.rows[0];
    const newAmount = target_amount !== undefined ? parseFloat(target_amount) : current.target_amount;
    const newUnits = target_units !== undefined ? parseInt(target_units, 10) : current.target_units;
    const newRate = commission_rate !== undefined ? parseFloat(commission_rate) : current.commission_rate;
    const newNotes = notes !== undefined ? notes : current.notes;

    const res = await runner.query(`
      UPDATE re_targets SET
        target_amount = $1,
        target_units = $2,
        commission_rate = $3,
        notes = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [newAmount, newUnits, newRate, newNotes, id]);

    return res.rows[0];
  }

  /**
   * Soft-deletes a real estate target.
   *
   * @param {number} id
   * @param {Object} actor
   * @param {Object} [client]
   * @returns {Promise<Object>}
   */
  async deleteTarget(id, actor, client = null) {
    const runner = client || db;
    const res = await runner.query(`
      UPDATE re_targets SET
        deleted_at = CURRENT_TIMESTAMP,
        deleted_by = $1,
        is_active = false,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING *
    `, [actor?.id || null, id]);

    if (res.rows.length === 0) {
      const err = new Error(`Target #${id} not found.`);
      err.statusCode = 404;
      throw err;
    }

    return res.rows[0];
  }

  /**
   * Queries real estate targets and computes 3D performance metrics for each.
   *
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async getTargetsWithProgress({ tenant_id, branch_id = null, period = null, user_id = null, target_scope = null, client = null }) {
    const runner = client || db;

    let sql = `
      SELECT rt.*, u.name as salesman_name, u.email as salesman_email
      FROM re_targets rt
      LEFT JOIN users u ON rt.user_id = u.id
      WHERE rt.tenant_id::text = $1::text
        AND rt.deleted_at IS NULL
        AND rt.is_active = true
    `;
    const params = [tenant_id];

    if (branch_id) {
      params.push(String(branch_id));
      sql += ` AND (rt.branch_id::text = $${params.length}::text OR rt.target_scope = 'company')`;
    }
    if (period && period !== 'All Periods') {
      const normalized = this.normalizePeriod(period);
      params.push(normalized);
      sql += ` AND rt.period = $${params.length}`;
    }
    if (user_id) {
      params.push(parseInt(user_id, 10));
      sql += ` AND rt.user_id = $${params.length}`;
    }
    if (target_scope) {
      params.push(target_scope);
      sql += ` AND rt.target_scope = $${params.length}`;
    }

    sql += ` ORDER BY rt.created_at DESC`;
    const targetsRes = await runner.query(sql, params);

    const enriched = [];
    for (const target of targetsRes.rows) {
      const bounds = this.resolvePeriodBounds(target.period);
      const metrics = await this.calculateProgressForTarget(target, bounds, runner);
      enriched.push({
        ...target,
        ...metrics
      });
    }

    return enriched;
  }

  /**
   * Internal calculator: Computes 3D metrics for a specific target.
   *
   * @param {Object} target
   * @param {Object} bounds
   * @param {Object} runner
   * @returns {Promise<Object>}
   */
  async calculateProgressForTarget(target, bounds, runner) {
    const { tenant_id, branch_id, user_id, target_scope, target_amount, target_units } = target;
    const { startLocal, endLocal, timezone } = bounds;

    // Scope conditions for re_contracts & deals
    let repScopeClause = '';
    const queryParams = [tenant_id, startLocal, endLocal];

    if (target_scope === 'individual') {
      queryParams.push(user_id);
      repScopeClause = `AND d.assigned_to::text = $${queryParams.length}::text`;
    } else if (target_scope === 'branch') {
      queryParams.push(String(branch_id));
      repScopeClause = `AND rc.branch_id::text = $${queryParams.length}::text`;
    }
    // company scope has no additional rep/branch restriction

    // 1. Metric 1 & 2: Contracted Value & Units Count
    // Fetch all contracts signed in this period with cancellation metadata
    const contractsSql = `
      SELECT
        rc.id, rc.contract_value, rc.unit_id, rc.status as contract_status,
        canc.created_at as cancelled_at
      FROM re_contracts rc
      JOIN deals d ON rc.deal_id = d.id AND d.tenant_id::text = rc.tenant_id::text
      LEFT JOIN re_cancellations canc ON (canc.contract_id = rc.id OR canc.deal_id = d.id) AND canc.tenant_id::text = rc.tenant_id::text
      WHERE rc.tenant_id::text = $1::text
        AND (rc.contract_date AT TIME ZONE '${timezone}' >= $2::timestamp
         AND rc.contract_date AT TIME ZONE '${timezone}' < $3::timestamp)
        ${repScopeClause}
    `;
    const cRes = await runner.query(contractsSql, queryParams);

    let grossContractsValue = 0;
    const activeUnits = new Set();
    let eligibleContractsCount = 0;

    cRes.rows.forEach(c => {
      // Contract is active if status in ('Signed', 'Active', 'Completed')
      // If status is 'Cancelled':
      // - If cancelled during this period (cancelled_at < endLocal), exclude from achievement (same-period cancellation)
      // - If cancelled after this period ended (cancelled_at >= endLocal), historical achievement of closed period is preserved!
      const isSamePeriodCancelled = c.contract_status === 'Cancelled' &&
        (!c.cancelled_at || new Date(c.cancelled_at).toISOString() < new Date(endLocal).toISOString());

      if (['Signed', 'Active', 'Completed'].includes(c.contract_status) || (!isSamePeriodCancelled && c.contract_status === 'Cancelled')) {
        grossContractsValue += parseFloat(c.contract_value) || 0;
        if (c.unit_id) activeUnits.add(c.unit_id);
        eligibleContractsCount++;
      }
    });

    // 2. Cancellations occurred during this period:
    // Separate same-period cancellations from prior-period cancellation settlements (deductions)
    const cancelSql = `
      SELECT
        canc.id, canc.total_paid_amount, canc.deduction_amount, canc.refundable_amount,
        rc.contract_value, rc.contract_date
      FROM re_cancellations canc
      JOIN deals d ON canc.deal_id = d.id AND d.tenant_id::text = canc.tenant_id::text
      LEFT JOIN re_contracts rc ON canc.contract_id = rc.id AND rc.tenant_id::text = canc.tenant_id::text
      WHERE canc.tenant_id::text = $1::text
        AND (canc.created_at AT TIME ZONE '${timezone}' >= $2::timestamp
         AND canc.created_at AT TIME ZONE '${timezone}' < $3::timestamp)
        ${repScopeClause}
    `;
    const cancelRes = await runner.query(cancelSql, queryParams);

    let samePeriodCancellationsCount = 0;
    let priorPeriodCancellationsCount = 0;
    let priorPeriodCancellationsValue = 0;
    let cancelledPaidAmount = 0;

    cancelRes.rows.forEach(canc => {
      cancelledPaidAmount += parseFloat(canc.total_paid_amount) || 0;
      const isPriorPeriod = canc.contract_date && (new Date(canc.contract_date).toISOString() < new Date(startLocal).toISOString());
      if (isPriorPeriod) {
        priorPeriodCancellationsCount++;
        priorPeriodCancellationsValue += parseFloat(canc.contract_value) || 0;
      } else {
        samePeriodCancellationsCount++;
      }
    });

    // True Net Contracts Value: Reflects actual business performance including deficits if cancellations exceed new sales
    const netContractsValue = Number((grossContractsValue - priorPeriodCancellationsValue).toFixed(2));

    // 3. Metric 3: Actual Cash Collected (Strict Actual Payments Only — Zero Ghost Collections, Zero Double Counting)
    // A. Installments paid in period (includes installment #0 for down payments, and periodic installments #1..N)
    const installmentsSql = `
      SELECT
        COALESCE(SUM(CASE WHEN ri.installment_type = 'down_payment' OR ri.installment_number = 0 THEN ri.paid_amount ELSE 0 END), 0) as down_payment_installments,
        COALESCE(SUM(CASE WHEN ri.installment_type != 'down_payment' AND ri.installment_number > 0 THEN ri.paid_amount ELSE 0 END), 0) as periodic_installments,
        COALESCE(SUM(ri.paid_amount), 0) as total_installments_paid
      FROM re_installments ri
      JOIN re_contracts rc ON ri.contract_id = rc.id AND rc.tenant_id::text = ri.tenant_id::text
      JOIN deals d ON rc.deal_id = d.id AND d.tenant_id::text = rc.tenant_id::text
      WHERE ri.tenant_id::text = $1::text
        AND ri.paid_amount > 0
        AND ri.status IN ('Paid', 'Partially Paid', 'Partial')
        AND (COALESCE(ri.paid_at, ri.updated_at) AT TIME ZONE '${timezone}' >= $2::timestamp
         AND COALESCE(ri.paid_at, ri.updated_at) AT TIME ZONE '${timezone}' < $3::timestamp)
        ${repScopeClause}
    `;
    const instRes = await runner.query(installmentsSql, queryParams);
    const downPaymentInstallments = parseFloat(instRes.rows[0]?.down_payment_installments) || 0;
    const periodicInstallments = parseFloat(instRes.rows[0]?.periodic_installments) || 0;

    // B. Direct contract/deal receipt vouchers that are NOT tied to an installment (installment_id IS NULL)
    // Strictly joins to deals & contracts of this tenant, enforces period bounds, rep scope, and branch
    const directVouchersSql = `
      SELECT COALESCE(SUM(fv.amount), 0) as direct_receipts
      FROM finance_vouchers fv
      JOIN deals d ON (
        (fv.deal_id IS NOT NULL AND fv.deal_id::text = d.id::text) OR
        (fv.contract_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM re_contracts rc_sub
          WHERE rc_sub.id::text = fv.contract_id::text AND rc_sub.deal_id = d.id
        ))
      ) AND d.tenant_id::text = fv.tenant_id::text
      LEFT JOIN re_contracts rc ON d.id = rc.deal_id AND rc.tenant_id::text = fv.tenant_id::text
      WHERE fv.tenant_id::text = $1::text
        AND fv.voucher_type = 'receipt'
        AND COALESCE(fv.status, 'active') NOT IN ('cancelled', 'reversed')
        AND fv.installment_id IS NULL
        AND (COALESCE(fv.voucher_date, fv.created_at) AT TIME ZONE '${timezone}' >= $2::timestamp
         AND COALESCE(fv.voucher_date, fv.created_at) AT TIME ZONE '${timezone}' < $3::timestamp)
        ${repScopeClause}
    `;
    let directReceipts = 0;
    try {
      const dvRes = await runner.query(directVouchersSql, queryParams);
      directReceipts = parseFloat(dvRes.rows[0]?.direct_receipts) || 0;
    } catch (vErr) {
      directReceipts = 0;
    }

    const totalActualDownPayment = Number((downPaymentInstallments + directReceipts).toFixed(2));
    const totalActualInstallments = Number(periodicInstallments.toFixed(2));
    const achievedCashCollected = Number((totalActualDownPayment + totalActualInstallments).toFixed(2));

    // Percentages based on net contract value
    const quotaAmount = parseFloat(target_amount) || 0;
    const quotaUnits = parseInt(target_units, 10) || 0;

    const contractsAchievementPct = quotaAmount > 0
      ? Number(((netContractsValue / quotaAmount) * 100).toFixed(2))
      : 0;

    const unitsAchievementPct = quotaUnits > 0
      ? Number(((activeUnits.size / quotaUnits) * 100).toFixed(2))
      : 0;

    return {
      achieved_contracts_value: netContractsValue,
      gross_contracts_value: grossContractsValue,
      prior_cancellations_deduction_value: priorPeriodCancellationsValue,
      prior_cancellations_count: priorPeriodCancellationsCount,
      achieved_units_count: activeUnits.size,
      achieved_collected_amount: achievedCashCollected,
      down_payment_total: totalActualDownPayment,
      installments_paid_total: totalActualInstallments,
      contracts_count: eligibleContractsCount,
      cancellations_count: cancelRes.rows.length,
      same_period_cancellations_count: samePeriodCancellationsCount,
      contracts_achievement_pct: contractsAchievementPct,
      units_achievement_pct: unitsAchievementPct
    };
  }

  /**
   * Returns granular drill-down details for the "عرض الأداء" (Salesman Performance Detail) drawer.
   *
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async getSalesmanPerformanceDetail({ tenant_id, user_id, period, branch_id = null, client = null }) {
    const runner = client || db;
    const bounds = this.resolvePeriodBounds(period);
    const { startLocal, endLocal, timezone } = bounds;

    // 1. Fetch user info
    const userRes = await runner.query('SELECT id, name, email, role, department_id FROM users WHERE id = $1 AND tenant_id::text = $2::text', [user_id, tenant_id]);
    if (userRes.rows.length === 0) {
      const err = new Error(`Salesman #${user_id} not found.`);
      err.statusCode = 404;
      throw err;
    }
    const salesman = userRes.rows[0];

    // 2. Fetch Target
    const targetRes = await runner.query(`
      SELECT * FROM re_targets
      WHERE tenant_id::text = $1::text
        AND user_id = $2
        AND period = $3
        AND deleted_at IS NULL
        AND is_active = true
      LIMIT 1
    `, [tenant_id, user_id, bounds.normalizedPeriod]);

    const target = targetRes.rows[0] || null;

    // 3. Fetch Contracts signed in period (with cancellation metadata)
    const contractsRes = await runner.query(`
      SELECT
        rc.id, rc.contract_number, rc.contract_value, rc.down_payment,
        rc.contract_date, rc.status as contract_status,
        c.name as customer_name, c.phone as customer_phone,
        ru.unit_number, ru.project_name, ru.type as unit_type,
        canc.created_at as cancelled_at, canc.cancellation_reason
      FROM re_contracts rc
      JOIN deals d ON rc.deal_id = d.id AND d.tenant_id::text = rc.tenant_id::text
      LEFT JOIN customers c ON rc.customer_id = c.id
      LEFT JOIN re_units ru ON rc.unit_id::text = ru.id::text AND ru.tenant_id::text = rc.tenant_id::text
      LEFT JOIN re_cancellations canc ON (canc.contract_id = rc.id OR canc.deal_id = d.id) AND canc.tenant_id::text = rc.tenant_id::text
      WHERE rc.tenant_id::text = $1::text
        AND d.assigned_to::text = $2::text
        AND (rc.contract_date AT TIME ZONE '${timezone}' >= $3::timestamp
         AND rc.contract_date AT TIME ZONE '${timezone}' < $4::timestamp)
      ORDER BY rc.contract_date DESC
    `, [tenant_id, String(user_id), startLocal, endLocal]);

    // Filter active contributing contracts: exclude same-period cancellations, keep closed-period ones
    const activeContracts = [];
    let grossContractValue = 0;
    const unitsContracted = new Set();

    contractsRes.rows.forEach(c => {
      const isSamePeriodCancelled = c.contract_status === 'Cancelled' &&
        (!c.cancelled_at || new Date(c.cancelled_at).toISOString() < new Date(endLocal).toISOString());

      if (['Signed', 'Active', 'Completed'].includes(c.contract_status) || (!isSamePeriodCancelled && c.contract_status === 'Cancelled')) {
        activeContracts.push(c);
        grossContractValue += parseFloat(c.contract_value) || 0;
        if (c.unit_number) unitsContracted.add(c.unit_number);
      }
    });

    // 4. Fetch Active Reservations assigned to this rep
    const reservationsRes = await runner.query(`
      SELECT id, name, unit_number, project_name, type, price, status, reservation_expires_at
      FROM re_units
      WHERE tenant_id::text = $1::text
        AND assigned_to::text = $2::text
        AND status = 'Reserved'
      ORDER BY created_at DESC
    `, [tenant_id, String(user_id)]);

    // 5. Fetch Granular Actual Collections (Installments + Direct Vouchers)
    const collections = [];

    // A. Paid installments
    const instDetailRes = await runner.query(`
      SELECT
        ri.id as installment_id,
        ri.installment_number,
        ri.installment_type,
        ri.paid_amount as amount,
        COALESCE(ri.paid_at, ri.updated_at) as payment_date,
        ri.status as payment_status,
        rc.contract_number,
        c.name as customer_name,
        ru.project_name,
        ru.unit_number,
        fv.voucher_number,
        COALESCE(fv.payment_method, 'cash') as payment_method
      FROM re_installments ri
      JOIN re_contracts rc ON ri.contract_id = rc.id AND rc.tenant_id::text = ri.tenant_id::text
      JOIN deals d ON rc.deal_id = d.id AND d.tenant_id::text = rc.tenant_id::text
      LEFT JOIN customers c ON rc.customer_id = c.id
      LEFT JOIN re_units ru ON rc.unit_id::text = ru.id::text AND ru.tenant_id::text = rc.tenant_id::text
      LEFT JOIN finance_vouchers fv ON ri.last_voucher_id = fv.id
      WHERE ri.tenant_id::text = $1::text
        AND d.assigned_to::text = $2::text
        AND ri.paid_amount > 0
        AND ri.status IN ('Paid', 'Partially Paid', 'Partial')
        AND (COALESCE(ri.paid_at, ri.updated_at) AT TIME ZONE '${timezone}' >= $3::timestamp
         AND COALESCE(ri.paid_at, ri.updated_at) AT TIME ZONE '${timezone}' < $4::timestamp)
      ORDER BY payment_date DESC, ri.id DESC
    `, [tenant_id, String(user_id), startLocal, endLocal]);

    instDetailRes.rows.forEach(row => {
      const isDownPayment = row.installment_type === 'down_payment' || row.installment_number === 0;
      collections.push({
        id: `inst-${row.installment_id}`,
        collection_type: isDownPayment ? 'down_payment' : 'installment',
        collection_type_label: isDownPayment ? 'دفعة مقدمة' : `قسط #${row.installment_number}`,
        reference_number: row.voucher_number || `قسط #${row.installment_number}`,
        contract_number: row.contract_number,
        project_name: row.project_name || '—',
        unit_number: row.unit_number || '—',
        customer_name: row.customer_name || '—',
        amount: parseFloat(row.amount) || 0,
        payment_date: row.payment_date,
        payment_method: row.payment_method,
        status: row.payment_status
      });
    });

    // B. Direct receipt vouchers where installment_id is NULL
    try {
      const fvDetailRes = await runner.query(`
        SELECT
          fv.id as voucher_id,
          fv.voucher_number,
          fv.amount,
          COALESCE(fv.voucher_date, fv.created_at) as payment_date,
          COALESCE(fv.payment_method, 'cash') as payment_method,
          rc.contract_number,
          c.name as customer_name,
          ru.project_name,
          ru.unit_number
        FROM finance_vouchers fv
        JOIN deals d ON (
          (fv.deal_id IS NOT NULL AND fv.deal_id::text = d.id::text) OR
          (fv.contract_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM re_contracts rc_sub
            WHERE rc_sub.id::text = fv.contract_id::text AND rc_sub.deal_id = d.id
          ))
        ) AND d.tenant_id::text = fv.tenant_id::text
        LEFT JOIN re_contracts rc ON d.id = rc.deal_id AND rc.tenant_id::text = fv.tenant_id::text
        LEFT JOIN customers c ON COALESCE(rc.customer_id, d.client_id) = c.id
        LEFT JOIN re_units ru ON COALESCE(rc.unit_id, d.unit_id)::text = ru.id::text AND ru.tenant_id::text = fv.tenant_id::text
        WHERE fv.tenant_id::text = $1::text
          AND d.assigned_to::text = $2::text
          AND fv.voucher_type = 'receipt'
          AND COALESCE(fv.status, 'active') NOT IN ('cancelled', 'reversed')
          AND fv.installment_id IS NULL
          AND (COALESCE(fv.voucher_date, fv.created_at) AT TIME ZONE '${timezone}' >= $3::timestamp
           AND COALESCE(fv.voucher_date, fv.created_at) AT TIME ZONE '${timezone}' < $4::timestamp)
        ORDER BY payment_date DESC, fv.id DESC
      `, [tenant_id, String(user_id), startLocal, endLocal]);

      fvDetailRes.rows.forEach(row => {
        collections.push({
          id: `fv-${row.voucher_id}`,
          collection_type: 'direct_receipt',
          collection_type_label: 'سند قبض مباشر',
          reference_number: row.voucher_number,
          contract_number: row.contract_number,
          project_name: row.project_name || '—',
          unit_number: row.unit_number || '—',
          customer_name: row.customer_name || '—',
          amount: parseFloat(row.amount) || 0,
          payment_date: row.payment_date,
          payment_method: row.payment_method,
          status: 'Paid'
        });
      });
    } catch (vErr) {
      // Ignore if table/columns don't exist
    }

    // Sort collections descending by date
    collections.sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));

    // 6. Fetch Cancellations & Settlements occurred during this period
    const cancelRes = await runner.query(`
      SELECT
        canc.id, canc.total_paid_amount, canc.deduction_amount, canc.refundable_amount,
        canc.cancellation_reason, canc.created_at as cancelled_at,
        rc.contract_number, rc.contract_value, rc.contract_date,
        c.name as customer_name, ru.project_name, ru.unit_number
      FROM re_cancellations canc
      JOIN deals d ON canc.deal_id = d.id AND d.tenant_id::text = canc.tenant_id::text
      LEFT JOIN re_contracts rc ON canc.contract_id = rc.id AND rc.tenant_id::text = canc.tenant_id::text
      LEFT JOIN customers c ON rc.customer_id = c.id
      LEFT JOIN re_units ru ON canc.unit_id::text = ru.id::text AND ru.tenant_id::text = canc.tenant_id::text
      WHERE canc.tenant_id::text = $1::text
        AND d.assigned_to::text = $2::text
        AND (canc.created_at AT TIME ZONE '${timezone}' >= $3::timestamp
         AND canc.created_at AT TIME ZONE '${timezone}' < $4::timestamp)
      ORDER BY canc.created_at DESC
    `, [tenant_id, String(user_id), startLocal, endLocal]);

    let priorPeriodDeduction = 0;
    const cancellationsList = cancelRes.rows.map(row => {
      const isPriorPeriod = row.contract_date && (new Date(row.contract_date).toISOString() < new Date(startLocal).toISOString());
      if (isPriorPeriod) {
        priorPeriodDeduction += parseFloat(row.contract_value) || 0;
      }
      return {
        id: row.id,
        contract_number: row.contract_number || '—',
        contract_value: parseFloat(row.contract_value) || 0,
        contract_date: row.contract_date,
        cancelled_at: row.cancelled_at,
        cancellation_reason: row.cancellation_reason,
        total_paid_amount: parseFloat(row.total_paid_amount) || 0,
        deduction_amount: parseFloat(row.deduction_amount) || 0,
        refundable_amount: parseFloat(row.refundable_amount) || 0,
        customer_name: row.customer_name || '—',
        project_name: row.project_name || '—',
        unit_number: row.unit_number || '—',
        is_prior_period: isPriorPeriod,
        settlement_type_label: isPriorPeriod ? 'تسوية إلغاء فترة سابقة' : 'إلغاء في نفس الفترة'
      };
    });

    // 7. Compute summary totals
    // True Net Contracts Value: Unclamped so managers can see real deficits if prior cancellations exceed sales
    const netContractValue = Number((grossContractValue - priorPeriodDeduction).toFixed(2));
    const totalCollectedAmount = collections.reduce((sum, col) => sum + col.amount, 0);
    const downPaymentCollected = collections
      .filter(col => col.collection_type === 'down_payment' || col.collection_type === 'direct_receipt')
      .reduce((sum, col) => sum + col.amount, 0);
    const installmentsCollected = collections
      .filter(col => col.collection_type === 'installment')
      .reduce((sum, col) => sum + col.amount, 0);

    const targetQuota = target ? parseFloat(target.target_amount) : 0;
    const targetUnits = target ? parseInt(target.target_units, 10) : 0;

    return {
      salesman: {
        id: salesman.id,
        name: salesman.name,
        email: salesman.email,
        role: salesman.role
      },
      period: bounds.normalizedPeriod,
      target: target ? {
        id: target.id,
        target_amount: targetQuota,
        target_units: targetUnits,
        commission_rate: parseFloat(target.commission_rate) || 0
      } : null,
      summary: {
        gross_contract_value: grossContractValue,
        prior_cancellations_deduction_value: priorPeriodDeduction,
        total_contract_value: netContractValue,
        units_contracted_count: unitsContracted.size,
        total_collected_amount: Number(totalCollectedAmount.toFixed(2)),
        total_down_payment: Number(downPaymentCollected.toFixed(2)),
        total_installments_collected: Number(installmentsCollected.toFixed(2)),
        active_reservations_count: reservationsRes.rows.length,
        cancellations_count: cancellationsList.length,
        contracts_achievement_pct: targetQuota > 0 ? Number(((netContractValue / targetQuota) * 100).toFixed(2)) : 0,
        units_achievement_pct: targetUnits > 0 ? Number(((unitsContracted.size / targetUnits) * 100).toFixed(2)) : 0
      },
      contracts: activeContracts,
      reservations: reservationsRes.rows,
      collections: collections,
      cancellations: cancellationsList
    };
  }

  /**
   * Fetches sales personnel for real estate assignments.
   *
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async getSalesmen({ tenant_id, branch_id = null, client = null }) {
    const runner = client || db;
    let sql = `
      SELECT id, name, email, role, department_id, branch_id
      FROM users
      WHERE tenant_id::text = $1::text
        AND role IN ('sales', 'agent', 'employee', 'manager', 'supervisor')
        AND is_working = true
    `;
    const params = [tenant_id];

    if (branch_id) {
      params.push(String(branch_id));
      sql += ` AND (branch_id::text = $${params.length}::text OR branch_id IS NULL)`;
    }

    sql += ` ORDER BY name ASC`;
    const res = await runner.query(sql, params);
    return res.rows;
  }
}

module.exports = new ReTargetService();
