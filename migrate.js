/**
 * migrate.js — One-time migration runner
 * Runs via: node migrate.js
 * Uses the project's existing config/db connection (no psql needed).
 */

const db = require('./config/db');

const SQL = `
BEGIN;

-- 1. treasury_accounts table
CREATE TABLE IF NOT EXISTS treasury_accounts (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(255) NOT NULL,
    type             VARCHAR(20)  NOT NULL DEFAULT 'cash'
                     CHECK (type IN ('cash', 'bank')),
    bank_name        VARCHAR(255),
    account_number   VARCHAR(100),
    opening_balance  DECIMAL(15, 2) NOT NULL DEFAULT 0,
    is_default       BOOLEAN NOT NULL DEFAULT false,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    tenant_id        UUID NOT NULL,
    branch_id        VARCHAR(255),
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_treasury_accounts_tenant
    ON treasury_accounts (tenant_id, branch_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_treasury_one_default_per_type
    ON treasury_accounts (tenant_id, branch_id, type)
    WHERE is_default = true;

-- 2. payments.treasury_account_id
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS treasury_account_id INTEGER
        REFERENCES treasury_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_treasury_account
    ON payments (treasury_account_id)
    WHERE treasury_account_id IS NOT NULL;

-- 3. expenses.treasury_account_id + expenses.payment_method
ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS treasury_account_id INTEGER
        REFERENCES treasury_accounts(id) ON DELETE SET NULL;

ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'cash';

CREATE INDEX IF NOT EXISTS idx_expenses_treasury_account
    ON expenses (treasury_account_id)
    WHERE treasury_account_id IS NOT NULL;

-- 4. Phase 5A: purchase_invoices.due_date + finance_vouchers.treasury_account_id
ALTER TABLE purchase_invoices
    ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE finance_vouchers
    ADD COLUMN IF NOT EXISTS treasury_account_id INTEGER
        REFERENCES treasury_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fv_treasury_account
    ON finance_vouchers(treasury_account_id)
    WHERE treasury_account_id IS NOT NULL;

-- 5. Phase 5B.1: purchase_requests & purchase_request_items
CREATE TABLE IF NOT EXISTS purchase_requests (
    id                  SERIAL PRIMARY KEY,
    request_number      VARCHAR(50) NOT NULL,
    requested_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    department          VARCHAR(100),
    branch_id           VARCHAR(255),
    warehouse_id        INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
    priority            VARCHAR(20) NOT NULL DEFAULT 'normal'
                        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    required_date       DATE,
    notes               TEXT,
    status              VARCHAR(30) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'converted_to_rfq')),
    rejection_reason    TEXT,
    approved_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at         TIMESTAMP WITH TIME ZONE,
    tenant_id           UUID NOT NULL,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_tenant_reqnum
    ON purchase_requests (tenant_id, request_number);

CREATE INDEX IF NOT EXISTS idx_pr_tenant_branch
    ON purchase_requests (tenant_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_pr_status
    ON purchase_requests (tenant_id, status);

CREATE TABLE IF NOT EXISTS purchase_request_items (
    id                   SERIAL PRIMARY KEY,
    request_id           INTEGER NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    product_id          INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    description          TEXT,
    quantity             DECIMAL(12, 3) NOT NULL CHECK (quantity > 0),
    estimated_unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00 CHECK (estimated_unit_price >= 0),
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pr_items_request
    ON purchase_request_items (request_id);

CREATE INDEX IF NOT EXISTS idx_pr_items_product
    ON purchase_request_items (product_id);

-- 6. Phase 5B.2: RFQs, RFQ Vendors, RFQ Items, Vendor Quotations, Quotation Items
CREATE TABLE IF NOT EXISTS rfqs (
    id                  SERIAL PRIMARY KEY,
    rfq_number          VARCHAR(50) NOT NULL,
    purchase_request_id INTEGER REFERENCES purchase_requests(id) ON DELETE SET NULL,
    issue_date          DATE NOT NULL DEFAULT CURRENT_DATE,
    deadline_date       DATE,
    status              VARCHAR(30) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'sent', 'quotes_received', 'awarded', 'closed', 'cancelled')),
    notes               TEXT,
    created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    tenant_id           UUID NOT NULL,
    branch_id           VARCHAR(255),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rfq_tenant_num
    ON rfqs (tenant_id, rfq_number);

CREATE INDEX IF NOT EXISTS idx_rfq_tenant_status
    ON rfqs (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_rfq_tenant_branch
    ON rfqs (tenant_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_rfq_pr_id
    ON rfqs (purchase_request_id);

CREATE TABLE IF NOT EXISTS rfq_items (
    id           SERIAL PRIMARY KEY,
    rfq_id       INTEGER NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity     DECIMAL(12, 3) NOT NULL CHECK (quantity > 0),
    target_specs TEXT,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rfq_items_rfq
    ON rfq_items (rfq_id);

CREATE INDEX IF NOT EXISTS idx_rfq_items_product
    ON rfq_items (product_id);

CREATE TABLE IF NOT EXISTS rfq_vendors (
    id                SERIAL PRIMARY KEY,
    rfq_id            INTEGER NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    vendor_id         INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    invitation_status VARCHAR(30) NOT NULL DEFAULT 'sent'
                      CHECK (invitation_status IN ('sent', 'quoted', 'declined')),
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_rfq_vendor UNIQUE (rfq_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_rfq_vendors_rfq
    ON rfq_vendors (rfq_id);

CREATE INDEX IF NOT EXISTS idx_rfq_vendors_vendor
    ON rfq_vendors (vendor_id);

CREATE TABLE IF NOT EXISTS vendor_quotations (
    id                  SERIAL PRIMARY KEY,
    quotation_number    VARCHAR(100) NOT NULL,
    rfq_id              INTEGER NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    vendor_id           INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    quotation_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until         DATE,
    currency            VARCHAR(10) NOT NULL DEFAULT 'EGP',
    payment_terms       TEXT,
    delivery_time_days  INTEGER NOT NULL DEFAULT 0 CHECK (delivery_time_days >= 0),
    warranty_terms      TEXT,
    subtotal            DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    discount_amount     DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    tax_amount          DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    shipping_cost       DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (shipping_cost >= 0),
    total_amount        DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    selection_status    VARCHAR(30) NOT NULL DEFAULT 'under_review'
                        CHECK (selection_status IN ('under_review', 'selected', 'rejected', 'expired')),
    selection_notes     TEXT,
    awarded_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    awarded_at          TIMESTAMP WITH TIME ZONE,
    tenant_id           UUID NOT NULL,
    branch_id           VARCHAR(255),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vq_tenant_vendor_qnum
    ON vendor_quotations (tenant_id, vendor_id, quotation_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vq_rfq_vendor
    ON vendor_quotations (rfq_id, vendor_id);

CREATE INDEX IF NOT EXISTS idx_vq_rfq_id
    ON vendor_quotations (rfq_id);

CREATE INDEX IF NOT EXISTS idx_vq_tenant_status
    ON vendor_quotations (tenant_id, selection_status);

CREATE TABLE IF NOT EXISTS vendor_quotation_items (
    id             SERIAL PRIMARY KEY,
    quotation_id   INTEGER NOT NULL REFERENCES vendor_quotations(id) ON DELETE CASCADE,
    product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity       DECIMAL(12, 3) NOT NULL CHECK (quantity > 0),
    unit_price     DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
    discount_pct   DECIMAL(5, 2) NOT NULL DEFAULT 0.00 CHECK (discount_pct >= 0 AND discount_pct <= 100),
    tax_pct        DECIMAL(5, 2) NOT NULL DEFAULT 0.00 CHECK (tax_pct >= 0),
    subtotal       DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vqi_quotation
    ON vendor_quotation_items (quotation_id);

CREATE INDEX IF NOT EXISTS idx_vqi_product
    ON vendor_quotation_items (product_id);

COMMIT;
`;

async function run() {
  console.log('\n[migrate] Starting treasury migration...\n');
  try {
    await db.query(SQL);
    console.log('[migrate] ✅ treasury_accounts created');
    console.log('[migrate] ✅ payments.treasury_account_id added');
    console.log('[migrate] ✅ expenses.treasury_account_id added');
    console.log('[migrate] ✅ expenses.payment_method added');
    console.log('\n[migrate] Migration complete.\n');
  } catch (err) {
    console.error('[migrate] ❌ Error:', err.message);
    process.exit(1);
  }

  // Verify
  try {
    const r = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name IN ('treasury_accounts','payments','expenses')
        AND column_name IN ('treasury_account_id','payment_method','id','type','is_default')
      ORDER BY table_name, column_name
    `);
    console.log('[migrate] Verification — relevant columns found:');
    r.rows.forEach(c => console.log('  ', c.column_name));
  } catch (e) {
    console.log('[migrate] Verification skipped:', e.message);
  }

  process.exit(0);
}

run();
