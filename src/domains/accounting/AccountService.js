/**
 * AccountService — Chart of Accounts (COA) Management & Seeding Engine
 *
 * Responsibilities:
 *  - Seed standard enterprise Chart of Accounts for new tenants
 *  - Tree hierarchy management (parent/child relationships)
 *  - Validate accounts before Journal Entry posting (is_group accounts CANNOT receive journal entries)
 *  - CRUD operations for custom tenant accounts
 */

const db = require('../../../config/db');

// Standard Enterprise Chart of Accounts Tree Template
const DEFAULT_COA_TREE = [
  // 1000 ASSETS
  { code: '1000', name: 'Assets', type: 'asset', is_group: true, parent_code: null },
    { code: '1100', name: 'Cash and Bank', type: 'asset', is_group: true, parent_code: '1000' },
      { code: '1110', name: 'Cash on Hand', type: 'asset', sub_type: 'cash', is_group: false, parent_code: '1100' },
      { code: '1120', name: 'Main Bank Account', type: 'asset', sub_type: 'bank', is_group: false, parent_code: '1100' },
    { code: '1200', name: 'Accounts Receivable', type: 'asset', sub_type: 'receivable', is_group: false, parent_code: '1000' },
    { code: '1300', name: 'WHT Receivable', type: 'asset', sub_type: 'wht_receivable', is_group: false, parent_code: '1000' },
    { code: '1400', name: 'Inventory Asset', type: 'asset', sub_type: 'inventory', is_group: false, parent_code: '1000' },
    { code: '1500', name: 'Fixed Assets', type: 'asset', is_group: true, parent_code: '1000' },
      { code: '1510', name: 'Property, Plant & Equipment', type: 'asset', sub_type: 'fixed_asset', is_group: false, parent_code: '1500' },
      { code: '1520', name: 'Accumulated Depreciation', type: 'asset', sub_type: 'accum_depr', is_group: false, parent_code: '1500' },

  // 2000 LIABILITIES
  { code: '2000', name: 'Liabilities', type: 'liability', is_group: true, parent_code: null },
    { code: '2100', name: 'Accounts Payable', type: 'liability', sub_type: 'payable', is_group: false, parent_code: '2000' },
    { code: '2150', name: 'Goods Received Not Invoiced (GRNI)', type: 'liability', sub_type: 'grni', is_group: false, parent_code: '2000' },
    { code: '2200', name: 'VAT Payable (Output VAT)', type: 'liability', sub_type: 'tax_payable', is_group: false, parent_code: '2000' },
    { code: '2210', name: 'VAT Input (Reclaimable VAT)', type: 'asset', sub_type: 'tax_input', is_group: false, parent_code: '1000' },
    { code: '2300', name: 'WHT Payable', type: 'liability', sub_type: 'wht_payable', is_group: false, parent_code: '2000' },

  // 3000 EQUITY
  { code: '3000', name: 'Equity', type: 'equity', is_group: true, parent_code: null },
    { code: '3100', name: 'Share Capital', type: 'equity', sub_type: 'equity', is_group: false, parent_code: '3000' },
    { code: '3200', name: 'Retained Earnings', type: 'equity', sub_type: 'retained_earnings', is_group: false, parent_code: '3000' },

  // 4000 REVENUE
  { code: '4000', name: 'Revenue', type: 'revenue', is_group: true, parent_code: null },
    { code: '4100', name: 'Sales Revenue', type: 'revenue', sub_type: 'revenue', is_group: false, parent_code: '4000' },
    { code: '4200', name: 'Sales Discounts & Allowances', type: 'revenue', sub_type: 'revenue_discount', is_group: false, parent_code: '4000' },
    { code: '7101', name: 'Foreign Exchange Gain', type: 'revenue', sub_type: 'fx_gain', is_group: false, parent_code: '4000' },

  // 5000 EXPENSES
  { code: '5000', name: 'Expenses', type: 'expense', is_group: true, parent_code: null },
    { code: '5100', name: 'Cost of Goods Sold (COGS)', type: 'expense', sub_type: 'cogs', is_group: false, parent_code: '5000' },
    { code: '5200', name: 'Operating Expenses', type: 'expense', is_group: true, parent_code: '5000' },
      { code: '5210', name: 'Salaries & Payroll Expense', type: 'expense', sub_type: 'expense', is_group: false, parent_code: '5200' },
      { code: '5220', name: 'Rent Expense', type: 'expense', sub_type: 'expense', is_group: false, parent_code: '5200' },
      { code: '5230', name: 'Utilities & General Expenses', type: 'expense', sub_type: 'expense', is_group: false, parent_code: '5200' },
    { code: '5300', name: 'Inventory Adjustment Expense', type: 'expense', sub_type: 'inventory_adjustment', is_group: false, parent_code: '5000' },
    { code: '5400', name: 'Purchase Price Variance (PPV)', type: 'expense', sub_type: 'ppv', is_group: false, parent_code: '5000' },
    { code: '5500', name: 'Depreciation Expense', type: 'expense', sub_type: 'depr_expense', is_group: false, parent_code: '5000' },
    { code: '7100', name: 'Foreign Exchange Loss', type: 'expense', sub_type: 'fx_loss', is_group: false, parent_code: '5000' },
];

