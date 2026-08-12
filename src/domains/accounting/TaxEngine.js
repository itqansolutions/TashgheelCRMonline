/**
 * TaxEngine — Enterprise Multi-Component Tax Engine
 *
 * Responsibilities:
 *  - Seed default Egyptian Tax Components (VAT 14%, WHT 1%, WHT 3%, WHT 5%)
 *  - Calculate multi-component tax breakdown per line item (Inclusive, Exclusive, WHT)
 *  - Link tax components to corresponding Chart of Accounts (VAT Payable, WHT Receivable/Payable)
 */

const db = require('../../../config/db');
const AccountService = require('./AccountService');

const DEFAULT_EGYPT_TAX_COMPONENTS = [
  { code: 'VAT14', name: 'Standard VAT 14%', rate: 14.00, applies_to: 'both', is_inclusive: false, is_withholding: false, sub_type: 'tax_payable' },
  { code: 'WHT1',  name: 'WHT Contracting & Services 1%', rate: 1.00, applies_to: 'both', is_inclusive: false, is_withholding: true, sub_type: 'wht_receivable' },
  { code: 'WHT3',  name: 'WHT Advisory & Services 3%', rate: 3.00, applies_to: 'both', is_inclusive: false, is_withholding: true, sub_type: 'wht_receivable' },
  { code: 'WHT5',  name: 'WHT Commercial & Royalties 5%', rate: 5.00, applies_to: 'both', is_inclusive: false, is_withholding: true, sub_type: 'wht_receivable' },
];

/**
 * Seed default Egyptian tax components for a tenant if none exist.
 */
async function seedDefaultTaxComponents(dbOrClient, tenantId) {
  const check = await dbOrClient.query('SELECT 1 FROM tax_components WHERE tenant_id::text = $1::text LIMIT 1', [String(tenantId)]);
  if (check.rows.length > 0) return;

  for (const comp of DEFAULT_EGYPT_TAX_COMPONENTS) {
    let glAccountId = null;
    try {
      const acc = await AccountService.getAccountBySubType(tenantId, comp.sub_type);
      glAccountId = acc ? acc.id : null;
    } catch (e) {
      // If COA not yet seeded, account will be linked later
    }

    await dbOrClient.query(`
      INSERT INTO tax_components
        (tenant_id, name, code, rate, type, applies_to, is_inclusive, is_withholding, gl_account_id, country_code)
      VALUES ($1, $2, $3, $4, 'percentage', $5, $6, $7, $8, 'EG')
      ON CONFLICT (tenant_id, code) DO NOTHING
    `, [String(tenantId), comp.name, comp.code, comp.rate, comp.applies_to, comp.is_inclusive, comp.is_withholding, glAccountId]);
  }

  console.log(`✅ [TaxEngine] Default tax components seeded for tenant ${tenantId}.`);
}

/**
 * Get all tax components for a tenant.
 */
async function getTaxComponents(tenantId) {
  await seedDefaultTaxComponents(db, tenantId);

  const result = await db.query(`
    SELECT tc.*, a.code as gl_account_code, a.name as gl_account_name
    FROM tax_components tc
    LEFT JOIN accounts a ON tc.gl_account_id = a.id
    WHERE tc.tenant_id::text = $1::text AND tc.is_active = true
    ORDER BY tc.code ASC
  `, [String(tenantId)]);

  return result.rows;
}

/**
 * Calculate multi-component tax breakdown for a document line item.
 *
 * @param {number} lineAmount - Line total before tax (or inclusive total)
 * @param {Array<string>} componentIds - Array of tax_component UUIDs applied to this line
 * @param {string} tenantId
 * @returns {Promise<Object>} tax breakdown object containing:
 *  {
 *    taxable_amount,
 *    total_tax_amount,
 *    total_wht_amount,
 *    net_line_amount,
 *    breakdown: [ { tax_component_id, name, rate, tax_amount, is_inclusive, is_withholding, gl_account_id } ]
 *  }
 */
async function calculateLineTaxes(lineAmount, componentIds, tenantId) {
  if (!componentIds || componentIds.length === 0) {
    return {
      taxable_amount: lineAmount,
      total_tax_amount: 0,
      total_wht_amount: 0,
      net_line_amount: lineAmount,
      breakdown: []
    };
  }

  const result = await db.query(`
    SELECT * FROM tax_components
    WHERE id = ANY($1) AND tenant_id::text = $2::text AND is_active = true
  `, [componentIds, String(tenantId)]);

  const components = result.rows;
  let taxableAmount = lineAmount;
  let totalTaxAmount = 0;
  let totalWhtAmount = 0;
  const breakdown = [];

  // Check if any applied tax is inclusive
  const inclusiveTax = components.find(c => c.is_inclusive && !c.is_withholding);
  if (inclusiveTax) {
    taxableAmount = lineAmount / (1 + Number(inclusiveTax.rate) / 100);
  }

  for (const comp of components) {
    const rate = Number(comp.rate);
    let taxAmount = 0;

    if (comp.is_withholding) {
      // WHT is calculated on taxable base and subtracted from payment settlement
      taxAmount = taxableAmount * (rate / 100);
      totalWhtAmount += taxAmount;
    } else if (comp.is_inclusive) {
      taxAmount = lineAmount - taxableAmount;
      totalTaxAmount += taxAmount;
    } else {
      // Exclusive tax (e.g. Standard VAT)
      taxAmount = taxableAmount * (rate / 100);
      totalTaxAmount += taxAmount;
    }

    breakdown.push({
      tax_component_id: comp.id,
      name: comp.name,
      code: comp.code,
      rate,
      taxable_amount: Number(taxableAmount.toFixed(2)),
      tax_amount: Number(taxAmount.toFixed(2)),
      is_inclusive: comp.is_inclusive,
      is_withholding: comp.is_withholding,
      gl_account_id: comp.gl_account_id,
    });
  }

  const netLineAmount = taxableAmount + totalTaxAmount - totalWhtAmount;

  return {
    taxable_amount: Number(taxableAmount.toFixed(2)),
    total_tax_amount: Number(totalTaxAmount.toFixed(2)),
    total_wht_amount: Number(totalWhtAmount.toFixed(2)),
    net_line_amount: Number(netLineAmount.toFixed(2)),
    breakdown,
  };
}

/**
 * Save document line tax breakdown into document_line_taxes table.
 */
async function saveDocumentLineTaxes(dbOrClient, tenantId, documentType, documentLineId, breakdown) {
  for (const item of breakdown) {
    await dbOrClient.query(`
      INSERT INTO document_line_taxes
        (tenant_id, document_type, document_line_id, tax_component_id, taxable_amount, tax_rate, tax_amount, is_inclusive, is_withholding, wht_account_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      String(tenantId), documentType, documentLineId, item.tax_component_id,
      item.taxable_amount, item.rate, item.tax_amount, item.is_inclusive,
      item.is_withholding, item.is_withholding ? item.gl_account_id : null
    ]);
  }
}

module.exports = {
  seedDefaultTaxComponents,
  getTaxComponents,
  calculateLineTaxes,
  saveDocumentLineTaxes,
  DEFAULT_EGYPT_TAX_COMPONENTS,
};
