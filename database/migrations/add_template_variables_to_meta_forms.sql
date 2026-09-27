-- Migration: Add template variables mapping and linked product to meta_forms & settings

-- 1. Extend meta_forms table
ALTER TABLE meta_forms ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE meta_forms ADD COLUMN IF NOT EXISTS template_name VARCHAR(120);
ALTER TABLE meta_forms ADD COLUMN IF NOT EXISTS template_language VARCHAR(20) DEFAULT 'ar';
ALTER TABLE meta_forms ADD COLUMN IF NOT EXISTS variable_mapping JSONB DEFAULT '[]'::jsonb;
ALTER TABLE meta_forms ADD COLUMN IF NOT EXISTS custom_variables JSONB DEFAULT '{}'::jsonb;

-- Index for product lookup
CREATE INDEX IF NOT EXISTS idx_meta_forms_product_id ON meta_forms(product_id);

-- 2. Extend meta_integration_settings table
ALTER TABLE meta_integration_settings ADD COLUMN IF NOT EXISTS default_variable_mapping JSONB DEFAULT '[]'::jsonb;
ALTER TABLE meta_integration_settings ADD COLUMN IF NOT EXISTS default_template_name VARCHAR(120);

-- 3. Extend whatsapp_settings table
ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS variable_mapping JSONB DEFAULT '[]'::jsonb;