-- Migration: Add notes and meta form metadata to customers table
-- Enables storing full lead answers, campaign info, and linking customers to specific Meta forms

ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_form_name VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_form_id VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_customers_meta_form_id ON customers(meta_form_id);
CREATE INDEX IF NOT EXISTS idx_customers_meta_lead_id ON customers(meta_lead_id);
