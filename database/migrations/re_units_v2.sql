-- Real Estate Sales OS: Phase 1 Migration
-- Goal: Create units registry and link them to specialized deals

-- 1. Units Table (UUID based as requested)
CREATE TABLE IF NOT EXISTS re_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id INTEGER, -- Optional, can be null for global units
    
    project_name VARCHAR(255) NOT NULL,
    unit_number VARCHAR(100) NOT NULL,
    type VARCHAR(100) NOT NULL, -- Apartment, Villa, Office, etc.
    
    floor INTEGER,
    area DECIMAL(12, 2),
    
    price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'Available', -- Available, Reserved, Sold
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Link Deals to Units
-- Note: Deals table uses SERIAL PK, adding UUID column for unit link
ALTER TABLE deals ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES re_units(id) ON DELETE SET NULL;

-- 3. Installments MVP Table
CREATE TABLE IF NOT EXISTS re_payments_mvp (
    id SERIAL PRIMARY KEY,
    deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    
    total_amount DECIMAL(15, 2) NOT NULL,
    down_payment DECIMAL(15, 2) DEFAULT 0.00,
    remaining_amount DECIMAL(15, 2) NOT NULL,
    
    next_payment_date DATE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Enable status integrity check index
CREATE INDEX IF NOT EXISTS idx_re_units_status ON re_units(status);
CREATE INDEX IF NOT EXISTS idx_re_units_tenant ON re_units(tenant_id);