/**
 * Seeds the standard Chart of Accounts for a tenant if no accounts exist yet.
 * Idempotent.
 *
 * @param {Object} dbOrClient - pg Pool or PoolClient
 * @param {string} tenantId
 */
async function seedDefaultCOA(dbOrClient, tenantId) {
  const check = await dbOrClient.query('SELECT 1 FROM accounts WHERE tenant_id::text = $1::text LIMIT 1', [String(tenantId)]);
  if (check.rows.length > 0) {
    return; // Already seeded
  }

  const codeToId = {};

  for (const acc of DEFAULT_COA_TREE) {
    const parentId = acc.parent_code ? codeToId[acc.parent_code] : null;

    const res = await dbOrClient.query(`
      INSERT INTO accounts (tenant_id, code, name, type, sub_type, parent_id, is_group, currency)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'EGP')
      ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [tenantId, acc.code, acc.name, acc.type, acc.sub_type || null, parentId || null, acc.is_group]);

    codeToId[acc.code] = res.rows[0].id;
  }

  console.log(`✅ [AccountService] Default COA seeded for tenant ${tenantId}.`);
}

/**
 * Get Chart of Accounts for a tenant (flat list or hierarchy tree).
 */
async function getAccounts(tenantId, { asTree = false } = {}) {
  // Ensure default accounts exist first
  await seedDefaultCOA(db, tenantId);

  const result = await db.query(`
    SELECT a.*, p.name as parent_name, p.code as parent_code
    FROM accounts a
    LEFT JOIN accounts p ON a.parent_id = p.id
    WHERE a.tenant_id::text = $1::text
    ORDER BY a.code ASC
  `, [String(tenantId)]);

  const rows = result.rows;

  if (!asTree) return rows;

  // Build tree hierarchy
  const map = {};
  const tree = [];

  rows.forEach(acc => {
    map[acc.id] = { ...acc, children: [] };
  });

  rows.forEach(acc => {
    if (acc.parent_id && map[acc.parent_id]) {
      map[acc.parent_id].children.push(map[acc.id]);
    } else {
      tree.push(map[acc.id]);
    }
  });

  return tree;
}

/**
 * Find account by sub_type (e.g. 'receivable', 'payable', 'inventory', 'grni', 'cash').
 */
async function getAccountBySubType(tenantId, subType) {
  await seedDefaultCOA(db, tenantId);

  const result = await db.query(`
    SELECT * FROM accounts
    WHERE tenant_id::text = $1::text AND sub_type = $2 AND is_active = true
    LIMIT 1
  `, [String(tenantId), subType]);

  if (result.rows.length === 0) {
    throw new Error(`Account with sub_type "${subType}" not found for tenant. Ensure COA is configured.`);
  }

  return result.rows[0];
}

/**
 * Create a new custom account.
 */
async function createAccount(tenantId, data) {
  const { code, name, type, sub_type, parent_id, is_group, currency } = data;

  // Validate parent if provided
  if (parent_id) {
    const parentRes = await db.query('SELECT is_group, type FROM accounts WHERE id = $1 AND tenant_id::text = $2::text', [parent_id, String(tenantId)]);
    if (parentRes.rows.length === 0) {
      throw new Error('Parent account not found.');
    }
    if (!parentRes.rows[0].is_group) {
      throw new Error('Parent account must be a Group Account (is_group = true).');
    }
  }

  const result = await db.query(`
    INSERT INTO accounts (tenant_id, code, name, type, sub_type, parent_id, is_group, currency)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [String(tenantId), code, name, type, sub_type || null, parent_id || null, is_group || false, currency || 'EGP']);

  return result.rows[0];
}

/**
 * Validate that an account is eligible for journal posting.
 * Group accounts (is_group = true) CANNOT receive journal entries!
 */
async function validatePostingAccount(dbOrClient, accountId, tenantId) {
  const res = await dbOrClient.query(`
    SELECT id, code, name, is_group, is_active FROM accounts
    WHERE id = $1 AND tenant_id::text = $2::text
  `, [accountId, String(tenantId)]);

  if (res.rows.length === 0) {
    throw new Error(`Account ${accountId} not found.`);
  }

  const acc = res.rows[0];
  if (!acc.is_active) {
    throw new Error(`Account "${acc.code} - ${acc.name}" is inactive.`);
  }
  if (acc.is_group) {
    throw new Error(`Account "${acc.code} - ${acc.name}" is a Group Account and cannot receive journal postings directly.`);
  }

  return acc;
}

module.exports = {
  seedDefaultCOA,
  getAccounts,
  getAccountBySubType,
  createAccount,
  validatePostingAccount,
  DEFAULT_COA_TREE,
};
