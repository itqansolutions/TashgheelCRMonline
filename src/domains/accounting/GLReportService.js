/**
 * GLReportService — Enterprise Double-Entry Financial Reporting Engine
 *
 * Responsibilities:
 *  - Trial Balance (SUM debit vs SUM credit from GL journal_entry_lines)
 *  - Balance Sheet (Assets vs Liabilities + Equity as of date)
 *  - Income Statement / P&L (Revenue vs Expenses for period)
 *  - Cash Flow Statement (Cash & Bank account movements)
 *  - AR Aging Report (Current, 1-30, 31-60, 61-90, 90+ days overdue)
 *  - AP Aging Report (Supplier outstanding aging)
 *  - GRNI Outstanding Report (Unmatched goods received not yet invoiced)
 */

const db = require('../../../config/db');
const AccountService = require('./AccountService');

/**
 * Trial Balance Report.
 */
async function getTrialBalance(tenantId, { startDate, endDate }) {
  let where = 'WHERE je.tenant_id::text = $1::text AND je.status = \'posted\'';
  const params = [String(tenantId)];
  let idx = 2;

  if (startDate) {
    where += ` AND je.date >= $${idx++}`;
    params.push(startDate);
  }
  if (endDate) {
    where += ` AND je.date <= $${idx++}`;
    params.push(endDate);
  }

  const result = await db.query(`
    SELECT
      a.id as account_id,
      a.code as account_code,
      a.name as account_name,
      a.type as account_type,
      a.sub_type,
      COALESCE(SUM(jel.debit), 0) AS total_debit,
      COALESCE(SUM(jel.credit), 0) AS total_credit,
      (COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0)) AS net_balance
    FROM accounts a
    LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
    ${where}
    GROUP BY a.id, a.code, a.name, a.type, a.sub_type
    HAVING (COALESCE(SUM(jel.debit), 0) != 0 OR COALESCE(SUM(jel.credit), 0) != 0)
    ORDER BY a.code ASC
  `, params);

  let grandDR = 0;
  let grandCR = 0;

  result.rows.forEach(r => {
    grandDR += Number(r.total_debit);
    grandCR += Number(r.total_credit);
  });

  return {
    rows: result.rows,
    grand_total_debit: Number(grandDR.toFixed(2)),
    grand_total_credit: Number(grandCR.toFixed(2)),
    is_balanced: Math.abs(grandDR - grandCR) < 0.01
  };
}

/**
 * Balance Sheet Report.
 */
async function getBalanceSheet(tenantId, { asOfDate }) {
  const dateStr = asOfDate || new Date().toISOString().split('T')[0];

  const result = await db.query(`
    SELECT
      a.id as account_id,
      a.code as account_code,
      a.name as account_name,
      a.type as account_type,
      a.sub_type,
      (COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0)) AS balance
    FROM accounts a
    LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.status = 'posted' AND je.date <= $2
    WHERE a.tenant_id::text = $1::text AND a.type IN ('asset', 'liability', 'equity')
    GROUP BY a.id, a.code, a.name, a.type, a.sub_type
    ORDER BY a.code ASC
  `, [String(tenantId), dateStr]);

  const assets = [];
  const liabilities = [];
  const equity = [];

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;

  result.rows.forEach(r => {
    const bal = Number(r.balance);
    if (r.account_type === 'asset') {
      assets.push(r);
      totalAssets += bal;
    } else if (r.account_type === 'liability') {
      const liabBal = -bal; // liabilities have credit balance
      liabilities.push({ ...r, balance: liabBal });
      totalLiabilities += liabBal;
    } else if (r.account_type === 'equity') {
      const eqBal = -bal; // equity has credit balance
      equity.push({ ...r, balance: eqBal });
      totalEquity += eqBal;
    }
  });

  return {
    as_of_date: dateStr,
    assets: { accounts: assets, total: Number(totalAssets.toFixed(2)) },
    liabilities: { accounts: liabilities, total: Number(totalLiabilities.toFixed(2)) },
    equity: { accounts: equity, total: Number(totalEquity.toFixed(2)) },
    total_liabilities_and_equity: Number((totalLiabilities + totalEquity).toFixed(2)),
    is_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01
  };
}

/**
 * Income Statement / P&L Report.
 */
async function getIncomeStatement(tenantId, { startDate, endDate }) {
  let where = 'WHERE a.tenant_id::text = $1::text AND a.type IN (\'revenue\', \'expense\')';
  const params = [String(tenantId)];
  let idx = 2;

  if (startDate) {
    where += ` AND je.date >= $${idx++}`;
    params.push(startDate);
  }
  if (endDate) {
    where += ` AND je.date <= $${idx++}`;
    params.push(endDate);
  }

  const result = await db.query(`
    SELECT
      a.id as account_id,
      a.code as account_code,
      a.name as account_name,
      a.type as account_type,
      a.sub_type,
      COALESCE(SUM(jel.debit), 0) AS total_debit,
      COALESCE(SUM(jel.credit), 0) AS total_credit
    FROM accounts a
    LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.status = 'posted'
    ${where}
    GROUP BY a.id, a.code, a.name, a.type, a.sub_type
    ORDER BY a.code ASC
  `, params);

  const revenue = [];
  const expenses = [];
  let totalRevenue = 0;
  let totalExpenses = 0;

  result.rows.forEach(r => {
    const dr = Number(r.total_debit);
    const cr = Number(r.total_credit);

    if (r.account_type === 'revenue') {
      const revAmount = cr - dr;
      revenue.push({ ...r, amount: revAmount });
      totalRevenue += revAmount;
    } else if (r.account_type === 'expense') {
      const expAmount = dr - cr;
      expenses.push({ ...r, amount: expAmount });
      totalExpenses += expAmount;
    }
  });

  const netProfit = totalRevenue - totalExpenses;

  return {
    start_date: startDate || null,
    end_date: endDate || null,
    revenue: { accounts: revenue, total: Number(totalRevenue.toFixed(2)) },
    expenses: { accounts: expenses, total: Number(totalExpenses.toFixed(2)) },
    net_profit: Number(netProfit.toFixed(2))
  };
}

/**
 * AR Aging Report.
 */
async function getARAging(tenantId) {
  const result = await db.query(`
    SELECT
      sub.*,
      CURRENT_DATE - sub.date AS days_overdue,
      CASE
        WHEN (CURRENT_DATE - sub.date) <= 0 THEN 'current'
        WHEN (CURRENT_DATE - sub.date) BETWEEN 1 AND 30 THEN '1_30_days'
        WHEN (CURRENT_DATE - sub.date) BETWEEN 31 AND 60 THEN '31_60_days'
        WHEN (CURRENT_DATE - sub.date) BETWEEN 61 AND 90 THEN '61_90_days'
        ELSE '90_plus_days'
      END AS aging_bracket
    FROM v_ar_subledger sub
    WHERE sub.tenant_id::text = $1::text AND sub.outstanding > 0
    ORDER BY sub.date ASC
  `, [String(tenantId)]);

  const brackets = {
    current: 0,
    '1_30_days': 0,
    '31_60_days': 0,
    '61_90_days': 0,
    '90_plus_days': 0
  };

  result.rows.forEach(r => {
    brackets[r.aging_bracket] += Number(r.outstanding);
  });

  return {
    brackets,
    invoices: result.rows
  };
}

module.exports = {
  getTrialBalance,
  getBalanceSheet,
  getIncomeStatement,
  getARAging,
};
