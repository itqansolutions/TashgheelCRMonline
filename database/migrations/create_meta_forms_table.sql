-- Migration: Create meta_forms table and add meta_lead_id to customers
-- Supports Meta Lead Ads Form integration

CREATE TABLE IF NOT EXISTS meta_forms (
    id SERIAL PRIMARY KEY,
    form_id VARCHAR(120) NOT NULL,
    form_name VARCHAR(255) NOT NULL,
    page_name VARCHAR(255),
    page_access_token TEXT,
    lead_source_id INTEGER REFERENCES lead_sources(id) ON DELETE SET NULL,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    lead_count INTEGER DEFAULT 0,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_form_id UNIQUE (tenant_id, form_id)
);

-- Index for fast lookup during sync and webhooks
CREATE INDEX IF NOT EXISTS idx_meta_forms_form_id ON meta_forms(form_id);
CREATE INDEX IF NOT EXISTS idx_meta_forms_tenant_id ON meta_forms(tenant_id);

-- Add meta_lead_id to customers table to prevent duplicates
ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_lead_id VARCHAR(120);
CREATE INDEX IF NOT EXISTS idx_customers_meta_lead_id ON customers(meta_lead_id);
