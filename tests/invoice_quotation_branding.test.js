const test = require('node:test');
const assert = require('node:assert/strict');
const tenantsController = require('../controllers/tenantsController');
const financeController = require('../controllers/financeController');
const quotationsController = require('../controllers/quotationsController');
const filesController = require('../controllers/filesController');
const db = require('../config/db');

function mockReqRes({ body = {}, params = {}, user = { id: 1, tenant_id: 'tenant-abc-123', branch_id: 'branch-1' }, file = null } = {}) {
  const req = {
    body,
    params,
    user,
    file,
    headers: {}
  };

  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    }
  };

  return { req, res };
}

test('Invoice & Quotation Branding & Header Customization Test Suite', async (t) => {
  const origQuery = db.query;

  t.afterEach(() => {
    db.query = origQuery;
  });

  await t.test('1. updateTenant persists customized invoice & quotation header fields', async () => {
    const executedQueries = [];
    db.query = async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('SELECT * FROM tenants WHERE id::text = $1::text')) {
        return {
          rows: [{
            id: 'tenant-abc-123',
            name: 'Original Name',
            invoice_header_title: 'فاتورة ضريبية',
            invoice_header_subtitle: null,
            quotation_header_title: 'عرض أسعار',
            quotation_header_subtitle: null
          }]
        };
      }
      if (sql.includes('ALTER TABLE tenants')) {
        return { rows: [] };
      }
      if (sql.includes('UPDATE tenants')) {
        return {
          rows: [{
            id: 'tenant-abc-123',
            name: 'Abelaty Co',
            invoice_header_title: 'فاتورة ضريبية رسمية',
            invoice_header_subtitle: 'حلول ذكية للمقاولات',
            quotation_header_title: 'عرض أسعار معتمد',
            quotation_header_subtitle: 'صلاحية 15 يوماً'
          }]
        };
      }
      return { rows: [] };
    };

    const { req, res } = mockReqRes({
      params: { id: 'tenant-abc-123' },
      body: {
        name: 'Abelaty Co',
        invoice_header_title: 'فاتورة ضريبية رسمية',
        invoice_header_subtitle: 'حلول ذكية للمقاولات',
        quotation_header_title: 'عرض أسعار معتمد',
        quotation_header_subtitle: 'صلاحية 15 يوماً'
      }
    });

    await tenantsController.updateTenant(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.status, 'success');
    assert.equal(res.data.data.name, 'Abelaty Co');
    assert.equal(res.data.data.invoice_header_title, 'فاتورة ضريبية رسمية');
    assert.equal(res.data.data.invoice_header_subtitle, 'حلول ذكية للمقاولات');
    assert.equal(res.data.data.quotation_header_title, 'عرض أسعار معتمد');
    assert.equal(res.data.data.quotation_header_subtitle, 'صلاحية 15 يوماً');
  });

  await t.test('2. getInvoiceDetails returns invoice along with dynamic tenant branding', async () => {
    db.query = async (sql, params) => {
      if (sql.includes('FROM invoices i')) {
        return {
          rows: [{
            id: 'inv-101',
            invoice_number: 'INV-0002',
            total_amount: '20000',
            tenant_id: 'tenant-abc-123'
          }]
        };
      }
      if (sql.includes('FROM invoice_items')) {
        return { rows: [{ id: 1, description: 'Items from quotation', quantity: 1, unit_price: 20000, subtotal: 20000 }] };
      }
      if (sql.includes('FROM payments')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT * FROM tenants WHERE id::text = $1::text')) {
        return {
          rows: [{
            id: 'tenant-abc-123',
            name: 'Abelaty',
            logo_url: 'uploads/tenant-abc-123/logo.png',
            address: 'Business St, Smart Village, Egypt 123',
            tax_no: '123-456-789',
            reg_no: 'Reg No. 5566',
            phone: '+201234567890',
            invoice_header_title: 'فاتورة ضريبية',
            invoice_header_subtitle: 'توريدات عمومية ومقاولات',
            terms: 'مستحق عند الاستلام',
            invoice_footer: 'شكراً لتعاملكم معنا'
          }]
        };
      }
      return { rows: [] };
    };

    const { req, res } = mockReqRes({ params: { id: 'inv-101' } });
    await financeController.getInvoiceDetails(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.status, 'success');
    assert.ok(res.data.data.invoice);
    assert.ok(res.data.data.tenant);
    assert.equal(res.data.data.tenant.name, 'Abelaty');
    assert.equal(res.data.data.tenant.invoice_header_title, 'فاتورة ضريبية');
    assert.equal(res.data.data.tenant.invoice_header_subtitle, 'توريدات عمومية ومقاولات');
    assert.equal(res.data.data.tenant.tax_no, '123-456-789');
    assert.equal(res.data.data.tenant.logo_url, 'uploads/tenant-abc-123/logo.png');
  });

  await t.test('3. getQuotationById returns quotation along with dynamic tenant branding', async () => {
    db.query = async (sql, params) => {
      if (sql.includes('FROM quotations q')) {
        return {
          rows: [{
            id: 201,
            number: 'QUO-001',
            total_amount: 15000,
            tenant_id: 'tenant-abc-123'
          }]
        };
      }
      if (sql.includes('FROM quotation_items')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT * FROM tenants WHERE id::text = $1::text')) {
        return {
          rows: [{
            id: 'tenant-abc-123',
            name: 'Abelaty',
            logo_url: 'uploads/tenant-abc-123/logo.png',
            quotation_header_title: 'عرض أسعار',
            quotation_header_subtitle: 'عروض أسعار معتمدة',
            quotation_terms: 'ساري لمدة 15 يوماً',
            quotation_footer: 'نتطلع للتعاون معكم'
          }]
        };
      }
      return { rows: [] };
    };

    const { req, res } = mockReqRes({ params: { id: '201' } });
    await quotationsController.getQuotationById(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.status, 'success');
    assert.ok(res.data.data.tenant);
    assert.equal(res.data.data.tenant.name, 'Abelaty');
    assert.equal(res.data.data.tenant.quotation_header_title, 'عرض أسعار');
    assert.equal(res.data.data.tenant.quotation_header_subtitle, 'عروض أسعار معتمدة');
    assert.equal(res.data.data.tenant.quotation_terms, 'ساري لمدة 15 يوماً');
  });

  await t.test('4. filesController.uploadFile auto-updates tenant logo_url and handles Tenant linkage', async () => {
    let tenantUpdatedLogo = null;
    db.query = async (sql, params) => {
      if (sql.includes('INSERT INTO attachments')) {
        return { rows: [{ id: 99, file_path: params[3] }] };
      }
      if (sql.includes('UPDATE tenants SET logo_url')) {
        tenantUpdatedLogo = params[0];
        return { rows: [] };
      }
      return { rows: [] };
    };

    const mockFile = {
      filename: '1728888-logo.png',
      originalname: 'logo.png',
      mimetype: 'image/png',
      path: 'uploads/tenant-abc-123/1728888-logo.png'
    };

    const { req, res } = mockReqRes({
      body: { linked_type: 'Tenant', linked_id: 'undefined' },
      file: mockFile
    });

    await filesController.uploadFile(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.data.status, 'success');
    assert.ok(tenantUpdatedLogo);
    assert.match(tenantUpdatedLogo, /logo\.png/);
  });
});
