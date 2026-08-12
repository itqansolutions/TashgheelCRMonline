/**
 * FiscalYearService — ERP Fiscal Calendar Manager
 *
 * Responsibilities:
 *  - Create fiscal years and their 12 periods for a tenant
 *  - Validate that a given date falls in an open period
 *  - Close / lock / reopen periods
 *  - Configurable start month per tenant (e.g. Jan or Jul)
 *
 * Fiscal Year is configurable per-tenant via:
 *   tenants.fiscal_year_start_month (1–12, default 1 = January)
 *
 * Usage:
 *   const FiscalYearService = require('../../domains/accounting/FiscalYearService');
 *   await FiscalYearService.ensureFiscalYear(db, tenantId);
 *   await FiscalYearService.validatePeriodOpen(db, tenantId, '2026-08-15');
 */

const db = require('../../../config/db');

const PERIOD_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Determines the fiscal year name and boundaries for a given calendar date,
 * based on the tenant's configured start month.
 */
function getFiscalYearBounds(date, startMonth) {
  const d = new Date(date);
  const month = d.getMonth() + 1; // 1-indexed
  const year  = d.getFullYear();

  let fyStart, fyEnd, fyName;

  if (startMonth === 1) {
    // Standard calendar year
    fyStart = new Date(year, 0, 1);
    fyEnd   = new Date(year, 11, 31);
    fyName  = `FY ${year}`;
  } else {
    // Shifted fiscal year (e.g. July = month 7)
    if (month >= startMonth) {
      // We're in the first half of the FY (e.g. Aug 2026 → FY 2026/2027)
      fyStart = new Date(year, startMonth - 1, 1);
      fyEnd   = new Date(year + 1, startMonth - 2, getDaysInMonth(year + 1, startMonth - 1));
      fyName  = `FY ${year}/${year + 1}`;
    } else {
      fyStart = new Date(year - 1, startMonth - 1, 1);
      fyEnd   = new Date(year, startMonth - 2, getDaysInMonth(year, startMonth - 1));
      fyName  = `FY ${year - 1}/${year}`;
    }
  }

  return { fyStart, fyEnd, fyName };
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Ensure a fiscal year (and its 12 periods) exist for a tenant for the given date.
 * Idempotent — safe to call on every request if needed.
 *
 * @param {Object} dbOrClient  - pg Pool or PoolClient
 * @param {string} tenantId
 * @param {Date|string} [forDate]  - defaults to today
 * @returns {Promise<{fiscalYear, period}>}
 */
async function ensureFiscalYear(dbOrClient, tenantId, forDate = new Date()) {
  // Get tenant's fiscal year start month
  const tenantRes = await dbOrClient.query(
    'SELECT fiscal_year_start_month FROM tenants WHERE id::text = $1::text',
    [String(tenantId)]
  );
  const startMonth = tenantRes.rows[0]?.fiscal_year_start_month || 1;

  const { fyStart, fyEnd, fyName } = getFiscalYearBounds(forDate, startMonth);

  // Upsert fiscal year
  const fyRes = await dbOrClient.query(`
    INSERT INTO fiscal_years (tenant_id, name, start_date, end_date, status)
    VALUES ($1, $2, $3, $4, 'open')
    ON CONFLICT (tenant_id, name) DO UPDATE
      SET start_date = EXCLUDED.start_date,
          end_date   = EXCLUDED.end_date
    RETURNING *
  `, [tenantId, fyName, fyStart.toISOString().split('T')[0], fyEnd.toISOString().split('T')[0]]);

  const fiscalYear = fyRes.rows[0];

  // Create 12 periods if they don't exist
  for (let i = 0; i < 12; i++) {
    const periodMonth = ((startMonth - 1 + i) % 12) + 1; // 1-indexed month
    const periodYear  = fyStart.getFullYear() + Math.floor((startMonth - 1 + i) / 12);
    const periodStart = new Date(periodYear, periodMonth - 1, 1);
    const periodEnd   = new Date(periodYear, periodMonth, 0); // last day of month
    const periodName  = `${PERIOD_NAMES[periodMonth - 1]} ${periodYear}`;

    await dbOrClient.query(`
      INSERT INTO fiscal_periods
        (fiscal_year_id, tenant_id, period_number, name, start_date, end_date, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'open')
      ON CONFLICT (fiscal_year_id, period_number) DO NOTHING
    `, [
      fiscalYear.id,
      tenantId,
      i + 1,
      periodName,
      periodStart.toISOString().split('T')[0],
      periodEnd.toISOString().split('T')[0],
    ]);
  }

  // Find the current period for forDate
  const periodRes = await dbOrClient.query(`
    SELECT * FROM fiscal_periods
    WHERE fiscal_year_id = $1
      AND start_date <= $2
      AND end_date   >= $2
    LIMIT 1
  `, [fiscalYear.id, new Date(forDate).toISOString().split('T')[0]]);

  return {
    fiscalYear,
    period: periodRes.rows[0] || null,
  };
}

/**
 * Find the fiscal period for a given date and tenant.
 * Returns the period record, or throws if the period is closed/locked.
 *
 * @param {Object} dbOrClient
 * @param {string} tenantId
 * @param {Date|string} date
 * @param {Object} [options]
 * @param {boolean} [options.allowClosed=false] - set true to read without period check (for reports)
 * @returns {Promise<Object>} fiscal_period row
 */
async function validatePeriodOpen(dbOrClient, tenantId, date, { allowClosed = false } = {}) {
  const dateStr = new Date(date).toISOString().split('T')[0];

  const result = await dbOrClient.query(`
    SELECT fp.*, fy.name as fiscal_year_name
    FROM fiscal_periods fp
    JOIN fiscal_years fy ON fp.fiscal_year_id = fy.id
    WHERE fp.tenant_id = $1
      AND fp.start_date <= $2
      AND fp.end_date   >= $2
    LIMIT 1
  `, [tenantId, dateStr]);

  if (!result.rows[0]) {
    // Auto-create fiscal year and period if missing
    const { period } = await ensureFiscalYear(dbOrClient, tenantId, date);
    if (!period) {
      throw new Error(`No fiscal period found for date ${dateStr}. Please configure fiscal year settings.`);
    }
    return period;
  }

  const period = result.rows[0];

  if (!allowClosed && (period.status === 'closed' || period.status === 'locked')) {
    throw new Error(
      `Accounting period "${period.name}" is ${period.status}. ` +
      `Cannot post transactions to a ${period.status} period. ` +
      `Use the next open period or contact your administrator.`
    );
  }

  return period;
}

/**
 * Close a fiscal period.
 * Requires: period is currently 'open', and user has 'period.close' permission.
 */
async function closePeriod(periodId, tenantId, closedByUserId) {
  const result = await db.query(`
    UPDATE fiscal_periods
    SET status = 'closed', closed_at = CURRENT_TIMESTAMP, closed_by = $1
    WHERE id = $2 AND tenant_id = $3 AND status = 'open'
    RETURNING *
  `, [closedByUserId, periodId, tenantId]);

  if (!result.rows[0]) {
    throw new Error('Period not found, already closed, or not authorized.');
  }
  return result.rows[0];
}

/**
 * Lock a fiscal period (no further reopening without admin override).
 * Requires: period is 'closed', and user has 'period.close' permission (admin).
 */
async function lockPeriod(periodId, tenantId, lockedByUserId) {
  const result = await db.query(`
    UPDATE fiscal_periods
    SET status = 'locked', closed_at = CURRENT_TIMESTAMP, closed_by = $1
    WHERE id = $2 AND tenant_id = $3 AND status = 'closed'
    RETURNING *
  `, [lockedByUserId, periodId, tenantId]);

  if (!result.rows[0]) {
    throw new Error('Period not found, not closed, or not authorized.');
  }
  return result.rows[0];
}

/**
 * Reopen a fiscal period. Requires 'period.reopen' permission (admin only).
 */
async function reopenPeriod(periodId, tenantId, reopenedByUserId) {
  const result = await db.query(`
    UPDATE fiscal_periods
    SET status = 'open', closed_at = NULL, closed_by = NULL
    WHERE id = $1 AND tenant_id = $2 AND status IN ('closed', 'locked')
    RETURNING *
  `, [periodId, tenantId]);

  if (!result.rows[0]) {
    throw new Error('Period not found or already open.');
  }
  return result.rows[0];
}

/**
 * List all fiscal years for a tenant.
 */
async function listFiscalYears(tenantId) {
  const result = await db.query(`
    SELECT fy.*,
      json_agg(fp ORDER BY fp.period_number) AS periods
    FROM fiscal_years fy
    LEFT JOIN fiscal_periods fp ON fp.fiscal_year_id = fy.id
    WHERE fy.tenant_id = $1
    GROUP BY fy.id
    ORDER BY fy.start_date DESC
  `, [tenantId]);
  return result.rows;
}

module.exports = {
  ensureFiscalYear,
  validatePeriodOpen,
  closePeriod,
  lockPeriod,
  reopenPeriod,
  listFiscalYears,
  getFiscalYearBounds,
};
