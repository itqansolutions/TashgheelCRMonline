/**
 * FixedAssetService — ERP Fixed Assets & Depreciation Engine
 *
 * Responsibilities:
 *  - Fixed Assets Master Data
 *  - Straight-Line Monthly Depreciation Calculation
 *  - Auto-posts Monthly Depreciation Journal Entries:
 *    DR Depreciation Expense (5500) / CR Accumulated Depreciation (1520)
 */

const db = require('../../../config/db');
const JournalEngine = require('./JournalEngine');
const AccountService = require('./AccountService');
const TransactionEngine = require('../shared/TransactionEngine');

async function getFixedAssets(tenantId) {
  const result = await db.query('SELECT * FROM fixed_assets WHERE tenant_id::text = $1::text ORDER BY asset_code ASC', [String(tenantId)]);
  return result.rows;
}

async function createFixedAsset(tenantId, branchId, data) {
  const { name, asset_code, category, acquisition_date, acquisition_cost, useful_life_months, residual_value } = data;

  const faAcc  = await AccountService.getAccountBySubType(tenantId, 'fixed_asset');
  const accum  = await AccountService.getAccountBySubType(tenantId, 'accum_depr');
  const deprEx = await AccountService.getAccountBySubType(tenantId, 'depr_expense');

  const cost = Number(acquisition_cost);
  const resVal = Number(residual_value || 0);

  const result = await db.query(`
    INSERT INTO fixed_assets
      (tenant_id, branch_id, name, asset_code, category, acquisition_date, acquisition_cost, useful_life_months, residual_value, net_book_value, gl_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `, [
    String(tenantId), branchId || null, name, asset_code, category || null,
    acquisition_date || new Date(), cost, useful_life_months, resVal,
    cost, faAcc.id, accum.id, deprEx.id
  ]);

  return result.rows[0];
}

async function runAssetDepreciation(tenantId, assetId, periodDate, userId) {
  return await TransactionEngine.executeTransaction(async (client) => {
    const assetRes = await client.query('SELECT * FROM fixed_assets WHERE id = $1 AND tenant_id::text = $2::text FOR UPDATE', [assetId, String(tenantId)]);
    if (assetRes.rows.length === 0) throw new Error('Fixed Asset not found.');

    const asset = assetRes.rows[0];
    const cost = Number(asset.acquisition_cost);
    const resVal = Number(asset.residual_value || 0);
    const lifeMonths = Number(asset.useful_life_months);

    const monthlyDepr = Number(((cost - resVal) / lifeMonths).toFixed(2));

    const deprEx = await AccountService.getAccountBySubType(tenantId, 'depr_expense');
    const accum  = await AccountService.getAccountBySubType(tenantId, 'accum_depr');

    const pDate = periodDate || new Date().toISOString().split('T')[0];

    // Post Depreciation Journal Entry: DR Depreciation Expense / CR Accumulated Depreciation
    const journal = await JournalEngine.postJournal(client, {
      tenantId,
      date: pDate,
      sourceType: 'asset_depreciation',
      sourceId: assetId,
      entryPurpose: 'depreciation',
      description: `Monthly Depreciation for Asset ${asset.asset_code} (${asset.name})`,
      postedBy: userId,
      entries: [
        { account_id: deprEx.id, debit: monthlyDepr, credit: 0, description: `Depreciation Expense (${asset.asset_code})` },
        { account_id: accum.id,  debit: 0, credit: monthlyDepr, description: `Accumulated Depreciation (${asset.asset_code})` }
      ]
    });

    const newAccum = Number(asset.accumulated_depreciation || 0) + monthlyDepr;
    const newNBV   = cost - newAccum;

    await client.query(`
      UPDATE fixed_assets
      SET accumulated_depreciation = $1, net_book_value = $2
      WHERE id = $3
    `, [newAccum, newNBV, assetId]);

    await client.query(`
      INSERT INTO asset_depreciation_schedule
        (tenant_id, asset_id, period_date, depreciation_amount, accumulated_total, journal_entry_id, is_posted)
      VALUES ($1, $2, $3, $4, $5, $6, true)
    `, [String(tenantId), assetId, pDate, monthlyDepr, newAccum, journal.id]);

    return {
      status: 'depreciated',
      asset_code: asset.asset_code,
      monthly_depreciation: monthlyDepr,
      new_accumulated: newAccum,
      new_net_book_value: newNBV,
      journal_entry_id: journal.id
    };
  });
}

module.exports = {
  getFixedAssets,
  createFixedAsset,
  runAssetDepreciation,
};
