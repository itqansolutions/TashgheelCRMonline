-- =========================================================================
-- MIGRATION 031: sales discount (quotation -> sales order -> invoice)
-- =========================================================================
-- Additive only. New nullable/defaulted columns, no rewrite of existing rows' totals.
-- Existing rows get discount 0 (catalog-only change in PostgreSQL 11+ for constant defaults).
-- total_amount stays the NET (after discount) figure everywhere, so payments, balances,
-- statements and revenue reports keep working unchanged.
-- Safe to run more than once. Rollback: 031_rollback_sales_discount_columns.sql
-- =========================================================================
BEGIN;
ALTER TABLE quotations   ADD COLUMN IF NOT EXISTS discount_type VARCHAR(10) NULL;
ALTER TABLE quotations   ADD COLUMN IF NOT EXISTS discount_value NUMERIC(15,4) NOT NULL DEFAULT 0;
ALTER TABLE quotations   ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE quotations   ADD COLUMN IF NOT EXISTS subtotal_before_discount NUMERIC(15,2) NULL;

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_type VARCHAR(10) NULL;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_value NUMERIC(15,4) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS subtotal_before_discount NUMERIC(15,2) NULL;

ALTER TABLE invoices     ADD COLUMN IF NOT EXISTS discount_type VARCHAR(10) NULL;
ALTER TABLE invoices     ADD COLUMN IF NOT EXISTS discount_value NUMERIC(15,4) NOT NULL DEFAULT 0;
ALTER TABLE invoices     ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices     ADD COLUMN IF NOT EXISTS subtotal_before_discount NUMERIC(15,2) NULL;
COMMIT;
