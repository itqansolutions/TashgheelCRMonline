-- Migration 013: Prevent duplicate active Sales Orders from the same Quotation (Phase 2.2)
-- Enforces 1:1 active mapping between Quotation and Sales Order per tenant

BEGIN;

-- 1. Create partial unique index on sales_orders (tenant_id, quotation_id)
-- Guarantees that only ONE non-cancelled Sales Order can exist per Quotation in any given Tenant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_orders_tenant_quotation
    ON sales_orders (tenant_id, quotation_id)
    WHERE quotation_id IS NOT NULL AND (status IS NULL OR status != 'cancelled');

COMMIT;
