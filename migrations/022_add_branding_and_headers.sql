-- Migration 022: Add Invoice & Quotation Branding, Header Customization & Ensure Attachments Table
-- Multi-Tenant Idempotent Migration

-- 1. Ensure branding and custom header columns in tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_no VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS reg_no VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'EGP';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_rate NUMERIC DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_prefix VARCHAR(20) DEFAULT 'INV-';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_footer TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS terms TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS quotation_prefix VARCHAR(10) DEFAULT 'QUO-';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS quotation_footer TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS quotation_terms TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS primary_color VARCHAR(20) DEFAULT '#f59e0b';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_header_title VARCHAR(255) DEFAULT 'فاتورة ضريبية';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_header_subtitle VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS quotation_header_title VARCHAR(255) DEFAULT 'عرض أسعار';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS quotation_header_subtitle VARCHAR(255);

-- 2. Ensure attachments table exists with safe types for multi-tenant attachments
CREATE TABLE IF NOT EXISTS attachments (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    file_path TEXT NOT NULL,
    linked_type VARCHAR(50) NOT NULL,
    linked_id VARCHAR(255) NOT NULL,
    uploaded_by INTEGER,
    tenant_id VARCHAR(255),
    branch_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure attachments columns exist if table was created with an older schema
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS linked_type VARCHAR(50);
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS linked_id VARCHAR(255);
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS uploaded_by INTEGER;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255);
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Relax any foreign key / not-null constraints on legacy attachments columns if needed
ALTER TABLE attachments ALTER COLUMN linked_id TYPE VARCHAR(255);
ALTER TABLE attachments ALTER COLUMN tenant_id TYPE VARCHAR(255);
ALTER TABLE attachments ALTER COLUMN branch_id TYPE VARCHAR(255);
ALTER TABLE attachments ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE attachments ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE attachments ALTER COLUMN branch_id DROP NOT NULL;

-- 3. Multi-tenant indexes for fast file lookup
CREATE INDEX IF NOT EXISTS idx_attachments_tenant ON attachments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attachments_tenant_linked ON attachments(tenant_id, linked_type, linked_id);
CREATE INDEX IF NOT EXISTS idx_attachments_filename ON attachments(filename);
