-- Real Estate Installments Migration (v2 - Clean Tracking)
-- Goal: Track core financial flow linked to Real Estate deals

CREATE TABLE IF NOT EXISTS re_payments_mvp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id INTEGER,
    
    deal_id INTEGER UNIQUE REFERENCES deals(id) ON DELETE CASCADE,
    
    total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    down_payment DECIMAL(15, 2) DEFAULT 0.00,
    paid_amount DECIMAL(15, 2) DEFAULT 0.00,
    
    next_payment_date DATE,
    
    status VARCHAR(50) DEFAULT 'Pending', -- System-managed based on math
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for due date lookups
CREATE INDEX IF NOT EXISTS idx_re_payments_due ON re_payments_mvp(next_payment_date);
CREATE INDEX IF NOT EXISTS idx_re_payments_deal ON re_payments_mvp(deal_id);
