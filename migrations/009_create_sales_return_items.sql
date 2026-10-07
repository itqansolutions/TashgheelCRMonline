-- =====================================================================
-- Migration 009: Create sales_return_items table for Delivery Returns (Stock IN)
-- Phase G-5: Delivery Returns & Stock IN Integrity
-- =====================================================================

CREATE TABLE IF NOT EXISTS sales_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255),
    number VARCHAR(50) NOT NULL,
    delivery_note_id UUID REFERENCES delivery_notes(id),
    customer_id INTEGER REFERENCES customers(id),
    return_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(30) DEFAULT 'draft',
    accounting_status VARCHAR(20) DEFAULT 'unposted',
    journal_entry_id UUID REFERENCES journal_entries(id),
    total_amount NUMERIC(15,2) DEFAULT 0,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, number)
);

CREATE TABLE IF NOT EXISTS sales_return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_return_id UUID REFERENCES sales_returns(id) ON DELETE CASCADE,
    delivery_note_item_id UUID REFERENCES delivery_note_items(id) ON DELETE RESTRICT,
    product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
    quantity_returned NUMERIC(12,3) NOT NULL CHECK (quantity_returned > 0),
    unit_cost NUMERIC(12,2) DEFAULT 0,
    tenant_id VARCHAR(255) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_returns_dn ON sales_returns(tenant_id, delivery_note_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_dni ON sales_return_items(delivery_note_item_id);
