-- Migration 005: Phase 5B.3 — Purchase Orders & Purchase Order Items
-- Pure Tashgheel CRM procurement commitment layer

-- Ensure any legacy unpopulated ERP prototype tables are archived safely
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'purchase_orders' AND column_name = 'supplier_id'
    ) THEN
        ALTER TABLE purchase_orders RENAME TO erp_legacy_purchase_orders;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'purchase_order_items' AND column_name = 'purchase_order_id'
    ) THEN
        ALTER TABLE purchase_order_items RENAME TO erp_legacy_purchase_order_items;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS purchase_orders (
    id                     SERIAL PRIMARY KEY,
    po_number              VARCHAR(50) NOT NULL,
    rfq_id                 INTEGER REFERENCES rfqs(id) ON DELETE SET NULL,
    vendor_quotation_id    INTEGER REFERENCES vendor_quotations(id) ON DELETE SET NULL,
    vendor_id              INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    warehouse_id           INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    order_date             DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    payment_terms          TEXT,
    shipping_terms         TEXT,
    subtotal               DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    discount_amount        DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    tax_amount             DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    shipping_cost          DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (shipping_cost >= 0),
    total_amount           DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    status                 VARCHAR(30) NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'approved', 'sent_to_vendor', 'partially_received', 'completed', 'cancelled')),
    notes                  TEXT,
    approved_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at            TIMESTAMP WITH TIME ZONE,
    tenant_id              UUID NOT NULL,
    branch_id              VARCHAR(255),
    created_at             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Unique PO number per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_po_tenant_ponum
    ON purchase_orders (tenant_id, po_number);

-- Enforce exactly one PO per awarded quotation
CREATE UNIQUE INDEX IF NOT EXISTS idx_po_tenant_quotation
    ON purchase_orders (tenant_id, vendor_quotation_id)
    WHERE vendor_quotation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_po_tenant_status
    ON purchase_orders (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_po_tenant_branch
    ON purchase_orders (tenant_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_po_vendor
    ON purchase_orders (vendor_id);

CREATE INDEX IF NOT EXISTS idx_po_warehouse
    ON purchase_orders (warehouse_id);

CREATE INDEX IF NOT EXISTS idx_po_rfq
    ON purchase_orders (rfq_id);

-- purchase_order_items
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id                SERIAL PRIMARY KEY,
    po_id             INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity          DECIMAL(12, 3) NOT NULL CHECK (quantity > 0),
    received_quantity DECIMAL(12, 3) NOT NULL DEFAULT 0.000 CHECK (received_quantity >= 0),
    unit_price        DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
    discount_pct      DECIMAL(5, 2) NOT NULL DEFAULT 0.00 CHECK (discount_pct >= 0 AND discount_pct <= 100),
    tax_pct           DECIMAL(5, 2) NOT NULL DEFAULT 0.00 CHECK (tax_pct >= 0),
    subtotal          DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_poi_received_qty CHECK (received_quantity <= quantity)
);

CREATE INDEX IF NOT EXISTS idx_poi_po
    ON purchase_order_items (po_id);

CREATE INDEX IF NOT EXISTS idx_poi_product
    ON purchase_order_items (product_id);

COMMIT;
