const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Phase 4: Attribution & Funnel Analytics + Business Operations', async (t) => {

  await t.test('Meta Service: Structured campaign attribution columns & saving', () => {
    const content = fs.readFileSync(path.join(__dirname, '../services/metaService.js'), 'utf8');

    assert.match(content, /ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_campaign_name/, 'Must add meta_campaign_name column');
    assert.match(content, /ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_adset_name/, 'Must add meta_adset_name column');
    assert.match(content, /ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_ad_name/, 'Must add meta_ad_name column');

    assert.match(content, /meta_campaign_name = COALESCE\(\$9, meta_campaign_name\)/, 'Update query must save meta_campaign_name');
    assert.match(content, /INSERT INTO customers \([\s\S]*meta_campaign_name[\s\S]*meta_adset_name[\s\S]*meta_ad_name/, 'Insert query must save structured meta fields');
  });

  await t.test('WhatsApp Inbound: Unknown number automatically creates CRM lead', () => {
    const content = fs.readFileSync(path.join(__dirname, '../controllers/whatsappController.js'), 'utf8');

    assert.match(content, /Auto-create CRM lead if unknown phone number/, 'Must have unknown phone number handling');
    assert.match(content, /INSERT INTO customers \([\s\S]*source[\s\S]*status[\s\S]*VALUES[\s\S]*'WhatsApp'[\s\S]*'lead'/, 'Must create customer with source WhatsApp and status lead');
  });

  await t.test('Commissions: Trigger events and cancellation clawback status support', () => {
    const commContent = fs.readFileSync(path.join(__dirname, '../controllers/reCommissionsController.js'), 'utf8');

    assert.match(commContent, /trigger_event = 'contract_signing'/, 'Must support trigger_event default');
    assert.match(commContent, /contract_signing[\s\S]*down_payment[\s\S]*installment_collection/, 'Must support all three trigger events');
    assert.match(commContent, /'Clawback'/, 'Must support Clawback status transition');

    const cancelContent = fs.readFileSync(path.join(__dirname, '../controllers/reCancellationsController.js'), 'utf8');
    assert.match(cancelContent, /UPDATE re_commissions SET[\s\S]*status = CASE WHEN paid_amount > 0 THEN 'Clawback' ELSE 'Cancelled' END/, 'Cancellation must clawback or cancel deal commissions');
  });

  await t.test('Cancellations: Never deletes contracts or payments, releases unit to Available', () => {
    const content = fs.readFileSync(path.join(__dirname, '../controllers/reCancellationsController.js'), 'utf8');

    assert.match(content, /UPDATE re_contracts SET\s+status = 'Cancelled'/, 'Contract must be updated to Cancelled, never deleted');
    assert.match(content, /UPDATE re_units SET\s+status = 'Available'/, 'Unit must be released to Available');
    assert.doesNotMatch(content, /DELETE FROM re_contracts/, 'Must never delete re_contracts');
    assert.doesNotMatch(content, /DELETE FROM re_installments/, 'Must never delete re_installments');
  });

  await t.test('Funnel Reports: Real Estate and General funnel stages', () => {
    const reportContent = fs.readFileSync(path.join(__dirname, '../controllers/reportsController.js'), 'utf8');
    const routesContent = fs.readFileSync(path.join(__dirname, '../routes/reportRoutes.js'), 'utf8');

    assert.match(routesContent, /router\.get\('\/funnel'/, 'Route /funnel must be registered');
    assert.match(reportContent, /exports\.getFunnelReport/, 'reportsController must export getFunnelReport');

    // Real Estate Funnel stages
    assert.match(reportContent, /'lead'/, 'Funnel includes lead');
    assert.match(reportContent, /'customer'/, 'Funnel includes customer');
    assert.match(reportContent, /'requirement'/, 'Funnel includes requirement');
    assert.match(reportContent, /'deal'/, 'Funnel includes deal');
    assert.match(reportContent, /'site_visit'/, 'Funnel includes site_visit');
    assert.match(reportContent, /'reservation'/, 'Funnel includes reservation');
    assert.match(reportContent, /'contract'/, 'Funnel includes contract');
    assert.match(reportContent, /'collection'/, 'Funnel includes collection');
    assert.match(reportContent, /'commission'/, 'Funnel includes commission');
    assert.match(reportContent, /'handover'/, 'Funnel includes handover');

    // General Funnel stages
    assert.match(reportContent, /'quotation'/, 'Funnel includes quotation');
    assert.match(reportContent, /'sales_order'/, 'Funnel includes sales_order');
    assert.match(reportContent, /'delivery'/, 'Funnel includes delivery');
    assert.match(reportContent, /'invoice'/, 'Funnel includes invoice');
  });
});
