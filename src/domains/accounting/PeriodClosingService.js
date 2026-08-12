/**
 * PeriodClosingService — ERP Month-End & Year-End Closing Engine
 *
 * Responsibilities:
 *  - Month-End Closing: checks Trial Balance balance and locks period
 *  - Year-End Closing:
 *      1. Zeroes out all Revenue accounts -> Retained Earnings
 *      2. Zeroes out all Expense accounts -> Retained Earnings
 *      3. Posts Year-End Closing Journal Entry (source_type = 'period_closing', entry_purpose = 'year_end_close')
 *      4. Locks Fiscal Year
 */

const db = require('../../../config/db');
const JournalEngine = require('./JournalEngine');
const FiscalYearService = require('./FiscalYearService');
const GLReportService = require('./GLReportService');
const AccountService = require('./AccountService');
const TransactionEngine = require('../shared/TransactionEngine');

/**
 * Perform Month-End Closing for a period.
 */
async function performMonthEndClosing(tenantId, periodId, userId) {
  // Check Trial Balance balance
  const tb = await GLReportService.getTrialBalance(tenantId, {});
  if (!tb.is_balanced) {
    throw new Error(`Cannot close period: Trial Balance is IMBALANCED (Difference: ${Math.abs(tb.grand_total_debit - tb.grand_total_credit)} EGP).`);
  }

  return await FiscalYearService.closePeriod(periodId, tenantId, userId);
}

/**
 * Perform Year-End Closing for a fiscal year.
 */
async function performYearEndClosing(tenantId, fiscalYearId, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
    // 1. Fetch Fiscal Year details
    const fyRes = await client.query('SELECT * FROM fiscal_years WHERE id = $1 AND tenant_id::text = $2::text', [fiscalYearId, String(tenantId)]);
    if (fyRes.rows.length === 0) throw new Error('Fiscal Year not found.');

    const fy = fyRes.rows[0];

    // 2. Fetch P&L summary
    const pl = await GLReportService.getIncomeStatement(tenantId, { startDate: fy.start_date, endDate: fy.end_date });
    const retainedEarningsAcc = await AccountService.getAccountBySubType(tenantId, 'retained_earnings');

    const closingEntries = [];

    // Zero out Revenue Accounts
    pl.revenue.accounts.forEach(acc => {
      if (acc.amount > 0) {
        closingEntries.push({ account_id: acc.account_id, debit: acc.amount, credit: 0, description: `Year-End Revenue Closing: ${acc.account_name}` });
      }
    });

    // Zero out Expense Accounts
    pl.expenses.accounts.forEach(acc => {
      if (acc.amount > 0) {
        closingEntries.push({ account_id: acc.account_id, debit: 0, credit: acc.amount, description: `Year-End Expense Closing: ${acc.account_name}` });
      }
    });

    // Net Profit/Loss -> Retained Earnings
    if (pl.net_profit > 0) {
      closingEntries.push({ account_id: retainedEarningsAcc.id, debit: 0, credit: pl.net_profit, description: `Year-End Net Profit Allocation` });
    } else if (pl.net_profit < 0) {
      closingEntries.push({ account_id: retainedEarningsAcc.id, debit: Math.abs(pl.net_profit), credit: 0, description: `Year-End Net Loss Allocation` });
    }

    // Post Year-End Closing Journal Entry
    const closingJournal = await JournalEngine.postJournal(client, {
      tenantId,
      date: fy.end_date,
      sourceType: 'period_closing',
      sourceId: fiscalYearId,
      entryPurpose: 'year_end_close',
      description: `Year-End Closing Entry for ${fy.name}`,
      postedBy: userId,
      entries: closingEntries
    });

    // Lock Fiscal Year
    await client.query(`
      UPDATE fiscal_years SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = $1 AND tenant_id::text = $2::text
    `, [fiscalYearId, String(tenantId)]);

    return {
      status: 'year_end_closed',
      fiscal_year: fy.name,
      net_profit: pl.net_profit,
      journal_entry_id: closingJournal.id
    };
  });
}

module.exports = {
  performMonthEndClosing,
  performYearEndClosing,
};
