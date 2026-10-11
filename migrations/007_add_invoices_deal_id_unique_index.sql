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

        -- Migration 007 is superseded by Migration 008 (uq_invoices_active_sales_order).
        -- If Migration 008 is already recorded or uq_invoices_active_sales_order exists,
        -- do not recreate uq_invoices_active_deal.
        IF NOT EXISTS (
            SELECT 1 FROM schema_migrations WHERE name = '008_align_general_invoice_uniqueness.sql'
        ) AND NOT EXISTS (
            SELECT 1 FROM pg_indexes WHERE tablename = 'invoices' AND indexname = 'uq_invoices_active_sales_order'
        ) THEN
            CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_active_deal 
            ON invoices (tenant_id, deal_id) 
            WHERE deal_id IS NOT NULL 
              AND (status IS NULL OR status != 'cancelled');
        END IF;
    END IF;
END $$;
