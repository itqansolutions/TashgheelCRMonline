-- migrations/007_add_invoices_deal_id_unique_index.sql
-- Idempotent partial unique index preventing duplicate active invoices for the same deal under a tenant.
-- Allows replacement invoices if previous invoices for the deal are 'cancelled'.
-- Uses standard PostgreSQL 9.5+ syntax.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'invoices'
    ) THEN
        -- Safely ensure deal_id column exists
        ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deal_id VARCHAR(255);

        -- Create partial unique index on (tenant_id, deal_id) for active invoices
        CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_active_deal 
        ON invoices (tenant_id, deal_id) 
        WHERE deal_id IS NOT NULL 
          AND (status IS NULL OR status != 'cancelled');
    END IF;
END $$;
