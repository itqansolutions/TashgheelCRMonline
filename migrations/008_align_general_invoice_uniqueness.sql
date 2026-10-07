-- migrations/008_align_general_invoice_uniqueness.sql
-- Alignment for General CRM Multi-Order Sales Architecture:
-- 1. Drops the restrictive deal-level unique index (uq_invoices_active_deal) if present,
--    enabling multiple Sales Orders and multiple active Invoices under a single Deal (Deal -> SO1 -> Inv1, SO2 -> Inv2).
-- 2. Direct Deal -> Invoice single billing remains protected in code via application-level idempotency and FOR UPDATE locks.
-- 3. Creates partial unique index on (tenant_id, sales_order_id) for active invoices,
--    enforcing strict single-active-invoice identity per Sales Order while allowing cancelled replacements.
-- Uses standard PostgreSQL 9.5+ syntax.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'invoices'
    ) THEN
        -- Safely ensure sales_order_id column exists
        ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sales_order_id VARCHAR(255);

        -- Step 1: Explicitly drop the deal-level uniqueness constraint/index if it exists
        DROP INDEX IF EXISTS uq_invoices_active_deal;

        -- Step 2: Enforce partial unique index per Sales Order under each tenant
        CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_active_sales_order
        ON invoices (tenant_id, sales_order_id)
        WHERE sales_order_id IS NOT NULL 
          AND (status IS NULL OR status != 'cancelled');
    END IF;
END $$;
