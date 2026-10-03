-- Migration 004: Phase 5B.2 — RFQ & Vendor Quotations
-- Tables: rfqs, rfq_vendors, rfq_items, vendor_quotations, vendor_quotation_items

BEGIN;

-- 1. rfqs
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

-- 2. rfq_items
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

-- 3. rfq_vendors
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

-- 4. vendor_quotations
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

CREATE INDEX IF NOT EXISTS idx_vq_rfq_id
    ON vendor_quotations (rfq_id);

CREATE INDEX IF NOT EXISTS idx_vq_tenant_status
    ON vendor_quotations (tenant_id, selection_status);

-- 5. vendor_quotation_items
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
