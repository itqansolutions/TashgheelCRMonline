/**
 * salesCommissionService.js — Phase 3.3C: Sales Commissions & Earnings Lifecycle
 *
 * Implements:
 * 1. Cash Collection Basis per-payment commission accruals with immutable snapshots.
 * 2. Deduplication via database-level uniqueness.
 * 3. Monthly durable settlements with target achievement and single-tier fixed cash bonus.
 * 4. Segregation of Duties (SoD) approval workflows.
 * 5. Native integration with Finance/Treasury payment vouchers without balance mutation.
 * 6. Audit logging into activities table.
 * 7. 100% isolation from Real Estate workflows (unit_id IS NULL).
 */

const db = require('../config/db');
const { generateVoucherNumber } = require('../controllers/financeController');

class SalesCommissionService {
  /**
   * Resolves the monthly period string ('YYYY-MM') for a given date in Africa/Cairo.
   *
   * @param {Date|string} date
   * @returns {string} e.g. '2026-10'
   */
  resolvePeriod(date) {
    const d = date ? new Date(date) : new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit'
    });
    const parts = formatter.formatToParts(d);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    return `${year}-${month}`;
  }

  /**
   * Creates or updates a commission rule.
   *
   * @param {Object} ruleData
   * @param {Object} actor
   * @param {Object} [client]
   * @returns {Promise<Object>}
   */
  async createRule(ruleData, actor, client = null) {
    const runner = client || db;
    const {
      tenant_id,
      branch_id = null,
      name,
      base_rate,
      effective_from,
      effective_to = null,
      is_active = true
    } = ruleData;

    if (!name || base_rate === undefined || !effective_from) {
      const err = new Error('Name, base_rate, and effective_from are required.');
      err.statusCode = 400;
      throw err;
    }

    const rateNum = parseFloat(base_rate);
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
      const err = new Error('base_rate must be a valid percentage between 0 and 100.');
      err.statusCode = 400;
      throw err;
    }

    const sql = `
      INSERT INTO sales_commission_rules (
        tenant_id, branch_id, name, base_rate, effective_from, effective_to, is_active, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const res = await runner.query(sql, [
      tenant_id,
      branch_id ? String(branch_id) : null,
      name,
      rateNum,
      effective_from,
      effective_to || null,
      is_active,
      actor?.id || null
    ]);

    const created = res.rows[0];

    // Log to activities
    await runner.query(`
      INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, meta)
      VALUES ($1, $2, 'commission_rule', $3, 'rule_created', $4)
    `, [tenant_id, actor?.id || null, String(created.id), JSON.stringify({ name, base_rate: rateNum, effective_from })]);

    return created;
  }

  /**
   * Sets bonus tiers for a commission rule.
   *
   * @param {number} rule_id
   * @param {string} tenant_id
   * @param {Array} tiers
   * @param {Object} [client]
   * @returns {Promise<Array>}
   */
  async setRuleTiers(rule_id, tenant_id, tiers, client = null) {
    const runner = client || db;

    // Validate non-overlapping tiers
    tiers.sort((a, b) => a.min_achievement_pct - b.min_achievement_pct);
    for (let i = 0; i < tiers.length; i++) {
      const cur = tiers[i];
      if (cur.min_achievement_pct < 0 || cur.bonus_amount < 0) {
        const err = new Error('Tier minimum achievement and bonus amount must be non-negative.');
        err.statusCode = 400;
        throw err;
      }
      if (cur.max_achievement_pct !== null && cur.max_achievement_pct !== undefined) {
        if (cur.max_achievement_pct <= cur.min_achievement_pct) {
          const err = new Error('max_achievement_pct must be strictly greater than min_achievement_pct.');
          err.statusCode = 400;
          throw err;
        }
      }
      if (i > 0) {
        const prev = tiers[i - 1];
        if (prev.max_achievement_pct && cur.min_achievement_pct < prev.max_achievement_pct) {
          const err = new Error('Bonus tiers cannot overlap.');
          err.statusCode = 400;
          throw err;
        }
      }
    }

    await runner.query('DELETE FROM sales_commission_tiers WHERE rule_id = $1 AND tenant_id::text = $2::text', [rule_id, tenant_id]);

    const createdTiers = [];
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      const res = await runner.query(`
        INSERT INTO sales_commission_tiers (
          tenant_id, rule_id, min_achievement_pct, max_achievement_pct, bonus_amount, tier_order
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [tenant_id, rule_id, t.min_achievement_pct, t.max_achievement_pct || null, t.bonus_amount, i + 1]);
      createdTiers.push(res.rows[0]);
    }

    return createdTiers;
  }

  /**
   * Retrieves the applicable active commission rule for a given payment date and branch.
   *
   * @param {string} tenant_id
   * @param {string|null} branch_id
   * @param {Date|string} date
   * @param {Object} [client]
   * @returns {Promise<Object|null>}
   */
  async getApplicableRule(tenant_id, branch_id, date, client = null) {
    const runner = client || db;
    const dateStr = (date instanceof Date ? date : new Date(date)).toISOString().split('T')[0];

    const sql = `
      SELECT * FROM sales_commission_rules
      WHERE tenant_id::text = $1::text
        AND is_active = true
        AND (
          CASE
            WHEN $2::text IS NOT NULL THEN (branch_id::text = $2::text OR branch_id IS NULL)
            ELSE branch_id IS NULL
          END
        )
        AND effective_from <= $3::date
        AND (effective_to IS NULL OR effective_to >= $3::date)
      ORDER BY 
        (CASE WHEN branch_id IS NOT NULL THEN 0 ELSE 1 END),
        effective_from DESC,
        id DESC
      LIMIT 1
    `;
    const res = await runner.query(sql, [tenant_id, branch_id ? String(branch_id) : null, dateStr]);
    return res.rows[0] || null;
  }

  /**
   * Accrues commission for an eligible payment transaction inside a managed transaction.
   * Idempotent: duplicate calls for the same payment return the existing accrual.
   *
   * @param {number} payment_id
   * @param {string} tenant_id
   * @param {Object} [client]
   * @returns {Promise<Object>}
   */
  async accruePaymentCommission(payment_id, tenant_id, client = null) {
    const ownsTransaction = !client;
    const runner = client || (await db.connect());

    try {
      if (ownsTransaction) await runner.query('BEGIN');

      // 1. Fetch payment with invoice, order, and deal details
      const payRes = await runner.query(`
        SELECT 
          p.id as payment_id,
          p.amount as payment_amount,
          p.status as payment_status,
          p.cancelled_at as payment_cancelled_at,
          p.payment_date,
          p.created_at as payment_created_at,
          p.tenant_id,
          p.branch_id,
          i.id as invoice_id,
          i.status as invoice_status,
          i.unit_id as invoice_unit_id,
          so.id as sales_order_id,
          so.assigned_to as so_assigned_to,
          d.id as deal_id,
          d.unit_id as deal_unit_id,
          d.assigned_to as deal_assigned_to
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        LEFT JOIN sales_orders so ON i.sales_order_id = so.id::text
        LEFT JOIN deals d ON i.deal_id = d.id::text
        WHERE p.id = $1 AND p.tenant_id::text = $2::text
        FOR UPDATE OF p
      `, [payment_id, tenant_id]);

      if (payRes.rows.length === 0) {
        if (ownsTransaction) await runner.query('ROLLBACK');
        const err = new Error(`Payment #${payment_id} not found.`);
        err.statusCode = 404;
        throw err;
      }

      const row = payRes.rows[0];

      // Eligibility validations:
      // A. Payment must be active and not cancelled
      if (row.payment_status === 'cancelled' || row.payment_cancelled_at !== null) {
        if (ownsTransaction) await runner.query('ROLLBACK');
        return { skipped: true, reason: 'Payment is cancelled or reversed.' };
      }

      // B. Invoice must not be cancelled
      if (row.invoice_status === 'cancelled') {
        if (ownsTransaction) await runner.query('ROLLBACK');
        return { skipped: true, reason: 'Invoice is cancelled.' };
      }

      // C. Real Estate isolation: unit_id MUST be null on invoice and deal
      if (row.invoice_unit_id || row.deal_unit_id) {
        if (ownsTransaction) await runner.query('ROLLBACK');
        return { skipped: true, reason: 'Real estate transaction excluded.' };
      }

      // D. Attribution hierarchy: so.assigned_to > d.assigned_to
      let beneficiaryUserId = null;
      let attributionSource = null;

      if (row.so_assigned_to) {
        beneficiaryUserId = parseInt(row.so_assigned_to, 10);
        attributionSource = 'sales_order';
      } else if (row.deal_assigned_to) {
        beneficiaryUserId = parseInt(row.deal_assigned_to, 10);
        attributionSource = 'deal';
      }

      if (!beneficiaryUserId) {
        // Standalone house sales without assigned salesperson do not generate individual commissions
        if (ownsTransaction) await runner.query('ROLLBACK');
        return { skipped: true, reason: 'Standalone house sale: no individual salesperson assigned.' };
      }

      // Fetch beneficiary name
      const userRes = await runner.query('SELECT id, name FROM users WHERE id = $1', [beneficiaryUserId]);
      if (userRes.rows.length === 0) {
        if (ownsTransaction) await runner.query('ROLLBACK');
        return { skipped: true, reason: 'Beneficiary user not found.' };
      }
      const beneficiaryName = userRes.rows[0].name;

      // Check existing active accrual for idempotency
      const existingRes = await runner.query(`
        SELECT * FROM sales_commissions
        WHERE tenant_id::text = $1::text
          AND payment_id = $2
          AND beneficiary_user_id = $3
          AND status != 'cancelled'
          AND adjustment_of_id IS NULL
      `, [tenant_id, payment_id, beneficiaryUserId]);

      if (existingRes.rows.length > 0) {
        if (ownsTransaction) await runner.query('COMMIT');
        return { skipped: false, existing: true, data: existingRes.rows[0] };
      }

      // E. Resolve applicable rule & rate
      const effectiveDate = row.payment_date || row.payment_created_at || new Date();
      const period = this.resolvePeriod(effectiveDate);
      const rule = await this.getApplicableRule(tenant_id, row.branch_id, effectiveDate, runner);

      let appliedRate = 0;
      let ruleSnapshot = null;
      let ruleId = null;

      if (rule) {
        appliedRate = parseFloat(rule.base_rate);
        ruleId = rule.id;
        ruleSnapshot = { id: rule.id, name: rule.name, base_rate: appliedRate };
      } else {
        // Fallback: Check if target has a defined commission_rate for that period
        const targetRes = await runner.query(`
          SELECT id, commission_rate FROM sales_targets
          WHERE tenant_id::text = $1::text
            AND user_id = $2
            AND target_scope = 'individual'
            AND period = $3
            AND deleted_at IS NULL
            AND is_active = true
          LIMIT 1
        `, [tenant_id, beneficiaryUserId, period]);

        if (targetRes.rows.length > 0 && targetRes.rows[0].commission_rate > 0) {
          appliedRate = parseFloat(targetRes.rows[0].commission_rate);
          ruleSnapshot = { source: 'sales_target', target_id: targetRes.rows[0].id, commission_rate: appliedRate };
        }
      }

      const paymentAmt = parseFloat(row.payment_amount) || 0;
      const commissionAmount = Number(((paymentAmt * appliedRate) / 100).toFixed(2));

      // F. Insert accrual
      const insertSql = `
        INSERT INTO sales_commissions (
          tenant_id, branch_id, payment_id, invoice_id, sales_order_id, deal_id,
          beneficiary_user_id, beneficiary_name, rule_id, rule_snapshot,
          eligible_payment_amount, applied_rate, commission_amount,
          payment_date, period, attribution_source, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'calculated')
        ON CONFLICT (tenant_id, payment_id, beneficiary_user_id) WHERE (status != 'cancelled' AND adjustment_of_id IS NULL)
        DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      const insertRes = await runner.query(insertSql, [
        tenant_id,
        row.branch_id ? String(row.branch_id) : null,
        payment_id,
        row.invoice_id,
        row.sales_order_id ? String(row.sales_order_id) : null,
        row.deal_id ? String(row.deal_id) : null,
        beneficiaryUserId,
        beneficiaryName,
        ruleId,
        ruleSnapshot ? JSON.stringify(ruleSnapshot) : null,
        paymentAmt,
        appliedRate,
        commissionAmount,
        effectiveDate,
        period,
        attributionSource
      ]);

      const accrual = insertRes.rows[0];

      // Log to activities
      await runner.query(`
        INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, meta)
        VALUES ($1, $2, 'sales_commission', $3, 'commission_accrued', $4)
      `, [
        tenant_id,
        beneficiaryUserId,
        String(accrual.id),
        JSON.stringify({
          payment_id,
          eligible_amount: paymentAmt,
          applied_rate: appliedRate,
          commission_amount: commissionAmount,
          period
        })
      ]);

      if (ownsTransaction) await runner.query('COMMIT');
      return { skipped: false, data: accrual };
    } catch (err) {
      if (ownsTransaction) await runner.query('ROLLBACK');
      throw err;
    } finally {
      if (ownsTransaction) runner.release();
    }
  }

  /**
   * Handles payment cancellation or reversal.
   * If accrual is un-settled, marks as cancelled.
   * If already settled/paid, creates an explicit adjustment record.
   *
   * @param {number} payment_id
   * @param {string} tenant_id
   * @param {Object} actor
   * @param {Object} [client]
   * @returns {Promise<Object>}
   */
  async processPaymentCancellation(payment_id, tenant_id, actor, client = null) {
    const runner = client || db;

    const commRes = await runner.query(`
      SELECT * FROM sales_commissions
      WHERE payment_id = $1 AND tenant_id::text = $2::text AND status != 'cancelled'
    `, [payment_id, tenant_id]);

    if (commRes.rows.length === 0) {
      return { adjusted: false, message: 'No active commission found for this payment.' };
    }

    const comm = commRes.rows[0];

    if (comm.status === 'calculated') {
      // Unsettled: Mark as cancelled safely
      await runner.query(`
        UPDATE sales_commissions
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP, notes = 'Cancelled due to payment reversal'
        WHERE id = $1
      `, [comm.id]);

      await runner.query(`
        INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, meta)
        VALUES ($1, $2, 'sales_commission', $3, 'commission_cancelled', $4)
      `, [tenant_id, actor?.id || null, String(comm.id), JSON.stringify({ payment_id, reason: 'Payment reversed' })]);

      return { adjusted: true, type: 'cancelled', commission_id: comm.id };
    } else if (comm.status === 'settled') {
      // Already settled/closed: Create immutable negative adjustment record
      const currentPeriod = this.resolvePeriod(new Date());
      const adjSql = `
        INSERT INTO sales_commissions (
          tenant_id, branch_id, payment_id, invoice_id, sales_order_id, deal_id,
          beneficiary_user_id, beneficiary_name, rule_id, rule_snapshot,
          eligible_payment_amount, applied_rate, commission_amount,
          payment_date, period, attribution_source, status, adjustment_of_id, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14, $15, 'adjusted', $16, $17)
        RETURNING *
      `;
      const adjRes = await runner.query(adjSql, [
        tenant_id,
        comm.branch_id,
        payment_id,
        comm.invoice_id,
        comm.sales_order_id,
        comm.deal_id,
        comm.beneficiary_user_id,
        comm.beneficiary_name,
        comm.rule_id,
        comm.rule_snapshot,
        comm.eligible_payment_amount,
        comm.applied_rate,
        -Math.abs(parseFloat(comm.commission_amount)),
        currentPeriod,
        comm.attribution_source,
        comm.id,
        `Adjustment for cancelled payment #${payment_id} from settled commission #${comm.id}`
      ]);

      await runner.query(`
        INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, meta)
        VALUES ($1, $2, 'sales_commission', $3, 'commission_adjusted', $4)
      `, [tenant_id, actor?.id || null, String(adjRes.rows[0].id), JSON.stringify({ original_commission_id: comm.id, payment_id })]);

      return { adjusted: true, type: 'adjusted', adjustment_id: adjRes.rows[0].id };
    }

    return { adjusted: false, message: 'Commission status does not require adjustment.' };
  }

  /**
   * Generates or re-reads durable monthly settlement for a salesperson.
   * Idempotent: re-running does not duplicate settlements or tiers.
   *
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async generateMonthlySettlement({ tenant_id, branch_id = null, period, user_id, actor, client = null }) {
    const ownsTransaction = !client;
    const runner = client || (await db.connect());

    try {
      if (ownsTransaction) await runner.query('BEGIN');

      // Check existing settlement for idempotency
      const existingRes = await runner.query(`
        SELECT * FROM sales_commission_settlements
        WHERE tenant_id::text = $1::text
          AND beneficiary_user_id = $2
          AND period = $3
          AND status != 'cancelled'
        FOR UPDATE
      `, [tenant_id, user_id, period]);

      if (existingRes.rows.length > 0) {
        if (ownsTransaction) await runner.query('COMMIT');
        return { existing: true, settlement: existingRes.rows[0] };
      }

      // Fetch beneficiary
      const userRes = await runner.query('SELECT id, name FROM users WHERE id = $1', [user_id]);
      if (userRes.rows.length === 0) {
        if (ownsTransaction) await runner.query('ROLLBACK');
        const err = new Error(`User #${user_id} not found.`);
        err.statusCode = 404;
        throw err;
      }
      const beneficiaryName = userRes.rows[0].name;

      // Fetch pending calculated accruals and adjustments
      const commsRes = await runner.query(`
        SELECT * FROM sales_commissions
        WHERE tenant_id::text = $1::text
          AND beneficiary_user_id = $2
          AND period = $3
          AND status IN ('calculated', 'adjusted')
          AND settlement_id IS NULL
        ORDER BY payment_date ASC
      `, [tenant_id, user_id, period]);

      let baseCommissionTotal = 0;
      let totalCollectedAmount = 0;
      let adjustmentTotal = 0;

      commsRes.rows.forEach(c => {
        const amt = parseFloat(c.commission_amount) || 0;
        if (c.status === 'adjusted') {
          adjustmentTotal += amt;
        } else {
          baseCommissionTotal += amt;
          totalCollectedAmount += parseFloat(c.eligible_payment_amount) || 0;
        }
      });

      // Fetch sales target for target achievement and tiered bonus
      const targetRes = await runner.query(`
        SELECT * FROM sales_targets
        WHERE tenant_id::text = $1::text
          AND user_id = $2
          AND target_scope = 'individual'
          AND period = $3
          AND deleted_at IS NULL
          AND is_active = true
        LIMIT 1
      `, [tenant_id, user_id, period]);

      let targetId = null;
      let targetSnapshot = null;
      let targetAmount = 0;
      let achievementPct = 0;
      let selectedTierId = null;
      let bonusAmount = 0;

      if (targetRes.rows.length > 0) {
        const target = targetRes.rows[0];
        targetId = target.id;
        targetAmount = parseFloat(target.target_amount) || 0;
        targetSnapshot = { id: target.id, target_amount: targetAmount, period: target.period };

        if (targetAmount > 0) {
          achievementPct = Number(((totalCollectedAmount / targetAmount) * 100).toFixed(2));
        }

        // Fetch applicable rule's tiers respecting branch hierarchy and period date
        const resolvedBranchId = branch_id || target.branch_id || null;
        const periodDate = `${period}-15`;
        const applicableRule = await this.getApplicableRule(tenant_id, resolvedBranchId, periodDate, runner);

        if (applicableRule) {
          const tiersRes = await runner.query(`
            SELECT * FROM sales_commission_tiers
            WHERE rule_id = $1 AND tenant_id::text = $2::text
            ORDER BY tier_order DESC
          `, [applicableRule.id, tenant_id]);

          // Pick EXACTLY ONE matching tier (highest tier where min <= achievementPct < max)
          for (const tier of tiersRes.rows) {
            const minPct = parseFloat(tier.min_achievement_pct);
            const maxPct = tier.max_achievement_pct ? parseFloat(tier.max_achievement_pct) : null;

            if (achievementPct >= minPct && (maxPct === null || achievementPct < maxPct)) {
              selectedTierId = tier.id;
              bonusAmount = parseFloat(tier.bonus_amount);
              break;
            }
          }
        }
      }

      const netPayable = Number((baseCommissionTotal + bonusAmount + adjustmentTotal).toFixed(2));
      const settlementNumber = `SETTLE-${period.replace('-', '')}-${user_id}-${Date.now().toString().slice(-4)}`;

      // Insert settlement
      const insertSql = `
        INSERT INTO sales_commission_settlements (
          settlement_number, tenant_id, branch_id, beneficiary_user_id, beneficiary_name,
          period, target_id, target_snapshot, target_amount, total_collected_amount,
          achievement_percentage, base_commission_total, selected_tier_id, bonus_amount,
          adjustment_total, net_payable_amount, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'calculated', $17)
        RETURNING *
      `;
      const sRes = await runner.query(insertSql, [
        settlementNumber,
        tenant_id,
        branch_id ? String(branch_id) : null,
        user_id,
        beneficiaryName,
        period,
        targetId,
        targetSnapshot ? JSON.stringify(targetSnapshot) : null,
        targetAmount,
        totalCollectedAmount,
        achievementPct,
        baseCommissionTotal,
        selectedTierId,
        bonusAmount,
        adjustmentTotal,
        netPayable,
        actor?.id || null
      ]);

      const settlement = sRes.rows[0];

      // Link items and update accruals
      for (const comm of commsRes.rows) {
        await runner.query(`
          INSERT INTO sales_commission_settlement_items (settlement_id, commission_id, amount)
          VALUES ($1, $2, $3)
        `, [settlement.id, comm.id, comm.commission_amount]);

        await runner.query(`
          UPDATE sales_commissions SET settlement_id = $1, status = 'settled' WHERE id = $2
        `, [settlement.id, comm.id]);
      }

      // Log to activities
      await runner.query(`
        INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, meta)
        VALUES ($1, $2, 'commission_settlement', $3, 'settlement_generated', $4)
      `, [
        tenant_id,
        actor?.id || null,
        String(settlement.id),
        JSON.stringify({
          period,
          beneficiary_user_id: user_id,
          total_collected: totalCollectedAmount,
          achievement_pct: achievementPct,
          net_payable: netPayable
        })
      ]);

      if (ownsTransaction) await runner.query('COMMIT');
      return { existing: false, settlement };
    } catch (err) {
      if (ownsTransaction) await runner.query('ROLLBACK');
      throw err;
    } finally {
      if (ownsTransaction) runner.release();
    }
  }

  /**
   * Approves a monthly settlement with Segregation of Duties (SoD).
   *
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async approveSettlement({ settlement_id, tenant_id, actor, client = null }) {
    const runner = client || db;

    const sRes = await runner.query(`
      SELECT * FROM sales_commission_settlements
      WHERE id = $1 AND tenant_id::text = $2::text
    `, [settlement_id, tenant_id]);

    if (sRes.rows.length === 0) {
      const err = new Error('Settlement not found.');
      err.statusCode = 404;
      throw err;
    }

    const settlement = sRes.rows[0];

    if (settlement.status !== 'calculated') {
      const err = new Error(`Settlement cannot be approved in '${settlement.status}' status.`);
      err.statusCode = 400;
      throw err;
    }

    // SoD Check: Manager cannot approve their own commission settlement!
    if (String(actor?.id) === String(settlement.beneficiary_user_id)) {
      const err = new Error('Segregation of Duties violation: You cannot approve your own commission settlement.');
      err.statusCode = 403;
      throw err;
    }

    const upRes = await runner.query(`
      UPDATE sales_commission_settlements SET
        status = 'approved',
        approved_by = $1,
        approved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND tenant_id::text = $3::text
      RETURNING *
    `, [actor?.id || null, settlement_id, tenant_id]);

    await runner.query(`
      INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, meta)
      VALUES ($1, $2, 'commission_settlement', $3, 'settlement_approved', $4)
    `, [tenant_id, actor?.id || null, String(settlement_id), JSON.stringify({ approved_by: actor?.id })]);

    return upRes.rows[0];
  }

  /**
   * Records payout for an approved settlement by generating a real finance payment voucher.
   * Atomic and prevents duplicate disbursements.
   *
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async payoutSettlement({ settlement_id, tenant_id, treasury_account_id, payment_method = 'cash', actor, notes = null, client = null }) {
    const ownsTransaction = !client;
    const runner = client || (await db.connect());

    try {
      if (ownsTransaction) await runner.query('BEGIN');

      const sRes = await runner.query(`
        SELECT * FROM sales_commission_settlements
        WHERE id = $1 AND tenant_id::text = $2::text
        FOR UPDATE
      `, [settlement_id, tenant_id]);

      if (sRes.rows.length === 0) {
        if (ownsTransaction) await runner.query('ROLLBACK');
        const err = new Error('Settlement not found.');
        err.statusCode = 404;
        throw err;
      }

      const settlement = sRes.rows[0];

      if (settlement.status !== 'approved') {
        if (ownsTransaction) await runner.query('ROLLBACK');
        const err = new Error(`Settlement must be 'approved' before payout (current: '${settlement.status}').`);
        err.statusCode = 400;
        throw err;
      }

      if (settlement.payout_voucher_id) {
        if (ownsTransaction) await runner.query('ROLLBACK');
        const err = new Error('Settlement already has a payout voucher linked.');
        err.statusCode = 409;
        throw err;
      }

      // P1 Guard: Reject payout if net payable amount is zero or negative
      const netPayable = parseFloat(settlement.net_payable_amount) || 0;
      if (netPayable <= 0) {
        if (ownsTransaction) await runner.query('ROLLBACK');
        const err = new Error('Cannot issue a payout voucher for a settlement with zero or negative net payable amount.');
        err.statusCode = 400;
        throw err;
      }

      // Validate Treasury Account
      let resolvedTreasuryId = treasury_account_id ? parseInt(treasury_account_id, 10) : null;
      if (!resolvedTreasuryId) {
        const taRes = await runner.query(`
          SELECT id FROM treasury_accounts
          WHERE tenant_id::text = $1::text AND is_default = true AND is_active = true
          LIMIT 1
        `, [tenant_id]);
        if (taRes.rows.length > 0) resolvedTreasuryId = taRes.rows[0].id;
      }

      if (!resolvedTreasuryId) {
        if (ownsTransaction) await runner.query('ROLLBACK');
        const err = new Error('A valid active treasury_account_id is required for payout.');
        err.statusCode = 400;
        throw err;
      }

      // Generate Voucher Number
      const voucherNumber = await generateVoucherNumber(tenant_id, settlement.branch_id, 'payment', runner);

      // Insert Payment Voucher into finance_vouchers
      const voucherSql = `
        INSERT INTO finance_vouchers (
          voucher_number, voucher_type, party_type, party_name,
          amount, payment_method, treasury_account_id, reference_no,
          notes, voucher_date, created_by, tenant_id, branch_id, status
        ) VALUES ($1, 'payment', 'employee', $2, $3, $4, $5, $6, $7, CURRENT_DATE, $8, $9, $10, 'active')
        RETURNING *
      `;
      const vRes = await runner.query(voucherSql, [
        voucherNumber,
        settlement.beneficiary_name,
        settlement.net_payable_amount,
        payment_method,
        resolvedTreasuryId,
        settlement.settlement_number,
        notes || `صرف عمولة مبيعات عن تسوية رقم ${settlement.settlement_number}`,
        actor?.id || null,
        tenant_id,
        settlement.branch_id ? String(settlement.branch_id) : null
      ]);

      const voucher = vRes.rows[0];

      // Update Settlement status to paid
      const upRes = await runner.query(`
        UPDATE sales_commission_settlements SET
          status = 'paid',
          payout_voucher_id = $1,
          payout_at = CURRENT_TIMESTAMP,
          payout_notes = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND tenant_id::text = $4::text
        RETURNING *
      `, [voucher.id, notes || null, settlement_id, tenant_id]);

      const paidSettlement = upRes.rows[0];

      // Audit log
      await runner.query(`
        INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, meta)
        VALUES ($1, $2, 'commission_settlement', $3, 'settlement_paid', $4)
      `, [
        tenant_id,
        actor?.id || null,
        String(settlement_id),
        JSON.stringify({
          voucher_id: voucher.id,
          voucher_number: voucher.voucher_number,
          payout_amount: settlement.net_payable_amount,
          treasury_account_id: resolvedTreasuryId
        })
      ]);

      if (ownsTransaction) await runner.query('COMMIT');
      return { settlement: paidSettlement, voucher };
    } catch (err) {
      if (ownsTransaction) {
        try { await runner.query('ROLLBACK'); } catch (_) {}
      }
      throw err;
    } finally {
      if (ownsTransaction) runner.release();
    }
  }

  /**
   * Queries commission accruals with filtering and RBAC.
   *
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async getCommissions({ tenant_id, branch_id = null, user_id = null, period = null, status = null, client = null }) {
    const runner = client || db;
    let sql = `
      SELECT sc.*, u.email as beneficiary_email
      FROM sales_commissions sc
      JOIN users u ON sc.beneficiary_user_id = u.id
      WHERE sc.tenant_id::text = $1::text
    `;
    const params = [tenant_id];

    if (branch_id) {
      params.push(String(branch_id));
      sql += ` AND sc.branch_id::text = $${params.length}::text`;
    }
    if (user_id) {
      params.push(parseInt(user_id, 10));
      sql += ` AND sc.beneficiary_user_id = $${params.length}`;
    }
    if (period) {
      params.push(period);
      sql += ` AND sc.period = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND sc.status = $${params.length}`;
    }

    sql += ` ORDER BY sc.payment_date DESC`;
    const res = await runner.query(sql, params);
    return res.rows;
  }

  /**
   * Queries commission settlements with filtering.
   *
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async getSettlements({ tenant_id, branch_id = null, user_id = null, period = null, status = null, client = null }) {
    const runner = client || db;
    let sql = `
      SELECT scs.*, fv.voucher_number as payout_voucher_number
      FROM sales_commission_settlements scs
      LEFT JOIN finance_vouchers fv ON scs.payout_voucher_id = fv.id
      WHERE scs.tenant_id::text = $1::text
    `;
    const params = [tenant_id];

    if (branch_id) {
      params.push(String(branch_id));
      sql += ` AND scs.branch_id::text = $${params.length}::text`;
    }
    if (user_id) {
      params.push(parseInt(user_id, 10));
      sql += ` AND scs.beneficiary_user_id = $${params.length}`;
    }
    if (period) {
      params.push(period);
      sql += ` AND scs.period = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND scs.status = $${params.length}`;
    }

    sql += ` ORDER BY scs.created_at DESC`;
    const res = await runner.query(sql, params);
    return res.rows;
  }
}

module.exports = new SalesCommissionService();
